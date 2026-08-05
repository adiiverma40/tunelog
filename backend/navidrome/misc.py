# Functions that i dont know where to place

from core.db import get_db_connection_usr
from rich.console import Console
from Workers.worker_queue import ND_queue, NDWork

console = Console()


def get_ND_token(cursor):
    cursor.execute(
        "SELECT ND_token FROM user WHERE ND_token IS NOT NULL LIMIT 1"
    )
    row = cursor.fetchone()

    if row:
        return row[0]

    return ""


def fetch_ND_users(cursor):
    console.print("[bold blue]\\[USER SYNC] Fetching Navidrome Users")
    response = ND_queue.addWork(
        NDWork(method="get", endpoint="/api/user", token=get_ND_token(cursor))
    )
    return response


def save_ND_users(cursor, response):
    console.print("[bold blue]\\[USER SYNC] Saving Navidrome Users to DB")
    users = response if isinstance(response, list) else response.get("data", [])
    users_to_sync = []

    for user in users:
        username = user.get("userName")
        name = user.get("name", "")
        is_admin = 1 if user.get("isAdmin") else 0
        if username:
            users_to_sync.append((username, name, is_admin))

    if users_to_sync:
        try:
            sql = """
                INSERT INTO user (username, name, isAdmin)
                VALUES (?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    name = excluded.name,
                    isAdmin = excluded.isAdmin
            """
            cursor.executemany(sql, users_to_sync)
            cursor.connection.commit()

            console.print(
                f"[bold green]\\[USER SYNC] Successfully synced {len(users_to_sync)} users![/bold green]"
            )

        except Exception as e:
            console.print(f"[bold red]\\[USER SYNC] Database Error during sync: {e}[/bold red]")
    else:
        console.print("[yellow]\\[USER SYNC] No users found to sync.[/yellow]")


def sync_ND_users():
    console.print("[bold blue]\\[USER SYNC] Syncing Navidrome Users")
    conn = get_db_connection_usr()
    cursor = conn.cursor()
    users = fetch_ND_users(cursor)
    save_ND_users(cursor, users)
    conn.commit()
    conn.close()
