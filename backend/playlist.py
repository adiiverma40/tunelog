from datetime import datetime, datetime, timedelta, timezone
import requests
import random
import heapq
from rich.console import Console
from rich.table import Table


from genre import readJson as readJSON

from misc import (
    log,
    log_scores,
    log_slot,
    log_wildcard,
    log_genre_injection,
    log_pool,
    log_summary,
)


import json
from db import (
    get_db_connection,
    get_db_connection_lib,
    get_db_connection_usr,
    get_db_connection_playlist,
    DB_PATH_LOG,
)
from config import build_url, build_url_for_user, getAllUser
from state import notification_status, tune_config
import re

pat = DB_PATH_LOG

console = Console(log_path=False, log_time=False)

PLAYLIST_SIZE = tune_config["playlist_generation"]["playlist_size"]
WILDCARD_DAY = tune_config["playlist_generation"]["wildcard_day"]

SIGNAL_WEIGHTS = tune_config["playlist_generation"]["signal_weights"]
slotsValue = tune_config["playlist_generation"]["slot_ratios"]


PLAYLIST_NAME = "Tunelog - {}"


def signalWeights(weights: dict):
    global SIGNAL_WEIGHTS
    SIGNAL_WEIGHTS = {
        "repeat": weights.get("repeat", 3),
        "positive": weights.get("positive", 2),
        "partial": weights.get("partial", 0),
        "skip": weights.get("skip", -2),
    }


def songSlots(values):
    global slotsValue
    slotsValue = {
        "positive": values["positive"],
        "repeat": values["repeat"],
        "partial": values["partial"],
        "skip": values["skip"],
    }


def getDataFromDb():
    conn_lib = get_db_connection_lib()
    conn_hist = get_db_connection()
    cursor_lib = conn_lib.cursor()
    cursor_hist = conn_hist.cursor()

    libraryData = cursor_lib.execute("SELECT * FROM library").fetchall()
    historyData = cursor_hist.execute("SELECT * FROM listens").fetchall()

    library = {
        row[0]: {
            "title": row[1],
            "artist": row[2],
            "album": row[3],
            "genre": row[4],
            "explicit": row[10],
            "created": row[11],
        }
        for row in libraryData
    }

    history = {}
    for row in historyData:
        sid = row[1]
        if sid not in history:
            history[sid] = []

        history[sid].append(
            {
                "id": row[0],
                "title": row[2],
                "artist": row[3],
                "album": row[4],
                "genre": row[5],
                "signal": row[9],
                "timestamp": row[10],
                "user_id": row[11],
            }
        )

    for sid in history:
        history[sid].sort(key=lambda x: x["timestamp"], reverse=True)

    return library, history


def score_batch(user_id, song_ids, history_dict):
    scores = {}
    for sid in song_ids:
        song_history = history_dict.get(sid, [])
        user_listens = [h for h in song_history if h["user_id"] == user_id][:20]

        if not user_listens:
            continue

        scores[sid] = {"score": 0, "signal": None}
        listen_count = 0
        for record in user_listens:
            signal = record["signal"]
            signal_weight = SIGNAL_WEIGHTS.get(signal, 0)
            listen_count += 1

            if listen_count <= 3:
                signal_weight *= 2

            scores[sid]["score"] += signal_weight
            scores[sid]["signal"] = signal

    return scores


def score_song(user_id, library_dict, history_dict):
    user_songs_latest = []
    for sid, listens in history_dict.items():
        user_listens = [l for l in listens if l["user_id"] == user_id]
        if user_listens:
            latest_id = max(l["id"] for l in user_listens)
            user_songs_latest.append((sid, latest_id))

    if not user_songs_latest:
        return {}

    user_songs_latest.sort(key=lambda x: x[1], reverse=True)

    user_song_ids = [sid for sid, max_id in user_songs_latest[: PLAYLIST_SIZE * 3]]

    scores = {}
    signal_contributions = {}

    for sid in user_song_ids:
        listens = [l for l in history_dict.get(sid, []) if l["user_id"] == user_id]

        listens.sort(key=lambda x: x["id"], reverse=True)
        listens = listens[:20]
        listens.sort(key=lambda x: x["id"])

        if not listens:
            continue

        scores[sid] = {"score": 0, "signal": None}
        signal_contributions[sid] = {}
        listen_count = 0

        for record in listens:
            signal = record["signal"]
            signal_weight = SIGNAL_WEIGHTS.get(signal, 0)

            listen_count += 1
            multiplier = 2 if listen_count <= 3 else 1
            weighted = signal_weight * multiplier

            scores[sid]["score"] += weighted
            scores[sid]["signal"] = signal
            signal_contributions[sid][signal] = (
                signal_contributions[sid].get(signal, 0) + weighted
            )

    for sid in scores:
        contribs = signal_contributions[sid]
        positive_contribs = {s: v for s, v in contribs.items() if v > 0}

        if positive_contribs:
            scores[sid]["dominant_signal"] = max(
                positive_contribs, key=positive_contribs.get
            )
        elif contribs:
            scores[sid]["dominant_signal"] = max(contribs, key=contribs.get)
        else:
            scores[sid]["dominant_signal"] = scores[sid]["signal"]

    titles = {sid: library_dict[sid]["title"] for sid in scores if sid in library_dict}
    log_scores(user_id, scores, signal_contributions, titles)

    return scores


def fill_slots(scores, slots, slot_sizes, allowed_songs=None, user_id="unknown"):
    for song_id, data in scores.items():
        score = data["score"]
        target_slot = data.get("dominant_signal") or data["signal"]
        title = (
            allowed_songs.get(song_id, "Unknown Title")
            if allowed_songs
            else "Unknown Title"
        )

        if score < 0 or target_slot is None:
            log_slot(
                user_id,
                song_id,
                title,
                score,
                target_slot or "none",
                False,
                "score_negative_or_no_signal",
            )
            continue

        if allowed_songs is not None and song_id not in allowed_songs:
            log_slot(
                user_id, song_id, title, score, target_slot, False, "not_in_allowed_ids"
            )
            continue

        if target_slot not in slots:
            log_slot(
                user_id, song_id, title, score, target_slot, False, "slot_not_found"
            )
            continue

        max_size = slot_sizes[target_slot]
        heap = slots[target_slot]

        if len(heap) < max_size:
            heapq.heappush(heap, (score, song_id))
            log_slot(user_id, song_id, title, score, target_slot, True, "accepted")
        else:
            if score > heap[0][0]:
                heapq.heapreplace(heap, (score, song_id))
                log_slot(
                    user_id, song_id, title, score, target_slot, True, "replaced_min"
                )
            else:
                log_slot(
                    user_id,
                    song_id,
                    title,
                    score,
                    target_slot,
                    False,
                    "slot_full_low_score",
                )


def get_translation_maps(genre_json):
    alias_to_cat = {}
    for category, aliases in genre_json.items():
        for alias in aliases:
            alias_to_cat[alias.lower()] = category.lower()
        alias_to_cat[category.lower()] = category.lower()
    return alias_to_cat


def analyze_user_ratios(user_id, history_dict, alias_to_cat):
    cat_counts = {}
    artist_counts = {}

    for sid, listens in history_dict.items():
        for l in listens:
            if l["user_id"] != user_id:
                continue

            raw_genres = l.get("genre", "")
            if raw_genres:
                genres = [g.strip().lower() for g in raw_genres.split(",") if g.strip()]
                for g in genres:
                    clean_cat = alias_to_cat.get(g, g)
                    cat_counts[clean_cat] = cat_counts.get(clean_cat, 0) + 1
            else:
                cat_counts["unknown"] = cat_counts.get("unknown", 0) + 1

            raw_artists = l.get("artist", "")
            if raw_artists:
                artists = [a.strip() for a in raw_artists.split(",")]
                for a in artists:
                    artist_counts[a] = artist_counts.get(a, 0) + 1

    return cat_counts, artist_counts


def fill_genre_slots(target_counts, library_dict, heard_ids, alias_to_cat):
    playlist = []
    unheard_pool = []

    for sid, info in library_dict.items():
        if sid in heard_ids:
            continue

        raw_genres = info.get("genre", "")
        if raw_genres:
            clean_genres = [
                g.strip().lower() for g in raw_genres.split(",") if g.strip()
            ]
            mapped_cats = {alias_to_cat.get(g, g) for g in clean_genres}
        else:
            mapped_cats = {"unknown"}

        priority = len(mapped_cats.intersection(target_counts.keys()))
        unheard_pool.append({"id": sid, "cats": mapped_cats, "priority": priority})

    random.shuffle(unheard_pool)
    unheard_pool.sort(key=lambda x: x["priority"], reverse=True)

    unknowns = [s for s in unheard_pool if "unknown" in s["cats"]][:2]
    playlist.extend([s["id"] for s in unknowns])
    for s in unknowns:
        unheard_pool.remove(s)

    for song in unheard_pool:
        matches = [c for c in song["cats"] if target_counts.get(c, 0) > 0]
        if matches:
            playlist.append(song["id"])
            for m in matches:
                target_counts[m] -= 1

    return playlist


def fill_artist_slots(artist_ratios, library_dict, heard_ids, playlist_ids, limit):
    sorted_artists = sorted(artist_ratios.items(), key=lambda x: x[1], reverse=True)

    artist_playlist = []
    current_heard = set(heard_ids) | set(playlist_ids)

    for artist, count in sorted_artists:
        if len(artist_playlist) >= limit:
            break

        for sid, info in library_dict.items():
            if sid in current_heard:
                continue
            song_artists = [a.strip() for a in info.get("artist", "").split(",")]

            if artist in song_artists:
                artist_playlist.append(sid)
                current_heard.add(sid)
                break

    return artist_playlist


def get_unheard_songs(library_dict, user_id, type="blend"):
    conn_hist = get_db_connection()
    heard_rows = conn_hist.execute(
        "SELECT DISTINCT song_id FROM listens WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn_hist.close()
    all_ids_set = set(library_dict.keys())
    heard_ids = {row[0] for row in heard_rows}
    unheard_set = all_ids_set - heard_ids
    unheard_ratio = len(unheard_set) / len(all_ids_set) if all_ids_set else 0
    unheard = list(unheard_set)
    if type == "discovery":
        unheard.sort(
            key=lambda sid: library_dict[sid].get("created") or "", reverse=True
        )
    else:
        random.shuffle(unheard)

    return unheard, unheard_ratio, heard_ids


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
        song_score = scores.get(song_id, {}).get("score", 0)

        if days_since >= WILDCARD_DAY and song_score > 0:
            wildcards.append(song_id)
    return wildcards


def weighted_sample(pool, scores, k):
    if not pool or k <= 0:
        return []
    k = min(k, len(pool))
    weights = [max(scores.get(sid, 0.01), 0.01) for sid in pool]
    selected = []
    seen = set()
    pool_copy = list(pool)
    weights_copy = list(weights)
    for _ in range(k):
        if not pool_copy:
            break
        chosen = random.choices(pool_copy, weights=weights_copy, k=1)[0]
        idx = pool_copy.index(chosen)
        if chosen not in seen:
            selected.append(chosen)
            seen.add(chosen)
        pool_copy.pop(idx)
        weights_copy.pop(idx)
    return selected


def get_allowed_songs(explicit_filter: str) -> dict:
    conn = get_db_connection_lib()
    if explicit_filter == "strict":
        rows = conn.execute(
            "SELECT song_id, title FROM library WHERE explicit = 'notExplicit'"
        ).fetchall()
    elif explicit_filter == "allow_cleaned":
        rows = conn.execute(
            "SELECT song_id, title FROM library WHERE explicit IN ('notExplicit', 'cleaned', 'notInItunes')"
        ).fetchall()
    else:
        rows = conn.execute("SELECT song_id, title FROM library").fetchall()
    conn.close()
    return {row[0]: row[1] for row in rows}


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


def createPlaylistIfDeleteByNavidrome(base_url, name, data, user_id):
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
            "UPDATE user SET playlistId = ? WHERE username = ?", (new_id, user_id)
        )
        conn_usr.commit()
        conn_usr.close()

        print(f"[TuneLog] Recreated playlist with new ID {new_id}")
        return new_id
    except Exception as e:
        print(f"[ERROR] Failed to recreate playlist: {e}")
        return


signal_color = {
    "repeat": "green",
    "positive": "cyan",
    "partial": "yellow",
    "skip": "red",
    "wildcard": "magenta",
    "unheard": "blue",
}


def _log_selection_table(
    title: str,
    song_ids: list,
    scores: dict,
    allowed_songs: dict,
    song_signals: dict,
):
    if not song_ids:
        return
    sig_colors = signal_color

    table = Table(title=title, show_header=True)
    table.add_column("#", style="dim", width=4)
    table.add_column("Song", min_width=20, max_width=35)
    table.add_column("Signal", width=10)
    table.add_column("Score", justify="right", width=7)

    for i, sid in enumerate(song_ids, 1):
        name = allowed_songs.get(sid, "Unknown")
        name = name if len(name) <= 32 else name[:29] + "..."
        signal = song_signals.get(sid, "?")
        score = round(scores.get(sid, {}).get("score", 0), 2)
        sig_color = sig_colors.get(signal, "white")
        table.add_row(
            str(i),
            name,
            f"[{sig_color}]{signal}[/{sig_color}]",
            str(score),
        )

    console.print(table)


def build_playlist(
    library,
    history,
    scores,
    unheard,
    wildcards,
    unheard_ratio,
    all_time_heard,
    user_id,
    explicit_filter,
    size,
    injection=True,
):
    allowed_songs = get_allowed_songs(explicit_filter)
    song_signals = {}
    breakdown = tune_config["playlist_generation"]["injection_breakdown"]

    if injection:
        signal_size = round(size * breakdown["signal"])
        unheard_size = round(size * breakdown["unheard"])
        wildcard_size = round(size * breakdown["wildcard"])
    else:
        signal_size = size
        unheard_size = 0
        wildcard_size = 0

    slot_sizes = {
        signal: max(1, round(ratio * signal_size))
        for signal, ratio in slotsValue.items()
    }
    slots = {signal: [] for signal in slotsValue}

    fill_slots(scores, slots, slot_sizes, allowed_songs, user_id=user_id)

    signal_songs = []
    for signal, heap in slots.items():
        for score, song_id in heap:
            signal_songs.append(song_id)
            song_signals[song_id] = scores.get(song_id, {}).get(
                "dominant_signal", signal
            )

    for sid in signal_songs:
        log_pool(
            user_id,
            "signal_slot",
            sid,
            allowed_songs.get(sid, "Unknown"),
            song_signals.get(sid, "unknown"),
        )

    _log_selection_table(
        f"Signal Slots · {user_id}",
        signal_songs,
        scores,
        allowed_songs,
        song_signals,
    )

    wildcard_songs = []
    if injection:
        wildcard_pool = [
            sid for sid in wildcards if sid in allowed_songs and sid not in song_signals
        ]
        wildcard_songs = weighted_sample(
            wildcard_pool,
            {sid: scores.get(sid, {}).get("score", 1) for sid in wildcard_pool},
            wildcard_size,
        )

        for sid in wildcard_songs:
            song_signals[sid] = "wildcard"
            log_pool(
                user_id,
                "wildcard_random",
                sid,
                allowed_songs.get(sid, "Unknown"),
                "wildcard",
            )
        log_wildcard(user_id, wildcard_pool, wildcard_songs)

    _log_selection_table(
        f"Wildcards · {user_id}",
        wildcard_songs,
        scores,
        allowed_songs,
        song_signals,
    )

    leftover = wildcard_size - len(wildcard_songs)

    genre_songs = []
    if injection:

        heard_so_far = set(song_signals.keys()) | all_time_heard

        adjusted_unheard_size = unheard_size + leftover
        alias_to_cat = get_translation_maps(readJSON())
        cat_counts, artist_counts = analyze_user_ratios(user_id, history, alias_to_cat)

        total_cat_listens = sum(cat_counts.values())
        target_counts = {}
        if total_cat_listens > 0:
            for cat, count in cat_counts.items():
                slots_needed = max(
                    1, round((count / total_cat_listens) * adjusted_unheard_size)
                )
                target_counts[cat] = slots_needed

        genre_playlist = fill_genre_slots(
            target_counts, library, heard_so_far, alias_to_cat
        )

        remaining_slots = adjusted_unheard_size - len(genre_playlist)
        artist_playlist = []
        if remaining_slots > 0:
            artist_playlist = fill_artist_slots(
                artist_counts,
                library,
                heard_so_far,
                set(genre_playlist),
                remaining_slots,
            )

        combined_new_songs = genre_playlist + artist_playlist

        genre_songs = [
            sid
            for sid in combined_new_songs
            if sid in allowed_songs and sid not in heard_so_far
        ][:adjusted_unheard_size]

        for sid in genre_songs:
            song_signals[sid] = "unheard"
            log_pool(
                user_id,
                "genre_artist_injection",
                sid,
                allowed_songs.get(sid, "Unknown"),
                "unheard",
            )

        mock_distribution = sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)
        log_genre_injection(
            user_id, mock_distribution, adjusted_unheard_size, genre_songs
        )

    _log_selection_table(
        f"Unheard / Genre Injection · {user_id}",
        genre_songs,
        scores,
        allowed_songs,
        song_signals,
    )

    seen = set()
    final_ids = []
    for sid in signal_songs + wildcard_songs + genre_songs:
        if sid not in seen:
            seen.add(sid)
            final_ids.append(sid)

    backfill = []
    if len(final_ids) < size:
        needed = size - len(final_ids)
        backfill = [
            sid
            for sid, data in sorted(
                scores.items(), key=lambda x: x[1]["score"], reverse=True
            )
            if sid not in seen
            and sid in allowed_songs
            and data["score"] >= 0
            and data["signal"] != "skip"
        ][:needed]

        for sid in backfill:
            song_signals[sid] = scores[sid]["signal"]
            log_pool(
                user_id,
                "score_backfill",
                sid,
                allowed_songs.get(sid, "Unknown"),
                scores[sid]["signal"],
            )
            final_ids.append(sid)
            seen.add(sid)

    _log_selection_table(
        f"Score Backfill · {user_id}",
        backfill,
        scores,
        allowed_songs,
        song_signals,
    )

    unheard_backfill = []
    if len(final_ids) < size:
        needed = size - len(final_ids)
        remaining_unheard = [
            sid for sid in unheard if sid in allowed_songs and sid not in seen
        ]
        random.shuffle(remaining_unheard)
        unheard_backfill = remaining_unheard[:needed]

        for sid in unheard_backfill:
            song_signals[sid] = "unheard"
            log_pool(
                user_id,
                "unheard_random",
                sid,
                allowed_songs.get(sid, "Unknown"),
                "unheard",
            )
            final_ids.append(sid)
            seen.add(sid)

    _log_selection_table(
        f"Unheard Random Backfill · {user_id}",
        unheard_backfill,
        scores,
        allowed_songs,
        song_signals,
    )

    failsafe_picks = []
    if len(final_ids) < size:
        console.log(
            f"[yellow]Failsafe triggered:[/yellow] {len(final_ids)}/{size}, expanding window..."
        )
        conn = get_db_connection()
        extra_rows = conn.execute(
            "SELECT DISTINCT song_id FROM listens WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, size * 10),
        ).fetchall()
        conn.close()

        extra_ids = [row[0] for row in extra_rows if row[0] not in seen]
        if extra_ids:
            extra_scores = score_batch(user_id, extra_ids, history)
            for sid, data in sorted(
                extra_scores.items(), key=lambda x: x[1]["score"], reverse=True
            ):
                if len(final_ids) >= size:
                    break
                if sid not in seen and sid in allowed_songs and data["score"] >= 0:
                    song_signals[sid] = data["signal"]
                    log_pool(
                        user_id,
                        "failsafe_fallback",
                        sid,
                        allowed_songs.get(sid, "Unknown"),
                        data["signal"],
                    )
                    final_ids.append(sid)
                    seen.add(sid)
                    failsafe_picks.append(sid)

    _log_selection_table(
        f"Failsafe Fallback · {user_id}",
        failsafe_picks,
        scores,
        allowed_songs,
        song_signals,
    )

    final_playlist = final_ids[:size]
    random.shuffle(final_playlist)
    counts = {}
    for sid in final_ids[:size]:
        sig = song_signals.get(sid, "unheard")
        counts[sig] = counts.get(sig, 0) + 1

    table = Table(
        title=f"Playlist · {user_id} · {len(final_ids[:size])} songs", show_header=True
    )
    table.add_column("Type", style="bold")
    table.add_column("Songs", justify="right")

    for sig, count in sorted(counts.items(), key=lambda x: x[1], reverse=True):
        color = signal_color.get(sig, "white")
        table.add_row(f"[{color}]{sig}[/{color}]", str(count))

    console.print(table)
    log_summary(user_id, len(final_ids[:size]), counts)

    return final_ids[:size], song_signals


def appendPlaylist(user_id, password, explicit_filter, size, injection=True):
    library, history = getDataFromDb()
    scores = score_song(user_id, library, history)
    unheard, unheard_ratio, all_time_heard = get_unheard_songs(library, user_id)
    wildcards = get_wildcard_songs(scores, user_id)
    playlist, song_signals = build_playlist(
        library,
        history,
        scores,
        unheard,
        wildcards,
        unheard_ratio,
        all_time_heard,
        user_id,
        explicit_filter,
        size,
        injection,
    )

    stored_playlist_id = getPlaylistId(user_id)
    name = PLAYLIST_NAME.format(user_id)

    if stored_playlist_id and stored_playlist_id != "no users/playlist id":
        url = (
            build_url_for_user("updatePlaylist", user_id, password)
            + f"&playlistId={stored_playlist_id}"
        )
        data = [("songIdToAdd", sid) for sid in playlist]
    else:
        url = build_url_for_user("createPlaylist", user_id, password) + f"&name={name}"
        data = [("songId", sid) for sid in playlist]

    try:
        r = requests.post(url, data=data).json()
        notification_status.playlist.append(
            {"username": user_id, "size": len(data), "type": "append"}
        )
        if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
            error = (
                r.get("subsonic-response", {})
                .get("error", {})
                .get("message", "Unknown error")
            )
            log(
                "error",
                f"Append failed: {error}",
                source="playlist",
                user_id=user_id,
                event="error",
            )
            return False

        if not stored_playlist_id or stored_playlist_id == "no users/playlist id":
            new_id = r["subsonic-response"]["playlist"]["id"]
            conn_usr = get_db_connection_usr()
            conn_usr.execute(
                "UPDATE user SET playlistId = ? WHERE username = ?", (new_id, user_id)
            )
            conn_usr.commit()
            conn_usr.close()
    except Exception as e:
        log(
            "error",
            f"Navidrome communication failed: {e}",
            source="playlist",
            user_id=user_id,
            event="error",
        )
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
        "INSERT OR IGNORE INTO playlist (username, song_id, title, artist, genre, signal, explicit) VALUES (?, ?, ?, ?, ?, ?, ?)",
        insert_data,
    )
    conn.commit()
    conn.close()
    return True


def getPlaylistIds(username: str) -> dict:
    conn = get_db_connection_usr()
    row = conn.execute(
        "SELECT playlistIds FROM user WHERE username = ?", (username,)
    ).fetchone()
    conn.close()
    if row and row[0]:
        try:
            return json.loads(row[0])
        except Exception:
            return {}
    return {}


def getPlaylistIdForType(username: str, playlist_type: str) -> str | None:
    ids = getPlaylistIds(username)
    return ids.get(playlist_type)


def setPlaylistIdForType(username: str, playlist_type: str, playlist_id: str):
    conn = get_db_connection_usr()
    row = conn.execute(
        "SELECT playlistIds FROM user WHERE username = ?", (username,)
    ).fetchone()
    current = {}
    if row and row[0]:
        try:
            current = json.loads(row[0])
        except Exception:
            current = {}
    current[playlist_type] = playlist_id
    conn.execute(
        "UPDATE user SET playlistIds = ? WHERE username = ?",
        (json.dumps(current), username),
    )
    conn.commit()
    conn.close()


def push_playlist(
    song_ids,
    user_id,
    song_signals,
    playname=None,
    newPlaylist=False,
    playlist_type="blend",
):
    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    if not password:
        log(
            "error",
            f"No credentials found for user",
            source="playlist",
            user_id=user_id,
            event="error",
        )
        return

    name = playname if playname else PLAYLIST_NAME.format(user_id)
    stored_id = None

    if not newPlaylist:
        stored_id = getPlaylistIdForType(user_id, playlist_type)
        if not stored_id:
            try:
                fetch_url = build_url_for_user("getPlaylists", user_id, password)
                r_lists = requests.get(fetch_url).json()
                playlists = (
                    r_lists.get("subsonic-response", {})
                    .get("playlists", {})
                    .get("playlist", [])
                )
                for pl in playlists:
                    if pl.get("name") == name:
                        stored_id = pl["id"]
                        setPlaylistIdForType(user_id, playlist_type, stored_id)
                        console.print(
                            f"[yellow]Recovered playlist ID for {user_id}/{playlist_type} via name match[/yellow]"
                        )
                        break
            except Exception as e:
                console.print(f"[red]Name fallback lookup failed: {e}[/red]")

    base_url = build_url_for_user("createPlaylist", user_id, password)
    data = [("songId", sid) for sid in song_ids]

    def _do_create_fresh() -> dict | None:
        try:
            r = requests.post(f"{base_url}&name={name}", data=data).json()
            return r
        except Exception as e:
            log(
                "error",
                f"Failed to create fresh playlist: {e}",
                source="playlist",
                user_id=user_id,
                event="error",
            )
            return None

    if stored_id:
        url = f"{base_url}&playlistId={stored_id}"
    else:
        url = f"{base_url}&name={name}"

    try:
        r = requests.post(url, data=data).json()
        notification_status.playlist.append(
            {"username": user_id, "size": len(data), "type": "regenerate"}
        )

        if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
            error = (
                r.get("subsonic-response", {})
                .get("error", {})
                .get("message", "Unknown error")
            )

            if stored_id and "not found" in error.lower():
                console.print(
                    f"[yellow]Stale playlist ID '{stored_id}' for {user_id}/{playlist_type}. Recreating...[/yellow]"
                )
                setPlaylistIdForType(user_id, playlist_type, "")
                r = _do_create_fresh()
                if r is None:
                    return
                if (
                    "subsonic-response" not in r
                    or r["subsonic-response"]["status"] == "failed"
                ):
                    log(
                        "error",
                        f"Navidrome API failed even after recreate",
                        source="playlist",
                        user_id=user_id,
                        event="error",
                    )
                    return
            else:
                log(
                    "error",
                    f"Navidrome API failed: {error}",
                    source="playlist",
                    user_id=user_id,
                    event="error",
                )
                return

        final_id = r["subsonic-response"]["playlist"]["id"]
        setPlaylistIdForType(user_id, playlist_type, final_id)

        requests.get(
            build_url_for_user("updatePlaylist", user_id, password)
            + f"&playlistId={final_id}&public=false"
        )

    except Exception as e:
        log(
            "error",
            f"Failed to push playlist: {e}",
            source="playlist",
            user_id=user_id,
            event="error",
        )
        return

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
    cursor.execute(
        "DELETE FROM playlist WHERE username = ? AND type = ?",
        (user_id, playlist_type),
    )

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
                    (
                        song_signals.get(sid, "unheard")
                        if isinstance(song_signals, dict)
                        else song_signals
                    ),
                    row[4],
                    playlist_type,
                )
            )

    cursor.executemany(
        "INSERT INTO playlist (username, song_id, title, artist, genre, signal, explicit, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        insert_data,
    )
    conn.commit()
    conn.close()


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
    return list(registered_users & listening_users)


def API_push_playlist(song_ids, user_id, playname="New CSV Playlist"):
    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    if not password:
        return False
    base_url = build_url_for_user("createPlaylist", user_id, password)
    url = f"{base_url}&name={playname}"
    payload = [("songId", sid) for sid in song_ids]

    try:
        response = requests.post(url, data=payload)
        r_json = response.json()
        if (
            "subsonic-response" in r_json
            and r_json["subsonic-response"]["status"] == "ok"
        ):
            new_id = r_json["subsonic-response"]["playlist"]["id"]
            update_url = build_url_for_user("updatePlaylist", user_id, password)
            requests.get(f"{update_url}&playlistId={new_id}&public=false")
            return True
        return False
    except Exception:
        return False


def _to_utc_dt(iso_str: str) -> datetime:
    s = re.sub(r"(\.\d{6})\d+", r"\1", iso_str)
    s = s.replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def resolve_date_window(
    date_from, date_to, days_from, days_to
) -> tuple[datetime, datetime]:
    both_provided = (date_from is not None or date_to is not None) and (
        days_from is not None or days_to is not None
    )
    if both_provided:
        raise ValueError(
            "Provide either date_from/date_to OR days_from/days_to, not both."
        )

    today = datetime.now(timezone.utc)
    epoch = datetime.min.replace(tzinfo=timezone.utc)

    if days_from is not None or days_to is not None:
        start = (today - timedelta(days=days_from or 0)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end = (today - timedelta(days=days_to or 0)).replace(
            hour=23, minute=59, second=59, microsecond=999999
        )
        return start, end

    if date_from is not None or date_to is not None:
        start = epoch
        if date_from:
            start = _to_utc_dt(date_from).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

        end = today
        if date_to:
            end = _to_utc_dt(date_to).replace(
                hour=23, minute=59, second=59, microsecond=999999
            )

        return start, end

    return epoch, today.replace(hour=23, minute=59, second=59, microsecond=999999)


def _fmt_db(dt: datetime) -> str:
    s = dt.isoformat(timespec="microseconds").replace("+00:00", "Z")
    assert len(s) == 27, f"_fmt_db output unexpected length {len(s)}: {s}"
    return s


def get_discovery_pool(
    window_start: datetime,
    window_end: datetime,
    size: int,
    backtrack: bool,
    explicit_filter="notExplicit",
    pool_limit: int = 1000,
) -> tuple[list, bool, int]:

    metrics = {"filter_calls": 0, "backtrack_loops": 0}
    pool = []
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    start_str = _fmt_db(window_start)
    end_str = _fmt_db(window_end)

    print(f"[Discovery] Window: {start_str} → {end_str}")

    try:
        cursor.execute(f"ATTACH DATABASE '{pat}' AS history_db")

        def filter_pool() -> list:
            metrics["filter_calls"] += 1

            db_start = start_str[:27]
            db_end = end_str[:27]

            print(f"[Discovery] SQL comparing: {db_start} → {db_end}")

            cursor.execute(
                """
                SELECT lib.song_id, lib.title, lib.created, lib.genre
                FROM library lib
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM history_db.listens hist
                    WHERE hist.song_id = lib.song_id
                )
                AND substr(lib.created, 1, 27) >= ?
                AND substr(lib.created, 1, 27) <= ?
                ORDER BY lib.created DESC
                LIMIT ?
            """,
                (db_start, db_end, pool_limit),
            )

            rows = [dict(row) for row in cursor.fetchall()]
            print(f"[Discovery] filter_pool() → {len(rows)} rows")
            return rows

        pool = filter_pool()
        if len(pool) == 0:
            print("[Discovery] ⚠️  Pool returned 0 songs.")
            print(f"            Window start : {start_str}")
            print(f"            Window end   : {end_str}")
            print(f"            Pool limit   : {pool_limit}")
            print(f"            Backtrack    : {backtrack}")

        result_is_backtracked = False
        days_back = 0

        if backtrack and len(pool) < size:
            result_is_backtracked = True
            metrics["backtrack_loops"] += 1
            print("[Discovery] Pool too small, running backtrack query...")
            cursor.execute(
                """
                SELECT lib.song_id, lib.title, lib.created, lib.genre
                FROM library lib
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM history_db.listens hist
                    WHERE hist.song_id = lib.song_id
                )
                ORDER BY lib.created DESC
                LIMIT ?
            """,
                (pool_limit,),
            )

            seen_ids = {row["song_id"] for row in pool}
            backtrack_songs = [dict(row) for row in cursor.fetchall()]
            new_songs = [s for s in backtrack_songs if s["song_id"] not in seen_ids]
            pool += new_songs
            pool = pool[:pool_limit]

            if len(pool) == 0:
                print(
                    "[Discovery] Backtrack also returned 0 songs. Library may be empty or all songs are in listen history."
                )

        cursor.execute("DETACH DATABASE history_db")

    except Exception as e:
        print(f"[Discovery] Database error: {e}")
        pool, result_is_backtracked, days_back = [], False, 0
    finally:
        conn.close()

    print("\n" + "=" * 45)
    print("DISCOVERY POOL OPERATION SUMMARY")
    print("=" * 45)
    print(f"• filter_pool() Calls   : {metrics['filter_calls']}")
    print(f"• Backtrack Loops       : {metrics['backtrack_loops']}")
    print(f"• Target Size           : {size}")
    print(f"• Candidates Found      : {len(pool)}")
    print("=" * 45 + "\n")

    return pool, result_is_backtracked, days_back


def build_discovery_playlist(
    pool: list,
    history_dict: dict,
    user_id: str,
    size: int,
    alias_to_cat: dict,
) -> tuple[list, dict]:

    song_signals: dict = {}
    final_ids: list = []
    seen: set = set()

    cat_counts, _ = analyze_user_ratios(user_id, history_dict, alias_to_cat)
    total_listens = sum(cat_counts.values())

    def get_mapped_genres(song: dict) -> set:
        raw = song.get("genre", "")
        genres = [g.strip().lower() for g in raw.split(",") if g.strip()] if raw else []
        return {alias_to_cat.get(g, g) for g in genres} or {"unknown"}

    def add_song(sid: str, reason: str, song: dict):
        final_ids.append(sid)
        seen.add(sid)
        song_signals[sid] = "unheard"
        log_pool(user_id, reason, sid, song.get("title", "Unknown"), "unheard")

    if total_listens > 0:
        target_counts = {
            cat: max(1, round((count / total_listens) * size))
            for cat, count in cat_counts.items()
        }

        non_genre_pool = []
        for song in pool:
            if len(final_ids) >= size:
                break
            sid = song["song_id"]
            if sid in seen:
                continue

            mapped = get_mapped_genres(song)
            matches = [c for c in mapped if target_counts.get(c, 0) > 0]

            if matches:
                add_song(sid, "discovery_genre_match", song)
                for m in matches:
                    target_counts[m] = max(0, target_counts[m] - 1)
            else:
                non_genre_pool.append(song)

        for song in non_genre_pool:
            if len(final_ids) >= size:
                break
            sid = song["song_id"]
            if sid not in seen:
                add_song(sid, "discovery_pool_nongenre", song)

    else:
        for song in pool[:size]:
            add_song(song["song_id"], "discovery_pool_nohistory", song)
    if len(final_ids) < size:
        remaining = [s for s in pool if s["song_id"] not in seen]
        random.shuffle(remaining)
        for song in remaining:
            if len(final_ids) >= size:
                break
            add_song(song["song_id"], "discovery_fallback_random", song)

    if final_ids:
        table = Table(
            title=f"Discovery Playlist · {user_id} · {len(final_ids[:size])} songs",
            show_header=True,
        )
        table.add_column("#", style="dim", width=4)
        table.add_column("Song", min_width=20, max_width=35)
        table.add_column("Added", width=12)

        for i, sid in enumerate(final_ids[:size], 1):
            song = next((s for s in pool if s["song_id"] == sid), {})
            name = song.get("title", "Unknown")
            name = name if len(name) <= 32 else name[:29] + "..."
            raw_date = song.get("created", "")
            try:
                parsed = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                date_str = parsed.strftime("%-d %b %Y")
            except Exception:
                date_str = "Unknown"
            table.add_row(str(i), name, date_str)

        console.print(table)

    return final_ids[:size], song_signals
