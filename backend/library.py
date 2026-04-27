# to fetch and create library database from navidrome
# uses SEARCH3 api endpoint to build library database
# works by runing a loop thourgh the api

# TODO : ADD CHECKS FOR IF SONG ALDREADY EXISTS WITH DIFFRENT METADATA
# artist name : arijit singh ,
# artist name : arjeet singh may be recorded diffrently


# ISSUES AND FIXES
# Issue : Genre with slight diffrent name gets diffrent values, bollywood music and bollywood
# fix : used genre aliases to make bollywood and bollywood music same

# GITHUB ISSUE
# 5 : better mapping of artist name from navidrome
# Fixxes :
# 1. implemented navidrome.toml for this tag
# Tags.Artist.Aliases = ["artist", "artists"]
# changed normalise_genre function to work like this
# Added a refresh option, if the data in library.db differe from data from navidrome update the library.db


## sync library rework
## initially it works as the navidrome api returns every 100 song aka 1 batch gets prossed and then committed at every 5 song

# the rework version will be better by
# 1. adding normalise_artist to get the aritsit of the song              [DONE]
# 2. Commiting at every 100 or 500 song for fast sync and 5 per song for slow sync [DONE - 100/5 via executemany]
# 3. adding a check up for songs if there is less song aka 4535 if used 500 as check point, 35 songs will be left, [DONE - flush_batches() after loop]
# 4. adding a clean up and comparison, loading the preexisting song and then matching for new or diffrenanc in the dict, if diff metadata , update it else create a new, [DONE]
# 5. the deletion code will be as it is , it will check if deleted songs are in database and will cleaned up [DONE - fixed missing arg bug]


# issue : using auto genre match the
# fix, store the genre as it is, during genre injection in playlist ,
# make it so before scoring genre it matches with genre.json for data on whcih messy or noisy genre
# belog to which category


import json  # ADDED
import requests
import time
from config import build_url, itunesApi
from db import init_db_lib, get_db_connection_lib , init_search_db

# from genre import autoGenre, sync_database_to_json
import re
from rich.console import Console
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
    TimeElapsedColumn,
)
from rich.panel import Panel
from rich.live import Live
from misc import crossCheckDatabase
from state import tune_config
import asyncio
import httpx
# from db import get_db_connection_lib

SEMAPHORE_LIMIT = 10

console = Console()

sync_config = tune_config["sync_and_automation"]
_auto_sync = sync_config["auto_sync_hour"]
_toggle_itune = sync_config["use_itunes_fallback"]
_timezone = sync_config["timezone"]

_startSyncSong = False
_isSyncing = False
_progress = 0
_stopSync = False
_fallbackStop = False

isDroppedSearchTable = False


def setSyncSettings(auto_sync=2, itunes=False, timezone="Asia/Kolkata"):
    global _auto_sync, _toggle_itune, _timezone
    _auto_sync = auto_sync
    _toggle_itune = itunes
    _timezone = timezone


def getSyncSettings():
    return {
        "auto_sync": _auto_sync,
        "use_itunes": _toggle_itune,
    }


def triggerSync(use_itunes=False):
    global _startSyncSong, _toggle_itune
    _toggle_itune = use_itunes
    _startSyncSong = True


def getSyncStatus():
    return {
        "is_syncing": _isSyncing,
        "progress": _progress,
        "start_sync": _startSyncSong,
    }


def _response_preview(response, limit=240):
    text = (response.text or "").strip().replace("\n", " ")
    return text[:limit] + ("..." if len(text) > limit else "")


def _get_json(url_value, retries=3):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(url_value, timeout=20)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = RuntimeError(f"Failed to call Navidrome API: {exc}")
        except requests.exceptions.JSONDecodeError as exc:
            content_type = response.headers.get("Content-Type", "unknown")
            preview = _response_preview(response)
            last_error = RuntimeError(
                "Navidrome API returned a non-JSON response while syncing library. "
                f"status={response.status_code}, content_type={content_type}, "
                f"url={response.url}, body_preview={preview!r}"
            )
        if attempt < retries:
            time.sleep(1.5 * attempt)
    raise last_error


def normalise_genre(raw):
    if not raw:
        return "default"
    parts = re.split(r"[/;•,]", raw)
    cleaned_genres = [g.strip().lower() for g in parts if g.strip()]
    unique_genres = list(dict.fromkeys(cleaned_genres))
    return ",".join(unique_genres)


def normalise_artist(raw):
    if not raw:
        return "Unknown"
    if " • " in raw:
        parts = [p.strip() for p in raw.split(" • ")]
        res = parts[1] if len(parts) > 1 else parts[0]
    else:
        res = raw
    primary_parts = re.split(r"[/;,&]", res)
    return primary_parts[0].strip()


def url(batch, offset):
    base_url = build_url("search3")
    song_url = base_url + f"&query=&songCount={batch}&songOffset={offset}"
    return song_url


def fetch_all_song():
    all_song = []
    offset = 0
    batch = 50

    with console.status("[bold yellow]Fetching song list from Navidrome..."):
        while True:
            data = _get_json(url(batch, offset))
            songs = data["subsonic-response"].get("searchResult3", {}).get("song", [])
            if not songs:
                break
            all_song.extend(songs)
            offset += batch

    return all_song


def fetchSongFromDB():
    db_songs = {}

    with console.status("[bold blue]Fetching library and lyrics from db..."):
        conn = get_db_connection_lib()
        cursor = conn.cursor()
        query = """
            SELECT 
                l.song_id, l.title, l.artist, l.album, l.genre, l.explicit, l.duration,
                l.artistId, l.artistJSON, l.albumId,
                m.lyrics
            FROM library l
            LEFT JOIN search_metadata m ON l.song_id = m.song_id
        """

        rows = cursor.execute(query).fetchall()
        conn.close()

        if not rows:
            return {}

        db_songs = {
            row[0]: {
                "song_id": row[0],
                "title": row[1],
                "artist": row[2],
                "album": row[3],
                "genre": row[4],
                "explicit": row[5],
                "duration": row[6],
                "artistId": row[7],
                "artistJSON": row[8],
                "albumId": row[9],
                "lyrics": row[10],
            }
            for row in rows
        }

        console.log(f"[bold green]Loaded {len(db_songs)} songs with metadata & lyrics.")
        return db_songs


def remove_deleted_songs(navidrome_ids: set, dbSongId: set):
    deleted_ids = dbSongId - navidrome_ids
    if not deleted_ids:
        return
    console.log(
        f"[bold red]CLEANUP:[/bold red] Found {len(deleted_ids)} stale songs. Removing..."
    )
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    try:
        delete_payload = [(song_id,) for song_id in deleted_ids]
        cursor.executemany("DELETE FROM library WHERE song_id = ?", delete_payload)
        conn.commit()
        console.log(
            f"[bold green]CLEANUP:[/bold green] Successfully removed {len(deleted_ids)} songs."
        )
    except Exception as e:
        console.log(f"[bold red]CLEANUP ERROR:[/bold red] {e}")
        conn.rollback()
    finally:
        conn.close()

       

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text) 
    text = re.sub(r"([a-z])\1{1,}", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
   
    return text


def normalize_dbSongs(dbSongs: dict) -> dict:
    normalized = {}
    SKIP_KEYS = {"song_id", "artistId", "albumId", "artistJSON" , "actualArtist" , "actualAlbum", "actualTitle"}
    
    console.print("[bold purple]Normalizing DB list[/bold purple]")
    for sid, song in dbSongs.items():
        new_song = {}
        new_song["actualArtist"] = song.get("artist", "")
        new_song["actualAlbum"] = song.get("album", "")
        # new_song["actualTitle"] = song.get("title", "")
        
        for key, value in song.items():
            if key in SKIP_KEYS:
                new_song[key] = value
            elif isinstance(value, str):
                new_song[key] = normalize_text(value)
            else:
                new_song[key] = value
                
        normalized[sid] = new_song
        
    return normalized

def populate_search_index(dbSongs):
    global isDroppedSearchTable
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    normlisedDb = normalize_dbSongs(dbSongs)
    try:
        fts_data = []
        metadata_data = []

        for sid, song in normlisedDb.items():
            current_lyrics = song.get("lyrics") or ""

            fts_data.append(
                (
                    sid,
                    song.get("title", ""),
                    song.get("artist", ""),         
                    song.get("actualArtist", ""),    
                    song.get("artistId", ""),
                    song.get("artistJSON", ""),
                    song.get("album", ""),           
                    song.get("actualAlbum", ""),     
                    song.get("albumId", ""),
                    current_lyrics,
                )
            )
            metadata_data.append((sid, current_lyrics))

        if not fts_data:
            return
        if not isDroppedSearchTable:
            console.print("[bold red]Dropping FTS Search table")
            cursor.execute("DROP TABLE song_search_index")
            console.print("[bold yellow]Closing the database")
            conn.commit()
            conn.close()
            console.print("[bold yellow]Initalising table")
            init_search_db()
            console.print("[bold green]Creating new db connetion")
            conn = get_db_connection_lib()
            cursor = conn.cursor()
            isDroppedSearchTable = True
        else:
            cursor.execute("DELETE FROM song_search_index")
        
        cursor.executemany(
            """INSERT INTO song_search_index 
               (song_id, title, artist, actualArtist, artistId, artistJSON, album, actualAlbum, albumId, lyrics) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            fts_data,
        )
        cursor.executemany(
            "INSERT OR REPLACE INTO search_metadata (song_id, lyrics) VALUES (?, ?)",
            metadata_data,
        )
        conn.commit()
        console.print(
            f"[bold green]Search Index & Metadata Refreshed:[/bold green] {len(fts_data)} tracks synced."
        )
    except Exception as e:
        console.print(f"[bold red]Indexing Error:[/bold red] {e}")
        conn.rollback()
    finally:
        conn.close()
        
        
async def fetch_lyrics_task(client, song_id, semaphore):
    async with semaphore:
        url = build_url("getLyricsBySongId") + f"&id={song_id}&f=json"
        try:
            resp = await client.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                lyrics_list = data.get("subsonic-response", {}).get("lyricsList", {})
                structured = lyrics_list.get("structuredLyrics", [])

                if structured:
                    lines_data = structured[0].get("line", [])
                    just_text = [line.get("value", "").strip() for line in lines_data]
                    clean_lyrics = "\n".join([text for text in just_text if text])
                    return song_id, clean_lyrics if clean_lyrics else "noLyricsInSong"

            return song_id, "noLyricsInSong"
        except Exception:
            return song_id, None


async def enrich_search_engine_async():
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    missing = cursor.execute(
        """
        SELECT song_id FROM library 
        WHERE song_id NOT IN (SELECT song_id FROM search_metadata WHERE lyrics IS NOT NULL)
    """
    ).fetchall()

    conn.commit()
    if not missing:
        console.log("[bold green]All lyrics are already up to date.")
        return
    ids_to_fetch = [row[0] for row in missing]
    console.log(
        f"[bold yellow]Async Enrichment:[/bold yellow] Fetching lyrics for {len(ids_to_fetch)} songs..."
    )

    semaphore = asyncio.Semaphore(SEMAPHORE_LIMIT)
    async with httpx.AsyncClient() as client:
        tasks = [fetch_lyrics_task(client, sid, semaphore) for sid in ids_to_fetch]
        results = []
        with Progress() as progress:
            task_id = progress.add_task("[cyan]Fetching Lyrics...", total=len(tasks))
            for f in asyncio.as_completed(tasks):
                res = await f
                results.append(res)
                progress.update(task_id, advance=1)

    valid_results = [(sid, lyr) for sid, lyr in results if lyr is not None]

    if valid_results:
        cursor.executemany(
            "INSERT OR REPLACE INTO search_metadata (song_id, lyrics) VALUES (?, ?)",
            valid_results,
        )
        for sid, lyr in valid_results:
            searchable_text = "" if lyr == "noLyricsInSong" else lyr
            cursor.execute(
                "UPDATE song_search_index SET lyrics = ? WHERE song_id = ?",
                (searchable_text, sid),
            )
        conn.commit()
        console.log(
            f"[bold green]Enrichment Done:[/bold green] Processed {len(valid_results)} songs."
        )


def sync_library():
    global _isSyncing, _progress, _startSyncSong, _stopSync

    _isSyncing = True
    _startSyncSong = False
    _progress = 0

    songs = fetch_all_song()
    dbSongs = fetchSongFromDB()
    console.print("[bold blue] Trying to update fts and search database")
    total = len(songs)

    fast_sync = not _toggle_itune
    batch_size = 100 if fast_sync else 5

    conn = get_db_connection_lib()
    cursor = conn.cursor()

    inserted = 0
    updated = 0
    skipped = 0

    insert_batch: list[tuple] = []
    update_batch: list[tuple] = []

    def flush_batches():
        if insert_batch:
            cursor.executemany(
                """INSERT INTO library 
                   (song_id, title, artist, album, genre, duration, explicit, artistId, artistJSON, albumId)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                insert_batch,
            )
            crossCheckDatabase(
                [(item[1], item[2], item[3], item[4], item[0]) for item in insert_batch]
            )
            insert_batch.clear()

        if update_batch:
            cursor.executemany(
                """UPDATE library
                   SET title=?, artist=?, album=?, genre=?, duration=?, explicit=?,
                       artistId=?, artistJSON=?, albumId=?,
                       last_synced=CURRENT_TIMESTAMP
                   WHERE song_id=?""",
                update_batch,
            )
            crossCheckDatabase(
                [(item[0], item[1], item[2], item[3], item[9]) for item in update_batch]
            )
            update_batch.clear()

        conn.commit()

    progress_bar = Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(bar_width=None),
        TaskProgressColumn(),
        TimeElapsedColumn(),
    )

    sync_task = progress_bar.add_task("[cyan]Syncing Library...", total=total)

    with Live(progress_bar, refresh_per_second=4):
        for i, song in enumerate(songs):
            if _stopSync:
                console.log("[bold red]Sync stopped by user.")
                break

            song_id = song["id"]
            song_title = song.get("title", "Unknown")
            song_artist = normalise_artist(song.get("artist", "Unknown"))
            nav_album = song.get("album", "")
            nav_duration = song.get("duration", 0)
            nav_genre = normalise_genre(song.get("genre"))

            raw_artists = song.get("artists", [])
            nav_artistId = raw_artists[0]["id"] if raw_artists else ""
            nav_artistJSON = json.dumps(raw_artists)
            nav_albumId = song.get("albumId", "")

            existing = dbSongs.get(song_id)

            if existing:
                metadata_changed = (
                    existing["title"] != song_title
                    or existing["artist"] != song_artist
                    or existing["album"] != nav_album
                    or existing["duration"] != nav_duration
                )

                if fast_sync:
                    if metadata_changed:
                        update_batch.append(
                            (
                                song_title,
                                song_artist,
                                nav_album,
                                nav_genre,
                                nav_duration,
                                existing["explicit"],
                                nav_artistId,
                                nav_artistJSON,
                                nav_albumId,
                                song_id,
                            )
                        )
                        updated += 1
                    else:
                        skipped += 1

                else:
                    existing_explicit = existing["explicit"]

                    if existing_explicit and existing_explicit != "":
                        if metadata_changed:
                            update_batch.append(
                                (
                                    song_title,
                                    song_artist,
                                    nav_album,
                                    nav_genre,
                                    nav_duration,
                                    existing_explicit,
                                    nav_artistId,
                                    nav_artistJSON,
                                    nav_albumId,
                                    song_id,
                                )
                            )
                            updated += 1
                        else:
                            skipped += 1
                    else:
                        try:
                            raw_itunes = itunesApi(song_title, song_artist)
                            iTunes = raw_itunes or {}

                            if not iTunes:
                                new_explicit = "notInItunes"
                                new_genre = nav_genre
                            else:
                                new_explicit = iTunes.get("explicit", "notInItunes")
                                new_genre = normalise_genre(
                                    iTunes.get("genre") or song.get("genre")
                                )
                                song_artist = iTunes.get("artist") or song_artist
                                nav_album = iTunes.get("album") or nav_album
                                if iTunes.get("duration"):
                                    nav_duration = iTunes["duration"] // 1000

                            update_batch.append(
                                (
                                    song_title,
                                    song_artist,
                                    nav_album,
                                    new_genre,
                                    nav_duration,
                                    new_explicit,
                                    nav_artistId,
                                    nav_artistJSON,
                                    nav_albumId,
                                    song_id,
                                )
                            )
                            updated += 1
                        except Exception:
                            skipped += 1

            else:
                if _toggle_itune:
                    try:
                        raw_itunes = itunesApi(song_title, song_artist)
                        iTunes = raw_itunes or {}

                        if not iTunes:
                            explicit = "notInItunes"
                        else:
                            explicit = iTunes.get("explicit")
                            nav_genre = normalise_genre(
                                iTunes.get("genre") or song.get("genre")
                            )
                            song_artist = iTunes.get("artist") or song_artist
                            nav_album = iTunes.get("album") or nav_album
                            if iTunes.get("duration"):
                                nav_duration = iTunes["duration"] // 1000
                    except Exception:
                        explicit = None
                else:
                    explicit = None

                insert_batch.append(
                    (
                        song_id,
                        song_title,
                        song_artist,
                        nav_album,
                        nav_genre,
                        nav_duration,
                        explicit,
                        nav_artistId,
                        nav_artistJSON,
                        nav_albumId,
                    )
                )
                inserted += 1

            _progress = round((i + 1) / total * 100, 2)
            progress_bar.update(
                sync_task,
                advance=1,
                description=f"[cyan]Syncing: [white]{song_title[:20]}...",
            )

            if (i + 1) % batch_size == 0:
                flush_batches()

    flush_batches()
    conn.close()
    try:
        console.log("[bold yellow]Starting Deep Enrichment (Lyrics)...")
        asyncio.run(enrich_search_engine_async())
    except Exception as e:
        console.log(f"[bold red]Lyrics Sync Failed:[/bold red] {e}")

    with console.status(
        "[bold cyan]Updating Search Index and Cleanup...", spinner="bouncingBar"
    ):
        latest_db_songs = fetchSongFromDB()
        populate_search_index(latest_db_songs)
        navidrome_ids = {song["id"] for song in songs}
        remove_deleted_songs(navidrome_ids, set(latest_db_songs.keys()))

    _isSyncing = False

    summary = (
        f"[bold green]Sync Complete![/bold green]\n\n"
        f"Total Processed: {total}\n"
        f"Inserted: [green]{inserted}[/green]\n"
        f"Updated: [yellow]{updated}[/yellow]\n"
        f"Skipped: [blue]{skipped}[/blue]"
    )
    console.print(Panel(summary, border_style="bright_blue", expand=False))
    
    console.print("[bold red]Freeing Up Database Size")
    conn = get_db_connection_lib()
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.execute("VACUUM")
    conn.close()


if __name__ == "__main__":
    init_db_lib()
    sync_library()
