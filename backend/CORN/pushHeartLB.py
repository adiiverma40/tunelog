from core.db import get_db_connection_lib, get_db_connection_usr
from core.crypto import decrypt_token
from rich.console import Console
from rich.panel import Panel
from rich import box
import requests
import sqlite3
import time

console = Console()

LB_HEADERS = {
    "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)"
}
LB_BASE = "https://api.listenbrainz.org"

pending_done_queue: list[tuple] = []
task_queue: list[dict] = [] 

def populateTask():
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR IGNORE INTO synced_tracks
        (songId, mbzRecordingID, starred, done)
        SELECT
            song_id,
            mbzRecordingID,
            starred,
            0
        FROM library
        WHERE starred = 1
    """)
    conn.commit()
    conn.close()


def getToken() -> list[dict]:
    usr_conn = get_db_connection_usr()
    cursor = usr_conn.cursor()
    cursor.execute(
        "SELECT username, LB_token FROM user "
        "WHERE LB_token IS NOT NULL AND LB_token != ''"
    )
    rows = cursor.fetchall()
    usr_conn.close()

    if not rows:
        console.print("[yellow]-- No users with LB_token found in users.db.[/yellow]")
        return []

    resolved = []
    for row in rows:
        db_username = row["username"]
        raw_token = row["LB_token"]

        try:
            decrypted = decrypt_token(raw_token)
        except Exception as e:
            console.print(f"  [red]✗ Decrypt failed for '{db_username}': {e}[/red]")
            continue

        resolved.append({
            "db_username": db_username,
            "decrypted_token": decrypted,
        })
        console.print(f"  [green]✓ Token loaded for '{db_username}'[/green]")

    return resolved


def get_authed_headers(decrypted_token: str) -> dict:
    return {**LB_HEADERS, "Authorization": f"Token {decrypted_token}"}

def mark_done_with_retry(song_id: str, retries: int = 5, delay: int = 2) -> bool:
    global pending_done_queue

    to_flush = pending_done_queue + [(song_id,)]

    conn = get_db_connection_lib()
    cursor = conn.cursor()

    for attempt in range(retries):
        try:
            cursor.executemany(
                "UPDATE synced_tracks SET done = 1 WHERE songId = ?",
                to_flush,
            )
            conn.commit()
            conn.close()
            flushed_count = len(to_flush)
            pending_done_queue.clear()
            if flushed_count > 1:
                console.print(
                    f"[bold green]-- Flushed {flushed_count} done marks "
                    f"(queue of {flushed_count - 1} + current)[/bold green]"
                )
            else:
                console.print(f"[bold green]-- Marked done: {song_id}[/bold green]")
            return True
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower():
                console.print(
                    f"[yellow]DB locked on mark-done, retry {attempt + 1}/{retries}...[/yellow]"
                )
                time.sleep(delay)
                continue
            conn.rollback()
            conn.close()
            console.print(f"[bold red]-- DB error on mark-done: {e}[/bold red]")
            break

    try:
        conn.close()
    except Exception:
        pass

    if (song_id,) not in pending_done_queue:
        pending_done_queue.append((song_id,))
        console.print(
            f"[yellow]-- mark-done failed for {song_id}, added to queue "
            f"(queue size: {len(pending_done_queue)})[/yellow]"
        )
    return False

def push_love_primary(song_id: str, mbz_id: str, token: str) -> bool:
    url = f"{LB_BASE}/1/feedback/recording-feedback"
    payload = {
        "recording_mbid": mbz_id,
        "score": 1,
    }
    try:
        r = requests.post(
            url,
            json=payload,
            headers=get_authed_headers(token),
            timeout=10,
        )
        if r.status_code == 200:
            console.print(
                f"[bold green]-- Love pushed via MBZ ID: {mbz_id}[/bold green]"
            )
            return True
        console.print(
            f"[yellow]-- Primary push failed (HTTP {r.status_code}): {r.text[:120]}[/yellow]"
        )
        return False
    except Exception as e:
        console.print(f"[yellow]-- Primary push exception: {e}[/yellow]")
        return False



def get_pending_tasks() -> None:
    global task_queue
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    rows = cursor.execute(
        "SELECT songId, mbzRecordingID FROM synced_tracks WHERE done = 0"
    ).fetchall()
    conn.close()
    task_queue = [{"song_id": row[0], "mbz_id": row[1] or ""} for row in rows]
    console.print(f"[cyan]Loaded {len(task_queue)} pending task(s) into memory queue.[/cyan]")


def pushStarredToListenBrainz():
    console.print(
        Panel.fit(
            "[bold magenta]ListenBrainz — Push Starred (Love)[/bold magenta]",
            box=box.DOUBLE_EDGE,
        )
    )

    populateTask()

    users = getToken()
    if not users:
        console.print("[bold red]No valid tokens. Aborting.[/bold red]")
        return

    get_pending_tasks()  

    if not task_queue:
        console.print("[bold green]-- No pending starred tracks to push.[/bold green]")
        return

    console.print(
        f"[bold cyan]Found {len(task_queue)} pending track(s) to love across "
        f"{len(users)} user(s).[/bold cyan]"
    )

    while task_queue:
        task = task_queue.pop(0) 
        song_id = task["song_id"]
        mbz_id = task["mbz_id"]

        console.print(f"\n[bold blue]── Processing: {song_id}[/bold blue]")

        all_users_ok = True

        for user in users:
            token = user["decrypted_token"]
            db_username = user["db_username"]

            console.print(f"  [dim]-- Pushing for user '{db_username}'...[/dim]")

            if mbz_id:
                success = push_love_primary(song_id, mbz_id, token)
                time.sleep(1.5)
            else:
                console.print(
                    f"  [yellow]-- No MBZ ID for {song_id}, skipping.[/yellow]"
                )
                success = False

            if not success:
                console.print(
                    f"  [bold red]-- All methods failed for '{db_username}' "
                    f"on song {song_id}. Skipping mark-done.[/bold red]"
                )
                all_users_ok = False

        if all_users_ok:
            mark_done_with_retry(song_id)
        else:
            console.print(
                f"[yellow]-- Skipping done-mark for {song_id} "
                f"(at least one user failed).[/yellow]"
            )