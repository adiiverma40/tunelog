# # This to give frontend api data


from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests
import os
import shutil
import tempfile
from typing import Optional
from config import Navidrome_url
from db import (
    get_db_connection_lib,
    get_db_connection,
    get_db_connection_usr,
    get_db_connection_playlist,
    init_db,
    init_db_lib,
    init_db_usr,
)
from playlist import (
    score_song,
    get_unheard_songs,
    get_wildcard_songs,
    build_playlist,
    push_playlist,
    appendPlaylist,
    songSlots,
    signalWeights,
    API_push_playlist,
    getDataFromDb,
)

from state import app_state, tune_config, save_config
import library
from itunesFuzzy import useFallBackMethods
from genre import readJson, writeJson, DeleteDataJson, autoGenre, sync_database_to_json
from misc import UpdateDBgenre
from importPlaylist import fuzzymatching

from threading import Thread
from fastapi.middleware.cors import CORSMiddleware
from rich.console import Console
from dotenv import load_dotenv

import asyncio
from fastapi.responses import StreamingResponse
from state import _subscribers, notification_status
import json
import re
import socketio

load_dotenv()

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
CONFIG_DIR = "./config/users"

save_dir = Path(CONFIG_DIR)
save_dir.mkdir(parents=True, exist_ok=True)

app = FastAPI()
app.mount("/avatars", StaticFiles(directory=CONFIG_DIR), name="avatars")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


SERVER_URL = os.getenv("VITE_API_URL", "http://localhost:8000")

console = Console(log_path=False, log_time=False)

allowedOriginsStr = os.getenv("ALLOWED_ORIGINS", "")
allowedOrigins = [
    origin.strip() for origin in allowedOriginsStr.split(",") if origin.strip()
]

if not allowedOrigins:
    allowedOrigins = ["http://localhost:5173"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowedOrigins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.on_event("startup")
def startup():
    init_db()
    init_db_lib()
    init_db_usr()


class CreateUserData(BaseModel):
    username: str
    password: str
    isAdmin: bool
    admin: str
    adminPD: str
    email: str
    name: str
    isUpdate: bool = False


class LoginData(BaseModel):
    username: str
    password: str


class AdminAuth(BaseModel):
    admin: str
    adminPD: str


class PlaylistOptions(BaseModel):
    username: str
    explicit_filter: str = "allow_cleaned"
    size: int = 50
    slots: Optional[dict] = None
    weights: Optional[dict] = None
    injection: bool


class UpdateMarkingPayload(BaseModel):
    song_id: str
    explicit: str


class csvPlaylist(BaseModel):
    username: list[str]
    song_ids: list[str]
    playlist_name: str


class configData(BaseModel):
    playlist_generation: dict
    behavioral_scoring: dict
    sync_and_automation: dict
    api_and_performance: dict
    jam : dict


VALID_EXPLICIT = {"explicit", "cleaned", "notExplicit"}


@app.post("/api/user/profile/update")
async def update_user_profile(
    username: str = Form(...),
    displayName: str = Form(...),
    avatar: UploadFile = File(None),
):
    try:
        save_dir = Path(CONFIG_DIR)
        save_dir.mkdir(parents=True, exist_ok=True)

        avatar_db_path = None
        full_avatar_url = None

        if avatar and avatar.filename:
            extension = Path(avatar.filename).suffix
            filename = f"{username}{extension}"
            target_file = save_dir / filename

            with open(target_file, "wb") as buffer:
                shutil.copyfileobj(avatar.file, buffer)

            avatar_db_path = f"/avatars/{filename}"

            full_avatar_url = f"{SERVER_URL.rstrip('/')}{avatar_db_path}"
        conn = get_db_connection_usr()
        if avatar_db_path:
            conn.execute(
                "UPDATE user SET name=?, avatar=? WHERE username=?",
                (displayName, avatar_db_path, username),
            )
        else:
            conn.execute(
                "UPDATE user SET display_name=? WHERE username=?",
                (displayName, username),
            )

            cursor = conn.execute(
                "SELECT avatar_path FROM user WHERE username=?", (username,)
            )
            row = cursor.fetchone()
            if row and row["avatar_path"]:
                full_avatar_url = f"{SERVER_URL.rstrip('/')}{row['avatar_path']}"

        conn.commit()
        conn.close()

        return {
            "status": "success",
            "user": {
                "username": username,
                "displayName": displayName,
                "avatarUrl": full_avatar_url,
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/get-users")
def getUsers(data: AdminAuth):
    token = getJWT(data.admin, data.adminPD)
    if not token:
        return {"status": "failed", "reason": "Invalid admin credentials"}

    conn = get_db_connection_usr()
    users = conn.execute("SELECT * FROM user").fetchall()
    conn.close()

    user_list = []
    for row in users:
        user_dict = dict(row)
        avatar_path = user_dict.get("avatar")
        avatar_url = f"{SERVER_URL.rstrip('/')}{avatar_path}" if avatar_path else None

        user_list.append(
            {
                "username": user_dict.get("username"),
                "password": user_dict.get("password"),
                "isAdmin": bool(user_dict.get("isAdmin")),
                "name": user_dict.get("name"),
                "avatarUrl": avatar_url,
            }
        )

    return {
        "status": "ok",
        "users": user_list,
    }


@app.get("/admin/getUserData")
def getUserData(username: str = "", password: str = ""):
    conn = get_db_connection()
    cursor = conn.cursor()
    if username != "" and password != "":
        rows = cursor.execute(
            """
            SELECT signal, COUNT(signal) 
            FROM listens 
            WHERE user_id = ? 
            GROUP BY signal;
            """,
            (username,),
        ).fetchall()

        stats_map = {row[0]: row[1] for row in rows}

        lastTimeStamp = cursor.execute(
            """
            SELECT timestamp 
            FROM listens 
            WHERE user_id = ? 
            ORDER BY timestamp DESC 
            LIMIT 1
            """,
            (username,),
        ).fetchone()
        last_log = lastTimeStamp[0] if lastTimeStamp else "never"

        total_listens = sum(stats_map.values())
        conn.close()

        return {
            "status": "ok",
            "totalListens": total_listens,
            "skips": stats_map.get("skip", 0),
            "repeat": stats_map.get("repeat", 0),
            "complete": stats_map.get("positive", 0),
            "partial": stats_map.get("partial", 0),
            "lastLogged": last_log,
        }
    else:
        conn.close()
        return {"status": "failed , username required"}


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


@app.get("/api/ping")
def ping():
    return {"status": "OK"}


@app.get("/api/stats")
def stats():
    conn_lib = get_db_connection_lib()
    conn_log = get_db_connection()

    countSongsLib = conn_lib.execute("SELECT COUNT(*) FROM library").fetchone()[0]
    countPlayedSongs = conn_log.execute(
        "SELECT COUNT(DISTINCT song_id) FROM listens"
    ).fetchone()[0]

    signal_rows = conn_log.execute(
        "SELECT signal, COUNT(*) as count FROM listens GROUP BY signal"
    ).fetchall()
    signals = {row[0]: row[1] for row in signal_rows}

    mostPlayedArtists_row = conn_log.execute(
        "SELECT artist, COUNT(*) as count FROM listens GROUP BY artist ORDER BY count DESC LIMIT 10"
    ).fetchall()
    mostPlayedArtists = {row[0]: row[1] for row in mostPlayedArtists_row}

    mostPlayedSongs_row = conn_log.execute(
        """
        SELECT title, artist, COUNT(*) as play_count 
        FROM listens 
        GROUP BY title
        ORDER BY play_count DESC
        LIMIT 10
        """
    ).fetchall()

    mostPlayedSongs = [
        {"title": row[0], "artist": row[1], "play_count": row[2]}
        for row in mostPlayedSongs_row
    ]

    conn_lib.close()
    conn_log.close()

    return {
        "total_songs": countSongsLib,
        "total_listens": countPlayedSongs,
        "signals": signals,
        "most_played_artists": mostPlayedArtists,
        "most_played_songs": mostPlayedSongs,
    }


def getJWT(admin_username, admin_password):
    try:
        res = requests.post(
            f"{Navidrome_url}/auth/login",
            json={"username": admin_username, "password": admin_password},
            timeout=5,
        )
        if res.status_code == 200:
            return res.json().get("token")
        return None
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        console.log("[yellow]Warning: Navidrome is currently unreachable.[/yellow]")
        return None
    except Exception as e:
        console.log(f"[red]API Error (getJWT):[/red] {e}")
        return None


@app.post("/auth/login")
def login(data: LoginData):
    try:
        admin = data.username
        password = data.password
        res = getJWT(admin, password)

        if not res:
            return {
                "status": "failed",
                "reason": "Invalid credentials or Navidrome offline",
            }

        conn = get_db_connection_usr()
        cursor = conn.cursor()

        existing = cursor.execute(
            "SELECT * FROM user WHERE username = ?", (admin,)
        ).fetchone()

        if not existing:
            cursor.execute(
                "INSERT INTO user (username, password, isAdmin) VALUES (?, ?, ?)",
                (admin, password, True),
            )
            conn.commit()
            console.log(f"[green]New User Created:[/green] {admin}")

        conn.close()
        return {"status": "success", "JWT": res}

    except Exception as e:
        console.log(f"[red]Login Route Error:[/red] {e}")
        return {"status": "failed", "reason": "Internal Error"}


@app.post("/admin/create-user")
def createUser(data: CreateUserData):
    username = data.username
    password = data.password
    isAdmin = data.isAdmin
    admin = data.admin
    adminPD = data.adminPD
    email = data.email
    name = data.name
    isUpdate = data.isUpdate

    if not (username and admin and adminPD):
        return {"status": "failed", "reason": "Missing required fields"}

    token = getJWT(admin, adminPD)
    if not token:
        return {
            "status": "failed",
            "reason": "Invalid admin credentials or Navidrome offline",
        }

    conn = get_db_connection_usr()
    existing = conn.execute(
        "SELECT * FROM user WHERE username = ?", (username,)
    ).fetchone()

    if existing:
        conn.close()
        return {"status": "failed", "reason": "User already exists in DB"}

    if isUpdate:
        console.log(f"[cyan]Syncing user:[/cyan] {username}")
        try:
            res = requests.get(
                f"{Navidrome_url}/api/user",
                headers={
                    "Content-Type": "application/json",
                    "X-ND-Authorization": f"Bearer {token}",
                },
                timeout=10,
            )

            if res.status_code != 200:
                conn.close()
                return {
                    "status": "failed",
                    "reason": "Failed to fetch users from Navidrome",
                }

            users = res.json()
            user_exists = any(u.get("userName") == username for u in users)

            if user_exists:
                conn.execute(
                    "INSERT INTO user (username, password, isAdmin) VALUES (?, ?, ?)",
                    (username, password, isAdmin),
                )
                conn.commit()
                conn.close()
                return {"status": "success", "reason": "User synced from Navidrome"}

            res_create = requests.post(
                f"{Navidrome_url}/api/user",
                headers={
                    "Content-Type": "application/json",
                    "X-ND-Authorization": f"Bearer {token}",
                },
                json={
                    "userName": username,
                    "name": name,
                    "password": password,
                    "isAdmin": isAdmin,
                    "email": email,
                },
                timeout=10,
            )

            if res_create.status_code == 200:
                conn.execute(
                    "INSERT INTO user (username, password, isAdmin) VALUES (?, ?, ?)",
                    (username, password, isAdmin),
                )
                conn.commit()
                conn.close()
                return {
                    "status": "success",
                    "reason": "User created in Navidrome and DB",
                }
            else:
                conn.close()
                return {
                    "status": "failed",
                    "reason": "Failed to create user in Navidrome",
                }

        except Exception as e:
            conn.close()
            return {"status": "failed", "reason": str(e)}

    if username and password and isAdmin is not None:
        try:
            res = requests.post(
                f"{Navidrome_url}/api/user",
                headers={
                    "Content-Type": "application/json",
                    "X-ND-Authorization": f"Bearer {token}",
                },
                json={
                    "userName": username,
                    "name": name,
                    "password": password,
                    "isAdmin": isAdmin,
                    "email": email,
                },
                timeout=10,
            )

            if res.status_code == 200:
                conn.execute(
                    "INSERT INTO user (username, password, isAdmin) VALUES (?, ?, ?)",
                    (username, password, isAdmin),
                )
                conn.commit()
                conn.close()
                return {"status": "success", "reason": "User created successfully"}
            else:
                conn.close()
                return {"status": "failed", "reason": "Navidrome API failed"}
        except Exception as e:
            conn.close()
            return {"status": "failed", "reason": str(e)}

    conn.close()
    return {"status": "failed", "reason": "Invalid input"}


@app.get("/api/sync/stop")
def stopSync():
    library._stopSync = True
    return {"status": "ok", "response": "stopped syncing"}


@app.get("/api/sync/status")
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


@app.get("/api/sync/start")
def startSync(use_itunes: bool = False):
    library.triggerSync(use_itunes)
    return {"status": "started"}


@app.get("/api/sync/setting")
def syncSetting(
    auto_sync_hour: int = 2, use_itunes: bool = False, timezone: str = "Asia/Kolkata"
):
    library.setSyncSettings(auto_sync_hour, use_itunes, timezone)
    return {"status": "ok"}


@app.get("/api/library/marking")
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


@app.post("/api/library/marking")
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


@app.get("/api/playlist/songs")
def getSongsFromPlaylist(username: str):
    if not username:
        return {"status": "ERROR, no username"}

    conn = get_db_connection_playlist()
    rows = conn.execute(
        "SELECT song_id, title, artist, genre, signal, explicit, generated_at FROM playlist WHERE username = ?",
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


@app.post("/api/playlist/generate")
def generatePlaylist(data: PlaylistOptions):
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
            # print("api song slots : " , data.slots)
        if data.weights:
            signalWeights(data.weights)
            # print("api signal weight " , data.weights)
        library, history = getDataFromDb()
        scores = score_song(username, history_dict=history, library_dict=library)
        unheard, unheard_ratio = get_unheard_songs(scores)
        wildcards = get_wildcard_songs(scores, username)
        playlist, song_signals = build_playlist(
            library,
            history,
            scores,
            unheard,
            wildcards,
            unheard_ratio,
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


@app.post("/api/playlist/append")
def appendPlaylist_api(data: PlaylistOptions):
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
        # success = appendPlaylist(username, password, explicit_filter, size)
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


@app.get("/api/user/profile")
def getUserProfile(username: str, password: str):
    conn_listen = get_db_connection()
    conn_library = get_db_connection_lib()
    lc = conn_listen.cursor()
    lib = conn_library.cursor()

    counts = lc.execute(
        """
        SELECT signal, COUNT(*) as cnt
        FROM listens
        WHERE user_id = ?
        GROUP BY signal
        """,
        (username,),
    ).fetchall()

    signal_map = {row[0]: row[1] for row in counts}
    total = sum(signal_map.values())

    last = lc.execute(
        "SELECT timestamp FROM listens WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
        (username,),
    ).fetchone()

    top_songs_raw = lc.execute(
        """
        SELECT song_id, COUNT(*) as cnt
        FROM listens
        WHERE user_id = ?
        GROUP BY song_id
        ORDER BY cnt DESC
        LIMIT 20
        """,
        (username,),
    ).fetchall()

    top_songs = []
    for song_id, count in top_songs_raw:
        meta = lib.execute(
            "SELECT title, artist FROM library WHERE song_id = ?", (song_id,)
        ).fetchone()
        if not meta:
            continue
        sig_row = lc.execute(
            """
            SELECT signal, COUNT(*) as c FROM listens
            WHERE user_id = ? AND song_id = ?
            GROUP BY signal ORDER BY c DESC LIMIT 1
            """,
            (username, song_id),
        ).fetchone()
        top_songs.append(
            {   
                "id" : song_id,
                "title": meta[0],
                "artist": meta[1],
                "count": count,
                "signal": sig_row[0] if sig_row else "positive",
            }
        )

    top_artists_raw = lc.execute(
        "SELECT song_id, COUNT(*) as cnt FROM listens WHERE user_id = ? GROUP BY song_id",
        (username,),
    ).fetchall()

    artist_counts: dict = {}
    for song_id, cnt in top_artists_raw:
        meta = lib.execute(
            "SELECT artist FROM library WHERE song_id = ?", (song_id,)
        ).fetchone()
        if not meta or not meta[0]:
            continue
        primary = meta[0].split(";")[0].strip()
        artist_counts[primary] = artist_counts.get(primary, 0) + cnt

    top_artists = sorted(
        [{"artist": a, "count": c} for a, c in artist_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:20]

    top_genres_raw = lc.execute(
        "SELECT song_id, COUNT(*) as cnt FROM listens WHERE user_id = ? GROUP BY song_id",
        (username,),
    ).fetchall()

    genre_counts: dict = {}
    for song_id, cnt in top_genres_raw:
        meta = lib.execute(
            "SELECT genre FROM library WHERE song_id = ?", (song_id,)
        ).fetchone()
        if not meta or not meta[0]:
            continue
        genre_counts[meta[0]] = genre_counts.get(meta[0], 0) + cnt

    top_genres = sorted(
        [{"genre": g, "count": c} for g, c in genre_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:15]

    history_raw = lc.execute(
        """
        SELECT song_id, signal, timestamp
        FROM listens
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 100
        """,
        (username,),
    ).fetchall()

    recent_history = []
    for song_id, signal, timestamp in history_raw:
        meta = lib.execute(
            "SELECT title, artist, genre FROM library WHERE song_id = ?", (song_id,)
        ).fetchone()
        recent_history.append(
            {   
                "id" : song_id,
                "title": meta[0] if meta else "Unknown",
                "artist": meta[1] if meta else "Unknown",
                "genre": meta[2] if meta else "—",
                "signal": signal,
                "listened_at": timestamp,
            }
        )

    conn_listen.close()
    conn_library.close()

    return {
        "status": "ok",
        "totalListens": total,
        "skips": signal_map.get("skip", 0),
        "partial": signal_map.get("partial", 0),
        "complete": signal_map.get("positive", 0),
        "repeat": signal_map.get("repeat", 0),
        "lastLogged": last[0] if last else "never",
        "topSongs": top_songs,
        "topArtists": top_artists,
        "topGenres": top_genres,
        "recentHistory": recent_history,
    }


@app.get("/api/library/getMonthlyListens")
def getMonthlyListens():
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT 
            strftime('%Y-%m', timestamp) as month, 
            COUNT(*) as count 
        FROM listens 
        WHERE timestamp >= date('now', '-6 months')
        GROUP BY month
        ORDER BY month ASC
    """
    rows = cursor.execute(query).fetchall()
    conn.close()
    return [{"month": row[0], "count": row[1]} for row in rows]


@app.post("/api/sync/fallback")
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


@app.get("/api/sync/fallback/status")
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


@app.get("/api/sync/fallback/stop")
def stopFallback():
    print("fallback stop triggerd")
    # print(app_state.fallback_stop)
    app_state.fallback_stop = True
    # print(app_state.fallback_stop)
    return {"status": "ok"}


@app.get("/api/genre/read")
def readGenre():
    data = readJson()
    return {"status": "success", "Genre": data}


@app.get("/api/genre/write")
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


@app.get("/api/genre/delete")
def deleteGenre(category, value=None):
    if category:
        data = DeleteDataJson(category, value)
        return {"status": "success", "Genre": data}
    else:
        return {"status": "Deletion Failed, Category is required"}


@app.get("/api/genre/get")
def GetGenreFromDb():
    data = GetGenre()
    return data


@app.get("/api/genre/auto")
def autoMatchGenre():
    data = readJson()
    update = autoGenre(data)
    # sync_database_to_json()
    remaining_data = GetGenre()
    return {"unmapped": remaining_data, "genre_updated": update}


@app.post("/api/import/csv")
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


@app.post("/api/import/csvPlaylist")
def csvPlaylist(data: csvPlaylist):
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


@app.get("/notifications/stream")
async def sse_stream():
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    subscriber_entry = (queue, loop)
    _subscribers.append(subscriber_entry)

    async def event_generator():
        try:
            for field in ("songState", "playlist", "starredSong"):
                existing = list(getattr(notification_status, field))
                if existing:
                    payload = json.dumps({field: existing})
                    yield f"data: {payload}\n\n"

            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"data: {data}\n\n"

                    field = list(json.loads(data).keys())[0]
                    getattr(notification_status, field).clear()

                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _subscribers.remove(subscriber_entry)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/config")
def SendConfig():
    # print("Sending config")
    return tune_config


@app.post("/api/config/update")
def update_config(payload: configData):
    # print(payload)
    console.print("[bold blue]Received config update request...")
    # print(payload.dict())
    success, message = save_config(payload.dict())
    if not success:
        raise HTTPException(status_code=500, detail=message)
    return {"status": "success", "message": "config.json updated"}


# ====================================================================
# JAM
# ========================================================


import uuid
import asyncio
from datetime import datetime, timezone
from jam import (
    sendSongPayload,
    AddQueue,
    currentQueue,
    ClearQueue,
    future_queue_ids,
    past_queue_ids,
)


HOST_RECONNECT_GRACE = 20
host_reconnect_task = None

connected_users = {}

jam_state = {
    "host_sid": None,
    "host_name": None,
    "current_track": None,
    "is_playing": False,
}

jamConfig = tune_config["jam"]


async def broadcast_users():
    await sio.emit("users", connected_users)


async def end_jam_after_timeout():
    await asyncio.sleep(HOST_RECONNECT_GRACE)

    if jam_state["host_sid"] is None and jam_state["host_name"] is not None:
        jam_state["host_name"] = None
        jam_state["current_track"] = None
        jam_state["is_playing"] = False
        await sio.emit("jam_finished")
        console.print("[bold red]Jam ended — host did not reconnect")


@sio.event
async def leave_jam(sid):
    console.print("[bold red]Leaving jam")
    await sio.leave_room(sid, room="jam")
    await sio.emit("leaveJam", to=sid)


@sio.event
async def connect(sid, environ, auth):
    global host_reconnect_task
    username = (auth or {}).get("username") or "Anonymous"

    console.print(f"[bold white]Client connected: {sid} ({username})")
    connected_users[sid] = {"username": username, "isHost": False}

    if (
        jam_state["host_name"]
        and username == jam_state["host_name"]
        and jam_state["host_sid"] is None
    ):
        jam_state["host_sid"] = sid
        connected_users[sid]["isHost"] = True

        if host_reconnect_task:
            host_reconnect_task.cancel()
            host_reconnect_task = None

        await sio.enter_room(sid, "jam")
        console.print("[bold green]Host reconnected and jam restored")
    await sio.emit(
        "jam_announced",
        {
            "hostName": jam_state.get("host_name"),
            "trackId": jam_state.get("current_track"),
            "isPlaying": jam_state.get("is_playing", False),
        },
        to=sid,
    )

    if connected_users[sid]["isHost"]:
        track_id = jam_state.get("current_track")
        payload = sendSongPayload(track_id) if track_id else None
        await sio.emit("now_playing", payload, to=sid)
        await sio.emit("queue_update", currentQueue(), to=sid)
    await broadcast_users()


@sio.event
async def disconnect(sid):
    global host_reconnect_task

    console.print(f"[bold red]Client disconnected: {sid}")
    connected_users.pop(sid, None)

    if sid == jam_state["host_sid"]:
        jam_state["host_sid"] = None
        jam_state["is_playing"] = False
        await sio.emit(
            "jam_host_lost",
            {
                "hostName": jam_state["host_name"],
                "trackId": jam_state["current_track"],
            },
        )

        if host_reconnect_task:
            host_reconnect_task.cancel()

        host_reconnect_task = asyncio.create_task(end_jam_after_timeout())
        console.print("[bold yellow]Host disconnected — waiting for reconnect")
    await broadcast_users()


@sio.event
async def start_jam(sid, data):
    user = connected_users.get(sid)
    if not user:
        return

    username = user["username"]

    jam_state["host_sid"] = sid
    jam_state["host_name"] = username
    jam_state["is_playing"] = True
    connected_users[sid]["isHost"] = True

    library, history = getDataFromDb()
    scores = score_song(
        username,
        history_dict=history,
        library_dict=library,
    )
    unheard, unheard_ratio = get_unheard_songs(scores)
    wildcards = get_wildcard_songs(scores, username)

    playlist, song_signals = build_playlist(
        library,
        history,
        scores,
        unheard,
        wildcards,
        unheard_ratio,
        username,
        "all",
        10,
        False,
    )

    ClearQueue()
    for songId in playlist:
        AddQueue(songId, user=username)

    if future_queue_ids:
        jam_state["current_track"] = future_queue_ids.pop(0)
    else:
        jam_state["current_track"] = data.get("trackId")
    await sio.emit(
        "jam_announced",
        {
            "hostName": jam_state["host_name"],
            "trackId": jam_state["current_track"],
            "isPlaying": True,
        },
    )

    payload = (
        sendSongPayload(jam_state["current_track"])
        if jam_state["current_track"]
        else {}
    )
    await sio.enter_room(sid, "jam")
    await sio.emit("now_playing", payload, room="jam")
    await sio.emit("queue_update", currentQueue(), room="jam")

    await broadcast_users()
    console.print(f"[bold blue]Jam started by: {jam_state['host_name']}")


@sio.event
async def joinJam(sid):
    console.print("[bold green]User joined the jam")
    payload = (
        sendSongPayload(jam_state["current_track"])
        if jam_state["current_track"]
        else {}
    )

    await sio.enter_room(sid, "jam")
    await sio.emit("now_playing", payload, to=sid)
    await sio.emit("queue_update", currentQueue(), to=sid)
    await sio.emit("jam_playback", {"isPlaying": jam_state["is_playing"]}, to=sid)


@sio.event
async def get_queue(sid):
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def add_queue(sid, data):
    user = connected_users.get(sid)
    if not user:
        return
    username = user["username"]

    console.print(f"[bold yellow]Adding {data.get('title')} by {username} ")

    if jamConfig["only_host_add_queue"] and sid != jam_state["host_sid"]:
        console.print("[bold red]Only host can add to queue")
        return

    AddQueue(
        song_id=data["song_id"],
        title=data.get("title"),
        artist=data.get("artist", "Unknown"),
        user=username,
    )
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def reorder_queue(sid, data):
    if jamConfig["only_host_change_queue"]:
        if jam_state["host_sid"] != sid:
            console.print("[bold red]Unauthorized reorder attempt")
            return

    console.print("[bold green]Reordering queue")
    ClearQueue()
    for item in data:
        AddQueue(
            item["song_id"],
            item.get("title"),
            item.get("artist", "Unknown"),
            item.get("user", "unknown")
        )
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def clear_queue(sid):
    if jamConfig["only_host_clear_queue"]:
        if jam_state["host_sid"] != sid:
            console.print("[bold red]Unauthorized Clear attempt")
            return

    console.print("[bold yellow]Clearing Queue")
    ClearQueue()
    jam_state["current_track"] = None
    jam_state["is_playing"] = False
    await sio.emit("now_playing", None, room="jam")
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def stop_jam(sid):
    if sid != jam_state["host_sid"]:
        return

    jam_state["host_sid"] = None
    jam_state["host_name"] = None
    jam_state["current_track"] = None
    jam_state["is_playing"] = False

    connected_users[sid]["isHost"] = False
    await sio.emit("jam_finished")
    await sio.emit("now_playing", None, room="jam")
    await sio.emit("queue_update", [], room="jam")

    await sio.close_room("jam")
    
    await broadcast_users()
    console.print("[bold yellow]Jam stopped by host")


@sio.event
async def jam_play(sid):
    if sid != jam_state["host_sid"]:
        return
    jam_state["is_playing"] = True
    await sio.emit("jam_playback", {"isPlaying": True}, room="jam")


@sio.event
async def jam_pause(sid):
    if sid != jam_state["host_sid"]:
        return
    jam_state["is_playing"] = False
    await sio.emit("jam_playback", {"isPlaying": False}, room="jam")


@sio.event
async def jam_next(sid):
    if sid != jam_state["host_sid"]:
        return

    if jam_state["current_track"]:
        past_queue_ids.append(jam_state["current_track"])

    if future_queue_ids:
        next_track_id = future_queue_ids.pop(0)
        jam_state["current_track"] = next_track_id
        jam_state["is_playing"] = True
        payload = sendSongPayload(next_track_id)
    else:
        jam_state["current_track"] = None
        jam_state["is_playing"] = False
        payload = None

    await sio.emit("now_playing", payload, room="jam")
    await sio.emit("jam_playback", {"isPlaying": jam_state["is_playing"]}, room="jam")
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def jam_prev(sid):
    if sid != jam_state["host_sid"]:
        return

    if not past_queue_ids:
        return
    if jam_state["current_track"]:
        future_queue_ids.insert(0, jam_state["current_track"])
    prev_track_id = past_queue_ids.pop()
    jam_state["current_track"] = prev_track_id
    jam_state["is_playing"] = True

    payload = sendSongPayload(prev_track_id)

    await sio.emit("now_playing", payload, room="jam")
    await sio.emit("jam_playback", {"isPlaying": jam_state["is_playing"]}, room="jam")
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def sync_time(sid, data):
    if sid != jam_state["host_sid"]:
        return
    await sio.emit("sync_room_time", {"positionMs": data.get("positionMs")}, room="jam")


@sio.event
async def chat_message(sid, data):
    if sid not in connected_users:
        return

    username = connected_users[sid]["username"]
    text = (data.get("text") or "").strip()
    if not text:
        return

    msg = {
        "id": str(uuid.uuid4()),
        "username": username,
        "text": text,
        "sentAt": datetime.now(timezone.utc).isoformat(),
    }

    await sio.emit("chat_message", msg, room="jam")


@sio.event
async def transfer_host(sid, data):
    if sid != jam_state["host_sid"]:
        console.print("[bold red]Unauthorized transfer_host attempt")
        return

    to_username = data.get("toUsername")
    if not to_username:
        return

    target_sid = next(
        (s for s, u in connected_users.items() if u["username"] == to_username), None
    )

    if target_sid is None:
        console.print(f"[bold red]transfer_host: {to_username} not connected")
        return

    connected_users[sid]["isHost"] = False
    jam_state["host_sid"] = target_sid
    jam_state["host_name"] = to_username
    connected_users[target_sid]["isHost"] = True

    await sio.enter_room(target_sid, "jam")
    await sio.emit(
        "jam_announced",
        {
            "hostName": to_username,
            "trackId": jam_state.get("current_track"),
            "isPlaying": jam_state.get("is_playing", False),
        },
    )

    await broadcast_users()


if __name__ == "__main__":
    init_db()
    init_db_lib()
    init_db_usr()
