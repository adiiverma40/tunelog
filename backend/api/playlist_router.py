import json
from datetime import timedelta
from typing import Optional

from core.db import (
    get_db_connection_playlist,
    get_db_connection_usr,
)
from fastapi import APIRouter
from metadata.genre import readJson as readJSON
from playlists.playlist import (
    API_push_playlist,
    appendPlaylist,
    build_discovery_playlist,
    build_playlist,
    get_discovery_pool,
    get_translation_maps,
    get_unheard_songs,
    get_wildcard_songs,
    getDataFromDb,
    push_playlist,
    resolve_date_window,
    score_song,
    signalWeights,
    songSlots,
)
from pydantic import BaseModel
from rich.console import Console

console = Console()

router = APIRouter(
    tags=['playlist']
)


class PlaylistOptions(BaseModel):
    username: str
    explicit_filter: str = "allow_cleaned"
    size: int = 50
    slots: Optional[dict] = None
    weights: Optional[dict] = None
    injection: bool

class DiscoveryQueueModel(BaseModel):
    username: str
    size: int = 50
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    days_from: Optional[int] = None
    days_to: Optional[int] = None
    backtrack: bool = False
    explicit_filter: str

class CsvPlaylist(BaseModel):
    username: list[str]
    song_ids: list[str]
    playlist_name: str




@router.get("/api/playlist/songs")
def getSongsFromPlaylist(username: str):
    # print("get playlist songs")
    if not username:
        return {"status": "ERROR, no username"}

    conn = get_db_connection_playlist()
    rows = conn.execute(
        "SELECT song_id, title, artist, genre, signal, explicit, generated_at FROM playlist WHERE username = ? and type = 'blend'",
        (username,),
    ).fetchall()
    conn.close()

    if not rows:
        return {"status": "ok", "songs": [], "stats": {}}

    genre_counts = {}
    for row in rows:
        genre = row[3]
        if genre:
            genre_counts[genre] = genre_counts.get(genre, 0) + 1

    top_genre = max(genre_counts, key=genre_counts.get) if genre_counts else None
    last_generated = rows[0][6]

    stats = {
        "last_generated": last_generated,
        "total_songs": len(rows),
        "top_genre": top_genre,
    }

    songs = [
        {
            "song_id": row[0],
            "title": row[1],
            "artist": row[2],
            "genre": row[3],
            "signal": row[4],
            "explicit": row[5],
        }
        for row in rows
    ]

    return {"status": "ok", "stats": stats, "songs": songs}


@router.post("/api/playlist/generate")
def generatePlaylist(data: PlaylistOptions):
    # print("generate playlist")
    username = data.username
    explicit_filter = data.explicit_filter
    size = data.size
    injection = data.injection

    console.log(
        f"[cyan]Playlist Generation:[/cyan] {username} | Filter: {explicit_filter} | Size: {size}"
    )

    try:
        if data.slots:
            songSlots(data.slots)
        if data.weights:
            signalWeights(data.weights)
        library, history = getDataFromDb()
        scores = score_song(username, history_dict=history, library_dict=library)
        unheard, unheard_ratio, all_time_heard = get_unheard_songs(library, username)
        wildcards = get_wildcard_songs(scores, username)
        playlist, song_signals = build_playlist(
            library,
            history,
            scores,
            unheard,
            wildcards,
            unheard_ratio,
            all_time_heard,
            username,
            explicit_filter,
            size,
            injection,
        )
        push_playlist(playlist, username, song_signals)

        return {"status": "ok", "songs_added": len(playlist)}

    except Exception as e:
        console.log(f"[red]Playlist Gen Error:[/red] {e}")
        return {"status": "error", "reason": str(e)}


@router.post("/api/playlist/append")
def appendPlaylist_api(data: PlaylistOptions):
    # print("append")
    username = data.username
    explicit_filter = data.explicit_filter
    size = data.size
    injection = data.injection
    console.log(f"[cyan]Append Playlist:[/cyan] {username} | Size: {size}")

    try:
        if data.slots:
            songSlots(data.slots)
        if data.weights:
            signalWeights(data.weights)

        conn = get_db_connection_usr()
        row = conn.execute(
            "SELECT password FROM user WHERE username = ?", (username,)
        ).fetchone()
        conn.close()

        if not row:
            return {"status": "error", "reason": "User not found in TuneLog database"}

        password = row[0]
        success = appendPlaylist(username, password, explicit_filter, size, injection)

        if success:
            return {
                "status": "ok",
                "message": f"Successfully appended songs for {username}",
                "size_requested": size,
            }
        else:
            return {"status": "error", "reason": "Failed to append to Navidrome"}

    except Exception as e:
        return {"status": "error", "reason": str(e)}


@router.get("/playlist/discoveryid")
def discoveryPlaylistId(username: str):
    console.print(
        "[bold green]Fetching Discovery Playlist Id for[/bold green]", username
    )
    conn = get_db_connection_usr()
    row = (
        conn.cursor()
        .execute("SELECT playlistIds FROM user WHERE username = ?", (username,))
        .fetchone()
    )
    conn.close()

    if not row or not row[0]:
        return {"status": "error", "id": None}

    try:
        ids = json.loads(row[0])
        print(ids)
        print(ids.get("blend"))
        return {"status": "success", "id": ids.get("discovery")}
    except Exception:
        return {"status": "error", "id": None}




@router.post("/generateDiscoveryQueue")
def generateDiscoveryQueue(data: DiscoveryQueueModel):
    console.print(
        f"[bold blue]Generating Discovery Queue for {data.username}[/bold blue]"
    )

    try:
        print(data.date_from, data.date_to, data.days_from, data.days_to)
        window_start, window_end = resolve_date_window(
            data.date_from, data.date_to, data.days_from, data.days_to
        )
    except ValueError as e:
        return {"status": "error", "reason": str(e), "songs": [], "total": 0}
    library, history = getDataFromDb()
    pool, did_backtrack, days_backtracked = get_discovery_pool(
        window_start, window_end, data.size, data.backtrack
    )
    alias_to_cat = get_translation_maps(readJSON())
    final_ids, song_signals = build_discovery_playlist(
        pool,
        history,
        data.username,
        data.size,
        alias_to_cat,
    )
    if final_ids and len(final_ids) > 0:
        push_playlist(
            final_ids,
            data.username,
            song_signals,
            playname="Discovery Pool",
            newPlaylist=False,
            playlist_type="discovery",
        )
        console.print("[bold yellow]Successfully pushed song")
    else:
        console.print("[bold red]No song to Push")
    # print("API : 906")
    effective_start = window_start - timedelta(days=days_backtracked)
    effective_end = window_end

    # print("API : 910")
    return {
        "status": "ok",
        "songs": final_ids,
        "total": len(final_ids),
        "effective_date_from": effective_start.isoformat(),
        "effective_date_to": effective_end.isoformat(),
        "backtracked": did_backtrack,
        "backtrack_days": days_backtracked,
        "reason": "discovery_genre_ratio" if final_ids else "no_songs_found",
    }


@router.post("/api/import/csvPlaylist")
def csvPlaylist(data: CsvPlaylist):
    # print("csv playlist")
    songIdv = data.song_ids
    playname = data.playlist_name
    username = data.username

    console.log(f"[cyan]Creating Playlist from CSV:[/cyan] {playname}")

    try:
        if songIdv:
            for name in username:
                API_push_playlist(songIdv, name, playname)
            return {"status": "success"}
    except Exception as e:
        console.log(f"[red]Error pushing CSV playlist:[/red] {e}")
        return {"status": str(e)}

