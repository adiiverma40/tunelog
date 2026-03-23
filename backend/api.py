# This to give frontend api data


# imports

from fastapi import FastAPI
from pydantic import BaseModel
import requests
from config import Navidrome_url

from db import get_db_connection_lib , get_db_connection, get_db_connection_usr , get_db_connection_playlist
from db import init_db, init_db_lib, init_db_usr

from playlist import (
    score_song,
    get_unheard_songs,
    get_wildcard_songs,
    build_playlist,
    push_playlist,
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
    
    
    ],
    allow_methods=["*"],
    allow_headers=["*"],
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
    name : str


class LoginData(BaseModel):
    username: str
    password: str


class AdminAuth(BaseModel):
    admin: str
    adminPD: str


# ping

@app.get("/api/ping")
def ping():
    return {"status" : "OK"}


# send statics

@app.get("/api/stats")
def stats():

    # connection to db
    conn_lib = get_db_connection_lib()
    conn_log = get_db_connection()    #tunelog.db

    # no of songs in library

    countSongsLib = conn_lib.execute(
        "SELECT COUNT(*) FROM library"
    ).fetchone()[0]

    countPlayedSongs = conn_log.execute(
        "SELECT COUNT(*) FROM listens"
        ).fetchone()[0]

    signal_rows = conn_log.execute(
        "SELECT signal, COUNT(*) as count FROM listens GROUP BY signal"
    ).fetchall()

    signals = {row[0]: row[1] for row in signal_rows}

    mostPlayedArtists_row = conn_log.execute(
        "SELECT artist, COUNT(*) as count FROM listens GROUP BY artist ORDER BY count DESC LIMIT 10"
    ).fetchall()

    mostPlayedArtists = {row[0] : row[1] for row in mostPlayedArtists_row}

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
    {
        "title": row[0],
        "artist": row[1],
        "play_count": row[2]
    } 
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

    if username and password and isAdmin is not None and admin and adminPD:
        token = getJWT(admin, adminPD)
        if not token:
            return {"status": "failed", "reason": "Invalid admin credentials"}

        # check if user already exists in DB
        conn = get_db_connection_usr()
        existing = conn.execute(
            "SELECT * FROM user WHERE username = ?", (username,)
        ).fetchone()

        if existing:
            conn.close()
            return {"status": "failed", "reason": "User already exists"}

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
        print("response came", res.json())

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
                "username": username,
                "password": password,
                "isAdmin": isAdmin,
                "admin": admin,
                "Admin Password": adminPD,
            }
        else:
            conn.close()
            return {"status": "failed", "reason": "Navidrome API returned false"}

    else:
        return {
            "status": "failed",
            "reason": "All values are not entered",
            "username": username,
            "password": password,
            "isAdmin": isAdmin,
            "admin": admin,
            "Admin Password": adminPD,
        }


@app.post("/admin/get-users")
def getUsers(data: AdminAuth):
    token = getJWT(data.admin, data.adminPD)

    if not token:
        return {"status": "failed", "reason": "Invalid admin credentials"}

    conn = get_db_connection_usr()
    users = conn.execute("SELECT * FROM user").fetchall()
    conn.close()

    return {"status": "ok", "users": [dict(row) for row in users]}

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


@app.get("/api/playlist/generate")
def generatePlaylist(
    username: str, explicit_filter: str = "allow_cleaned", size: int = 50
):
    try:
        scores = score_song(username)
        unheard, unheard_ratio = get_unheard_songs(scores)
        wildcards = get_wildcard_songs(scores, username)
        playlist, song_signals = build_playlist(
            scores, unheard, wildcards, unheard_ratio, username, explicit_filter , size
        )
        push_playlist(playlist, username, song_signals)

        return {
            "status": "ok",
            "songs_added": len(playlist),
        }

    except Exception as e:
        return {"status": "error", "reason": str(e)}


if __name__ == "__main__":
    init_db()
    init_db_lib()
    print("asdasd")
    init_db_usr()
