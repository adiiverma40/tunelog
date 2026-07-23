import asyncio
import json
import os
import threading
import time
from typing import Tuple

from rich.console import Console

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


CONFIG_DIR = "./config"
CONFIG_FILE_PATH = f"{CONFIG_DIR}/config.json"
AUTOMATION_CONFIG_FILE_PATH = f"{CONFIG_DIR}/Automation_config.json"
SKIPPED_CONFIG_FILE_PATH = f"{CONFIG_DIR}/Skip_config.json"

DEFAULT_CONFIG = {
    "playlist_generation": {
        "playlist_size": 40,
        "wildcard_day": 60,
        "auto_generate_playlist": True,
        "auto_generate_time": 4,
        "auto_generate_when_complete": True,
        "auto_generate_completion_percent": 80,
        "auto_generate_explicit": "all",
        "auto_generate_for": [],
        "auto_generate_injection": True,
        "last_auto_generate": 0,
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
        "long_song_duration": 300,
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
        "auto_sync_after_navidrome": True,
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
    "listenbrainz": {
        "treat_data_as": "partial",
        "pool_listen_brainz": 1,
        "last_synced": 0,
        "for_users": [],
        "enabled": False,
        "dedup_window_seconds": 30,
        "PushLovedSongs": False,
    },
    "timeout": {
        "skip_count": 3,
        "timeout": 30,
    },
}

true = True
false = False

DEFAULT_AUTO_CONFIG = {
    "weekly_LB_fetch": {"last_synced": 0, "check_interval": 12},
    "cf_playlist_config": {
        "size": 50,
        "heard": 25,
        "unheard": 25,
        "unheard_genre_injection": true,
        "heard_genre_injection": false,
        "unheard_last_score": 0,
        "heard_last_score": 0,
        "auto_generate_time": 1,
        "Name": "Listenbrainz Playlist",
        "backfill_unheard_song": true,
        "use_blend": true,
        "last_score": 0,
        "fallbackScore": true,
        "for_users": [],
    },
}

DEFAULT_SKIP_CONFIG = {"base_path": "", "type": "", "action": "move"}

config_lock = threading.Lock()


def deep_merge_defaults(defaults: dict, loaded: dict) -> Tuple[dict, bool]:
    modified = False
    for key, default_val in defaults.items():
        if key not in loaded:
            loaded[key] = default_val
            modified = True
            console.print(
                f"[yellow]Config: missing key '{key}' restored to default.[/yellow]"
            )
        elif isinstance(default_val, dict) and isinstance(loaded[key], dict):
            _, child_modified = deep_merge_defaults(default_val, loaded[key])
            if child_modified:
                modified = True
    return loaded, modified


def _write_default_config(filepath: str, data: dict):
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(filepath, "w") as file:
            json.dump(data, file, indent=4)
    except OSError as e:
        console.print(
            f"[bold red]Failed to write default config to {filepath}:[/bold red] {e}"
        )


def load_generic_config(filepath: str, default_data: dict) -> dict:
    try:
        with open(filepath, "r") as file:
            data = json.load(file)

        data, modified = deep_merge_defaults(default_data, data)

        if modified:
            console.print(
                f"[yellow]Config {filepath} patched with missing defaults. Saving...[/yellow]"
            )
            _write_default_config(filepath, data)
        return data

    except FileNotFoundError:
        console.print(
            f"[yellow]{filepath} missing. Creating fresh default file.[/yellow]"
        )
        _write_default_config(filepath, default_data)
        return dict(default_data)

    except json.JSONDecodeError as e:
        console.print(
            f"[bold red]{filepath} is corrupted:[/bold red] {e}. Resetting to defaults."
        )
        _write_default_config(filepath, default_data)
        return dict(default_data)


def save_generic_config(
    filepath: str, new_data: dict, target_dict: dict, label: str
) -> Tuple[bool, str]:
    with config_lock:
        try:
            with open(filepath, "w") as file:
                json.dump(new_data, file, indent=4)

            target_dict.update(new_data)

            console.print(f"[bold green]{label} saved successfully.[/bold green]")
            return True, "Success"

        except Exception as e:
            error_msg = f"Failed to save {label.lower()}: {e}"
            console.print(f"[bold red]{error_msg}[/bold red]")
            return False, error_msg


tune_config = load_generic_config(CONFIG_FILE_PATH, DEFAULT_CONFIG)
automation_config = load_generic_config(
    AUTOMATION_CONFIG_FILE_PATH, DEFAULT_AUTO_CONFIG
)
skip_config = load_generic_config(SKIPPED_CONFIG_FILE_PATH, DEFAULT_SKIP_CONFIG)


def save_config(new_config_data: dict) -> Tuple[bool, str]:
    global tune_config
    return save_generic_config(
        CONFIG_FILE_PATH, new_config_data, tune_config, "Configuration"
    )


def save_automation_config(new_config_data: dict) -> Tuple[bool, str]:
    global automation_config
    return save_generic_config(
        AUTOMATION_CONFIG_FILE_PATH,
        new_config_data,
        automation_config,
        "Automation Configuration",
    )


def save_skip_config(newconfigdata: dict) -> Tuple[bool, str]:
    global skip_config
    return save_generic_config(
        SKIPPED_CONFIG_FILE_PATH, newconfigdata, skip_config, "skipConfig"
    )
