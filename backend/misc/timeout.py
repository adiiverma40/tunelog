# THIS FILE CONTAINS SCRIPT FOR THE SONG TIMEOUT SCRIPT
#

from datetime import datetime, timedelta

from navidrome.state import tune_config
from rich.console import Console

console = Console()
TUNECONFIG = tune_config["timeout"]


def timeout_song(username, song_id, rows, cursor):
    timeout_skip = TUNECONFIG["skip_count"]
    consecutive_skips = 0
    if len(rows) <= 9:
        console.print(f"[yellow]Not enough listens: {len(rows)}[/yellow]")
        return
    for row in rows:
        signal = row["signal"]

        if signal == "skip":
            consecutive_skips += 1
            if consecutive_skips >= int(timeout_skip):
                console.print(
                    f"[red]Timeout: {consecutive_skips} consecutive skips[/red]"
                )
                enter_timeout(username, song_id, cursor)
                break

        else:
            console.print(f"[green]Not enough skips: {consecutive_skips} consecutive skips[/green]")
            break

def enter_timeout(username, song_id, cursor):
    now = datetime.now()
    timeout_days = int(TUNECONFIG["timeout"])
    timeout_time = now + timedelta(days=timeout_days)
    formatted_timeout_time = timeout_time.strftime("%Y-%m-%d %H:%M:%S")


    # SQL Query by AI 
    cursor.execute("""
        INSERT INTO timeout (user_id, song_id, reason, timeout) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, song_id) DO UPDATE SET 
            timeout = excluded.timeout,
            reason = excluded.reason
    """, (username, song_id, "n skip", formatted_timeout_time))

    console.print(f"[green]Timeout entered: {formatted_timeout_time}[/green]")