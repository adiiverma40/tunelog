# This to give frontend api data


# imports

from fastapi import FastAPI
from pydantic import BaseModel
import requests
from typing import Optional
from config import Navidrome_url

from db import (
    get_db_connection_lib,
    get_db_connection,
    get_db_connection_usr,
    get_db_connection_playlist,
)
from db import init_db, init_db_lib, init_db_usr

from playlist import (
    score_song,
    get_unheard_songs,
    get_wildcard_songs,
    build_playlist,
    push_playlist,
    appendPlaylist,
    songSlots,
    signalWeights
)

# from library import isSyncing, progress, auto_sync, toggle_itune , startSyncSong
import library


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "*"
        #    "*"   use only if u want to access this with other devices, ig., mobile
    ],
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

# ping


@app.get("/api/ping")
def ping():
    return {"status": "OK"}


# send statics


@app.get("/api/stats")
def stats():

    # connection to db
    conn_lib = get_db_connection_lib()
    conn_log = get_db_connection()  # tunelog.db

    # no of songs in library

    countSongsLib = conn_lib.execute("SELECT COUNT(*) FROM library").fetchone()[0]

    countPlayedSongs = conn_log.execute("SELECT COUNT(*) FROM listens").fetchone()[0]

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


# http://your-server/rest/createUser.view?username=adii&password=1234&email=adii@mail.com&u=admin&p=adminpass&v=1.13.0&c=MyApp&f=json


# {"subsonic-response":
# {"status": "ok",
# "version": "1.16.1"}
# }


def getJWT(admin_username, admin_password):
    res = requests.post(
        f"{Navidrome_url}/auth/login",
        json={"username": admin_username, "password": admin_password},
    )
    if res.status_code == 200:
        return res.json()["token"]
    return None


@app.post("/auth/login")
def login(data: LoginData):
    admin = data.username
    password = data.password
    res = getJWT(admin, password)
    conn = get_db_connection_usr()
    cursor = conn.cursor()

    if res:
        existing = cursor.execute(
            "SELECT * FROM user WHERE username = ?", (admin,)
        ).fetchone()

        if existing:
            print("username already in database")
        else:
            cursor.execute(
                "INSERT INTO user (username, password, isAdmin) VALUES (?, ?, ?)",
                (admin, password, True),
            )
            conn.commit()

        conn.close()
        return {"status": "success", "JWT": res}

    conn.close()
    return {"status": "failed", "reason": "Invalid username or password"}


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

    print("Creating user.....")

    if not (username and admin and adminPD):
        return {
            "status": "failed",
            "reason": "Missing required fields",
        }
    print("Getting tocker from navidrome")
    token = getJWT(admin, adminPD)
    if not token:
        return {"status": "failed", "reason": "Invalid admin credentials"}

    conn = get_db_connection_usr()

    existing = conn.execute(
        "SELECT * FROM user WHERE username = ?", (username,)
    ).fetchone()


    if existing:
        conn.close()
        return {"status": "failed", "reason": "User already exists in DB"}

    print("isUpdate : ", isUpdate)
    if isUpdate:
        print(f"[TuneLog] Syncing user: {username}")

        try:
            res = requests.get(
                f"{Navidrome_url}/api/user",
                headers={
                    "Content-Type": "application/json",
                    "X-ND-Authorization": f"Bearer {token}",
                },
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
                print(f"[TuneLog] User {username} exists in Navidrome --> adding to DB")

                conn.execute(
                    "INSERT INTO user (username, password, isAdmin) VALUES (?, ?, ?)",
                    (username, password, isAdmin),
                )
                conn.commit()
                conn.close()

                return {
                    "status": "success",
                    "reason": "User synced from Navidrome",
                }

            print(f"[TuneLog] User {username} not found --> creating in Navidrome")

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
        )

        if res.status_code == 200:
            conn.execute(
                "INSERT INTO user (username, password, isAdmin) VALUES (?, ?, ?)",
                (username, password, isAdmin),
            )
            conn.commit()
            conn.close()

            return {
                "status": "success",
                "reason": "User created successfully",
            }

        else:
            conn.close()
            return {"status": "failed", "reason": "Navidrome API failed"}

    conn.close()
    return {"status": "failed", "reason": "Invalid input"}


@app.post("/admin/get-users")
def getUsers(data: AdminAuth):
    token = getJWT(data.admin, data.adminPD)

    if not token:
        return {"status": "failed", "reason": "Invalid admin credentials"}

    conn = get_db_connection_usr()
    users = conn.execute("SELECT * FROM user").fetchall()
    conn.close()

    # explicitly map columns so frontend always gets the right shape
    return {
        "status": "ok",
        "users": [
            {
                "username": row["username"],
                "password": row["password"],
                "isAdmin": bool(row["isAdmin"]),
            }
            for row in users
        ],
    }


# const PLACEHOLDER_STATS = {
#   totalListens: 103,
#   skips: 133,
#   repeat: 44,
#   complete: 89,
#   partial: 57,
#   lastLogged: "Mar 12, 2025",
# };


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

            """, (username,)
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
        return {
            "status" : "failed , username required"
        }


# http://your-server/rest/ping.view?u=joe&t=26719a1196d2a940705a59634eb18eab&s=c19b2d&v=1.12.0&c=myapp


# data = {
#     "username": "asdasd",
#     "password": "sdfasdf",
#     "isAdmin": True,
#     "admin": "adii",
#     "adminPD": "adutya11@",
#     "email": ""
# }


# print(createUser(data))
@app.get("/api/sync/stop")
def stopSync():
    library._stopSync = True
    print("stopping request recived")
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
        "explicit_counts": {
            "explicit": explicit_songs,
            "notExplicit": not_explicit,
            "cleaned": cleaned,
            "notInItunes": not_in_itunes,
            "pending": songs_needing_itunes,
        },
    }


@app.get("/api/sync/start")
def startSync(use_itunes: bool = False):
    library.triggerSync(use_itunes)
    return {"status": "started"}


@app.get("/api/sync/setting")
def syncSetting(auto_sync_hour: int = 2, use_itunes: bool = False):
    library.setSyncSettings(auto_sync_hour, use_itunes)
    return {"status": "ok"}


# playlist api


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
    try:
        if data.slots:
            songSlots(data.slots)
            print("=== PLAYLIST CONFIG ===")
            print("slots:", data.slots)

        if data.weights:
            signalWeights(data.weights)
            # print ("generated playlist for signal weights : " , data .weights)
            print("weights:", data.weights)
            print("=======================")

        scores = score_song(username)
        unheard, unheard_ratio = get_unheard_songs(scores)
        wildcards = get_wildcard_songs(scores, username)
        playlist, song_signals = build_playlist(
            scores, unheard, wildcards, unheard_ratio, username, explicit_filter, size
        )
        push_playlist(playlist, username, song_signals)

        return {
            "status": "ok",
            "songs_added": len(playlist),
        }

    except Exception as e:
        return {"status": "error", "reason": str(e)}


@app.post("/api/playlist/append")
def appendPlaylist_api(
    data: PlaylistOptions
):
    print("in appened mode")
    username = data.username
    explicit_filter = data.explicit_filter
    size = data.size
    try:
        if data.slots:
            songSlots(data.slots)
            # print("generated playlist of slots : " , data.slots)
            print("=== PLAYLIST CONFIG ===")
            print("slots:", data.slots)

        if data.weights:
            signalWeights(data.weights)
            # print ("generated playlist for signal weights : " , data .weights)
            print("weights:", data.weights)
            print("=======================")

        conn = get_db_connection_usr()
        row = conn.execute(
            "SELECT password FROM user WHERE username = ?", (username,)
        ).fetchone()
        conn.close()

        if not row:
            return {"status": "error", "reason": "User not found in TuneLog database"}

        password = row[0]

        success = appendPlaylist(
            username,
            password,
            explicit_filter,
            size,
        )

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
        """
        SELECT timestamp FROM listens
        WHERE user_id = ?
        ORDER BY timestamp DESC LIMIT 1
    """,
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
                "title": meta[0],
                "artist": meta[1],
                "count": count,
                "signal": sig_row[0] if sig_row else "positive",
            }
        )

    top_artists_raw = lc.execute(
        """
        SELECT song_id, COUNT(*) as cnt
        FROM listens
        WHERE user_id = ?
        GROUP BY song_id
    """,
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
        """
        SELECT song_id, COUNT(*) as cnt
        FROM listens
        WHERE user_id = ?
        GROUP BY song_id
    """,
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


if __name__ == "__main__":
    init_db()
    init_db_lib()
    print("asdasd")
    init_db_usr()
