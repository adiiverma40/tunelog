import os
from dotenv import load_dotenv
import requests
import time
from navidrome.state import tune_config
from rich.console import Console

console = Console()

jamConfig = tune_config["jam"]

load_dotenv()

NAVIDROME_URL = os.getenv("BASE_URL", "http://localhost:4533")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "adii")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "1234")

songQueue = {}
future_queue_ids = []
past_queue_ids = []


def log_info(message):
    console.print(f"[bold cyan]{message}[/bold cyan]")


def log_success(message):
    console.print(f"[bold green]{message}[/bold green]")


def log_warning(message):
    console.print(f"[bold yellow]{message}[/bold yellow]")


def log_error(message):
    console.print(f"[bold red]{message}[/bold red]")


def getStream(id):
    return (
        f"{NAVIDROME_URL}/rest/stream?id={id}"
        f"&u={ADMIN_USERNAME}&p={ADMIN_PASSWORD}&v=1.16.1&c=tunelog&f=json"
    )


def getSongDetails(id):
    url = (
        f"{NAVIDROME_URL}/rest/getSong?id={id}"
        f"&u={ADMIN_USERNAME}&p={ADMIN_PASSWORD}&v=1.16.1&c=tunelog&f=json"
    )
    request = requests.get(url, timeout=15)
    request.raise_for_status()
    json_data = request.json()
    return json_data["subsonic-response"]["song"]


def getAlbumCover(id):
    return (
        f"{NAVIDROME_URL}/rest/getCoverArt?id={id}"
        f"&u={ADMIN_USERNAME}&p={ADMIN_PASSWORD}&v=1.16.1&c=tunelog&f=json"
    )


def _format_queue_item(song_id):
    item = songQueue.get(song_id, {})
    return {
        "id": song_id,
        "title": item.get("title", "Unknown Track"),
        "artist": item.get("artist", "Unknown Artist"),
        "album": item.get("album", ""),
        "duration": item.get("duration", 0),
        "coverArt": item.get("coverArt"),
        "coverArtUrl": item.get("coverArtUrl"),
        "user": item.get("user", "Unknown"),
        "streamUrl": item.get("streamUrl"),
    }


def currentQueue():
    return [_format_queue_item(sid) for sid in future_queue_ids]


def pastQueue():
    return [_format_queue_item(sid) for sid in past_queue_ids]


def AddQueue(song_id, title=None, artist="unknown", user="Unknown"):
    try:
        if not jamConfig["same_song_in_queue"]:
            if song_id in future_queue_ids:
                log_warning("Song already in queue")
                return

        song = getSongDetails(song_id)
        cover_art_id = song.get("coverArt")
        title = song.get("title", title or "Unknown Track")
        artist = song.get("artist", "Unknown Artist")
        album = song.get("album", "")
        duration = int(song.get("duration", 0))
        stream_url = getStream(song_id)
        cover_url = getAlbumCover(cover_art_id) if cover_art_id else None

        songQueue[song_id] = {
            "title": title,
            "artist": artist,
            "album": album,
            "duration": duration,
            "coverArt": cover_art_id,
            "coverArtUrl": cover_url,
            "user": user,
            "streamUrl": stream_url,
        }
        future_queue_ids.append(song_id)
        log_success(f"Added to Future Queue: {title} (ID: {song_id})")

    except Exception as e:
        songQueue[song_id] = {
            "title": title or "Unknown Track",
            "artist": "Unknown Artist",
            "album": "",
            "duration": 0,
            "coverArt": None,
            "user": user,
            "streamUrl": getStream(song_id),
        }
        future_queue_ids.append(song_id)
        log_error(f"Added fallback queue item for {song_id}: {e}")


def DeleteQueue(song_id):
    if song_id in future_queue_ids:
        future_queue_ids.remove(song_id)
    if song_id in past_queue_ids:
        past_queue_ids.remove(song_id)

    removed_song = songQueue.pop(song_id, None)
    if removed_song:
        log_success(f"Deleted: {removed_song['title']}")
    else:
        log_error(f"ID {song_id} not found in queue")


def ClearQueue():
    songQueue.clear()
    future_queue_ids.clear()
    past_queue_ids.clear()
    log_info("Queues cleared")


def sendSongPayload(id):
    song = getSongDetails(id)
    song_url = getStream(id)
    album_id = song.get("coverArt")

    payload = {
        "user": "Adii",
        "song": {
            "title": song.get("title", "Unknown Track"),
            "artist": song.get("artist", "Unknown Artist"),
            "album": song.get("album", ""),
            "duration": int(song.get("duration", 0)) * 1000,
        },
        "playback": {
            "positionMs": 0,
            "isPlaying": True,
        },
        "media": {
            "url": song_url,
            "albumArtUrl": getAlbumCover(album_id) if album_id else None,
        },
        "timestamp": int(time.time() * 1000),
    }

    return payload
 