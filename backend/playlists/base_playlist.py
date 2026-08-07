import json
from ast import Store

import requests
from core.config import build_url_for_user, getAllUser
from core.db import (
    get_db_connection,
    get_db_connection_lib,
    get_db_connection_playlist,
    get_db_connection_usr,
)
from fastapi import params
from misc.misc import log
from navidrome.state import notification_status
from numpy._core.numeric import e
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


from Workers.worker_queue import ND_queue, NDWork


def createPlaylist(token, public, name, comment):
    payload = {"public": public, "name": name, "comment": comment}

    playlistId = ND_queue.addWork(
        NDWork(method="post", endpoint="/api/playlist", params=payload, token=token)
    )
    id = playlistId.get("data", "").get("id", "")
    print("create playlist, ", id)
    return id


def fetch_playlist(playlist_id, token):
    result = ND_queue.addWork(
        NDWork(
            method="get",
            endpoint=f"/api/playlist/{playlist_id}",
            params={},
            token=token,
        )
    )
    return result


def delete_playlist_songs(playlist_id, song_count, token):
    if not song_count:
        return {"status": "success", "message": "No songs to delete"}

    query_string = "&".join([f"id={i}" for i in range(1, song_count + 1)])

    endpoint = f"/api/playlist/{playlist_id}/tracks?{query_string}"

    result = ND_queue.addWork(
        NDWork(
            method="delete",
            endpoint=endpoint,
            params={},
            token=token,
        )
    )
    return True


def update_Playlist_id_in_db(playlist_id, playType, user_id):
    conn = get_db_connection_usr()
    cursor = conn.cursor()
    playlistId = cursor.execute(
        "select playlistIds from user where username = ?", (user_id,)
    ).fetchone()
    if playlistId and playlistId[0]:
        try:
            playDict = json.loads(playlistId[0])

        except json.JSONDecodeError:
            playDict = {}

    else:
        playDict = {}

    playDict[playType] = playlist_id
    updated_playlistIds = json.dumps(playDict)
    cursor.execute(
        "update user set playlistIds = ? where username = ?",
        (updated_playlistIds, user_id),
    )
    conn.commit()
    conn.close()
    return True


def push_song_id_to_playlist(playlist_id, song_ids, token):
    playlod = {"ids": song_ids}
    result = ND_queue.addWork(
        NDWork(
            method="post",
            endpoint=f"/api/playlist/{playlist_id}/tracks",
            params=playlod,
            token=token,
        )
    )
    return result


def push_playlist(
    song_ids,
    user_id,
    song_signals,
    playname=None,
    newPlaylist=False,
    playlist_type="blend",
    comment="",
):
    USER_CREDENTIALS = getAllUser()
    token = USER_CREDENTIALS.get(user_id)

    if not token:
        console.print(
            f"[bold red]\\[Push playlist] Error:[/bold red] No credentials found for user '{user_id}'"
        )
        console.print(
            "[bold yellow]\\[Push playlist] Warning:[/bold yellow] Cannot proceed with playlist creation."
        )
        return

    name = playname if playname else PLAYLIST_NAME.format(user_id)
    comment = "Playlist Created using Tunelog"
    stored_id = None

    console.print(
        f"[bold cyan]\\[Push playlist][/bold cyan] Starting workflow for playlist: [italic]{name}[/italic] (Type: {playlist_type})"
    )

    if not newPlaylist:
        stored_id = getPlaylistIdForType(user_id, playlist_type)

        if stored_id:
            console.print(
                f"[bold green]\\[Push playlist][/bold green] Found existing playlist ID: [bold]{stored_id}[/bold]"
            )
            console.print(
                "[bold blue]\\[Push playlist][/bold blue] Fetching current playlist state..."
            )

            playlist = fetch_playlist(stored_id, token)

            if playlist.get("status", "") == "error":
                console.print(
                    f"[bold red]\\[Push playlist] Error:[/bold red] Failed to fetch playlist: {playlist.get('error_msg', 'Unknown error')}"
                )
                console.print(
                    f"[bold red]\\[Push playlist] Creating:[/bold red] Trying to create a new playlist with name: {name}"
                )

                stored_id = createPlaylist(token, False, name, comment)

                if stored_id:
                    console.print(
                        f"[bold green]\\[Push playlist] Success:[/bold green] Created new playlist '{name}' with ID: {stored_id}"
                    )
                else:
                    console.print(
                        f"[bold red]\\[Push playlist] Error:[/bold red] Failed to create new playlist '{name}'"
                    )
                    return
            else:
                songCount = playlist.get("data", {}).get("songCount", 0)

                if songCount > 0:
                    console.print(
                        f"[bold magenta]\\[Push playlist][/bold magenta] Deleting {songCount} existing songs..."
                    )
                    isDel = delete_playlist_songs(stored_id, songCount, token)

                    if isDel:
                        console.print(
                            "[bold green]\\[Push playlist][/bold green] Successfully cleared old songs."
                        )
                    else:
                        console.print(
                            "[bold red]\\[Push playlist] Error:[/bold red] Failed to clear old songs."
                        )
                else:
                    console.print(
                        "[bold yellow]\\[Push playlist][/bold yellow] Playlist is already empty, skipping deletion."
                    )

        else:
            console.print(
                f"[bold yellow]\\[Push playlist][/bold yellow] No existing playlist found for type '{playlist_type}'."
            )
            console.print(
                "[bold blue]\\[Push playlist][/bold blue] Creating new playlist..."
            )
            stored_id = createPlaylist(token, False, name, comment)
            if stored_id:
                console.print(
                    f"[bold green]\\[Push playlist][/bold green] Created new playlist. ID: {stored_id}"
                )

    else:
        console.print(
            "[bold blue]\\[Push playlist][/bold blue] 'newPlaylist' flag is True. Creating a fresh playlist..."
        )
        stored_id = createPlaylist(token, False, name, comment)
        if stored_id:
            console.print(
                f"[bold green]\\[Push playlist][/bold green] Created fresh playlist. ID: {stored_id}"
            )

    if stored_id:
        console.print(
            f"[bold blue]\\[Push playlist][/bold blue] Pushing {len(song_ids)} songs to playlist ID: {stored_id}..."
        )
        result = push_song_id_to_playlist(stored_id, song_ids, token)

        console.print(f"[dim]Push Result: {result}[/dim]")

        console.print(
            f"[bold green]\\[Push playlist] Success:[/bold green] Playlist '{name}' populated successfully!"
        )

        console.print(
            "[bold blue]\\[Push playlist][/bold blue] Saving playlist ID to database..."
        )
        update_Playlist_id_in_db(stored_id, playlist_type, user_id)

        console.print("[bold green]\\[Push playlist] FINISHED[/bold green]")
    else:
        console.print(
            "[bold red]\\[Push playlist] Error:[/bold red] Failed to secure a stored_id for pushing."
        )


def API_push_playlist(song_ids, user_id, playname="New CSV Playlist"):
    USER_CREDENTIALS = getAllUser()
    token = USER_CREDENTIALS.get(user_id)

    if not token:
        console.print(
            f"[bold red]\\[API Push] Error:[/bold red] No credentials found for user '{user_id}'"
        )
        return False

    comment = "Playlist Created via API / CSV Import"

    try:
        console.print(
            f"[bold cyan]\\[API Push][/bold cyan] Creating new playlist '{playname}' for user: {user_id}"
        )
        playlist_id = createPlaylist(token, False, playname, comment)

        if not playlist_id:
            console.print(
                f"[bold red]\\[API Push] Error:[/bold red] Playlist creation failed for: '{playname}'"
            )
            return False

        console.print(
            f"[bold blue]\\[API Push][/bold blue] Pushing {len(song_ids)} songs to playlist ID: {playlist_id}..."
        )
        result = push_song_id_to_playlist(playlist_id, song_ids, token)

        console.print(f"[dim]Push Result: {result}[/dim]")

        if result and result.get("status") == "success":
            console.print(
                f"[bold green]\\[API Push] Success:[/bold green] Playlist '{playname}' populated successfully!"
            )
            return True
        else:
            console.print(
                f"[bold red]\\[API Push] Error:[/bold red] Failed to add tracks to playlist. Result: {result}"
            )
            return False

    except Exception as ex:
        console.print(
            f"[bold red]\\[API Push] Error:[/bold red] Exception occurred: {ex}"
        )
        return False
