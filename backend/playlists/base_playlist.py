import json

import requests
from core.config import build_url_for_user, getAllUser
from core.db import (
    get_db_connection,
    get_db_connection_lib,
    get_db_connection_playlist,
    get_db_connection_usr,
)
from misc.misc import log
from navidrome.state import notification_status
from rich.console import Console

console = Console(log_path=False, log_time=False)

PLAYLIST_NAME = "Tunelog - {}"


def get_translation_maps(genre_json):
    alias_to_cat = {}
    for category, aliases in genre_json.items():
        for alias in aliases:
            alias_to_cat[alias.lower()] = category.lower()
        alias_to_cat[category.lower()] = category.lower()
    return alias_to_cat


def analyze_user_ratios(user_id, history_dict, alias_to_cat):
    cat_counts = {}
    artist_counts = {}

    for sid, listens in history_dict.items():
        for l in listens:
            if l["user_id"] != user_id:
                continue

            raw_genres = l.get("genre", "")
            if raw_genres:
                genres = [g.strip().lower() for g in raw_genres.split(",") if g.strip()]
                for g in genres:
                    clean_cat = alias_to_cat.get(g, g)
                    cat_counts[clean_cat] = cat_counts.get(clean_cat, 0) + 1
            else:
                cat_counts["unknown"] = cat_counts.get("unknown", 0) + 1

            raw_artists = l.get("artist", "")
            if raw_artists:
                artists = [a.strip() for a in raw_artists.split(",")]
                for a in artists:
                    artist_counts[a] = artist_counts.get(a, 0) + 1

    return cat_counts, artist_counts


def get_allowed_songs(explicit_filter: str) -> dict:
    conn = get_db_connection_lib()
    if explicit_filter == "strict":
        rows = conn.execute(
            "SELECT song_id, title FROM library WHERE explicit = 'notExplicit'"
        ).fetchall()
    elif explicit_filter == "allow_cleaned":
        rows = conn.execute(
            "SELECT song_id, title FROM library WHERE explicit IN ('notExplicit', 'cleaned', 'notInItunes')"
        ).fetchall()
    else:
        rows = conn.execute("SELECT song_id, title FROM library").fetchall()
    conn.close()
    return {row[0]: row[1] for row in rows}


def getPlaylistIds(username: str) -> dict:
    conn = get_db_connection_usr()
    row = conn.execute(
        "SELECT playlistIds FROM user WHERE username = ?", (username,)
    ).fetchone()
    conn.close()
    if row and row[0]:
        try:
            return json.loads(row[0])
        except Exception:
            return {}
    return {}


def getPlaylistIdForType(username: str, playlist_type: str) -> str | None:
    ids = getPlaylistIds(username)
    return ids.get(playlist_type)


def setPlaylistIdForType(username: str, playlist_type: str, playlist_id: str):
    conn = get_db_connection_usr()
    row = conn.execute(
        "SELECT playlistIds FROM user WHERE username = ?", (username,)
    ).fetchone()
    current = {}
    if row and row[0]:
        try:
            current = json.loads(row[0])
        except Exception:
            current = {}
    current[playlist_type] = playlist_id
    conn.execute(
        "UPDATE user SET playlistIds = ? WHERE username = ?",
        (json.dumps(current), username),
    )
    conn.commit()
    conn.close()


def getDataFromDb():
    conn_lib = get_db_connection_lib()
    conn_hist = get_db_connection()
    cursor_lib = conn_lib.cursor()
    cursor_hist = conn_hist.cursor()

    libraryData = cursor_lib.execute("SELECT * FROM library").fetchall()
    historyData = cursor_hist.execute("SELECT * FROM listens").fetchall()

    library = {
        row[0]: {
            "title": row[1],
            "artist": row[2],
            "album": row[3],
            "genre": row[4],
            "explicit": row[10],
            "created": row[11],
        }
        for row in libraryData
    }

    history = {}
    for row in historyData:
        sid = row[1]
        if sid not in history:
            history[sid] = []

        history[sid].append(
            {
                "id": row[0],
                "title": row[2],
                "artist": row[3],
                "album": row[4],
                "genre": row[5],
                "signal": row[9],
                "timestamp": row[10],
                "user_id": row[11],
                "score": row[12],
            }
        )

    for sid in history:
        history[sid].sort(key=lambda x: x["timestamp"], reverse=True)

    return library, history


def get_all_users():
    listens_conn = get_db_connection()
    users_conn = get_db_connection_usr()

    listening_users = set(
        row[0]
        for row in listens_conn.execute(
            "SELECT DISTINCT user_id FROM listens"
        ).fetchall()
    )
    registered_users = set(
        row[0] for row in users_conn.execute("SELECT username FROM user").fetchall()
    )

    listens_conn.close()
    users_conn.close()
    return list(registered_users & listening_users)


def createPlaylistIfDeleteByNavidrome(base_url, name, data, user_id):
    try:
        create_url = f"{base_url}&name={name}"
        r2 = requests.post(create_url, data=data).json()

        if (
            "subsonic-response" not in r2
            or r2["subsonic-response"]["status"] == "failed"
        ):
            print("[ERROR] Failed to recreate playlist")
            return

        new_id = r2["subsonic-response"]["playlist"]["id"]
        conn_usr = get_db_connection_usr()
        conn_usr.execute(
            "UPDATE user SET playlistId = ? WHERE username = ?", (new_id, user_id)
        )
        conn_usr.commit()
        conn_usr.close()

        print(f"[TuneLog] Recreated playlist with new ID {new_id}")
        return new_id
    except Exception as e:
        print(f"[ERROR] Failed to recreate playlist: {e}")
        return


def push_playlist(
    song_ids,
    user_id,
    song_signals,
    playname=None,
    newPlaylist=False,
    playlist_type="blend",
):
    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    if not password:
        log(
            "error",
            f"No credentials found for user",
            source="playlist",
            user_id=user_id,
            event="error",
        )
        return

    name = playname if playname else PLAYLIST_NAME.format(user_id)
    stored_id = None

    if not newPlaylist:
        stored_id = getPlaylistIdForType(user_id, playlist_type)
        if not stored_id:
            try:
                fetch_url = build_url_for_user("getPlaylists", user_id, password)
                r_lists = requests.get(fetch_url).json()
                playlists = (
                    r_lists.get("subsonic-response", {})
                    .get("playlists", {})
                    .get("playlist", [])
                )
                for pl in playlists:
                    if pl.get("name") == name:
                        stored_id = pl["id"]
                        setPlaylistIdForType(user_id, playlist_type, stored_id)
                        console.print(
                            f"[yellow]Recovered playlist ID for {user_id}/{playlist_type} via name match[/yellow]"
                        )
                        break
            except Exception as e:
                console.print(f"[red]Name fallback lookup failed: {e}[/red]")

    base_url = build_url_for_user("createPlaylist", user_id, password)
    data = [("songId", sid) for sid in song_ids]

    def _do_create_fresh() -> dict | None:
        try:
            r = requests.post(f"{base_url}&name={name}", data=data).json()
            return r
        except Exception as e:
            log(
                "error",
                f"Failed to create fresh playlist: {e}",
                source="playlist",
                user_id=user_id,
                event="error",
            )
            return None

    if stored_id:
        url = f"{base_url}&playlistId={stored_id}"
    else:
        url = f"{base_url}&name={name}"

    try:
        r = requests.post(url, data=data).json()
        notification_status.playlist.append(
            {"username": user_id, "size": len(data), "type": "regenerate"}
        )

        if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
            error = (
                r.get("subsonic-response", {})
                .get("error", {})
                .get("message", "Unknown error")
            )

            if stored_id and "not found" in error.lower():
                console.print(
                    f"[yellow]Stale playlist ID '{stored_id}' for {user_id}/{playlist_type}. Recreating...[/yellow]"
                )
                setPlaylistIdForType(user_id, playlist_type, "")
                r = _do_create_fresh()
                if r is None:
                    return
                if (
                    "subsonic-response" not in r
                    or r["subsonic-response"]["status"] == "failed"
                ):
                    log(
                        "error",
                        f"Navidrome API failed even after recreate",
                        source="playlist",
                        user_id=user_id,
                        event="error",
                    )
                    return
            else:
                log(
                    "error",
                    f"Navidrome API failed: {error}",
                    source="playlist",
                    user_id=user_id,
                    event="error",
                )
                return

        final_id = r["subsonic-response"]["playlist"]["id"]
        setPlaylistIdForType(user_id, playlist_type, final_id)

        requests.get(
            build_url_for_user("updatePlaylist", user_id, password)
            + f"&playlistId={final_id}&public=false"
        )

    except Exception as e:
        log(
            "error",
            f"Failed to push playlist: {e}",
            source="playlist",
            user_id=user_id,
            event="error",
        )
        return

    conn_lib = get_db_connection_lib()
    placeholders = ",".join("?" * len(song_ids))
    rows = conn_lib.execute(
        f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
        song_ids,
    ).fetchall()
    conn_lib.close()

    lib_data = {row[0]: row for row in rows}
    conn = get_db_connection_playlist()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM playlist WHERE username = ? AND type = ?",
        (user_id, playlist_type),
    )

    insert_data = []
    for sid in song_ids:
        row = lib_data.get(sid)
        if row:
            insert_data.append(
                (
                    user_id,
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    (
                        song_signals.get(sid, "unheard")
                        if isinstance(song_signals, dict)
                        else song_signals
                    ),
                    row[4],
                    playlist_type,
                )
            )

    cursor.executemany(
        "INSERT INTO playlist (username, song_id, title, artist, genre, signal, explicit, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        insert_data,
    )
    conn.commit()
    conn.close()


def API_push_playlist(song_ids, user_id, playname="New CSV Playlist"):
    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    if not password:
        return False
    base_url = build_url_for_user("createPlaylist", user_id, password)
    url = f"{base_url}&name={playname}"
    payload = [("songId", sid) for sid in song_ids]

    try:
        response = requests.post(url, data=payload)
        r_json = response.json()
        if (
            "subsonic-response" in r_json
            and r_json["subsonic-response"]["status"] == "ok"
        ):
            new_id = r_json["subsonic-response"]["playlist"]["id"]
            update_url = build_url_for_user("updatePlaylist", user_id, password)
            requests.get(f"{update_url}&playlistId={new_id}&public=false")
            return True
        return False
    except Exception:
        return False
