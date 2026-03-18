# build playlist depending on user interaction
# song that user havent listened in 60 days, gets a chance in playlist


from datetime import datetime
import requests
import random
from db import get_db_connection, get_db_connection_lib, init_db, init_db_lib
from config import build_url, build_url_for_user, USER_CREDENTIALS

PLAYLIST_NAME = "Tunelog - {}"  # {} filled with user_id
PLAYLIST_SIZE = 50
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

        days_since = (datetime.now() - datetime.fromisoformat(timestamp)).days
        recency = 1 / (days_since + 1)
        weight = SIGNAL_WEIGHTS.get(signal, 0)
        contribution = weight * recency

        if song_id not in scores:
            scores[song_id] = []
        scores[song_id].append(contribution)

    return {
        song_id: sum(contribs) / len(contribs) for song_id, contribs in scores.items()
    }

# ── Genre Injection ───────────────────────────────────────────────────────────


def get_genre_distribution(user_id):
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT genre, COUNT(*) as cnt FROM listens WHERE user_id = ? GROUP BY genre ORDER BY cnt DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    # returns [("Bollywood", 60), ("Bhangra", 25), ...]
    return [(row[0], row[1]) for row in rows if row[0]]  # filter out NULL genres


def get_unheard_by_genre(heard_ids, genre, limit):
    if not heard_ids:
        placeholders = "SELECT NULL WHERE 1=0"  # empty fallback
        params = (genre,)
    else:
        placeholders = ",".join("?" * len(heard_ids))
        params = (genre, *heard_ids)

    conn = get_db_connection_lib()
    rows = conn.execute(
        f"SELECT song_id FROM library WHERE genre = ? AND song_id NOT IN ({placeholders})",
        params,
    ).fetchall()
    conn.close()
    return [r[0] for r in rows][:limit]


def get_unheard_by_genre_weighted(heard_ids, genre_distribution, total_slots):
    if not genre_distribution or total_slots <= 0:
        return []

    total_listens = sum(cnt for _, cnt in genre_distribution)
    result = []

    for genre, cnt in genre_distribution:
        # how many slots this genre gets proportional to listen count
        genre_slots = round((cnt / total_listens) * total_slots)
        if genre_slots <= 0:
            continue
        songs = get_unheard_by_genre(heard_ids, genre, genre_slots)
        result += songs

    return result


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
        days_since = (datetime.now() - datetime.fromisoformat(last_played)).days
        if days_since >= WILDCARD_DAY and scores.get(song_id, 0) > 0:
            wildcards.append(song_id)

    return wildcards


def weighted_sample(pool, scores, k):
    if not pool or k <= 0:
        return []
    k = min(k, len(pool))
    weights = [max(scores.get(sid, 0.01), 0.01) for sid in pool]
    return random.choices(pool, weights=weights, k=k)


def build_playlist(scores, unheard, wildcards, unheard_ratio, user_id):
    n = PLAYLIST_SIZE

    unheard_pct = min(0.35, unheard_ratio)
    wildcard_pct = 0.08
    remaining = 1 - unheard_pct - wildcard_pct

    slots = {
        "unheard": int(n * unheard_pct),
        "wildcard": int(n * wildcard_pct),
        "positive": int(n * remaining * 0.35),
        "repeat": int(n * remaining * 0.35),
        "partial": int(n * remaining * 0.20),
        "skip": int(n * remaining * 0.10),
    }

    def by_signal(signal):
        conn = get_db_connection()
        rows = conn.execute(
            "SELECT DISTINCT song_id FROM listens WHERE signal = ? AND user_id = ?",
            (signal, user_id),
        ).fetchall()
        conn.close()
        return [r[0] for r in rows]

    # ── genre injection replaces random unheard sample ──
    heard_ids = set(scores.keys())
    genre_distribution = get_genre_distribution(user_id)
    genre_unheard = get_unheard_by_genre_weighted(
        heard_ids, genre_distribution, slots["unheard"]
    )

    # fallback to pure random if genre injection doesn't fill the slot
    if len(genre_unheard) < slots["unheard"]:
        remaining_count = slots["unheard"] - len(genre_unheard)
        already_picked = set(genre_unheard)
        leftover = [s for s in unheard if s not in already_picked]
        genre_unheard += random.sample(leftover, min(remaining_count, len(leftover)))
    # ────────────────────────────────────────────────────

    playlist = []
    playlist += genre_unheard  # ← was random.sample(unheard, ...)
    playlist += weighted_sample(wildcards, scores, slots["wildcard"])
    playlist += weighted_sample(by_signal("positive"), scores, slots["positive"])
    playlist += weighted_sample(by_signal("repeat"), scores, slots["repeat"])
    playlist += weighted_sample(by_signal("partial"), scores, slots["partial"])
    playlist += weighted_sample(by_signal("skip"), scores, slots["skip"])

    seen = set()
    unique = []
    for song_id in playlist:
        if song_id not in seen:
            seen.add(song_id)
            unique.append(song_id)

    random.shuffle(unique)
    return unique[:n]


def push_playlist(song_ids, user_id):
    name = PLAYLIST_NAME.format(user_id)
    password = USER_CREDENTIALS.get(user_id)

    if not password:
        print(f"[TuneLog] No credentials found for {user_id}, skipping")
        return

    # use user-specific URL for all calls
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


def get_all_users():
    conn = get_db_connection()
    rows = conn.execute("SELECT DISTINCT user_id FROM listens").fetchall()
    conn.close()
    return [row[0] for row in rows]


def main():
    users = get_all_users()  # dynamically pulls all known users from DB

    for user_id in users:
        print(f"[TuneLog] Building playlist for {user_id}...")
        scores = score_song(user_id)
        unheard, unheard_ratio = get_unheard_songs(scores)
        wildcards = get_wildcard_songs(scores, user_id)
        playlist = build_playlist(scores, unheard, wildcards, unheard_ratio, user_id)
        push_playlist(playlist, user_id)


if __name__ == "__main__":
    main()
