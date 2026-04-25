import requests
import rapidfuzz
from rapidfuzz import process, fuzz
from collections import defaultdict
import datetime
import time
import json
from db import get_db_connection, get_db_connection_lib
from rich.console import Console
from state import tune_config

console = Console()

listenBrainzConf = tune_config.get("listenbrainz", {})
behaviour = tune_config.get("behavioral_scoring", {})


def batchSave(matched_records):
    if not matched_records:
        console.print("[yellow]No records to save.[/yellow]")
        return

    allowed_users = listenBrainzConf.get("for_users", [])
    if not allowed_users:
        console.print(
            "[bold red]ABORT: No users defined in config ('for_users' is empty).[/bold red]"
        )
        return

    console.print(
        f"\n[bold green]Preparing {len(matched_records)} tracks to save for users: {', '.join(allowed_users)}...[/bold green]"
    )

    default_signal = listenBrainzConf.get("treat_data_as", "scrobble")
    repeat_window_seconds = behaviour.get("repeat_time_window_min", 30) * 60

    conn = get_db_connection()
    cursor = conn.cursor()
    matched_records.sort(key=lambda x: x["listen"]["listened_at"])

    song_ids = list(set([r["song"]["songId"] for r in matched_records]))
    placeholders = ",".join(["?"] * len(song_ids))

    cursor.execute(
        f"SELECT song_id, MAX(timestamp) FROM listens WHERE song_id IN ({placeholders}) GROUP BY song_id",
        song_ids,
    )

    last_played = {}
    for row in cursor.fetchall():
        if row[1]:
            dt_obj = datetime.datetime.strptime(row[1], "%Y-%m-%d %H:%M:%S")
            last_played[row[0]] = int(dt_obj.timestamp())

    insert_data = []

    for record in matched_records:
        listen = record["listen"]
        song = record["song"]

        song_id = song["songId"]
        listened_at = listen["listened_at"]

        current_signal = default_signal
        if song_id in last_played:
            time_diff = listened_at - last_played[song_id]
            if 0 <= time_diff <= repeat_window_seconds:
                current_signal = "repeat"

        last_played[song_id] = listened_at

        dt_string = datetime.datetime.fromtimestamp(listened_at).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        metadata = listen.get("track_metadata", {}).get("additional_info", {})
        duration_ms = metadata.get("duration_ms", 0)
        duration_sec = int(duration_ms / 1000) if duration_ms else 0

        for username in allowed_users:
            insert_data.append(
                (
                    song_id,
                    song.get("title", ""),
                    song.get("artist", ""),
                    song.get("album", ""),
                    song.get("genre", ""),
                    duration_sec,
                    1,
                    100.0,
                    current_signal,
                    dt_string,
                    username,
                )
            )

    cursor.executemany(
        """
        INSERT INTO listens (song_id, title, artist, album, genre, duration, played, percent_played, signal, timestamp, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        insert_data,
    )

    conn.commit()
    conn.close()

    console.print(
        f"[bold green]✔ Successfully saved {len(insert_data)} total plays across {len(allowed_users)} users![/bold green]\n"
    )


def getListenBrainzResponse():
    console.print("[bold yellow]Getting data from ListenBrainz[/bold yellow]")
    last_synced_ts = listenBrainzConf.get("last_synced")

    if not last_synced_ts:
        console.print(
            "[bold red]No last synced Found, trying deep history sync[/bold red]"
        )
        return deep_history_sync(100)
    else:
        since = int(last_synced_ts)
        console.print(
            f"[blue]Syncing since: {datetime.datetime.fromtimestamp(since)}[/blue]"
        )

        url = f"https://api.listenbrainz.org/1/user/{listenBrainzConf['username']}/listens"
        params = {"min_ts": since, "count": 100}

        try:
            response = requests.get(url, params=params)
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
    ceiling_ts = int(time.time())
    while True:
        params = {"max_ts": ceiling_ts, "count": pagination}
        url = f"https://api.listenbrainz.org/1/user/{listenBrainzConf['username']}/listens"

        response = requests.get(url, params=params)
        data = response.json()
        listens = data.get("payload", {}).get("listens", [])

        if not listens:
            console.print("[yellow]No more history found.[/yellow]")
            break

        all_listens.extend(listens)
        console.print(f"[bold green]Fetched {len(all_listens)} total...[/bold green]")
        ceiling_ts = listens[-1]["listened_at"] - 1

        time.sleep(0.5)
        if len(listens) < pagination:
            console.print("[bold red]History from ListenBrainz fetched[/bold red]")
            return all_listens

    return all_listens


def getSongsFromDb():
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    songs = cursor.execute(
        "select song_id, title, artist, album, artistJSON, genre from library"
    ).fetchall()
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
                "genre": (
                    str(row[5]) if len(row) > 5 and row[5] else ""
                ),  
            }
        )
    return songDict



def fallback_stage_1(unmatched_listens, songs_list, matched_records):
    console.print(
        "\n[cyan]Building Artist, Album, and Title indexes for fallback...[/cyan]"
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
        "\n[bold yellow]Starting Fallback 2: Strict Artist -> Title Dictionary Search[/bold yellow]"
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
                matched_db_artist = match[0]
                for song in artist_dict[matched_db_artist]:
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
        "\n[bold yellow]Starting Fallback 3: Global Title -> Multi-Artist Verification[/bold yellow]"
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
            candidates = title_dict[um_title]
            for candidate in candidates:
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
    songs_list = getSongsFromDb()
    responseSongs = getListenBrainzResponse()

    if not responseSongs:
        console.print("[yellow]No ListenBrainz data to process.[/yellow]")
        return

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

        search_key = f"{lb_artist} - {lb_title}"
        matched_song = exact_match_dict.get(search_key)

        if matched_song:
            matched_records.append({"listen": listen, "song": matched_song})
        else:
            unmatched_listens.append(listen)

    console.print(
        f"\n[bold green]Direct Matches Found: {len(matched_records)}/{len(responseSongs)}[/bold green]"
    )

    if unmatched_listens:
        console.print(
            f"\n[bold yellow]Sending {len(unmatched_listens)} tracks to Fallback Pipeline...[/bold yellow]"
        )

        remaining_1, artist_index = fallback_stage_1(
            unmatched_listens, songs_list, matched_records
        )
        remaining_2 = fallback_stage_2(remaining_1, artist_index, matched_records)

        if remaining_2:
            final_garbage = fallback_stage_3(remaining_2, songs_list, matched_records)
            console.print(
                f"\n[bold red]True Misses (Ignored): {len(final_garbage)}[/bold red]"
            )
    batchSave(matched_records)
