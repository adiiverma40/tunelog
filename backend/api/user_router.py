import os
import shutil
from pathlib import Path

import requests
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from rich.console import Console

from core.config import Navidrome_url
from core.db import get_db_connection, get_db_connection_lib, get_db_connection_usr

console = Console()
router = APIRouter(tags=["user_and_admin"])

CONFIG_DIR = "./config/users"
SERVER_URL = os.getenv("VITE_API_URL", "http://localhost:8000")

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


@router.post("/auth/login")
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


@router.post("/api/user/profile/update")
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
                "UPDATE user SET name=? WHERE username=?",
                (displayName, username),
            )

        cursor = conn.execute(
            "SELECT avatar FROM user WHERE username=?", (username,)
        )
        row = cursor.fetchone()
        if row and row["avatar"]:
            full_avatar_url = f"{SERVER_URL.rstrip('/')}{row['avatar']}"

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


@router.post("/admin/get-users")
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


@router.get("/admin/getUserData")
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


@router.post("/admin/create-user")
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

    if existing and not isUpdate:
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


@router.get("/api/user/profile")
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
                "id": song_id,
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
                "id": song_id,
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