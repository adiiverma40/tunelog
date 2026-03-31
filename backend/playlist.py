# build playlist depending on user interaction
# song that user havent listened in 60 days, gets a chance in playlist
# implemented genre injection, it maps out most song listened from specif genre and give them a high chance in playlist,
# genre injection sometimes gives songs without metadata less priortiy
# this can be fixed by listening that song once

# tried to give song that user havent heared a lost of priorty

# playlist  maps like this
# repated song high priorty
# fully listened less priorty
# skipped less priorty
# song from most listened genre high priorty

##IMPLEMENETATION:
# Implemented genre distrubution system
#  - default gets 1 point
# - song with every genre other then default gets 2 point
# - bollywood/rap gets 2 and 2 points each
# - / gets changed into ,
#
# Implementing star system to grade and push it in navidrome


# implementation : explict song filter
# input from frontend, if they want explict or cleaned or all

# to implement : custom slider for diffrent values of signals like skip : 0 , it never gets in the playlist ever again

# idea is to make slots dynmaic instead of hardcoding this make it take from ui


# [ slots = {
#         "unheard": max(1, round(n * unheard_pct)),
#         "wildcard": max(1, round(n * wildcard_pct)),
#         "positive": max(1, round(n * remaining * 0.35)),
#         "repeat": max(1, round(n * remaining * 0.35)),
#         "partial": max(1, round(n * remaining * 0.20)),
#         "skip": max(1, round(n * remaining * 0.10)),
#     } ]
# and this also
# SIGNAL_WEIGHTS = {
#     "repeat": 3,
#     "positive": 2,
#     "partial": 1,
#     "skip": -2,
# }


# slots give the slot in playlist if playlist is has 10 song, 3.5 must be from unheard tag
# signal weight define the weight of specific song, skip is -2 and repate is +3 so repeat is 5 times better then skip


# - songs with a genre tag gets priorities
# - after genre fitlration it gets back to the default pointing system of skip, listented, partial and repeated

##ISSUES AND FIXES##

# issue : in slots when using int it was giving less then the amount in PLAYLIST_SIZE
# fix : used round instead of int

# Issue : Every time it chooses playlist alphabetically
# fix : added a random function , random.shuffle()

# Issue : timezone diffrent gets error
# fixed : by adding max

# Issue : Not generating exact no of song in playlist as playlist size
# Fix : Added a check loop, if counter is less then playlist size, run the loop again

# ISSUE : if user deletes playlist from navidrome and try to create a new playlist it gives error cause there is no playlist of that id but it is store in database
# fixed : createPlaylistIfDeleteByNavidrome() functions create new playlist if the playlist is delete or not exists

# ISSUE : if user deletes playlist from navidrome and then try to append in it it will fail,
# fix : use playlist database to create a new playlist with createPlaylistIfDeleteByNavidrome()  and then appened new list in it


# TODO add an playlist id in userdatabase so when playlist is created it updates it
# DONE


from datetime import datetime
import requests
import random
from db import (
    get_db_connection,
    get_db_connection_lib,
    get_db_connection_usr,
    get_db_connection_playlist,
)
from config import build_url, build_url_for_user, getAllUser

PLAYLIST_NAME = "Tunelog - {}"  
PLAYLIST_SIZE = 40
WILDCARD_DAY = 60

# gloabl defaults

SIGNAL_WEIGHTS = {
    "repeat": 3,
    "positive": 2,
    "partial": 1,
    "skip": -2,
}


slotsValue = {
    "positive": 0.35,
    "repeat": 0.35,
    "partial": 0.20,
    "skip": 0.10,

}

def signalWeights(weights: dict):
    global SIGNAL_WEIGHTS
    SIGNAL_WEIGHTS = {
        "repeat": weights.get("repeat", 3),
        "positive": weights.get("positive", 2),
        "partial": weights.get("partial", 1),
        "skip": weights.get("skip", -2),
    }


def songSlots(values):
    print("songSlots")
    global slotsValue

    slotsValue = {
    "positive":  values["positive"],
    "repeat":  values['repeat'],
    "partial":  values['partial'],
    "skip":  values['skip'],
    }


def score_song(user_id):
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT song_id, signal, timestamp FROM listens WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn.close()

    scores = {}
    for row in rows:
        song_id = row[0]
        signal = row[1]
        timestamp = row[2]

        days_since = max((datetime.now() - datetime.fromisoformat(timestamp)).days, 0)
        recency = 1 / (days_since + 1)
        weight = SIGNAL_WEIGHTS.get(signal, 0)
        contribution = weight * recency

        if song_id not in scores:
            scores[song_id] = []
        scores[song_id].append(contribution)

    return {
        song_id: sum(contribs) / len(contribs) for song_id, contribs in scores.items()
    }


def get_genre_distribution(user_id):
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT genre FROM listens WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn.close()

    counts = {}
    for row in rows:
        if not row[0]:
            continue
        for genre in row[0].split(","):
            genre = genre.strip()
            if genre:
                counts[genre] = counts.get(genre, 0) + 1

    return sorted(counts.items(), key=lambda x: x[1], reverse=True)


def get_unheard_by_genre(heard_ids, genre, limit):
    conn = get_db_connection_lib()
    if not heard_ids:
        rows = conn.execute(
            "SELECT song_id, genre FROM library WHERE genre LIKE ?",
            (f"%{genre}%",),
        ).fetchall()
    else:
        placeholders = ",".join("?" * len(heard_ids))
        rows = conn.execute(
            f"SELECT song_id, genre FROM library WHERE genre LIKE ? AND song_id NOT IN ({placeholders})",
            (f"%{genre}%", *heard_ids),
        ).fetchall()
    conn.close()

    results = [(r[0], r[1]) for r in rows]
    random.shuffle(results)
    return results[:limit]


def get_unheard_by_genre_weighted(heard_ids, genre_distribution, total_slots):
    if not genre_distribution or total_slots <= 0:
        return []

    total_listens = sum(cnt for _, cnt in genre_distribution)
    scored = {}  

    for genre, cnt in genre_distribution:
        # genre_slots = round((cnt / total_listens) * total_slots)
        genre_slots = max(1, round((cnt / total_listens) * total_slots))
        if genre_slots <= 0:
            continue
        songs = get_unheard_by_genre(heard_ids, genre, genre_slots)

        for song_id, song_genre in songs:
            if song_genre == "default":
                pts = 1
            else:
                pts = len(song_genre.split(",")) * 2 

            if song_id not in scored:
                scored[song_id] = pts
            else:
                scored[song_id] += pts 

    sorted_songs = sorted(scored.items(), key=lambda x: x[1], reverse=True)
    return [song_id for song_id, _ in sorted_songs[:total_slots]]


def get_unheard_songs(scored_ids):
    conn = get_db_connection_lib()
    all_songs = conn.execute("SELECT song_id FROM library").fetchall()
    conn.close()

    all_ids = {row[0] for row in all_songs}
    heard_ids = set(scored_ids.keys())
    unheard = list(all_ids - heard_ids)
    unheard_ratio = len(unheard) / len(all_ids) if all_ids else 0

    return unheard, unheard_ratio


def get_wildcard_songs(scores, user_id):
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT song_id, MAX(timestamp) as last_played FROM listens WHERE user_id = ? GROUP BY song_id",
        (user_id,),
    ).fetchall()
    conn.close()

    wildcards = []
    for row in rows:
        song_id = row[0]
        last_played = row[1]
        days_since = max((datetime.now() - datetime.fromisoformat(last_played)).days, 0)
        if days_since >= WILDCARD_DAY and scores.get(song_id, 0) > 0:
            wildcards.append(song_id)

    return wildcards


def weighted_sample(pool, scores, k):
    if not pool or k <= 0:
        return []
    k = min(k, len(pool))
    weights = [max(scores.get(sid, 0.01), 0.01) for sid in pool]
    return random.choices(pool, weights=weights, k=k)


def get_allowed_song_ids(explicit_filter: str) -> set:
    conn = get_db_connection_lib()

    if explicit_filter == "strict":
        rows = conn.execute(
            "SELECT song_id FROM library WHERE explicit = 'notExplicit'"
        ).fetchall()
    elif explicit_filter == "allow_cleaned":
        rows = conn.execute(
            "SELECT song_id FROM library WHERE explicit IN ('notExplicit', 'cleaned', 'notInItunes')"
        ).fetchall()
    else:  # all
        rows = conn.execute("SELECT song_id FROM library").fetchall()

    conn.close()
    return {row[0] for row in rows}


def getPlaylistId(username):
    conn = get_db_connection_usr()
    cursor = conn.cursor()

    result = cursor.execute(
        "SELECT playlistId FROM user WHERE username = ?", (username,)
    ).fetchone()

    conn.close()

    if result:
        return result[0]
    return None


def build_playlist(
    scores,
    unheard,
    wildcards,
    unheard_ratio,
    user_id,
    explicit_filter="allow_cleaned",
    n=PLAYLIST_SIZE,
):
    # n = PLAYLIST_SIZE
    playlist_ids = []
    seen_ids = set()
    added_count = 0
    song_signals = {}

    allowed_ids = get_allowed_song_ids(explicit_filter)

    unheard_pct = min(0.35, unheard_ratio)      # make this 0 if user dont want random song
    wildcard_pct = 0.08
    remaining = 1 - unheard_pct - wildcard_pct

    slots = {
        "unheard": max(0, round(n * unheard_pct)),
        "wildcard": max(0, round(n * wildcard_pct)),
        "positive": max(0, round(n * remaining * slotsValue['positive'])),
        "repeat": max(0, round(n * remaining * slotsValue['repeat'])),
        "partial": max(0, round(n * remaining * slotsValue['partial'])),
        "skip": max(0, round(n * remaining * slotsValue['skip'])),
    }

    def by_signal(signal, conn):
        rows = conn.execute(
            "SELECT DISTINCT song_id FROM listens WHERE signal = ? AND user_id = ?",
            (signal, user_id),
        ).fetchall()
        return [r[0] for r in rows if r[0] in allowed_ids]

    genre_distribution = get_genre_distribution(user_id)
    genre_unheard = get_unheard_by_genre_weighted(
        set(scores.keys()), genre_distribution, slots["unheard"]
    )

    conn_log = get_db_connection()
    pools = [
        (
            "unheard",
            [
                s
                for s in genre_unheard + [s for s in unheard if s not in genre_unheard]
                if s in allowed_ids
            ],
        ),
        ("wildcard", [s for s in wildcards if s in allowed_ids]),
        ("positive", by_signal("positive", conn_log)),
        ("repeat", by_signal("repeat", conn_log)),
        ("partial", by_signal("partial", conn_log)),
        ("skip", by_signal("skip", conn_log)),
    ]

    for category, pool in pools:
        if not pool:
            continue

        needed = slots.get(category, 0)
        if category == "unheard":
            candidates = random.sample(pool, min(len(pool), needed * 2))
        else:
            candidates = weighted_sample(pool, scores, needed * 2)

        for sid in candidates:
            if added_count < n and sid not in seen_ids:
                playlist_ids.append(sid)
                seen_ids.add(sid)
                added_count += 1
                song_signals[sid] = category
            if len([x for x in playlist_ids if x in pool]) >= needed:
                break

    if added_count < n:
        conn = get_db_connection_lib()
        all_lib = [
            r[0]
            for r in conn.execute("SELECT song_id FROM library").fetchall()
            if r[0] in allowed_ids 
        ]
        conn.close()
        random.shuffle(all_lib)

        idx = 0
        while added_count < n:
            if idx >= len(all_lib):
                break
            candidate_id = all_lib[idx]
            if candidate_id not in seen_ids:
                playlist_ids.append(candidate_id)
                seen_ids.add(candidate_id)
                added_count += 1
                song_signals[candidate_id] = "unheard"
            idx += 1

    random.shuffle(playlist_ids)
    return playlist_ids[:n], song_signals


# VERSION 2 OF PUSH PLAYLIST

def createPlaylistIfDeleteByNavidrome(base_url , name , data , user_id):
    try:
        create_url = f"{base_url}&name={name}"
        r2 = requests.post(create_url, data=data).json()

        if (
                "subsonic-response" not in r2
                or r2["subsonic-response"]["status"] == "failed"
        ):
            print("[ERROR] Failed to recreate playlist")
            return

        new_id = r2["subsonic-response"]["playlist"]["id"]

        conn_usr = get_db_connection_usr()
        conn_usr.execute(
                "UPDATE user SET playlistId = ? WHERE username = ?",
                (new_id, user_id),
            )
        conn_usr.commit()
        conn_usr.close()

        print(f"[TuneLog] Recreated playlist with new ID {new_id}")
        return new_id

    except Exception as e:
        print(f"[ERROR] Failed to recreate playlist: {e}")
        return


# push playlist v2 :  for csv import 

def push_playlist(song_ids, user_id, song_signals, playname=None, newPlaylist=False):
    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    final_playlist_id = None

    if not password:
        print(f"[TuneLog] No credentials found for {user_id}, skipping")
        return

    if newPlaylist:
        stored_playlist_id = None
    else:
        stored_playlist_id = getPlaylistId(user_id)

    if playname:
        name = playname
    else:
        name = PLAYLIST_NAME.format(user_id)

    base_url = build_url_for_user("createPlaylist", user_id, password)
    if stored_playlist_id and stored_playlist_id != "no users/playlist id":
        url = f"{base_url}&playlistId={stored_playlist_id}"
        print(
            f"[TuneLog] Updating existing playlist {stored_playlist_id} for {user_id}"
        )
    else:
        url = f"{base_url}&name={name}"
        print(f"[TuneLog] Creating new playlist for {user_id}")

    data = [("songId", sid) for sid in song_ids]
    try:
        r = requests.post(url, data=data).json()

        if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
            error = (
                r.get("subsonic-response", {})
                .get("error", {})
                .get("message", "Unknown error")
            )
            print(f"[ERROR] Navidrome API failed: {error}")

            if stored_playlist_id:
                print(
                    f"[TuneLog] Playlist {stored_playlist_id} missing ---> recreating..."
                )
                new_id = createPlaylistIfDeleteByNavidrome(
                    base_url, name, data, user_id
                )
                if not new_id:
                    return
                final_playlist_id = new_id
            else:
                return

        else:
            final_playlist_id = r["subsonic-response"]["playlist"]["id"]

        if not newPlaylist and final_playlist_id != stored_playlist_id:
            conn_usr = get_db_connection_usr()
            conn_usr.execute(
                "UPDATE user SET playlistId = ? WHERE username = ?",
                (final_playlist_id, user_id),
            )
            conn_usr.commit()
            conn_usr.close()
            print(
                f"[TuneLog] Saved new playlist ID {final_playlist_id} to database for {user_id}"
            )

        requests.get(
            build_url_for_user("updatePlaylist", user_id, password)
            + f"&playlistId={final_playlist_id}&public=false"
        )

    except Exception as e:
        print(f"[ERROR] Failed to push playlist: {e}")
        return

    print(f"[TuneLog] Syncing {len(song_ids)} songs to local playlist.db...")
    conn_lib = get_db_connection_lib()
    placeholders = ",".join("?" * len(song_ids))
    rows = conn_lib.execute(
        f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
        song_ids,
    ).fetchall()
    conn_lib.close()

    lib_data = {row[0]: row for row in rows}

    conn = get_db_connection_playlist()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM playlist WHERE username = ?", (user_id,))

    insert_data = []
    for sid in song_ids:
        row = lib_data.get(sid)
        if row:
            insert_data.append(
                (
                    user_id,
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    song_signals.get(sid, "unheard"),
                    row[4],
                )
            )

    cursor.executemany(
        """
        INSERT INTO playlist (username, song_id, title, artist, genre, signal, explicit)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        insert_data,
    )
    conn.commit()
    conn.close()
    print(f"[TuneLog] Success: Playlist fully synced for {user_id}")


def get_all_users():
    listens_conn = get_db_connection()
    users_conn = get_db_connection_usr()

    listening_users = set(
        row[0]
        for row in listens_conn.execute(
            "SELECT DISTINCT user_id FROM listens"
        ).fetchall()
    )

    registered_users = set(
        row[0] for row in users_conn.execute("SELECT username FROM user").fetchall()
    )

    listens_conn.close()
    users_conn.close()

    unregistered = listening_users - registered_users
    if unregistered:
        print(f"[MISMATCH] These users have listens but are NOT registered in TuneLog:")
        for u in unregistered:
            print(f"  --> {u} : log this user via the Web UI to generate their playlist")

    inactive = registered_users - listening_users
    if inactive:
        print(f"[INFO] These users are registered but have no listen history yet:")
        for u in inactive:
            print(f"  --> {u}")

    valid_users = registered_users & listening_users
    return list(valid_users)


def appendPlaylist(user_id, password , explicit_filter , size):

    # generate playlist using build playlist 

    scores = score_song(user_id)
    unheard, unheard_ratio = get_unheard_songs(scores)
    wildcards = get_wildcard_songs(scores, user_id)
    playlist, song_signals = build_playlist(
        scores,
        unheard,
        wildcards,
        unheard_ratio,
        user_id,
        explicit_filter,
        size
    )

    stored_playlist_id = getPlaylistId(user_id)
    name = PLAYLIST_NAME.format(user_id)

    if stored_playlist_id and stored_playlist_id != "no users/playlist id":
        url = (
            build_url_for_user("updatePlaylist", user_id, password)
            + f"&playlistId={stored_playlist_id}"
        )

        data = [("songIdToAdd", sid) for sid in playlist]
        print(
            f"[TuneLog] Appending {len(playlist)} songs to playlist {stored_playlist_id} for {user_id}"
        )
    else:

        url = build_url_for_user("createPlaylist", user_id, password) + f"&name={name}"
        data = [("songId", sid) for sid in playlist]
        print(
            f"[TuneLog] No ID found. Creating new playlist for {user_id} instead of appending."
        )

    try:
        r = requests.post(url, data=data).json()
        if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
            error = (
                r.get("subsonic-response", {})
                .get("error", {})
                .get("message", "Unknown error")
            )

            print(f"[ERROR] Append failed: {error}")

            if stored_playlist_id and "not found" in error.lower():
                print(f"[TuneLog] Playlist {stored_playlist_id} missing --> restoring from DB")

                conn = get_db_connection_playlist()
                rows = conn.execute(
                "SELECT song_id FROM playlist WHERE username = ?",
                (user_id,),
                ).fetchall()
                conn.close()

                old_song_ids = [row[0] for row in rows]

                combined_song_ids = list(dict.fromkeys(old_song_ids + playlist))

                create_url = build_url_for_user("createPlaylist", user_id, password) + f"&name={name}"
                create_data = [("songId", sid) for sid in combined_song_ids]

                r2 = requests.post(create_url, data=create_data).json()

                if "subsonic-response" not in r2 or r2["subsonic-response"]["status"] == "failed":
                    print("[ERROR] Failed to restore playlist")
                    return False

        new_id = r2["subsonic-response"]["playlist"]["id"]

        conn_usr = get_db_connection_usr()
        conn_usr.execute(
            "UPDATE user SET playlistId = ? WHERE username = ?",
            (new_id, user_id),
        )
        conn_usr.commit()
        conn_usr.close()

        print(f"[TuneLog] Playlist restored with ID {new_id}")

    
        if not stored_playlist_id or stored_playlist_id == "no users/playlist id":
            new_id = r["subsonic-response"]["playlist"]["id"]
            conn_usr = get_db_connection_usr()
            conn_usr.execute(
                "UPDATE user SET playlistId = ? WHERE username = ?", (new_id, user_id)
            )
            conn_usr.commit()
            conn_usr.close()
            print(f"[TuneLog] New playlist ID {new_id} saved to user DB.")
    except Exception as e:
        print(f"[ERROR] Navidrome communication failed: {e}")
        return False


    conn_lib = get_db_connection_lib()
    placeholders = ",".join("?" * len(playlist))
    rows = conn_lib.execute(
        f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
        playlist,
    ).fetchall()
    conn_lib.close()

    lib_data = {row[0]: row for row in rows}
    conn = get_db_connection_playlist()

    insert_data = []
    for sid in playlist:
        row = lib_data.get(sid)
        if row:
            insert_data.append(
                (
                    user_id,
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    song_signals.get(sid, "unheard"),
                    row[4],
                )
            )


    conn.executemany(
        """
        INSERT OR IGNORE INTO playlist (username, song_id, title, artist, genre, signal, explicit)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        insert_data,
    )
    conn.commit()
    conn.close()

    print(f"[TuneLog] Append successful for {user_id}")
    return True


if __name__ == "__main__":
    # main()
    print("in main statment of playlist generation")


# COMMENTED OUT SO THAT IT WONT RUN AT START UP, IF IT WORKS IT WILL RESET THE PLAYLIST THEN WHAT IS THE MEANING OF APPEND


# def main():
#     users = get_all_users()

#     for user_id in users:
#         print(f"[TuneLog] Building playlist for {user_id}...")
#         scores = score_song(user_id)
#         unheard, unheard_ratio = get_unheard_songs(scores)
#         wildcards = get_wildcard_songs(scores, user_id)
#         playlist, song_signals = build_playlist(
#             scores,
#             unheard,
#             wildcards,
#             unheard_ratio,
#             user_id,
#             explicit_filter="allow_cleaned",
#         )
#         push_playlist(playlist, user_id, song_signals)


# VERSION 1 OF PUSH PLAYLIST FUNCTION

# def push_playlist(song_ids, user_id, song_signals):
#     USER_CREDENTIALS = getAllUser()
#     name = PLAYLIST_NAME.format(user_id)
#     password = USER_CREDENTIALS.get(user_id)
#     playlist_id = getPlaylistId(user_id)
#     if not password:
#         print(f"[TuneLog] No credentials found for {user_id}, skipping")
#         return

#     r = requests.get(build_url_for_user("getPlaylists", user_id, password)).json()
#     playlists = r["subsonic-response"]["playlists"].get("playlist", [])

#     # for pl in playlists:
#     #     if pl["name"] == name:
#     #         requests.get(
#     #             build_url_for_user("deletePlaylist", user_id, password)
#     #             + f"&id={pl['id']}"
#     #         )
#     #         break

# # http://<your-navidrome-url>/rest/createPlaylist.view?u=<user>&p=<pass>&v=1.16.1&c=TuneLog&f=json&playlistId=<stored_playlist_id>&songId=<id1>&songId=<id2>&songId=<id3>


#     url = build_url_for_user("createPlaylist", user_id, password) + f"&name={name} "
#     data = [("songId", sid) for sid in song_ids]
#     r = requests.post(url, data=data).json()

#     new_id = r["subsonic-response"]["playlist"]["id"]
#     requests.get(
#         build_url_for_user("updatePlaylist", user_id, password)
#         + f"&playlistId={new_id}&public=false"
#     )

#     print(f"[TuneLog] Playlist pushed for {user_id} — {len(song_ids)} songs")

#     conn_lib = get_db_connection_lib()
#     placeholders = ",".join("?" * len(song_ids))
#     rows = conn_lib.execute(
#         f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
#         song_ids,
#     ).fetchall()
#     conn_lib.close()

#     conn = get_db_connection_playlist()
#     cursor = conn.cursor()
#     cursor.execute("DELETE FROM playlist WHERE username = ?", (user_id,))
#     cursor.executemany(
#         """
#         INSERT INTO playlist (username, song_id, title, artist, genre, signal, explicit)
#         VALUES (?, ?, ?, ?, ?, ?, ?)
#         """,
#         [
#             (
#                 user_id,
#                 row[0],
#                 row[1],
#                 row[2],
#                 row[3],
#                 song_signals.get(row[0]) or "unheard",
#                 row[4],
#             )
#             for row in rows
#         ],
#     )
#     conn.commit()
#     conn.close()
#     print(f"[TuneLog] Playlist saved to DB for {user_id} — {len(rows)} songs")


# INITIAL DRAFT

# def append_playlist(song_ids, user_id, song_signals):
#     USER_CREDENTIALS = getAllUser()
#     password = USER_CREDENTIALS.get(user_id)
#     stored_playlist_id = getPlaylistId(user_id)

#     if not password or not stored_playlist_id:
#         print(
#             f"[TuneLog] Cannot append: Missing credentials or playlist ID for {user_id}"
#         )
#         return False

#     # 1. Navidrome API: updatePlaylist with songIdToAdd
#     # This appends to the end of the existing playlist
#     url = (
#         build_url_for_user("updatePlaylist", user_id, password)
#         + f"&playlistId={stored_playlist_id}"
#     )

#     # Navidrome expects 'songIdToAdd' for appending
#     data = [("songIdToAdd", sid) for sid in song_ids]

#     try:
#         r = requests.post(url, data=data).json()
#         if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
#             print(f"[ERROR] Navidrome append failed")
#             return False

#         print(f"[TuneLog] Appended {len(song_ids)} songs to Navidrome for {user_id}")

#     except Exception as e:
#         print(f"[ERROR] Append request failed: {e}")
#         return False

#     # 2. Update local playlist.db (Add to existing instead of DELETE)
#     conn_lib = get_db_connection_lib()
#     placeholders = ",".join("?" * len(song_ids))
#     rows = conn_lib.execute(
#         f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
#         song_ids,
#     ).fetchall()
#     conn_lib.close()

#     lib_data = {row[0]: row for row in rows}
#     conn = get_db_connection_playlist()
#     cursor = conn.cursor()

#     insert_data = []
#     for sid in song_ids:
#         row = lib_data.get(sid)
#         if row:
#             insert_data.append(
#                 (
#                     user_id,
#                     row[0],
#                     row[1],
#                     row[2],
#                     row[3],
#                     song_signals.get(sid, "unheard"),
#                     row[4],
#                 )
#             )

#     # We use INSERT OR IGNORE to prevent Primary Key errors if a song is already there
#     cursor.executemany(
#         """
#         INSERT OR IGNORE INTO playlist (username, song_id, title, artist, genre, signal, explicit)
#         VALUES (?, ?, ?, ?, ?, ?, ?)
#         """,
#         insert_data,
#     )
#     conn.commit()
#     conn.close()
#     print(f"[TuneLog] Local playlist.db updated (appended {len(insert_data)} rows)")
#     return True


## for user mismatch, two condition user database has less user then lib, it will flag and tell user to add that user via web ui
# if user database has higher them it will tell which user has not listened to musci


# def push_playlist(song_ids, user_id, song_signals , playname = None , newPlaylist = False):
#     USER_CREDENTIALS = getAllUser()
#     password = USER_CREDENTIALS.get(user_id)
#     final_playlist_id = None

#     if not password:
#         print(f"[TuneLog] No credentials found for {user_id}, skipping")
#         return

#     stored_playlist_id = getPlaylistId(user_id)
#     if playname:
#         name = playname
#     else:
#         name = PLAYLIST_NAME.format(user_id)

#     base_url = build_url_for_user("createPlaylist", user_id, password)
#     if stored_playlist_id and stored_playlist_id != "no users/playlist id":
#         url = f"{base_url}&playlistId={stored_playlist_id}"
#         print(
#             f"[TuneLog] Updating existing playlist {stored_playlist_id} for {user_id}"
#         )
#     else:
#         url = f"{base_url}&name={name}"
#         print(f"[TuneLog] Creating new playlist for {user_id}")

#     data = [("songId", sid) for sid in song_ids]
#     try:
#         r = requests.post(url, data=data).json()

#         if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
#             error = (
#                 r.get("subsonic-response", {})
#                 .get("error", {})
#                 .get("message", "Unknown error")
#             )
#             print(f"[ERROR] Navidrome API failed: {error}")

#             if stored_playlist_id:
#                 print(f"[TuneLog] Playlist {stored_playlist_id} missing ---> recreating...")

#                 new_id = createPlaylistIfDeleteByNavidrome(base_url, name, data, user_id)

#                 if not new_id:
#                     return

#                 final_playlist_id = new_id

#             else:
#                 return

#         else:
#             final_playlist_id = r["subsonic-response"]["playlist"]["id"]

#         # if not stored_playlist_id or stored_playlist_id == "no users/playlist id":
#         if final_playlist_id != stored_playlist_id:
#             conn_usr = get_db_connection_usr()
#             conn_usr.execute(
#                 "UPDATE user SET playlistId = ? WHERE username = ?", (final_playlist_id, user_id)
#             )
#             conn_usr.commit()
#             conn_usr.close()
#             print(f"[TuneLog] Saved new playlist ID {final_playlist_id} to database for {user_id}")

#         requests.get(
#             build_url_for_user("updatePlaylist", user_id, password)
#             + f"&playlistId={final_playlist_id}&public=false"
#         )

#     except Exception as e:
#         print(f"[ERROR] Failed to push playlist: {e}")
#         return

#     print(f"[TuneLog] Syncing {len(song_ids)} songs to local playlist.db...")
#     conn_lib = get_db_connection_lib()
#     placeholders = ",".join("?" * len(song_ids))
#     rows = conn_lib.execute(
#         f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
#         song_ids,
#     ).fetchall()
#     conn_lib.close()

#     lib_data = {row[0]: row for row in rows}

#     conn = get_db_connection_playlist()
#     cursor = conn.cursor()
#     cursor.execute("DELETE FROM playlist WHERE username = ?", (user_id,))

#     insert_data = []
#     for sid in song_ids:
#         row = lib_data.get(sid)
#         if row:
#             insert_data.append(
#                 (
#                     user_id,
#                     row[0],  # song_id
#                     row[1],  # title
#                     row[2],  # artist
#                     row[3],  # genre
#                     song_signals.get(sid, "unheard"),
#                     row[4],  # explicit
#                 )
#             )


#     cursor.executemany(
#         """
#         INSERT INTO playlist (username, song_id, title, artist, genre, signal, explicit)
#         VALUES (?, ?, ?, ?, ?, ?, ?)
#         """,
#         insert_data,
#     )
#     conn.commit()
#     conn.close()
#     print(f"[TuneLog] Success: Playlist fully synced for {user_id}")
