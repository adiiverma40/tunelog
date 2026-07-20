import heapq
import random
from datetime import datetime

import requests
from core.config import build_url_for_user
from core.db import (
    get_db_connection,
    get_db_connection_lib,
    get_db_connection_playlist,
    get_db_connection_usr,
)
from metadata.genre import readJson as readJSON
from misc.misc import (
    log,
    log_genre_injection,
    log_pool,
    log_scores,
    log_slot,
    log_summary,
    log_wildcard,
)
from navidrome.state import notification_status, tune_config
from rich.console import Console
from rich.table import Table

from .base_playlist import (
    PLAYLIST_NAME,
    analyze_user_ratios,
    get_allowed_songs,
    get_translation_maps,
    getDataFromDb,
)

console = Console(log_path=False, log_time=False)

PLAYLIST_SIZE = tune_config["playlist_generation"]["playlist_size"]
WILDCARD_DAY = tune_config["playlist_generation"]["wildcard_day"]

SIGNAL_WEIGHTS = tune_config["playlist_generation"]["signal_weights"]
slotsValue = tune_config["playlist_generation"]["slot_ratios"]


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

        latest_db_score = user_listens[0].get("score")
        if latest_db_score is not None:
            scores[sid]["score"] = latest_db_score

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

        latest_db_score = listens[-1].get("score")
        if latest_db_score is not None:
            scores[sid]["score"] = latest_db_score

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
