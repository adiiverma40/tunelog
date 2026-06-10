import os
import re
import shutil
import string
import tempfile
from threading import Thread

from misc.bashScript import moveBashScript
import metadata.library as library
from core.db import get_db_connection_lib
from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from metadata.genre import DeleteDataJson, autoGenre, readJson, writeJson
from metadata.itunesFuzzy import useFallBackMethods
from core.db import get_db_connection

# from rich.console import Console
from navidrome.state import app_state, save_skip_config, skip_config
from playlists.importPlaylist import fuzzymatching
from pydantic import BaseModel
from rich.console import Console

console = Console()

router = APIRouter(
    tags=["library"]
)

VALID_EXPLICIT = {"explicit", "cleaned", "notExplicit"}

class UpdateMarkingPayload(BaseModel):
    song_id: str
    explicit: str

class generateScriptPayload(BaseModel):
      song_ids: list[str]
      shell: str
      base_path: str
      action: str
    

def GetGenre():
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    rows = cursor.execute(
        "SELECT DISTINCT genre FROM library WHERE explicit IS NOT NULL"
    ).fetchall()
    conn.close()

    db_genres = set()
    for row in rows:
        if row[0]:
            parts = [part.strip() for part in re.split(r"[,/]", row[0])]
            db_genres.update(parts)

    data = readJson()
    known_terms = set()

    for category, values in data.items():
        known_terms.add(category.lower())
        for v in values:
            known_terms.add(v.lower())

    unmapped_genres = [g for g in db_genres if g and g.lower() not in known_terms]

    return {
        "status": "success",
        "genres": sorted(unmapped_genres),
    }


@router.get("/api/genre/read")
def readGenre():
    data = readJson()
    return {"status": "success", "Genre": data}


@router.get("/api/genre/write")
def writeGenre(genre, noisyGenre):
    try:
        if genre and noisyGenre:
            data = writeJson(genre, noisyGenre)
            genreData = readJson()
            autoGenre(genreData)
            return {"status": "success", "Genre": data}
        else:
            return {"status": "Category Or Genre Empty"}
    except Exception as e:
        console.log(f"[red]Error writing genre:[/red] {e}")
        return {"status": "Error in writing data"}


@router.get("/api/genre/delete")
def deleteGenre(category, value=None):
    if category:
        data = DeleteDataJson(category, value)
        return {"status": "success", "Genre": data}
    else:
        return {"status": "Deletion Failed, Category is required"}


@router.get("/api/genre/get")
def GetGenreFromDb():
    data = GetGenre()
    return data

@router.get("/api/genre/auto")
def autoMatchGenre():
    data = readJson()
    update = autoGenre(data)
    # sync_database_to_json()
    remaining_data = GetGenre()
    return {"unmapped": remaining_data, "genre_updated": update}



@router.get("/api/sync/stop")
def stopSync():
    library._stopSync = True
    return {"status": "ok", "response": "stopped syncing"}


@router.get("/api/sync/status")
def syncStatus():
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    total_songs = cursor.execute("SELECT COUNT(*) FROM library").fetchone()[0]
    explicit_songs = cursor.execute(
        "SELECT COUNT(*) FROM library WHERE explicit = 'explicitContent'"
    ).fetchone()[0]
    last_sync = cursor.execute(
        "SELECT last_synced FROM library ORDER BY last_synced DESC LIMIT 1"
    ).fetchone()
    songs_needing_itunes = cursor.execute(
        "SELECT COUNT(*) FROM library WHERE explicit IS NULL"
    ).fetchone()[0]
    not_explicit = cursor.execute(
        "SELECT COUNT(*) FROM library WHERE explicit = 'notExplicit'"
    ).fetchone()[0]
    cleaned = cursor.execute(
        "SELECT COUNT(*) FROM library WHERE explicit = 'cleaned'"
    ).fetchone()[0]
    not_in_itunes = cursor.execute(
        "SELECT COUNT(*) FROM library WHERE explicit = 'notInItunes'"
    ).fetchone()[0]
    manual_needed = cursor.execute(
        "SELECT COUNT(*) FROM library WHERE explicit = 'manual'"
    ).fetchone()[0]

    conn.close()

    return {
        "is_syncing": library._isSyncing,
        "progress": library._progress,
        "start_sync": library._startSyncSong,
        "auto_sync": library._auto_sync,
        "use_itunes": library._toggle_itune,
        "total_songs": total_songs,
        "explicit_songs": explicit_songs,
        "last_sync": last_sync[0] if last_sync else None,
        "songs_needing_itunes": songs_needing_itunes,
        "timezone": library._timezone,
        "explicit_counts": {
            "explicit": explicit_songs,
            "notExplicit": not_explicit,
            "cleaned": cleaned,
            "notInItunes": not_in_itunes,
            "manual": manual_needed,
            "pending": songs_needing_itunes,
        },
    }


@router.get("/api/sync/start")
def startSync(use_itunes: bool = False):
    library.triggerSync(use_itunes)
    return {"status": "started"}


@router.get("/api/sync/setting")
def syncSetting(
    auto_sync_hour: int = 2, use_itunes: bool = False, timezone: str = "Asia/Kolkata"
):
    library.setSyncSettings(auto_sync_hour, use_itunes, timezone)
    return {"status": "ok"}


@router.get("/api/library/marking")
def manualMarking():
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT * FROM library WHERE explicit = 'manual'").fetchall()
    conn.close()

    songs = [
        {
            "song_id": row["song_id"],
            "title": row["title"],
            "artist": row["artist"],
            "album": row["album"],
            "genre": row["genre"],
            "duration": row["duration"],
            "explicit": row["explicit"],
        }
        for row in rows
    ]

    return {"status": "ok", "songs": songs}


@router.post("/api/library/marking")
def updateMarking(payload: UpdateMarkingPayload):
    console.log(f"[cyan]Manual Marking:[/cyan] {payload.song_id} -> {payload.explicit}")

    if payload.explicit not in VALID_EXPLICIT:
        return {"status": "error", "reason": "Invalid explicit value"}, 400

    conn = get_db_connection_lib()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE library SET explicit = ? WHERE song_id = ?",
        (payload.explicit, payload.song_id),
    )
    conn.commit()
    conn.close()

    return {"status": "ok", "song_id": payload.song_id, "explicit": payload.explicit}



@router.post("/api/sync/fallback")
def syncByFallback(tries: int = 500):
    console.log(f"[cyan]Fallback Sync Triggered[/cyan] (Tries: {tries})")

    if app_state.fallback_running:
        return {"status": "error", "reason": "Fallback sync already running"}

    conn = get_db_connection_lib()
    cursor = conn.cursor()
    songs_raw = cursor.execute(
        "SELECT * FROM library WHERE explicit = 'notInItunes'"
    ).fetchall()
    conn.close()

    songs = [dict(s) for s in songs_raw]

    if not songs:
        return {"status": "ok", "reason": "No notInItunes songs found"}

    app_state.fallback_running = True
    app_state.fallback_processed = 0
    app_state.fallback_total = len(songs)
    app_state.fallback_stop = False

    def run():
        for song in songs:
            if app_state.fallback_stop:
                console.log("[yellow]Fallback Sync Stopped by User[/yellow]")
                break

            result = useFallBackMethods(song, tries)
            app_state.fallback_processed += 1

        app_state.fallback_running = False

    Thread(target=run, daemon=True).start()
    return {"status": "ok", "total": len(songs)}

@router.get("/api/sync/fallback/status")
def fallbackStatus():
    return {
        "status": "ok",
        "is_running": app_state.fallback_running,
        "processed": app_state.fallback_processed,
        "total": app_state.fallback_total,
        "progress": (
            round((app_state.fallback_processed / app_state.fallback_total) * 100)
            if app_state.fallback_total > 0
            else 0
        ),
    }

@router.get("/api/sync/fallback/stop")
def stopFallback():
    app_state.fallback_stop = True
    return {"status": "ok"}

@router.post("/api/import/csv")
async def import_csv(file: UploadFile = File(...)):
    console.log(f"[cyan]Processing CSV Import:[/cyan] {file.filename}")
    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Please upload a CSV."
        )

    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, file.filename)

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        match_results = fuzzymatching(temp_path)

        return {
            "status": "success",
            "message": f"Processed {match_results['summary']['total']} songs.",
            "data": match_results,
        }
    except Exception as e:
        console.log(f"[red]Error during fuzzy matching:[/red] {e}")
        return {"status": "failed", "reason": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# =========================================
#       skipped songs api
# ===================================


@router.get("/api/listens/skipped")
def get_skipped_songs():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        #  CLEARLY THIS SQL QUERY WAS WRITTEN BY AI
        query = """
            SELECT
                MAX(id) AS id,
                song_id,
                title,
                artist,
                album,
                duration,
                genre,
                COUNT(*) AS skip_count,
                MAX(timestamp) AS timestamp,
                MAX(user_id) AS user_id
            FROM listens
            WHERE signal = 'skip'
            GROUP BY song_id
            ORDER BY skip_count DESC
        """

        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()
        if rows and isinstance(rows[0], tuple):
            columns = [column[0] for column in cursor.description]
            result = [dict(zip(columns, row)) for row in rows]
            return result

        return [dict(row) for row in rows]

    except Exception as e:
        return {
            "status": "error",
            "reason": f"Database error: {str(e)}",
        }

class ScriptSettingsPayload(BaseModel):
    shell: str
    basePath: str
    action: str


@router.put("/api/library/script-settings")
def update_script_settings(payload: ScriptSettingsPayload):
    new_config_data = {
        "base_path": payload.basePath,
        "type": payload.shell,
        "action": payload.action
    }

    success, error_msg = save_skip_config(new_config_data)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg
        )

    return Response(status_code=status.HTTP_200_OK)

@router.get("/api/library/script-settings")
def getSkipSetting():
    settings = skip_config

    frontend_payload = {
        "shell": settings.get("type", ""),
        "basePath": settings.get("base_path", ""),
        "action": settings.get("action", "move")
    }

    return frontend_payload

@router.post("/api/library/generate-script")
def generateSkipSetting(settings : generateScriptPayload):
    songs = settings.song_ids
    action = settings.action
    base = settings.base_path
    print(songs)
    if action == "move":
        script = moveBashScript(songs)
        print(script)
        return script