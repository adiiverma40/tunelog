## watches SSE for event triggers

import json
import math
import time

import requests
from core.config import Navidrome_url, build_url, event_queue, login
from core.db import get_db_connection
from metadata.library import normalise_artist, normalise_genre
from misc.misc import push_star
from navidrome.state import notification_status, status_registry, tune_config
from rich.console import Console

console = Console()

autoSync = tune_config["sync_and_automation"].get("auto_sync_after_navidrome", False)


def start_sse():
    isScanning = False
    while True:
        response = None
        try:
            with console.status("[bold green]Connecting to Navidrome SSE..."):
                creds = login()
                url = f"{Navidrome_url}/api/events?jwt={creds['jwt']}"

                response = requests.get(url, stream=True, timeout=(10, None))

                if response.status_code != 200:
                    raise Exception(f"Server returned {response.status_code}")

                console.print("[bold green]Connected to Navidrome SSE")
                status_registry.update("SSE", status="connected")

            event_type = None
            for line in response.iter_lines(decode_unicode=True):
                if not line or line.startswith(":"):
                    continue

                if line.startswith("event:"):
                    event_type = line.split(":", 1)[1].strip()

                elif line.startswith("data:"):
                    data = line.split(":", 1)[1].strip()
                    status_registry.update("SSE", status="running")
                    # print("event type : " , event_type , "data : " , data)
                    # print(event_type , " : " , data)
                    if event_type == "nowPlayingCount":
                        event_queue.put("nowPlaying")

                    elif event_type == "scanStatus":
                        try:
                            parsed = json.loads(data)
                            scanningNow = parsed.get("scanning", False)
                            if isScanning and not scanningNow:
                                console.print("[bold cyan]Scan Finnished")
                                if autoSync:
                                    console.print("[bold cyan]Starting Tunelog Sync")
                                    event_queue.put("librarySync")

                            if not isScanning and scanningNow:
                                console.print(
                                    "[bold cyan]Starting Library Sync in Navidrome"
                                )

                            isScanning = scanningNow
                        except Exception as e:
                            console.print("[bold red]Failed to parse data", data)
        except (
            requests.exceptions.ReadTimeout,
            requests.exceptions.ConnectionError,
        ) as e:
            console.print(
                "[bold yellow]SSE Connection lost (Timeout/Network). Retrying in 5s...[/bold yellow]"
            )
            status_registry.update("SSE", status="retrying", error=str(e))
            time.sleep(5)
            continue

        except Exception as e:
            console.print(f"[bold red]SSE Critical Failure:[/bold red] {e}")
            status_registry.update("SSE", status="crashed", error=str(e))
            time.sleep(10)
            continue


# ================================================
active = {}


def format_ms(ms):
    total_seconds = ms // 1000
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes} min {seconds} sec"


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
        "song_id": entry["id"],
        "user_id": entry["username"],
        "title": entry.get("title", ""),
        "album": entry.get("album", ""),
        "artist": normalise_artist(entry.get("artist", "")),
        "genre": normalise_genre(entry.get("genre")),
        "duration": entry["duration"],
        "positionMs": positionMs,
        "state": entry["state"],
        "playbackRate": 1,
        "tracker": PlaybackTracker(),
    }


def navidrome_url(endpoint):
    url = build_url(endpoint)
    response = requests.get(url)
    return response.json()


def Watcher():
    url_response = navidrome_url("getNowPlaying")
    entries = url_response["subsonic-response"].get("nowPlaying", {}).get("entry", [])

    for entry in entries:
        user_id = entry["username"]
        song_id = entry["id"]
        state = entry["state"]
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
            active[user_id]["state"] = state
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
                {
                    "username": user_id,
                    "song": stopped_entry["title"],
                    "state": "stopped",
                }
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


def calculate_dynamic_score(
    past_listen_count,
    signal_type,
    n_threshold=10,
    min_value=0.1,
    decay_rate=0.15,
):

    base_signal_value = tune_config["playlist_generation"]["signal_weights"].get(
        signal_type, 0
    )

    if base_signal_value <= 0:
        return float(base_signal_value)

    if past_listen_count <= 3:
        awarded_points = base_signal_value * 2.0

    elif past_listen_count <= n_threshold:
        awarded_points = float(base_signal_value)

    else:
        decay_steps = past_listen_count - n_threshold
        awarded_points = (base_signal_value - min_value) * math.exp(
            -decay_rate * decay_steps
        ) + min_value

    return round(awarded_points, 3)


def get_last_song_stats(song_id , cursor):
    cursor.execute(
        """
        SELECT score, COUNT(*) OVER() as play_count
        FROM listens
        WHERE song_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (song_id,),
    )
    row = cursor.fetchone()


    if row is None:
        return {"last_score": 0, "play_count": 0}

    last_score = row[0] if row[0] is not None else 0
    return {"last_score": last_score, "play_count": row[1]}

def log_history(song):
    played_ms = song["tracker"].get_projected_time()
    played = min(played_ms / 1000, song["duration"])
    percent_played = min(round((played / song["duration"]) * 100), 100)
    signal = signal_system(percent_played, song["song_id"], song["user_id"])

    conn = get_db_connection()
    cursor = conn.cursor()
    last = get_last_song_stats(song['song_id'] , cursor)
    score = calculate_dynamic_score(past_listen_count=last.get("play_count") , signal_type=signal)
    finalScore = score + int(last.get('last_score', 0) )
    console.print(
        f"[bold blue] {song['user_id']} [/bold blue] Listened  [red]: [/red] [green] {song['title']} [/green]  [red]: [/red] "
        f"[purple]{format_ms(played * 1000)} [red] :  [/red]{percent_played} % [red] : [/red] {signal} [green]With Score : {finalScore} "
    )
    # print(f"final score {finalScore}")
    cursor.execute(
        """
        INSERT INTO listens(
            song_id, title, artist, album, genre, duration, played, percent_played, signal, user_id, score
            )
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
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
            finalScore
        ),
    )
    conn.commit()
    conn.close()
    push_star(song, signal)
