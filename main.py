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
#     -can be done by , when song change detected, update database, by subtracting start and end time of the song to log the played time, 
# implement QUEUE
# url_queue = navidrome_url("getPlayQueue")
# print("queue:" ,url_queue)


import requests
import time
from config import build_url
from db import get_db_connection, init_db


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
    # print("\nentires : " , entries)
    if not entries:
        print("nothing is playing")
        return

    for entry in entries:
        user_id  = entry["username"]
        song_id  = entry["id"]

        if user_id not in active or active[user_id]["song_id"] != song_id:
            # only set start_time when it's a NEW song
            active[user_id] = {
                "song_id": song_id,
                "user_id": user_id,
                "title": entry.get("title", ""),
                "album": entry.get("album", ""),
                "artist": entry.get("artist" , ""),
                "genre": entry.get("genre", ""),
                "duration": entry["duration"],
                "start_time": time.time(), 
            }
            print(f"[NEW] {user_id} started: {entry['title']}")
        else:
            # same song still playing → don't touch start_time
            print(f"[SAME] {user_id} still playing: {active[user_id]['title']}")

# logs history in db

def log_history(song):
    # print(song)
    played = time.time() - song["start_time"]
    percent_played = round((played / song["duration"]) * 100)
    signal = "positve"
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
    print("existing", existing[0] if existing else None)

    if existing:
        cursor.execute("""
            UPDATE listens 
            SET played = ?, percent_played = ?
            WHERE id = ?
        """, (played, percent_played, existing[0]))
        print(f"[UPDATE] {song['user_id']} | {song['title']} | {percent_played}%")

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


#main function

if __name__ == "__main__":
    init_db()
    while True:
        Watcher()
        for user_id, song in active.items():
            log_history(song)
        time.sleep(5)
