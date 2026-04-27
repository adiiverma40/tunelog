# Tunelog, A light weight script to create a playlist recommendation system.
# It tracks how user react to certain music and on that it create a playlist for that user


# features implemented till now :
# 1. Watcher : watches every user and stores it in active dictornary
# 2. log_history : logs history to the database :
#         if song is new, uses inster to create a new line
#         if song is prexisting, uses update to change played, percentage,
# 3.


# UPDATE :
#     1. updated the logic to check repeat, instead of every two signal count as repeate,
#         if and only if last intreaction was positive or repeat it will count as repeat


# TODO:

# implement a better system to signal positive and stuff
#     -can be done by , when song change detected, update database, by subtracting start and end time of the song to log the played time, - done

# implement QUEUE
# url_queue = navidrome_url("getPlayQueue")
# print("queue:" ,url_queue)
# stop from going 200%

# existing 509
# [UPDATE] adii | Pal Bhar | 104%
# existing 510
# [UPDATE] adii_mobile | Soch Na Sake | 238%    done

# implement loging when song changes done


# ISSUES AND FIXS


## CHANGING APPROACH, INSTEAD OF CHECKING EVERY 5 SEC, WE WILL USE SSE
## SSE will return events, when the event is playingnow, use watcher to get the details
# use threading


##ISSUE: when using mobile client for navidrom, Tempo, it reports twice for the nowplayingcount event in sse
#           - this issue causes to run watcher multiple times,


# print("main")

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


def main():
    # Database
    proxyPort = int(os.getenv("PROXY_PORT", 4534))
    with console.status("[bold green]Initializing Database ..."):
        try:
            init_db()
            init_db_lib()
            init_db_usr()
            init_db_playlist()
            init_search_db()
            status_registry.update("Db", status="initialized")
            console.print("[bold yellow]Freeing Up Database Size TuneLog")
            conn = get_db_connection()
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("VACUUM")
            conn.close()
        except Exception as e:
            status_registry.update("Db", status="crashed", error=e)
            console.print("[bold red]Failed TO Initialize Database")
    console.print("[bold green]Database Initialized Successfully")

    with console.status("[bold green]Starting API/Proxy & Verifying Port 8000..."):
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
                kwargs={"host": "0.0.0.0", "port": proxyPort ,  "log_level": "warning"} ,
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
                    f"[bold red]API Failed to Bind:[/bold red] Port {proxyPort} is likely already in use."
                )
                sys.exit(1)
            else:
                status_registry.update("uvicorn", status="running")
                console.print(
                    f"[bold green]API Started & Verified on Port {proxyPort}[/bold green]"
                )
            if not uvicornThread.is_alive():
                status_registry.update(
                    "uvicorn", status="crashed", error="Port Conflict"
                )
                console.print(
                    "[bold red]API Failed to Bind:[/bold red] Port 8000 is likely already in use."
                )
                sys.exit(1)
            else:
                status_registry.update("uvicorn", status="running")
                console.print(
                    "[bold green]API Started & Verified on Port 8000[/bold green]"
                )
        except Exception as e:
            status_registry.update("uvicorn", status="crashed", error=str(e))
            console.print(
                f"[bold red]API Server Thread Initialization Failed:[/bold red] {e}"
            )
            sys.exit(1)

    # Watcher

    with console.status("[bold green]Starting Watcher Thread"):
        try:
            watcherThread = threading.Thread(target=start_sse, daemon=True)
            watcherThread.start()
            time.sleep(2.0)
            if not watcherThread.is_alive():
                status_registry.update(
                    "watcher", status="crashed", error="navidrome error"
                )
                console.print(
                    "[bold red]Failed to start SSE, check if Navidrome is running"
                )
                sys.exit(1)
            else:
                status_registry.update("watcher", status="running")
                console.print("[bold green]Watcher Started Succesfully")
        except Exception as e:
            status_registry.update("watcher", status="crashed", error=str(e))
            console.print(
                f"[bold red]Watcher Thread Initialization Failed:[/bold red] {e}"
            )
            sys.exit(1)

    last_auto_sync_day = None
    isGenerated = False
    
    is_lb_syncing = False
    while True:
        if library._startSyncSong and not library._isSyncing:
            console.print("[bold blue] Manual sync triggered from UI...")
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
                f"[bold blue] Auto sync triggered at {now.strftime('%H:%M')}..."
            )
            last_auto_sync_day = current_day
            syncThread = threading.Thread(target=autoSyncWithFallback, daemon=True)
            syncThread.start()
        playlistConf = tune_config["playlist_generation"]

        conf = tune_config

        if playlistConf["auto_generate_playlist"] and playlistConf[
            "last_auto_generate"
        ] != str(current_day):

            if current_hour == playlistConf["auto_generate_time"]:

                console.print(
                    f"[bold yellow]Auto generate playlist triggered at {current_hour}"
                )
                size = playlistConf["playlist_size"]
                explicit_filter = playlistConf["auto_generate_explicit"]
                injection = playlistConf["auto_generate_injection"]
                library1, history = getDataFromDb()
                for user in playlistConf["auto_generate_for"]:
                    scores = score_song(
                        user, history_dict=history, library_dict=library1
                    )
                    unheard, unheard_ratio , all_time = get_unheard_songs(library1 , user)
                    wildcards = get_wildcard_songs(scores, user)
                    playlist, song_signals = build_playlist(
                        library1,
                        history,
                        scores,
                        unheard,
                        wildcards,
                        unheard_ratio,
                        all_time ,
                        user,
                        explicit_filter,
                        size,
                        injection,
                    )
                    push_playlist(playlist, user, song_signals)
                    isGenerated = True
        if isGenerated:
            conf["playlist_generation"]["last_auto_generate"] = str(current_day)
            save_config(conf)
            isGenerated = False
        listenBrainzconf = tune_config["listenbrainz"]
        
        if listenBrainzconf.get("enabled", False) and not is_lb_syncing:
            pool_time_hours = float(listenBrainzconf.get("pool_listen_brainz", 6))
            last_time_synced = listenBrainzconf.get("last_synced")
            # print("last sync should be zero : " , last_time_synced)
            current_unix_time = int(time.time())
            seconds_threshold = pool_time_hours * 3600
            if not last_time_synced or (
                current_unix_time - int(last_time_synced) >= seconds_threshold
            ):

                console.print(
                    f"\n[bold magenta]ListenBrainz Auto-Sync Triggered[/bold magenta] (Interval: {pool_time_hours}h)"
                )
                is_lb_syncing = True
                def run_lb_sync():
                    try:

                        lb_conf = tune_config.get("listenbrainz", {})
                        if not lb_conf.get("username") or not lb_conf.get("enabled"):
                            console.print("[yellow]LB Sync skipped: username not set or disabled[/yellow]")
                            return

                        isFuzz = fuzzyMatchingSong()
                        print(isFuzz)
                        # if isFuzz:
                        
                        tune_config["listenbrainz"]["last_synced"] = int(time.time())
                        save_config(tune_config)
                        console.print("[bold green]ListenBrainz Sync Completed and Timestamp Updated[/bold green]")
                    except Exception as e:
                        console.print(f"[bold red]ListenBrainz Auto-Sync Failed:[/bold red] {e}")
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
                console.print("[bold blue]Tunelog library Sync -- done")

        except Exception as e:
            if "Empty" not in str(type(e).__name__):
                print(f"[ERROR] main loop: {e}")
