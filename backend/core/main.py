import os
import sys
import threading
import time
import traceback
from datetime import datetime
from zoneinfo import ZoneInfo

import metadata.library as library
import requests
import uvicorn
from core.db import (
    get_db_connection,
    get_db_connection_lib,
    init_db,
    init_db_lib,
    init_db_MB,
    init_db_playlist,
    init_db_usr,
    init_search_db,
    # migrate_playlist_ids
    migrate_playlist_primary_key,
)
from CORN.pushHeartLB import pushStarredToListenBrainz
from dotenv import load_dotenv
from metadata.itunesFuzzy import useFallBackMethods
from metadata.library import normalise_artist, normalise_genre, sync_library
from misc.misc import push_star
from navidrome.state import (
    automation_config,
    false,
    notification_status,
    save_automation_config,
    save_config,
    status_registry,
    tune_config,
)
from navidrome.watcher import start_sse
from playlists.Listenbrainz import (
    FetchCF,
    build_LB_CF_playlist,
    fetchPendingSongs,
    fillMusicBrainzDB,
    filter_pool_by_genre,
    match_and_update_nvid,
    retryFailedSongs,
)
from playlists.playlist import (
    build_discovery_playlist,
    build_playlist,
    get_discovery_pool,
    get_translation_maps,
    get_unheard_songs,
    get_wildcard_songs,
    getDataFromDb,
    push_playlist,
    readJSON,
    resolve_date_window,
    score_song,
)
from rich.console import Console
from scrobble.listenBrainz import fuzzyMatchingSong

from .config import build_url, event_queue

load_dotenv()
console = Console()
active = {}

CURRENT_VERSION = "0.001"

def format_ms(ms):
    total_seconds = ms // 1000
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes} min {seconds} sec"


def navidrome_url(endpoint):
    url = build_url(endpoint)
    response = requests.get(url)
    return response.json()




class PlaybackTracker:
    def __init__(self):
        self.is_playing = False
        self.anchor_time = 0.0
        self.anchor_position_ms = 0.0

    def sync_state(self, state: str, position_ms: float):
        if state == "starting":
            self.is_playing = True
            self.anchor_position_ms = position_ms
            self.anchor_time = time.monotonic()

        elif state == "playing":
            self.is_playing = True
            self.anchor_position_ms = position_ms
            self.anchor_time = time.monotonic()

        elif state in ["paused", "stopped"]:
            self.is_playing = False
            self.anchor_position_ms = position_ms

    def get_projected_time(self) -> float:
        if not self.is_playing:
            return self.anchor_position_ms

        elapsed_real_time_ms = (time.monotonic() - self.anchor_time) * 1000
        return self.anchor_position_ms + elapsed_real_time_ms







def make_entry(entry, positionMs):
    return {
        "song_id":      entry["id"],
        "user_id":      entry["username"],
        "title":        entry.get("title", ""),
        "album":        entry.get("album", ""),
        "artist":       normalise_artist(entry.get("artist", "")),
        "genre":        normalise_genre(entry.get("genre")),
        "duration":     entry["duration"],
        "positionMs":   positionMs,
        "state":        entry["state"],
        "playbackRate": 1,
        "tracker":      PlaybackTracker(),
    }


def Watcher():
    url_response = navidrome_url("getNowPlaying")
    entries = url_response["subsonic-response"].get("nowPlaying", {}).get("entry", [])

    for entry in entries:
        user_id    = entry["username"]
        song_id    = entry["id"]
        state      = entry["state"]
        positionMs = entry["positionMs"]
        if user_id not in active:
            active[user_id] = make_entry(entry, positionMs)
            active[user_id]["tracker"].sync_state(state=state, position_ms=positionMs)
            console.print(
                f"[bold yellow][NEW][/bold yellow] [green]{user_id}[/green] "
                f"[purple]Started: {entry['title']}[/purple] at "
                f"[bold green]{format_ms(positionMs)}[/bold green] "
                f"[bold red][STATE]: {state}"
            )

        elif song_id == active[user_id]["song_id"]:
            active[user_id]["positionMs"] = positionMs
            active[user_id]["state"]      = state
            active[user_id]["tracker"].sync_state(state=state, position_ms=positionMs)
            console.print(
                f"[bold blue][SAME][/bold blue] [green]{user_id}[/green] "
                f"[purple]playing: {entry['title']}[/purple] at "
                f"[bold green]{format_ms(positionMs)}[/bold green] "
                f"[bold red][STATE]: {state}"
            )

        else:
            log_history(active.pop(user_id))
            active[user_id] = make_entry(entry, positionMs)
            active[user_id]["tracker"].sync_state(state=state, position_ms=positionMs)
            console.print(
                f"[bold yellow][NEW][/bold yellow] [green]{user_id}[/green] "
                f"[purple]Started: {entry['title']}[/purple] at "
                f"[bold green]{format_ms(positionMs)}[/bold green] "
                f"[bold red][STATE]: {state}"
            )

    current_users = {entry["username"] for entry in entries}
    for user_id in list(active.keys()):
        if user_id not in current_users:
            stopped_entry = active.pop(user_id)
            log_history(stopped_entry)
            notification_status.songState.append(
                {"username": user_id, "song": stopped_entry["title"], "state": "stopped"}
            )
            console.print(f"[bold red][STOP] {user_id} stopped")


def log_history(song):
    played_ms  = song["tracker"].get_projected_time()
    played     = min(played_ms / 1000, song["duration"])
    percent_played = min(round((played / song["duration"]) * 100), 100)
    signal = signal_system(percent_played, song["song_id"], song["user_id"])
    console.print(
        f"[bold blue] {song['user_id']} [/bold blue] Listened  [red]: [/red] [green] {song['title']} [/green]  [red]: [/red] "
        f"[purple]{format_ms(played * 1000)} [red] :  [/red]{percent_played} % [red] : [/red] {signal} "
    )
    conn = get_db_connection()
    cursor = conn.cursor()
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


def MusicbrainzSeeding():
    inserted = fillMusicBrainzDB()
    if inserted != 0:
        fetchPendingSongs()
        retryFailedSongs()
        match_and_update_nvid()
    console.print("[bold green]Checking for the pending song")
    fetchPendingSongs()
    match_and_update_nvid()


def musicBrainzThread():
    with console.status("[dim]Starting Musicbrainz song fetching[/dim]"):
        try:
            MusicbrainzThread = threading.Thread(target=MusicbrainzSeeding, daemon=True)
            MusicbrainzThread.start()
            time.sleep(2.0)

            if not MusicbrainzThread.is_alive():
                console.print(
                    "[red]✗ Watcher failed to start:[/red] check that Navidrome is running."
                )

        except Exception as e:
            console.print(f"[red]✗ Watcher startup failed:[/red] {e}")
            sys.exit(1)
    console.print("[green]✓ Musicbrainz seeding is running[/green]")


def generate_listenbrainz_playlist(user_id: str, saveConfig: bool = False):
    print(f"\n[LB_CF] Starting playlist generation for user: {user_id}")

    cf_config = automation_config.get("cf_playlist_config", {})
    playlist_name = cf_config.get("Name", "Listenbrainz Playlist")

    print("[LB_CF] Fetching database history and library...")
    library, history = getDataFromDb()
    alias_to_cat = get_translation_maps(readJSON())

    print("[LB_CF] Calculating standard Navidrome scores...")
    standard_scores = score_song(user_id, library, history)

    print("[LB_CF] Building Collaborative Filtering playlist...")
    song_ids, song_signals, new_heard_score, new_unheard_score = build_LB_CF_playlist(
        user_id=user_id,
        cf_config=cf_config,
        history_dict=history,
        alias_to_cat=alias_to_cat,
        standard_scores=standard_scores,
    )

    if not song_ids:
        print(f"[LB_CF] Error: No songs returned for {user_id}. Aborting.")
        return False

    print(f"[LB_CF] Pushing {len(song_ids)} songs to Navidrome...")
    push_playlist(
        song_ids=song_ids,
        user_id=user_id,
        song_signals=song_signals,
        playname=playlist_name,
        newPlaylist=False,
        playlist_type="listenbrainz_cf",
    )
    cf_config["last_generated"] = int(time.time())

    if saveConfig:
        cf_config["heard_last_score"] = new_heard_score
        cf_config["unheard_last_score"] = new_unheard_score
        print(
            f"[LB_CF] Saving score cursors → heard: {new_heard_score:.4f}, "
            f"unheard: {new_unheard_score:.4f}"
        )

    save_automation_config({"cf_playlist_config": cf_config})

    print(
        f"[LB_CF] Playlist generation complete!\n"
        f"         Heard cursor:   {new_heard_score:.4f}\n"
        f"         Unheard cursor: {new_unheard_score:.4f}\n"
    )
    return True


def autoGenerateLB_CF(current_hour: int, current_day, timezone_str: str):
    cf_config = automation_config.get("cf_playlist_config", {})
    cf_auto_time = cf_config.get("auto_generate_time", 1)
    cf_last_generated = cf_config.get("last_generated", 0)
    cf_users = cf_config.get("for_users", [])

    cf_last_run_date = None
    if cf_last_generated > 0:
        cf_last_run_date = datetime.fromtimestamp(
            cf_last_generated, ZoneInfo(timezone_str)
        ).date()

    if current_hour >= cf_auto_time and current_day != cf_last_run_date:
        if len(cf_users) > 0:
            console.print(
                f"[dim]Auto CF playlist generation triggered (Scheduled: {cf_auto_time}:00, Current: {current_hour}:00).[/dim]"
            )
            for user in cf_users:
                try:
                    generate_listenbrainz_playlist(user, saveConfig=False)
                    console.print(f"[green]✓ ListenBrainz CF pushed for {user}[/green]")
                except Exception as e:
                    console.print(
                        f"[red]✗ ListenBrainz CF generation failed for {user}:[/red] {e}"
                    )
        else:
            console.print(
                "[yellow]⚠ Auto CF generation skipped: no users configured in for_users.[/yellow]"
            )
        cf_config["last_generated"] = int(time.time())
        save_automation_config({"cf_playlist_config": cf_config})


def Auto_LB_CF(thread=True):
    fetch_conf = automation_config.get("weekly_LB_fetch", {})
    last_synced = fetch_conf.get("last_synced", 0)
    current_unix_time = int(time.time())

    is_scheduled = current_unix_time - last_synced >= 86400
    is_manual = not thread

    if is_scheduled or is_manual:

        if is_manual:
            console.print("[dim]Manual ListenBrainz CF fetch triggered via API.[/dim]")
        else:
            console.print(
                "[dim]Daily ListenBrainz CF fetch triggered (24h interval passed).[/dim]"
            )

        automation_config["weekly_LB_fetch"]["last_synced"] = current_unix_time
        try:
            save_automation_config(automation_config)
        except Exception as e:
            console.print(
                f"[red]✗ Failed to save config for weekly_LB_fetch:[/red] {e}"
            )

        def fetch_worker():
            try:
                if thread:
                    print("sleeping 15 sec to let other process initialize")
                    time.sleep(15)

                inserted = FetchCF()
                if inserted is not None and inserted >= 0:
                    MusicbrainzSeeding()
                # match_and_update_nvid()
            except Exception as e:
                console.print(f"[red]✗ ListenBrainz CF fetch crashed:[/red] {e}")

        if thread:
            fetch_thread = threading.Thread(target=fetch_worker, daemon=True)
            fetch_thread.start()
        else:
            fetch_worker()

def main():
    proxyPort = int(os.getenv("PROXY_PORT", 4534))

    with console.status("[dim]Initializing database...[/dim]"):
        try:
            init_db()
            init_db_lib()
            init_db_usr()
            init_db_playlist()
            init_search_db()
            init_db_MB()
            status_registry.update("Db", status="initialized")
            conn = get_db_connection()
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("VACUUM")
            conn.close()

            migrate_playlist_primary_key()
        except Exception:
            traceback.print_exc()
            raise
            # status_registry.update("Db", status="crashed", error=e)
            # console.print(f"[red]✗ Database initialization failed:[/red] {e}")
            # sys.exit(1)
    console.print("[green]✓ Database ready[/green]")

    with console.status("[dim]Starting API and proxy...[/dim]"):
        try:
            # print("api router")
            uvicornThread = threading.Thread(
                target=uvicorn.run,
                args=("api.api_entry:socket_app",),
                kwargs={"host": "0.0.0.0", "port": 8000, "log_level": "debug"},
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
            Watcher()

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

    console.print("[bold blue]Starting Library Sync")
    syncThread = threading.Thread(target=library.sync_library)
    syncThread.start()
    syncThread.join()

    if tune_config['listenbrainz']["PushLovedSongs"] : 
        console.print("[bold blue]Pushing Starred Song to Listenbrainz")
        pushThread = threading.Thread(target=pushStarredToListenBrainz , daemon=True)
        pushThread.start()
    else:
        console.print("[bold red]Starred Song Syncing Disabled, SKIPPING")

    console.print("Checking Musicbrainz Remaining Seedings")
    musicBrainzThread()

    while True:

        Auto_LB_CF()

        if library._startSyncSong and not library._isSyncing:
            console.print("[dim]Manual library sync triggered.[/dim]")
            syncThread = threading.Thread(target=library.sync_library, daemon=True)
            syncThread.start()

        now = datetime.now(ZoneInfo(library._timezone))
        current_hour = now.hour
        current_day = now.date()
        settings = library.getSyncSettings()
        auto_sync_hour = settings["auto_sync"]
        autoGenerateLB_CF(current_hour, current_day, library._timezone)

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
                        # FetchCF()
                        # print("skipping Fetch cf")
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
