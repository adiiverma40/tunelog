import sys
import requests
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from rich.console import Console
from state import status_registry
from config import build_url, event_queue
from db import (
    get_db_connection,
    init_db,
    init_db_lib,
    init_db_usr,
    init_db_playlist,
    init_search_db,
    get_db_connection_lib,
    # migrate_playlist_ids
    migrate_playlist_primary_key,
)
from itunesFuzzy import useFallBackMethods
import library
from library import normalise_genre, normalise_artist, sync_library
from watcher import start_sse
from misc import push_star
import uvicorn
from state import notification_status, tune_config, save_config
from dotenv import load_dotenv
import os

from playlist import (
    getDataFromDb,
    score_song,
    get_unheard_songs,
    get_wildcard_songs,
    build_playlist,
    push_playlist,
    resolve_date_window,
    get_translation_maps,
    readJSON,
    get_discovery_pool,
    build_discovery_playlist,
)
from scrobble.listenBrainz import fuzzyMatchingSong

# from misc import setup_logger

load_dotenv()
console = Console()
active = {}

CURRENT_VERSION = "0.001"


def navidrome_url(endpoint):
    url = build_url(endpoint)
    response = requests.get(url)
    return response.json()


def Watcher():
    url_response = navidrome_url("getNowPlaying")
    entries = url_response["subsonic-response"].get("nowPlaying", {}).get("entry", [])

    now = time.time()
    timeout = tune_config["behavioral_scoring"]["stale_session_timeout_sec"]
    for user_id in list(active.keys()):
        if now - active[user_id]["last_seen"] > timeout:
            console.print(
                f"[blue][STALE] {user_id} flushed: {active[user_id]['title']}"
            )
            log_history(active.pop(user_id))

    if not entries:
        for user_id in list(active.keys()):
            active[user_id]["actual_played"] += now - active[user_id]["last_seen"]
            active[user_id]["last_seen"] = now
            log_history(active.pop(user_id))
            console.print(f"[bold red][STOP] {user_id} stopped")
            notification_status.songState.append(
                {"username": user_id, "song": "", "state": "stopped"}
            )
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
            console.print(
                f"[bold blue][SAME] {user_id} still playing: {active[user_id]['title']} | played: {round(active[user_id]['actual_played'])}s"
            )

            notification_status.songState.append(
                {"username": user_id, "song": active[user_id]["title"], "state": "same"}
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
                "artist": normalise_artist(entry.get("artist", "")),
                "genre": normalise_genre(entry.get("genre")),
                "duration": entry["duration"],
                "actual_played": 0,
                "last_seen": now,
            }
            console.print(f"[bold blue][NEW] {user_id} started: {entry['title']}")
            notification_status.songState.append(
                {"username": user_id, "song": entry["title"], "state": "started"}
            )
            # print(notification_status.songState)

    current_users = {entry["username"] for entry in entries}
    for user_id in list(active.keys()):
        if user_id not in current_users:
            active[user_id]["actual_played"] += now - active[user_id]["last_seen"]
            log_history(active.pop(user_id))
            notification_status.songState.append(
                {"username": user_id, "song": entry["title"], "state": "stopped"}
            )
            console.print(f"[bold red][STOP] {user_id} stopped")


def signal_system(percent_played, song_id, user_id):
    scoring = tune_config["behavioral_scoring"]
    if percent_played <= scoring["skip_threshold_pct"]:
        base = "skip"
    elif percent_played < scoring["positive_threshold_pct"]:
        base = "partial"
    else:
        base = "positive"

    if base == "positive":
        conn = get_db_connection()
        cursor = conn.cursor()
        window = scoring["repeat_time_window_min"]

        cursor.execute(
            """
            SELECT COUNT(*) FROM listens 
            WHERE song_id = ? AND user_id = ? 
            AND signal IN ('positive', 'repeat')
            AND timestamp > datetime('now', '-{window} minutes')
        """,
            (song_id, user_id),
        )

        valid_prior_positives = cursor.fetchone()[0]
        conn.close()

        if valid_prior_positives > 0:
            base = "repeat"

    return base


def log_history(song):
    played = min(song["actual_played"], song["duration"])
    percent_played = min(round((played / song["duration"]) * 100), 100)
    signal = signal_system(percent_played, song["song_id"], song["user_id"])

    behavioralScoring = tune_config["behavioral_scoring"]
    long_song = behavioralScoring["long_song_duration"]

    conn = get_db_connection()
    cursor = conn.cursor()

    if song["duration"] >= long_song:
        console.print("[bold red]Long song detected — merging listen history.")

        window_count = max(1, round(song["duration"] / long_song))

        prior_rows = cursor.execute(
            """
            SELECT id, played, signal FROM listens
            WHERE song_id = ? AND user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (song["song_id"], song["user_id"], window_count),
        ).fetchall()

        prior_ids = [row[0] for row in prior_rows]
        prior_played_total = sum(row[1] for row in prior_rows)
        most_recent_prior_signal = prior_rows[0][2] if prior_rows else None

        combined_played = prior_played_total + played
        combined_played = min(combined_played, song["duration"])
        combined_percent = min(round((combined_played / song["duration"]) * 100), 100)

        scoring = tune_config["behavioral_scoring"]
        if combined_percent <= scoring["skip_threshold_pct"]:
            merged_signal = "skip"
        elif combined_percent < scoring["positive_threshold_pct"]:
            merged_signal = "partial"
        else:
            merged_signal = "positive"
        if (
            prior_rows
            and most_recent_prior_signal != "skip"
            and merged_signal == "positive"
        ):
            merged_signal = "repeat"

        if prior_ids:
            placeholders = ",".join("?" * len(prior_ids))
            cursor.execute(
                f"DELETE FROM listens WHERE id IN ({placeholders})", prior_ids
            )
            console.print(f"[yellow]Deleted {len(prior_ids)} prior row(s) for merge.")

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
                combined_played,
                combined_percent,
                merged_signal,
                song["user_id"],
            ),
        )

        console.print(
            f"[green]Merged row inserted — played: {combined_played}s ({combined_percent}%), signal: {merged_signal}"
        )

        conn.commit()
        conn.close()
        push_star(song, merged_signal)

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
        push_star(song, signal)


def autoSyncWithFallback():
    console.print("[bold yellow] Starting auto sync...")
    library.sync_library()

    conn = get_db_connection_lib()
    not_in_itunes = conn.execute(
        "SELECT COUNT(*) FROM library WHERE explicit = 'notInItunes'"
    ).fetchone()[0]
    conn.close()

    if not_in_itunes > 0:
        console.print(
            f"[green]Auto sync done. {not_in_itunes} songs need fallback — starting..."
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
                console.print("[bold green]Fallback stopped")
                break
            result = useFallBackMethods(song, tries=500)
            console.print(f"[bold blue]Fallback result: {result}")

        console.print("[bold green]Fallback sync complete")
    else:
        console.print(
            "[bold green]Auto sync done. No notInItunes songs — skipping fallback"
        )


MIN_SCORE: float = tune_config["api_and_performance"]["sync_confidence"][
    "min_match_score"
]
TRIES: int = 500


def _get_unprocessed_entries() -> list[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute("""
        SELECT DISTINCT title, artist, album
        FROM   listenbrainz
        WHERE  tag = 'unmatched'
          AND  (comment IS NULL OR comment = '')
        """).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def _update_entry(
    raw_title: str,
    raw_artist: str,
    tag: str,
    comment: str,
    new_title: str = None,
    new_artist: str = None,
    new_album: str = None,
) -> None:
    conn = get_db_connection()
    cursor = conn.cursor()

    base_where_clause = """
        WHERE COALESCE(title, '') = ? 
          AND COALESCE(artist, '') = ?
          AND tag = 'unmatched' 
          AND (comment IS NULL OR comment = '')
    """

    if new_title and new_artist:
        cursor.execute(
            f"""
            UPDATE listenbrainz
            SET    tag = ?, comment = ?, title = ?, artist = ?, album = ?
            {base_where_clause}
            """,
            (
                tag,
                comment,
                new_title,
                new_artist,
                new_album or "",
                raw_title,
                raw_artist,
            ),
        )
    else:
        cursor.execute(
            f"""
            UPDATE listenbrainz 
            SET    tag = ?, comment = ? 
            {base_where_clause}
            """,
            (tag, comment, raw_title, raw_artist),
        )
    conn.commit()
    conn.close()


def run_lb_fuzzy_matching() -> None:

    entries = _get_unprocessed_entries()
    # print(entries)

    if not entries:
        console.print("[dim]LB Fuzzy: No unmatched entries to process.[/dim]")
        return

    console.print(
        f"[bold magenta]LB Fuzzy:[/bold magenta] Processing {len(entries)} distinct unmatched entries..."
    )

    for entry in entries:
        raw_title = entry.get("title") or ""
        raw_artist = entry.get("artist") or ""
        raw_album = entry.get("album") or ""

        song_stub = {
            "song_id": "",
            "title": raw_title,
            "artist": raw_artist,
            "album": raw_album,
        }

        console.print(f"[cyan]LB Fuzzy:[/cyan] {raw_title[:50]} | {raw_artist[:30]}")

        result = useFallBackMethods(song=song_stub, tries=TRIES, returnData=True)

        if result is not None:
            sc = result.get("score", 0)
            if sc >= MIN_SCORE:
                _update_entry(
                    raw_title=raw_title,
                    raw_artist=raw_artist,
                    tag="itunes",
                    comment=str(round(sc, 2)),
                    new_title=result.get("title") or raw_title,
                    new_artist=result.get("artist") or raw_artist,
                    new_album=result.get("album") or raw_album,
                )
                console.log(
                    f"[green]LB Fuzzy: Matched[/green] (score={sc}) → {result.get('title')}"
                )
            else:
                _update_entry(
                    raw_title=raw_title,
                    raw_artist=raw_artist,
                    tag="unmatched",
                    comment=str(round(sc, 2)),
                )
                console.log(
                    f"[yellow]LB Fuzzy: Low score[/yellow] ({sc}) → kept unmatched"
                )
        else:
            _update_entry(
                raw_title=raw_title,
                raw_artist=raw_artist,
                tag="unmatched",
                comment="no_match",
            )
            console.log("[yellow]LB Fuzzy: No match found → kept unmatched[/yellow]")

    console.print(
        f"[bold green]LB Fuzzy: Done.[/bold green] Processed {len(entries)} distinct entries."
    )


def main():
    proxyPort = int(os.getenv("PROXY_PORT", 4534))

    with console.status("[dim]Initializing database...[/dim]"):
        try:
            init_db()
            init_db_lib()
            init_db_usr()
            init_db_playlist()
            init_search_db()
            status_registry.update("Db", status="initialized")

            conn = get_db_connection()
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("VACUUM")
            conn.close()

            migrate_playlist_primary_key()
        except Exception as e:
            status_registry.update("Db", status="crashed", error=e)
            console.print(f"[red]✗ Database initialization failed:[/red] {e}")
            sys.exit(1)
    console.print("[green]✓ Database ready[/green]")

    with console.status("[dim]Starting API and proxy...[/dim]"):
        try:
            uvicornThread = threading.Thread(
                target=uvicorn.run,
                args=("api:socket_app",),
                kwargs={"host": "0.0.0.0", "port": 8000, "log_level": "warning"},
                daemon=True,
            )
            ProxyThread = threading.Thread(
                target=uvicorn.run,
                args=("proxy.proxy:app",),
                kwargs={"host": "0.0.0.0", "port": proxyPort, "log_level": "warning"},
                daemon=True,
            )
            uvicornThread.start()
            ProxyThread.start()
            time.sleep(2.0)

            if not ProxyThread.is_alive():
                status_registry.update(
                    "uvicorn", status="crashed", error="Port Conflict"
                )
                console.print(
                    f"[red]✗ Proxy failed to bind:[/red] port {proxyPort} is already in use."
                )
                sys.exit(1)

            if not uvicornThread.is_alive():
                status_registry.update(
                    "uvicorn", status="crashed", error="Port Conflict"
                )
                console.print(
                    "[red]✗ API failed to bind:[/red] port 8000 is already in use."
                )
                sys.exit(1)

            status_registry.update("uvicorn", status="running")
        except Exception as e:
            status_registry.update("uvicorn", status="crashed", error=str(e))
            console.print(f"[red]✗ API/proxy startup failed:[/red] {e}")
            sys.exit(1)
    console.print(
        f"[green]✓ API ready on port 8000 · Proxy ready on port {proxyPort}[/green]"
    )

    with console.status("[dim]Starting watcher...[/dim]"):
        try:
            watcherThread = threading.Thread(target=start_sse, daemon=True)
            watcherThread.start()
            time.sleep(2.0)

            if not watcherThread.is_alive():
                status_registry.update(
                    "watcher", status="crashed", error="navidrome error"
                )
                console.print(
                    "[red]✗ Watcher failed to start:[/red] check that Navidrome is running."
                )
                sys.exit(1)

            status_registry.update("watcher", status="running")
        except Exception as e:
            status_registry.update("watcher", status="crashed", error=str(e))
            console.print(f"[red]✗ Watcher startup failed:[/red] {e}")
            sys.exit(1)
    console.print("[green]✓ Watcher running[/green]")

    last_auto_sync_day = None
    isGenerated = False
    is_lb_syncing = False
    last_lb_sync_timestamp = None  

    while True:

        if library._startSyncSong and not library._isSyncing:
            console.print("[dim]Manual library sync triggered.[/dim]")
            syncThread = threading.Thread(target=library.sync_library, daemon=True)
            syncThread.start()

        now = datetime.now(ZoneInfo(library._timezone))
        current_hour = now.hour
        current_day = now.date()
        settings = library.getSyncSettings()
        auto_sync_hour = settings["auto_sync"]

        if (
            current_hour == auto_sync_hour
            and current_day != last_auto_sync_day
            and not library._isSyncing
        ):
            console.print(
                f"[dim]Auto library sync triggered at {now.strftime('%H:%M')}.[/dim]"
            )
            last_auto_sync_day = current_day
            syncThread = threading.Thread(target=autoSyncWithFallback, daemon=True)
            syncThread.start()

        playlistConf = tune_config["playlist_generation"]
        conf = tune_config

        if (
            playlistConf["auto_generate_playlist"]
            and playlistConf["last_auto_generate"] != str(current_day)
            and current_hour == playlistConf["auto_generate_time"]
        ):
            console.print(
                f"[dim]Auto playlist generation triggered at {current_hour}:00.[/dim]"
            )

            size = playlistConf["playlist_size"]
            explicit_filter = playlistConf["auto_generate_explicit"]
            injection = playlistConf["auto_generate_injection"]
            library1, history = getDataFromDb()
            users = playlistConf["auto_generate_for"]

            if len(users) > 0:
                for user in users:
                    scores = score_song(
                        user, history_dict=history, library_dict=library1
                    )
                    unheard, unheard_ratio, all_time = get_unheard_songs(library1, user)
                    wildcards = get_wildcard_songs(scores, user)
                    playlist, song_signals = build_playlist(
                        library1,
                        history,
                        scores,
                        unheard,
                        wildcards,
                        unheard_ratio,
                        all_time,
                        user,
                        explicit_filter,
                        size,
                        injection,
                    )
                    push_playlist(playlist, user, song_signals, playlist_type="blend")
                    console.print(f"[green]✓ Blend pushed for {user}[/green]")

                    try:
                        window_start, window_end = resolve_date_window(
                            date_from=None,
                            date_to=None,
                            days_from=50,
                            days_to=0,
                        )
                        alias_to_cat = get_translation_maps(readJSON())
                        pool, did_backtrack, days_backtracked = get_discovery_pool(
                            window_start=window_start,
                            window_end=window_end,
                            size=size,
                            backtrack=True,
                        )
                        final_ids, disc_signals = build_discovery_playlist(
                            pool,
                            history,
                            user,
                            size,
                            alias_to_cat,
                        )
                        if final_ids and len(final_ids) != 0:
                            push_playlist(
                                final_ids,
                                user,
                                disc_signals,
                                playname="Discovery Pool",
                                newPlaylist=False,
                                playlist_type="discovery",
                            )
                            backtrack_note = (
                                f", backtracked {days_backtracked}d"
                                if did_backtrack
                                else ""
                            )
                            console.print(
                                f"[green]✓ Discovery pushed for {user} ({len(final_ids)} songs{backtrack_note})[/green]"
                            )
                        else:
                            console.print(
                                f"[yellow]⚠ Discovery: no songs found for {user}[/yellow]"
                            )
                    except Exception as e:
                        console.print(
                            f"[red]✗ Discovery generation failed for {user}:[/red] {e}"
                        )
            else:
                console.print(
                    "[yellow]⚠ Auto generation skipped: no users configured.[/yellow]"
                )

            isGenerated = True

        if isGenerated:
            conf["playlist_generation"]["last_auto_generate"] = str(current_day)
            save_config(conf)
            isGenerated = False
            console.print("[dim]Auto generation timestamp saved.[/dim]")

        listenBrainzconf = tune_config["listenbrainz"]

        if listenBrainzconf.get("enabled", False) and not is_lb_syncing:
            pool_time_hours = float(listenBrainzconf.get("pool_listen_brainz", 6))
            config_last_synced = listenBrainzconf.get("last_synced") or 0
            effective_last_synced = (
                last_lb_sync_timestamp if last_lb_sync_timestamp else config_last_synced
            )
            current_unix_time = int(time.time())
            seconds_threshold = pool_time_hours * 3600

            if not effective_last_synced or (
                current_unix_time - int(effective_last_synced) >= seconds_threshold
            ):
                console.print(
                    f"[dim]ListenBrainz sync triggered (interval: {pool_time_hours}h).[/dim]"
                )
                is_lb_syncing = True
                last_lb_sync_timestamp = current_unix_time  
                
                def run_lb_sync():
                    try:
                        lb_conf = tune_config.get("listenbrainz", {})
                        if not lb_conf.get("username") or not lb_conf.get("enabled"):
                            console.print(
                                "[yellow]⚠ ListenBrainz sync skipped: username not set or disabled.[/yellow]"
                            )
                            return

                        LatestTimeStamp = fuzzyMatchingSong()

                        if LatestTimeStamp:
                            tune_config["listenbrainz"]["last_synced"] = int(
                                LatestTimeStamp
                            )
                        else:
                            tune_config["listenbrainz"]["last_synced"] = int(
                                config_last_synced
                            )

                        save_config(tune_config)
                        console.print("[green]✓ ListenBrainz sync complete.[/green]")
                        run_lb_fuzzy_matching()
                    except Exception as e:
                        console.print(f"[red]✗ ListenBrainz sync failed:[/red] {e}")
                    finally:
                        nonlocal is_lb_syncing
                        is_lb_syncing = False

                lbSyncThread = threading.Thread(target=run_lb_sync, daemon=True)
                lbSyncThread.start()

        try:
            event = event_queue.get(timeout=2)
            if event == "nowPlaying":
                Watcher()
            elif event == "librarySync":
                sync_library()
                console.print("[green]✓ Library sync complete.[/green]")
        except Exception as e:
            if "Empty" not in str(type(e).__name__):
                console.print(f"[red]✗ Main loop error:[/red] {e}")
