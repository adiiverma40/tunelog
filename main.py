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

import requests
import time
from config import build_url
from db import get_db_connection, init_db, init_db_lib
from library import sync_library
from playlist import main as generate_playlist


# store user data
active = {}


# url
def navidrome_url(endpoint):
    url = build_url(endpoint)
    response = requests.get(url)
    return response.json()


# watches what is user/users listening to


def Watcher():
    url_response = navidrome_url("getNowPlaying")
    entries = url_response["subsonic-response"].get("nowPlaying", {}).get("entry", [])

    if not entries:
        # print("nothing is playing")
        for user_id in list(active.keys()):
            log_history(active.pop(user_id))
            print(f"[STOP] {user_id} stopped")
        return

    # ── NEW: keep only the most recent entry per user ──
    latest = {}
    for entry in entries:
        user_id = entry["username"]
        if user_id not in latest or entry["minutesAgo"] < latest[user_id]["minutesAgo"]:
            latest[user_id] = entry

    entries = list(latest.values())  # deduplicated
    # ─────────────────────────────────────────────────

    for entry in entries:
        user_id = entry["username"]
        song_id = entry["id"]
        if user_id in active and active[user_id]["song_id"] == song_id:
            elapsed = time.time() - active[user_id]["start_time"]

            if elapsed >= active[user_id]["duration"]:
                active.pop(user_id)
                print(f"[DONE] {user_id} finished: {entry['title']}")
                continue

        if user_id not in active or active[user_id]["song_id"] != song_id:

            if user_id in active:
                # print(active[user_id])
                log_history(active[user_id])
                # print(active[user_id])

            active[user_id] = {
                "song_id": song_id,
                "user_id": user_id,
                "title": entry.get("title", ""),
                "album": entry.get("album", ""),
                "artist": entry.get("artist", ""),
                "genre": entry.get("genre", ""),
                "duration": entry["duration"],
                "start_time": time.time(),
            }
            # print(f"[NEW] {user_id} started: {entry['title']}")

        else:
            # same song still playing → don't touch start_time
            print(f"[SAME] {user_id} still playing: {active[user_id]['title']}")

    current_users = {entry["username"] for entry in entries}
    for user_id in list(active.keys()):
        if user_id not in current_users:
            log_history(active.pop(user_id))
            # print(f"[STOP] {user_id} stopped")


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


# logs history in db
def log_history(song):
    # print(song)
    played = min(time.time() - song["start_time"], song["duration"])
    percent_played = min(round((played / song["duration"]) * 100), 100)
    signal = signal_system(percent_played, song["song_id"], song["user_id"])
    # print("percent : ", percent_played)
    # print("signal : ", signal)
    conn = get_db_connection()
    cursor = conn.cursor()

    # update database if song is already in database, if the song was repeated after more then 10 mins, add in new row

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
    # print("existing", existing[0] if existing else None)

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


# main function

if __name__ == "__main__":
    init_db()
    init_db_lib()
    sync_library()
    init_db()
    print("[TuneLog] Generating playlist...")
    generate_playlist()
    while True:
        Watcher()

        time.sleep(5)
