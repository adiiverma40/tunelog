# Tunelog, A light weight script to create a playlist recommendation system.
# It tracks how user react to certain music and on that it create a playlist for that user


# features implemented till now :
# 1. Watcher : watches every user and stores it in active dictornary
# 2. log_history : logs history to the database :
#         if song is new, uses inster to create a new line
#         if song is prexisting, uses update to change played, percentage,
# 3.


# TODO:

# implement a better system to signal positive and stuff
#     -can be done by , when song change detected, update database, by subtracting start and end time of the song to log the played time, - done

# implement QUEUE
# url_queue = navidrome_url("getPlayQueue")
# print("queue:" ,url_queue)
# stop from going 200%

# existing 509
# [UPDATE] adii | Pal Bhar | 104%
# existing 510
# [UPDATE] adii_mobile | Soch Na Sake | 238%    done

# implement loging when song changes done


# ISSUES AND FIXS


## CHANGING APPROACH, INSTEAD OF CHECKING EVERY 5 SEC, WE WILL USE SSE
## SSE will return events, when the event is playingnow, use watcher to get the details
# use threading


##ISSUE: when using mobile client for navidrom, Tempo, it reports twice for the nowplayingcount event in sse
#           - this issue causes to run watcher multiple times,


import requests
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo


# from queue import Queue
from config import build_url, event_queue
from db import get_db_connection, init_db, init_db_lib, init_db_usr, init_db_playlist , get_db_connection_lib
from itunesFuzzy import useFallBackMethods
import library
# from playlist import main as generate_playlist
from library import normalise_genre
from watcher import start_sse
from misc import push_star
import uvicorn

# store user data
active = {}


# queue
# event_queue = Queue()


# url
def navidrome_url(endpoint):
    url = build_url(endpoint)
    response = requests.get(url)
    return response.json()


# watches what is user/users listening to


def Watcher():
    url_response = navidrome_url("getNowPlaying")
    entries = url_response["subsonic-response"].get("nowPlaying", {}).get("entry", [])

    now = time.time()

    # ── flush stale entries (paused > 10 mins) ──
    for user_id in list(active.keys()):
        if now - active[user_id]["last_seen"] > 600:
            print(f"[STALE] {user_id} flushed: {active[user_id]['title']}")
            log_history(active.pop(user_id))

    if not entries:
        for user_id in list(active.keys()):
            active[user_id]["actual_played"] += now - active[user_id]["last_seen"]
            active[user_id]["last_seen"] = now
            log_history(active.pop(user_id))
            print(f"[STOP] {user_id} stopped")
        return

    latest = {}
    for entry in entries:
        user_id = entry["username"]
        if user_id not in latest or entry["minutesAgo"] < latest[user_id]["minutesAgo"]:
            latest[user_id] = entry
    entries = list(latest.values())

    for entry in entries:
        user_id = entry["username"]
        song_id = entry["id"]

        if user_id in active and active[user_id]["song_id"] == song_id:
            active[user_id]["actual_played"] += now - active[user_id]["last_seen"]
            active[user_id]["last_seen"] = now
            print(
                f"[SAME] {user_id} still playing: {active[user_id]['title']} | played: {round(active[user_id]['actual_played'])}s"
            )

        else:
            if user_id in active:
                active[user_id]["actual_played"] += now - active[user_id]["last_seen"]
                log_history(active.pop(user_id))

            active[user_id] = {
                "song_id": song_id,
                "user_id": user_id,
                "title": entry.get("title", ""),
                "album": entry.get("album", ""),
                "artist": entry.get("artist", ""),
                "genre": normalise_genre(entry.get("genre")),
                "duration": entry["duration"],
                "actual_played": 0,
                "last_seen": now,
            }
            print(f"[NEW] {user_id} started: {entry['title']}")

    current_users = {entry["username"] for entry in entries}
    for user_id in list(active.keys()):
        if user_id not in current_users:
            active[user_id]["actual_played"] += now - active[user_id]["last_seen"]
            log_history(active.pop(user_id))
            print(f"[STOP] {user_id} stopped")


def signal_system(percent_played, song_id, user_id):
    if percent_played <= 30:
        base = "skip"
    elif percent_played < 80:
        base = "partial"
    else:
        base = "positive"

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT COUNT(*) FROM listens
        WHERE song_id = ? AND user_id = ?
        AND timestamp < datetime('now', '-10 minutes')
    """,
        (song_id, user_id),
    )

    prior_listens = cursor.fetchone()[0]
    conn.close()

    if prior_listens > 0 and base == "positive":
        base = "repeat"

    return base


def log_history(song):
    # print(song)
    # played = min(time.time() - song["start_time"], song["duration"])
    # percent_played = min(round((played / song["duration"]) * 100), 100)
    # signal = signal_system(percent_played, song["song_id"], song["user_id"])
    # print("percent : ", percent_played)
    played = min(song["actual_played"], song["duration"])
    percent_played = min(round((played / song["duration"]) * 100), 100)
    signal = signal_system(percent_played, song["song_id"], song["user_id"])


    push_star(song["song_id"], song["user_id"], signal)
    # print("signal : ", signal)
    conn = get_db_connection()
    cursor = conn.cursor()


    cursor.execute(
        """
        SELECT id FROM listens
        WHERE song_id = ? and user_id = ? 
        AND timestamp >= datetime('now', '-10 minutes')
        ORDER BY timestamp DESC 
        LIMIT 1
        """,
        (song["song_id"], song["user_id"]),
    )

    existing = cursor.fetchone()

    if existing:
        cursor.execute(
            """
            UPDATE listens 
            SET played = ?, percent_played = ?, signal = ?
            WHERE id = ?
        """,
            (played, percent_played, signal, existing[0]),
        )
        # print(f"[UPDATE] {song['user_id']} | {song['title']} | {percent_played}%")

    else:
        cursor.execute(
            """
                INSERT INTO listens(
                song_id, title, artist, album, genre, duration, played, percent_played, signal, user_id
                )
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """,
            (
                song["song_id"],
                song["title"],
                song["artist"],
                song["album"],
                song["genre"],
                song["duration"],
                played,
                percent_played,
                signal,
                song["user_id"],
            ),
        )

    conn.commit()
    conn.close()


def autoSyncWithFallback():
    print("[TuneLog] Starting auto sync...")
    library.sync_library()

    conn = get_db_connection_lib()
    not_in_itunes = conn.execute(
        "SELECT COUNT(*) FROM library WHERE explicit = 'notInItunes'"
    ).fetchone()[0]
    conn.close()

    if not_in_itunes > 0:
        print(
            f"[TuneLog] Auto sync done. {not_in_itunes} songs need fallback — starting..."
        )

        songs_raw = conn = (
            get_db_connection_lib()
            .execute("SELECT * FROM library WHERE explicit = 'notInItunes'")
            .fetchall()
        )
        songs = [dict(s) for s in songs_raw]

        library._fallbackStop = False
        for song in songs:
            if library._fallbackStop:
                print("[TuneLog] Fallback stopped")
                break
            result = useFallBackMethods(song, tries=500)
            print(f"[TuneLog] Fallback result: {result}")

        print("[TuneLog] Fallback sync complete")
    else:
        print("[TuneLog] Auto sync done. No notInItunes songs — skipping fallback")


if __name__ == "__main__":
    # Database
    print("Initializing databse")
    init_db()
    init_db_lib()
    init_db_usr()
    init_db_playlist()
    uvicornThread = threading.Thread(
        target=uvicorn.run,
        args=("api:app",),
        kwargs={"host": "0.0.0.0", "port": 8000 , "log_level":"warning"},
        
        daemon=True,
    )
    uvicornThread.start()

    # Watcher
    watcherThread = threading.Thread(target=start_sse, daemon=True)
    watcherThread.start()

    n = 0
    last_auto_sync_day = None 

    while True:
        if library._startSyncSong and not library._isSyncing:
            print("[TuneLog] Manual sync triggered from UI...")
            syncThread = threading.Thread(target=library.sync_library, daemon=True)
            syncThread.start()

        now = datetime.now(ZoneInfo(library._timezone))
        current_hour = now.hour
        current_day = now.date()
        settings = library.getSyncSettings()
        auto_sync_hour = settings["auto_sync"]
        # print("Current Hour : " ,  current_hour)
        if (
            current_hour == auto_sync_hour
            and current_day != last_auto_sync_day
            and not library._isSyncing
            ):
                print(f"[TuneLog] Auto sync triggered at {now.strftime('%H:%M')}...")
                last_auto_sync_day = current_day
                syncThread = threading.Thread(target=autoSyncWithFallback, daemon=True)  # ← changed
                syncThread.start()
        try:
            event = event_queue.get(
                timeout=2
            )  
            print("in while loop : ", event)
            if event == "nowPlaying":
                n += 1
                print("Its fucking working")
                print(n)
                Watcher()
        except Exception as e:
            if "Empty" not in str(type(e).__name__):
                print(f"[ERROR] main loop: {e}")
