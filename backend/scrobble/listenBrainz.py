import requests
from rapidfuzz import process, fuzz
from collections import defaultdict
import datetime
import time
import json
from db import get_db_connection, get_db_connection_lib
from rich.console import Console
from state import tune_config
import sqlite3
from typing import Optional, Dict, Any , List

console = Console()

listenBrainzConf = tune_config.get("listenbrainz", {})
behaviour = tune_config.get("behavioral_scoring", {})


def _execute_with_retry(cursor, conn, sql, data, retries=5, delay=2):
    for attempt in range(retries):
        try:
            cursor.executemany(sql, data)
            conn.commit()
            return True
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower():
                console.print(
                    f"[yellow]DB locked, retry {attempt + 1}/{retries}...[/yellow]"
                )
                time.sleep(delay)
                continue
            conn.rollback()
            raise
    conn.rollback()
    return False


def batchSave(matched_records, unmatched_records=None):
    if not matched_records and not unmatched_records:
        console.print("[yellow]No records to save.[/yellow]")
        return

    allowed_users = listenBrainzConf.get("for_users", [])
    if not allowed_users:
        console.print(
            "[bold red]ABORT: No users defined in config ('for_users' is empty).[/bold red]"
        )
        return

    console.print(
        f"[bold green]Preparing {len(matched_records)} tracks to save for users: {', '.join(allowed_users)}...[/bold green]"
    )
    default_signal = str(listenBrainzConf.get("treat_data_as", "complete")).lower()
    # print("treat data as : " , listenBrainzConf.get("treat_data_as", "complete"))
    default_signal = "positive" if default_signal == "complete" else default_signal
    repeat_window_seconds = behaviour.get("repeat_time_window_min", 30) * 60
    dedup_window_seconds = 30 * 60

    percent_map = {"skip": 15.0, "partial": 55.0, "positive": 100.0}
    base_percent = percent_map.get(default_signal, 100.0)

    conn = get_db_connection()
    cursor = conn.cursor()

    matched_records.sort(key=lambda x: x["listen"]["listened_at"])
    song_ids = list({r["song"]["songId"] for r in matched_records})

    existing_history = defaultdict(list)
    chunk_size = 900

    console.print("[cyan]Querying database for recent history...[/cyan]")
    for i in range(0, len(song_ids), chunk_size):
        chunk = song_ids[i : i + chunk_size]
        placeholders = ",".join(["?"] * len(chunk))
        query = f"""
            SELECT song_id, timestamp
            FROM (
                SELECT song_id, timestamp,
                       ROW_NUMBER() OVER (PARTITION BY song_id ORDER BY timestamp DESC) as rn
                FROM listens
                WHERE song_id IN ({placeholders})
            )
            WHERE rn <= 10
        """
        cursor.execute(query, chunk)
        for row in cursor.fetchall():
            dt_obj = datetime.datetime.strptime(row[1], "%Y-%m-%d %H:%M:%S")
            existing_history[row[0]].append(int(dt_obj.timestamp()))

    insert_data = []
    lb_log_data = []
    duplicates_ignored = 0

    console.print("[cyan]Processing and Deduplicating records...[/cyan]")

    for record in matched_records:
        listen = record["listen"]
        song = record["song"]

        song_id = song["songId"]
        listened_at = listen["listened_at"]
        title = song.get("title", "Unknown")
        artist = song.get("artist", "Unknown")
        album = song.get("album", "")
        human_time = datetime.datetime.utcfromtimestamp(listened_at).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        console.print(f"[dim]Analyzing: '{title}' by {artist} ({human_time})[/dim]")

        history = existing_history[song_id]

        is_duplicate = any(
            abs(listened_at - ts) <= dedup_window_seconds for ts in history
        )

        if is_duplicate:
            duplicates_ignored += 1
            console.print(f"[bold yellow] ↳ ⚠ Duplicate Ignored[/bold yellow]")
            # print("treat data as : " , listenBrainzConf.get("treat_data_as", "complete"))
            lb_log_data.append(
                (
                    song_id,
                    title,
                    artist,
                    album,
                    default_signal,
                    "duplicate",
                    None,
                    human_time,
                )
            )
            continue

        current_signal = default_signal
        current_percent = base_percent

        past_plays_before = [ts for ts in history if ts < listened_at]
        if past_plays_before:
            last_played_ts = max(past_plays_before)
            time_diff = listened_at - last_played_ts
            if time_diff <= repeat_window_seconds:
                current_signal = "repeat"
                current_percent = 100.0
                console.print(
                    f"[bold blue] ↳ ↻ Flagged as Repeat (Gap: {int(time_diff/60)}m)[/bold blue]"
                )

        existing_history[song_id].append(listened_at)
        dt_string = datetime.datetime.utcfromtimestamp(listened_at).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        metadata = listen.get("track_metadata", {}).get("additional_info", {})
        duration_ms = metadata.get("duration_ms", 0)
        duration_sec = int(duration_ms / 1000) if duration_ms else 0

        for username in allowed_users:
            insert_data.append(
                (
                    song_id,
                    title,
                    artist,
                    album,
                    song.get("genre", ""),
                    duration_sec,
                    1,
                    current_percent,
                    current_signal,
                    dt_string,
                    username,
                )
            )

        lb_log_data.append(
            (song_id, title, artist, album, current_signal, "matched", None, dt_string)
        )
        console.print(
            f"[bold green] ↳ ✔ Queued for insertion ({current_signal})[/bold green]"
        )
        # print("treat data as : " , listenBrainzConf.get("treat_data_as", "complete"))
    if unmatched_records:
        console.print(
            f"[bold red]Logging {len(unmatched_records)} unmatched tracks to listenbrainz table...[/bold red]"
        )
        for listen in unmatched_records:
            metadata = listen.get("track_metadata", {})
            raw_title = metadata.get("track_name", "")
            raw_artist = metadata.get("artist_name", "")
            raw_album = metadata.get("release_name", "")
            listened_at = listen.get("listened_at", 0)
            dt_string = datetime.datetime.utcfromtimestamp(listened_at).strftime(
                "%Y-%m-%d %H:%M:%S"
            )

            if raw_title and raw_artist:
                lb_log_data.append(
                    (
                        None,
                        raw_title,
                        raw_artist,
                        raw_album,
                        None,
                        "unmatched",
                        None,
                        dt_string,
                    )
                )
            else:
                fallback_label = raw_title or raw_artist or "unknown"
                lb_log_data.append(
                    (
                        None,
                        fallback_label,
                        None,
                        None,
                        None,
                        "unmatched",
                        None,
                        dt_string,
                    )
                )

    console.print("[cyan]Attempting to write to database...[/cyan]")
    # print("treat data as : " , listenBrainzConf.get("treat_data_as", "complete"))
    if insert_data:
        ok = _execute_with_retry(
            cursor,
            conn,
            """
            INSERT INTO listens (song_id, title, artist, album, genre, duration, played, percent_played, signal, timestamp, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            insert_data,
        )
        if ok:
            unique_tracks = len(insert_data) // len(allowed_users)
            console.print(
                f"[bold green]✔ Successfully saved {unique_tracks} unique tracks ({len(insert_data)} total plays)![/bold green]"
            )
        else:
            console.print("[bold red]✖ Database Save Failed after retries.[/bold red]")
    else:
        console.print(
            f"[bold yellow]Total Duplicates Ignored: {duplicates_ignored}[/bold yellow]"
        )
        console.print(
            "[bold red]No new unique tracks to save to the database.[/bold red]"
        )

    if lb_log_data:
        ok = _execute_with_retry(
            cursor,
            conn,
            """
            INSERT INTO listenbrainz (song_id, title, artist, album, signal, tag, comment, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            lb_log_data,
        )
        if ok:
            console.print(
                f"[bold cyan]✔ Logged {len(lb_log_data)} entries to listenbrainz table.[/bold cyan]"
            )
        else:
            console.print(
                "[bold red]✖ ListenBrainz log write failed after retries.[/bold red]"
            )

    conn.close()


def getListenBrainzResponse():
    console.print("[bold yellow]Getting data from ListenBrainz[/bold yellow]")
    last_synced_ts = listenBrainzConf.get("last_synced")

    if not last_synced_ts or 0:
        console.print(
            "[bold red]No last synced Found, trying deep history sync[/bold red]"
        )
        return deep_history_sync(100)
    else:
        since = int(last_synced_ts)
        console.print(
            f"[blue]Syncing since: {datetime.datetime.fromtimestamp(since)}[/blue]"
        )
        LB_HEADERS = {
            "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)"
        }
        url = f"https://api.listenbrainz.org/1/user/{listenBrainzConf['username']}/listens"
        params = {"min_ts": since, "count": 100}

        try:
            response = requests.get(url, params=params, headers=LB_HEADERS)
            response.raise_for_status()
            data = response.json()
            listens = data.get("payload", {}).get("listens", [])

            if listens:
                console.print(
                    f"[green]Successfully fetched {len(listens)} new tracks.[/green]"
                )
                return listens
            else:
                console.print("[white]No new tracks found since last sync.[/white]")
                return []
        except Exception as e:
            console.print(f"[bold red]Error fetching from ListenBrainz: {e}[/bold red]")
            return []


def deep_history_sync(pagination=20):
    all_listens = []

    ceiling_ts = None

    fresh_lb_conf = tune_config.get("listenbrainz", {})
    username = fresh_lb_conf.get("username")

    if not username:
        console.print(
            "[bold red]deep_history_sync aborted: No username found.[/bold red]"
        )
        return []

    LB_HEADERS = {
        "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)"
    }

    while True:
        params = {"count": pagination}
        if ceiling_ts is not None:
            params["max_ts"] = ceiling_ts

        url = f"https://api.listenbrainz.org/1/user/{username}/listens"

        try:
            response = requests.get(url, params=params, headers=LB_HEADERS)
            response.raise_for_status()

            data = response.json()
            listens = data.get("payload", {}).get("listens", [])

            if not listens:
                console.print("[yellow]No more history found.[/yellow]")
                break

            all_listens.extend(listens)
            console.print(
                f"[bold green]Fetched {len(all_listens)} total...[/bold green]"
            )

            ceiling_ts = listens[-1]["listened_at"] - 1

            time.sleep(0.5)
            if len(listens) < pagination:
                console.print(
                    "[bold green]All History from ListenBrainz fetched[/bold green]"
                )
                return all_listens

        except Exception as e:
            console.print(f"[bold red]Deep Sync API Error:[/bold red] {e}")
            if hasattr(e, "response") and e.response is not None:
                console.print(
                    f"[bold red]ListenBrainz says:[/bold red] {e.response.text}"
                )
            break

    return all_listens


def getSongsFromDb():
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    songs = cursor.execute(
        "select song_id, title, artist, album, artistJSON, genre from library"
    ).fetchall()
    conn.close()

    songDict = []
    for row in songs:
        parsed_artists = [row[2]] if row[2] else []
        try:
            if row[4]:
                ajson = json.loads(row[4])
                for a in ajson:
                    if "name" in a:
                        parsed_artists.append(a["name"])
        except Exception:
            pass

        clean_artists = list(set([str(a).lower().strip() for a in parsed_artists if a]))
        songDict.append(
            {
                "songId": row[0],
                "title": row[1],
                "artist": row[2],
                "album": row[3],
                "all_artists": clean_artists,
                "genre": (str(row[5]) if len(row) > 5 and row[5] else ""),
            }
        )
    return songDict


def fallback_stage_1(unmatched_listens, songs_list, matched_records):
    console.print(
        "[cyan]Building Artist, Album, and Title indexes for fallback...[/cyan]"
    )
    artist_dict = defaultdict(list)
    album_dict = defaultdict(list)
    title_dict = defaultdict(list)

    for s in songs_list:
        db_artist = str(s.get("artist", "")).lower().strip()
        db_album = str(s.get("album", "")).lower().strip()
        db_title = str(s.get("title", "")).lower().strip()

        if db_artist:
            artist_dict[db_artist].append(s)
        if db_album:
            album_dict[db_album].append(s)
        if db_title:
            title_dict[db_title].append(s)

    console.print(
        "[bold yellow]Starting Fallback 1: Targeted Fuzzy Matching[/bold yellow]"
    )
    deep_unmatched = []

    for unmatched in unmatched_listens:
        metadata = unmatched.get("track_metadata", {})
        um_title = str(metadata.get("track_name", "")).lower().strip()
        um_artist = str(metadata.get("artist_name", "")).lower().strip()
        um_album = str(metadata.get("release_name", "")).lower().strip()

        candidates = []
        lookup_type = ""

        if um_artist and um_artist in artist_dict:
            candidates = artist_dict[um_artist]
            lookup_type = "Artist"
        elif um_album and um_album in album_dict:
            candidates = album_dict[um_album]
            lookup_type = "Album"
        elif um_title and um_title in title_dict:
            candidates = title_dict[um_title]
            lookup_type = "Title"

        if candidates:
            choices = {s["songId"]: s["title"] for s in candidates}
            result = process.extractOne(um_title, choices, scorer=fuzz.token_set_ratio)

            if result and result[1] >= 85.0:
                matched_id = result[2]
                matched_song = next(
                    (s for s in candidates if s["songId"] == matched_id), None
                )
                matched_records.append({"listen": unmatched, "song": matched_song})
                console.print(
                    f"[bold blue]✔ FUZZY ({result[1]:.1f}% via {lookup_type}):[/bold blue] '{um_title}' -> [dim]ID: {matched_id}[/dim]"
                )
            else:
                deep_unmatched.append(unmatched)
        else:
            deep_unmatched.append(unmatched)

    return deep_unmatched, artist_dict


def fallback_stage_2(unmatched_listens, artist_dict, matched_records):
    console.print(
        "[bold yellow]Starting Fallback 2: Strict Artist -> Title Dictionary Search[/bold yellow]"
    )
    known_artists = list(artist_dict.keys())
    final_misses = []

    for unmatched in unmatched_listens:
        metadata = unmatched.get("track_metadata", {})
        um_title = str(metadata.get("track_name", "")).lower().strip()
        um_artist = str(metadata.get("artist_name", "")).lower().strip()

        if not um_artist or not um_title:
            final_misses.append(unmatched)
            continue

        artist_matches = process.extract(
            um_artist, known_artists, scorer=fuzz.token_set_ratio, limit=10
        )
        title_pool = {}
        full_songs_pool = []

        for match in artist_matches:
            if match[1] >= 80.0:
                for song in artist_dict[match[0]]:
                    title_pool[song["songId"]] = str(song["title"]).lower().strip()
                    full_songs_pool.append(song)

        if title_pool:
            title_match = process.extractOne(
                um_title, title_pool, scorer=fuzz.token_set_ratio
            )
            if title_match and title_match[1] >= 85.0:
                matched_id = title_match[2]
                matched_song = next(
                    (s for s in full_songs_pool if s["songId"] == matched_id), None
                )
                matched_records.append({"listen": unmatched, "song": matched_song})
                console.print(
                    f"[bold magenta]✔ STAGE 2 MATCH ({title_match[1]:.1f}%):[/bold magenta] '{um_title}' -> [dim]ID: {matched_id}[/dim]"
                )
                continue

        final_misses.append(unmatched)
    return final_misses


def fallback_stage_3(unmatched_listens, songs_list, matched_records):
    console.print(
        "[bold yellow]Starting Fallback 3: Global Title -> Multi-Artist Verification[/bold yellow]"
    )
    absolute_misses = []

    title_dict = defaultdict(list)
    all_titles_pool = {}
    song_by_id = {}

    for s in songs_list:
        db_title = str(s.get("title", "")).lower().strip()
        song_id = s["songId"]
        if db_title:
            title_dict[db_title].append(s)
            all_titles_pool[song_id] = db_title
        song_by_id[song_id] = s

    for unmatched in unmatched_listens:
        metadata = unmatched.get("track_metadata", {})
        um_title = str(metadata.get("track_name", "")).lower().strip()
        um_artist = str(metadata.get("artist_name", "")).lower().strip()

        if not um_artist or not um_title:
            absolute_misses.append(unmatched)
            continue

        matched = False

        if um_title in title_dict:
            for candidate in title_dict[um_title]:
                artist_match = process.extractOne(
                    um_artist, candidate["all_artists"], scorer=fuzz.token_set_ratio
                )
                if artist_match and artist_match[1] >= 80.0:
                    matched_records.append({"listen": unmatched, "song": candidate})
                    console.print(
                        f"[bold magenta]✔ STAGE 3 MATCH (Exact Title):[/bold magenta] '{um_title}' -> [dim]ID: {candidate['songId']}[/dim]"
                    )
                    matched = True
                    break

        if matched:
            continue

        title_matches = process.extract(
            um_title, all_titles_pool, scorer=fuzz.token_set_ratio, limit=5
        )
        for t_match in title_matches:
            if t_match[1] >= 85.0:
                candidate_id = t_match[2]
                candidate = song_by_id[candidate_id]
                artist_match = process.extractOne(
                    um_artist, candidate["all_artists"], scorer=fuzz.token_set_ratio
                )
                if artist_match and artist_match[1] >= 80.0:
                    matched_records.append({"listen": unmatched, "song": candidate})
                    console.print(
                        f"[bold magenta]✔ STAGE 3 MATCH (Fuzzy Title {t_match[1]:.1f}%):[/bold magenta] '{t_match[0]}' -> [dim]ID: {candidate_id}[/dim]"
                    )
                    matched = True
                    break

        if not matched:
            absolute_misses.append(unmatched)

    return absolute_misses


def fuzzyMatchingSong():
    fresh_lb_conf = tune_config.get("listenbrainz", {})
    if not fresh_lb_conf.get("username"):
        console.print(
            "[bold red]Aborting: No ListenBrainz username configured.[/bold red]"
        )
        return None

    songs_list = getSongsFromDb()
    responseSongs = getListenBrainzResponse()

    if not responseSongs:
        console.print("[yellow]No ListenBrainz data to process.[/yellow]")
        return None

    newest_ts = responseSongs[0].get("listened_at")

    console.print("[cyan]Building local library exact-match index...[/cyan]")

    exact_match_dict = {}
    for s in songs_list:
        artist = str(s["artist"]).lower().strip() if s["artist"] else ""
        title = str(s["title"]).lower().strip() if s["title"] else ""
        lookup_key = f"{artist} - {title}"
        exact_match_dict[lookup_key] = s

    unmatched_listens = []
    matched_records = []

    console.print(f"[cyan]Processing {len(responseSongs)} listens...[/cyan]")

    for listen in responseSongs:
        metadata = listen.get("track_metadata", {})
        lb_title = str(metadata.get("track_name", "")).lower().strip()
        lb_artist = str(metadata.get("artist_name", "")).lower().strip()

        matched_song = exact_match_dict.get(f"{lb_artist} - {lb_title}")
        if matched_song:
            matched_records.append({"listen": listen, "song": matched_song})
        else:
            unmatched_listens.append(listen)

    console.print(
        f"[bold green]Direct Matches Found: {len(matched_records)}/{len(responseSongs)}[/bold green]"
    )

    final_garbage = []
    if unmatched_listens:
        console.print(
            f"[bold yellow]Sending {len(unmatched_listens)} tracks to Fallback Pipeline...[/bold yellow]"
        )
        remaining_1, artist_index = fallback_stage_1(
            unmatched_listens, songs_list, matched_records
        )
        remaining_2 = fallback_stage_2(remaining_1, artist_index, matched_records)
        if remaining_2:
            final_garbage = fallback_stage_3(remaining_2, songs_list, matched_records)
            console.print(
                f"[bold red]True Misses (Ignored): {len(final_garbage)}[/bold red]"
            )

    batchSave(matched_records, unmatched_records=final_garbage)

    return newest_ts


def batchMatchNavidromeTracks(tracks: List[Any]) -> tuple[List[Dict[str, Any]], int]:
    songs_list = getSongsFromDb()
    exact_match_dict = {}
    for s in songs_list:
        db_artist = str(s.get("artist", "")).lower().strip()
        db_title = str(s.get("title", "")).lower().strip()
        exact_match_dict[f"{db_artist} - {db_title}"] = s

    matched_results = {}
    unmatched_listens = []
    for idx, track in enumerate(tracks):
        um_title = str(track.title or "").strip()
        um_artist = str(track.artist or "").strip()
        um_album = str(track.album or "").strip()

        lookup_key = f"{um_artist.lower()} - {um_title.lower()}"
        exact = exact_match_dict.get(lookup_key)

        if exact:
            matched_results[idx] = {
                "navidrome_id": exact["songId"],
                "matched_name": f'{exact.get("artist", "")} - {exact.get("title", "")}',
                "match_type": "exact",
            }
        else:
            fake_listen = {
                "_original_index": idx,
                "track_metadata": {
                    "track_name": um_title,
                    "artist_name": um_artist,
                    "release_name": um_album,
                },
            }
            unmatched_listens.append(fake_listen)

    matched_records = []

    if unmatched_listens:
        remaining_1, artist_index = fallback_stage_1(
            unmatched_listens, songs_list, matched_records
        )
        remaining_2 = fallback_stage_2(remaining_1, artist_index, matched_records)
        fallback_stage_3(remaining_2, songs_list, matched_records)

    for record in matched_records:
        listen = record["listen"]
        song = record["song"]
        idx = listen["_original_index"]
        matched_results[idx] = {
            "navidrome_id": song["songId"],
            "matched_name": f'{song.get("artist", "")} - {song.get("title", "")}',
            "match_type": "fallback",
        }

    output_tracks = []
    matched_count = 0

    for idx, track in enumerate(tracks):
        track_data = track.model_dump()
        match_info = matched_results.get(idx)

        if match_info:
            track_data["navidrome_id"] = match_info["navidrome_id"]
            track_data["matched_name"] = match_info["matched_name"]
            matched_count += 1
            print(f"MATCHED [{match_info['match_type']}]: {match_info['matched_name']}")
        else:
            print(f"NO MATCH: {track.title} by {track.artist}")

        output_tracks.append(track_data)

    return output_tracks, matched_count
