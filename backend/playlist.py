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


#implementation : explict song filter
# input from frontend, if they want explict or cleaned or all









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


from datetime import datetime
import requests
import random
from db import get_db_connection, get_db_connection_lib, get_db_connection_usr , get_db_connection_playlist
from config import build_url, build_url_for_user, getAllUser

PLAYLIST_NAME = "Tunelog - {}"  # {} filled with user_id
PLAYLIST_SIZE = 40
WILDCARD_DAY = 60

SIGNAL_WEIGHTS = {
    "repeat": 3,
    "positive": 2,
    "partial": 1,
    "skip": -2,
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
    scored = {}  # song_id → points

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
                pts = len(song_genre.split(",")) * 2  # 2pts per genre tag

            if song_id not in scored:
                scored[song_id] = pts
            else:
                scored[song_id] += pts  # song matched multiple genre pools

    # sort by points descending, return top total_slots
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


def build_playlist(
    scores, unheard, wildcards, unheard_ratio, user_id, explicit_filter="allow_cleaned"  , n = PLAYLIST_SIZE):
    # n = PLAYLIST_SIZE
    playlist_ids = []
    seen_ids = set()
    added_count = 0
    song_signals = {}

    allowed_ids = get_allowed_song_ids(explicit_filter)

    unheard_pct = min(0.35, unheard_ratio)
    wildcard_pct = 0.08
    remaining = 1 - unheard_pct - wildcard_pct

    slots = {
        "unheard": max(1, round(n * unheard_pct)),
        "wildcard": max(1, round(n * wildcard_pct)),
        "positive": max(1, round(n * remaining * 0.35)),
        "repeat": max(1, round(n * remaining * 0.35)),
        "partial": max(1, round(n * remaining * 0.20)),
        "skip": max(1, round(n * remaining * 0.10)),
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
            if r[0] in allowed_ids  # filter here too
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


def push_playlist(song_ids, user_id, song_signals):
    USER_CREDENTIALS = getAllUser()
    name = PLAYLIST_NAME.format(user_id)
    password = USER_CREDENTIALS.get(user_id)

    if not password:
        print(f"[TuneLog] No credentials found for {user_id}, skipping")
        return

    r = requests.get(build_url_for_user("getPlaylists", user_id, password)).json()
    playlists = r["subsonic-response"]["playlists"].get("playlist", [])

    for pl in playlists:
        if pl["name"] == name:
            requests.get(
                build_url_for_user("deletePlaylist", user_id, password)
                + f"&id={pl['id']}"
            )
            break

    url = build_url_for_user("createPlaylist", user_id, password) + f"&name={name}"
    data = [("songId", sid) for sid in song_ids]
    r = requests.post(url, data=data).json()

    new_id = r["subsonic-response"]["playlist"]["id"]
    requests.get(
        build_url_for_user("updatePlaylist", user_id, password)
        + f"&playlistId={new_id}&public=false"
    )

    print(f"[TuneLog] Playlist pushed for {user_id} — {len(song_ids)} songs")

    conn_lib = get_db_connection_lib()
    placeholders = ",".join("?" * len(song_ids))
    rows = conn_lib.execute(
        f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
        song_ids,
    ).fetchall()
    conn_lib.close()

    conn = get_db_connection_playlist()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM playlist WHERE username = ?", (user_id,))
    cursor.executemany(
        """
        INSERT INTO playlist (username, song_id, title, artist, genre, signal, explicit)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                user_id,
                row[0],
                row[1],
                row[2],
                row[3],
                song_signals.get(row[0]) or "unheard",
                row[4],
            )
            for row in rows
        ],
    )
    conn.commit()
    conn.close()
    print(f"[TuneLog] Playlist saved to DB for {user_id} — {len(rows)} songs")


## for user mismatch, two condition user database has less user then lib, it will flag and tell user to add that user via web ui
# if user database has higher them it will tell which user has not listened to musci

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
            print(f"  → {u} — log this user via the Web UI to generate their playlist")

    inactive = registered_users - listening_users
    if inactive:
        print(f"[INFO] These users are registered but have no listen history yet:")
        for u in inactive:
            print(f"  → {u}")

    valid_users = registered_users & listening_users
    return list(valid_users)


def main():
    users = get_all_users()

    for user_id in users:
        print(f"[TuneLog] Building playlist for {user_id}...")
        scores = score_song(user_id)
        unheard, unheard_ratio = get_unheard_songs(scores)
        wildcards = get_wildcard_songs(scores, user_id)
        playlist, song_signals = build_playlist(
            scores,
            unheard,
            wildcards,
            unheard_ratio,
            user_id,
            explicit_filter="allow_cleaned",
        )
        push_playlist(playlist, user_id, song_signals)


if __name__ == "__main__":
    main()
