import time
import threading
import asyncio
import json
from rich.console import Console
import os

console = Console()


class GlobalStatus:
    def __init__(self):
        self._data = {
            "main": {"heartbeat": time.time(), "error": "", "status": "init"},
            "SSE": {"heartbeat": time.time(), "error": "", "status": "init"},
            "sync": {"heartbeat": time.time(), "error": "", "status": "idle"},
            "genre": {"heartbeat": time.time(), "error": "", "status": "idle"},
            "star": {"heartbeat": time.time(), "error": "", "status": "idle"},
            "Db": {"heartbeat": time.time(), "error": "", "status": "idle"},
            "uvicorn": {"heartbeat": time.time(), "error": "", "status": "idle"},
            "watcher": {"heartbeat": time.time(), "error": "", "status": "idle"},
            "import": {"heartbeat": time.time(), "error": "", "status": "idle"},
        }
        self.lock = threading.Lock()

    def update(self, thread_name, status=None, error=""):
        with self.lock:
            if thread_name in self._data:
                self._data[thread_name]["heartbeat"] = time.time()
                if status:
                    self._data[thread_name]["status"] = status
                if error:
                    self._data[thread_name]["error"] = error

    def get_all(self):
        with self.lock:
            return self._data.copy()


status_registry = GlobalStatus()


class SyncState:
    sync_running = False
    sync_stop = False

    fallback_running = False
    fallback_processed = 0
    fallback_total = 0
    fallback_stop = False


_subscribers: list[tuple[asyncio.Queue, asyncio.AbstractEventLoop]] = []


def broadcast(field: str, data: list):
    payload = json.dumps({field: data})
    for q, loop in _subscribers:
        loop.call_soon_threadsafe(q.put_nowait, payload)


class _ReactiveList(list):
    def __init__(self, field_name: str):
        super().__init__()
        self._field = field_name

    def append(self, item):
        super().append(item)
        broadcast(self._field, list(self))


class NotificationStatus:
    # print("function called")
    def __init__(self):
        self.songState = _ReactiveList("songState")
        self.playlist = _ReactiveList("playlist")
        self.starredSong = _ReactiveList("starredSong")


notification_status = NotificationStatus()

app_state = SyncState()


# ALL VARIABLES


CONFIG_DIR = "./config"
CONFIG_FILE_PATH = f"{CONFIG_DIR}/config.json"

DEFAULT_CONFIG = {
    "playlist_generation": {
        "playlist_size": 40,
        "wildcard_day": 60,
        "auto_generate_playlist": True,
        "auto_generate_time": 4,
        "auto_generate_when_complete": True,
        "auto_generate_completion_percent": 80,
        "auto_generate_explicit" : "all",
        "auto_generate_for" : [],
        "auto_generate_injection" : True , 
        "last_auto_generate" : 0 , 
        "signal_weights": {"repeat": 3, "positive": 2, "partial": 0, "skip": -2},
        "slot_ratios": {
            "positive": 0.35,
            "repeat": 0.35,
            "partial": 0.25,
            "skip": 0.05,
        },
        "injection_breakdown": {"signal": 0.57, "unheard": 0.35, "wildcard": 0.08},
    },
    "behavioral_scoring": {
        "skip_threshold_pct": 30,
        "positive_threshold_pct": 80,
        "repeat_time_window_min": 30,
        "stale_session_timeout_sec": 600,
        "min_listens_for_star": 3,
        "historical_decay_factor": 0.9,
    },
    "sync_and_automation": {
        "auto_sync_hour": 2,
        "timezone": "Asia/Kolkata",
        "use_itunes_fallback": False,
        "auto_sync_after_navidrome": True,  ## for auto syncing after navidrome sync library
    },
    "api_and_performance": {
        "max_fuzzy_iterations": 500,
        "api_max_retries": 3,
        "api_retry_delay_sec": 3,
        "itunes_search_depth": 200,
        "sync_confidence": {
            "min_match_score": 70,
            "metadata_overwrite_score": 80,
            "genre_map_strictness": 95,
            "duration_tolerance_pct": 10,
        },
    },
    "jam": {
        "same_song_in_queue": False,
        "only_host_change_queue": False,
        "only_host_clear_queue": True,
        "only_host_add_queue": False,
    },
}

config_lock = threading.Lock()


def save_config(new_config_data):
    global tune_config
    with config_lock:
        try:
            with open(CONFIG_FILE_PATH, "w") as file:
                json.dump(new_config_data, file, indent=4)

            # tune_config.clear()
            tune_config.update(new_config_data)
            
            console.print("[bold green]Configuration saved successfully.[/bold green]")
            return True, "Success"

        except Exception as e:
            error_msg = f"Failed to save config: {e}"
            console.print(f"[bold red]{error_msg}[/bold red]")
            return False, error_msg


def _write_default_config(data):
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_FILE_PATH, "w") as file:
            json.dump(data, file, indent=4)
    except OSError as e:
        console.print(f"[bold red]Failed to write default config.json:[/bold red] {e}")


def load_config():
    try:
        with open(CONFIG_FILE_PATH, "r") as file:
            data = json.load(file)
            return data

    except FileNotFoundError:
        console.print(
            "[yellow]config.json missing. Creating fresh default file.[/yellow]"
        )
        _write_default_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG

    except json.JSONDecodeError as e:
        console.print(
            f"[bold red]config.json is corrupted:[/bold red] {e}. Resetting to defaults."
        )
        _write_default_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG


tune_config = load_config()
