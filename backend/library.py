# to fetch and create library database from navidrome
# uses SEARCH3 api endpoint to build library database
# works by runing a loop thourgh the api

# TODO : ADD CHECKS FOR IF SONG ALDREADY EXISTS WITH DIFFRENT METADATA
# artist name : arijit singh ,
# artist name : arjeet singh may be recorded diffrently


# ISSUES AND FIXES
# Issue : Genre with slight diffrent name gets diffrent values, bollywood music and bollywood
# fix : used genre aliases to make bollywood and bollywood music same

import requests
import time
from config import build_url
from config import build_url, _extract, itunesApi
from db import init_db_lib, get_db_connection_lib
from time import sleep
from genre import autoGenre, sync_database_to_json


_auto_sync = 2
_toggle_itune = False
_startSyncSong = False
_isSyncing = False
_progress = 0
_stopSync = False
_fallbackStop = False
_timezone = "Asia/Kolkata"


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
    parts = raw.split("/")
    result = []
    for g in parts:
        # print(g)

        g = g.strip().lower()

        # print(g)
        # g = GENRE_ALIASES.get(g, g)  # if not in aliases, keep as-is

        # print(g)
        if g not in result:
            result.append(g)
    return ",".join(result)


def url(batch, offset):
    url = build_url("search3")
    song_url = url + f"&query=&songCount={batch}&songOffset={offset}"
    # print(song_url)
    return song_url


def fetch_all_song():
    all_song = []
    offset = 0
    batch = 5

    while True:
        data = _get_json(url(batch, offset))
        
        songs = data["subsonic-response"].get("searchResult3", {}).get("song", [])
        if not songs:
            break

        all_song.extend(songs)
        offset += batch
        # print(f"[SYNC] fetched {len(all_song)} songs so far...")

    return all_song


def remove_deleted_songs(navidrome_ids: set):
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    db_ids = {
        row[0] for row in cursor.execute("SELECT song_id FROM library").fetchall()
    }

    deleted_ids = db_ids - navidrome_ids

    if not deleted_ids:
        # print(f"[CLEANUP] No deleted songs found — library is in sync")
        conn.close()
        return

    print(
        f"[CLEANUP] Found {len(deleted_ids)} songs in DB not in Navidrome — deleting..."
    )

    for song_id in deleted_ids:
        title = cursor.execute(
            "SELECT title FROM library WHERE song_id = ?", (song_id,)
        ).fetchone()
        # print(f"[CLEANUP DELETE] {title[0] if title else song_id}")

        cursor.execute("DELETE FROM library WHERE song_id = ?", (song_id,))

    conn.commit()
    conn.close()
    print(f"[CLEANUP] Done — removed {len(deleted_ids)} songs")


def sync_library():
    global _isSyncing, _progress, _startSyncSong, _stopSync

    _isSyncing = True
    _startSyncSong = False
    _progress = 0

    songs = fetch_all_song()
    total = len(songs)

    conn = get_db_connection_lib()
    cursor = conn.cursor()

    inserted = 0
    updated = 0
    skipped = 0

    for i, song in enumerate(songs):
        song_id = song["id"]
        song_title = song.get("title", "")
        song_artist = song.get("artist", "")

        existing = cursor.execute(
            "SELECT explicit, genre FROM library WHERE song_id = ?", (song_id,)
        ).fetchone()

        if existing:
            explicit_val = existing[0]
            genre_val = existing[1]

            if explicit_val and explicit_val != "":
                skipped += 1
                _progress = round((i + 1) / total * 100, 2)
                # print(
                #     f"[SKIP] {song_title} | explicit={explicit_val} genre={genre_val}"
                # )
                continue

            # explicit is NULL
            if _toggle_itune:
                # print(f"[ITUNES CALL] {song_title} | {song_artist}")
                raw_itunes = itunesApi(song_title, song_artist)
                iTunes = raw_itunes or {}
                # print(f"[ITUNES RAW] {song_title} → {raw_itunes}")

                if not iTunes:
                    # print(f"[ITUNES MISS] {song_title} — setting notInItunes")
                    cursor.execute(
                        """UPDATE library SET
                            explicit = 'notInItunes',
                            genre = COALESCE(NULLIF(genre, 'default'), 'default'),
                            last_synced = CURRENT_TIMESTAMP
                        WHERE song_id = ?""",
                        (song_id,),
                    )
                else:
                    # print("in else statement")
                    new_explicit = iTunes.get("explicit", "notInItunes")
                    new_genre = normalise_genre(
                        iTunes.get("genre") or song.get("genre")
                    )
                    cursor.execute(
                        """UPDATE library SET
                            explicit = ?,
                            genre = ?,
                            last_synced = CURRENT_TIMESTAMP
                        WHERE song_id = ?""",
                        (new_explicit, new_genre, song_id),
                    )

                    result = cursor.execute(
                        "SELECT explicit FROM library WHERE song_id = ?", (song_id,)
                    ).fetchone()
                    
                updated += 1

            else:
                skipped += 1

        else:
            if _toggle_itune:
                raw_itunes = itunesApi(song_title, song_artist)
                iTunes = raw_itunes or {}
                
                if not iTunes:
                    explicit = "notInItunes"
                    genre = normalise_genre(song.get("genre"))
                    artist = song.get("artist", "")
                    album = song.get("album", "")
                    duration = song.get("duration", 0)
                    # print(f"[ITUNES MISS NEW] {song_title} | genre={genre}")
                else:
                    explicit = iTunes.get("explicit")
                    genre = normalise_genre(iTunes.get("genre") or song.get("genre"))
                    artist = iTunes.get("artist") or song.get("artist", "")
                    album = iTunes.get("album") or song.get("album", "")
                    duration = (
                        (iTunes.get("duration") // 1000)
                        if iTunes.get("duration")
                        else song.get("duration", 0)
                    )
                    # )
            else:
                explicit = None
                genre = normalise_genre(song.get("genre"))
                artist = song.get("artist", "")
                album = song.get("album", "")
                duration = song.get("duration", 0)
                
            cursor.execute(
                """
                INSERT INTO library (song_id, title, artist, album, genre, duration, explicit)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (song_id, song_title, artist, album, genre, duration, explicit),
            )

            inserted += 1

        _progress = round((i + 1) / total * 100, 2)
        print(
            f"[SYNC] {_progress}% | inserted={inserted} updated={updated} skipped={skipped}",
            end="\r",
        )

        if (i + 1) % 5 == 0:
            conn.commit()

            print(f"[SYNC] Committed at {i + 1} songs", end="\r")
            if _stopSync == False:
                continue
            else:
                print("Stopped syncing")
                break

    conn.commit()
    conn.close()

    # cross-reference remove songs deleted from Navidrome
    navidrome_ids = {song["id"] for song in songs}
    print(
        f"[CLEANUP] Cross-referencing {len(navidrome_ids)} Navidrome songs against DB..."
    )
    remove_deleted_songs(navidrome_ids)
    print("[AUTO GENRE]Trying to get new genres")
    autoGenre()
    print("[Syncing Genre] Trying to sync genre ")
    sync_database_to_json()

    _isSyncing = False
    print(f"[SYNC] done — inserted={inserted} updated={updated} skipped={skipped}")


if __name__ == "__main__":
    init_db_lib()
    sync_library()
