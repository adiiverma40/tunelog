# for things i dont know where to put


# ISSUES : if user skip a song and then listen it once complete, one the 1st listen it will mark as 1 star but then he listen again so it will marked as repeated song and hence getting 5 star
# fix :  to use a percentage and priority system, lets say 1st listen was 1 star and 2nd time is 4 instead of giving it 5 stars get it avg of 1 and 4 star , also by prioriting when the song was listened,
# if song was listend 4 days ago get it less percentage,

# TODO : Add an option to update playlist from stars , plan is to get the song, and there stars, and use value defined by user to mark them as skip partial, complete and repeat


# # redo star sytem, lets instead of just writing the star on one intraction lets do in more intearactions like 2 or 3 and prioriting recent
# - take 2 or more intreaction as minimum to star
# - priorities recent interactions
# - decay to deplete  0.1 ^ days
# - add a buffer to check repeat, if a song is listen 2 times in 20 min then consider it a repeat
# - dont take data if its older then 2 months,


# Issues : the song's final score can be infinte, it will take ages to make it down,
# fix : take the last 15 song intreaction, max score = +3 and min = -2

# ISSUES : taking last 15 intreaction creates ineffiency if the user has listened to same song 15 times a day, the 1st intreaction and 15th has same weightage
# fix :  transistiong from times decay to  index

# tunelog-backend   | song :  Ranjha rating :  3.0 signal :  repeat     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  3.0 signal :  repeat     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  2.0 signal :  positive     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  2.0 signal :  positive     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0


# ISSUES : DATABASE IS LOCKEd
# FIX : executemany()
from config import build_url_for_user, getAllUser
import requests
from db import get_db_connection, get_db_connection_lib, db_supervisor
from state import status_registry
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.columns import Columns
import sqlite3
from datetime import datetime
import os
import json
import sys
from datetime import datetime
from loguru import logger


import os
import sys
import json
from loguru import logger





console = Console()



LOG_MAX_SIZE      = os.getenv("LOG_MAX_SIZE", "10 MB")
LOG_RETENTION     = os.getenv("LOG_RETENTION_DAYS", "7 days")
LOG_LEVEL         = os.getenv("LOG_LEVEL", "DEBUG").upper()

LOG_DIR = os.getenv("LOG_DIR", "/app/logs")
MAIN_LOG_FILE     = os.path.join(LOG_DIR, "main.log")
PLAYLIST_LOG_FILE = os.path.join(LOG_DIR, "playlist.jsonl")

os.makedirs(LOG_DIR, exist_ok=True)


star_map = {
    "skip": -2.0,
    "partial": 0.5,
    "positive": 2.0,
    "repeat": 3.0,
}


@db_supervisor
def _fetch_recent_listens(cursor, user_id, song_id):
    return cursor.execute(
        """
        SELECT * FROM listens
        WHERE user_id = ? AND song_id = ?
        ORDER BY timestamp DESC
        LIMIT 15
        """,
        (user_id, song_id),
    ).fetchall()


@db_supervisor
def _update_listens_genre(cursor, data):
    cursor.executemany("UPDATE listens SET genre = ? WHERE genre = ?", data)


@db_supervisor
def _update_library_genre(cursor, data):
    cursor.executemany("UPDATE library SET genre = ? WHERE genre = ?", data)


def push_star(song, signal):
    song_id = song["song_id"]
    user_id = song["user_id"]
    now = datetime.now()

    try:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
    except Exception as e:
        console.print(f"[bold red]push star: DB connection failed:[/bold red] {e}")
        status_registry.update("Db", status="crashed", error=str(e))
        return

    rows = _fetch_recent_listens(cursor, user_id, song_id)
    conn.close()

    if rows is None:
        console.print(
            f"[bold red]push star: Failed to fetch listens for {song['title']}[/bold red]"
        )
        return

    totalListens = len(rows)
    if totalListens < 3:
        console.print(
            f"[dim]push star: {song['title']} needs at least 3 listens (has {totalListens})[/dim]"
        )
        return

    totalWeight = 0
    rowSongScore = 0

    for i, row in enumerate(rows):
        weightage = 0.9**i
        rowSignal = row["signal"]
        rating = star_map.get(rowSignal, 0)

        rowSongScore += rating * weightage
        totalWeight += weightage

    if totalWeight <= 0:
        console.print(
            f"[yellow]push_star: totalWeight is 0 for {song['title']}, skipping.[/yellow]"
        )
        return

    songScore = rowSongScore / totalWeight

    if songScore >= 2.5:
        final_rating = 5
    elif songScore >= 1.5:
        final_rating = 4
    elif songScore >= 0.5:
        final_rating = 3
    elif songScore >= 0:
        final_rating = 2
    else:
        final_rating = 1

    table = Table(
        title=f"Recent History: {song['title']}",
        title_style="bold magenta",
        show_header=True,
        header_style="bold magenta",
    )
    table.add_column("Index", justify="right", style="dim")
    table.add_column("Signal", justify="center")
    table.add_column("Rating", justify="right")
    table.add_column("Weight", justify="right", style="italic")
    for i, row in enumerate(rows):
        row_signal = row["signal"]
        sig_style = (
            "red"
            if row_signal == "skip"
            else (
                "green"
                if row_signal == "positive"
                else "cyan" if row_signal == "repeat" else "white"
            )
        )

        table.add_row(
            str(i),
            f"[{sig_style}]{row_signal}[/{sig_style}]",
            f"{star_map.get(row_signal, 0):.1f}",
            f"{0.9**i:.3f}",
        )
    summary_content = (
        f"[bold white]User:[/bold white] {user_id}\n"
        f"[bold white]Calculated Score:[/bold white] [cyan]{songScore:.2f}[/cyan]\n"
        f"[bold white]Final Rating:[/bold white] [bold yellow]({final_rating} Stars)[/bold yellow]"
    )

    summary_panel = Panel(
        summary_content,
        title="[bold green]Star Update[/bold green]",
        border_style="green",
        expand=False,
    )

    console.print(table)
    console.print(summary_panel)

    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    if not password:
        console.print(
            f"[bold red]push_star: No credentials for user {user_id}[/bold red]"
        )
        status_registry.update(
            "main", status="warning", error=f"Missing credentials: {user_id}"
        )
        return

    url = build_url_for_user("setRating", user_id, password)
    url += f"&id={song_id}&rating={final_rating}"

    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        console.print(
            f"[bold green]STAR:[/bold green] {user_id} | {song['title']} → {final_rating} stars"
        )
    except requests.Timeout:
        console.print(
            f"[bold red]push_star: Timeout reaching Navidrome for {user_id}[/bold red]"
        )
        status_registry.update(
            "main", status="warning", error=f"Navidrome timeout: {user_id}"
        )
    except requests.HTTPError as e:
        console.print(f"[bold red]push_star: HTTP error for {user_id}:[/bold red] {e}")
        status_registry.update("main", status="warning", error=str(e))
    except requests.RequestException as e:
        console.print(
            f"[bold red]push_star: Request failed for {user_id}:[/bold red] {e}"
        )
        status_registry.update("main", status="warning", error=str(e))


def UpdateDBgenre(data, connLib=None):
    if not data:
        console.print("[yellow]UpdateDBgenre: Empty data, nothing to update.[/yellow]")
        return {"status": "Category or value is empty"}

    console.print(
        f"[bold green]UpdateDBgenre:[/bold green] Applying {len(data)} mapping(s)..."
    )

    try:
        conn_log = get_db_connection()
        cursor_log = conn_log.cursor()
    except Exception as e:
        console.print(
            f"[bold red]UpdateDBgenre: Failed to connect to listens DB:[/bold red] {e}"
        )
        status_registry.update("Db", status="crashed", error=str(e))
        return {"status": "db_error"}

    close_lib = connLib is None
    try:
        conn_lib = connLib if connLib else get_db_connection_lib()
        cursor_lib = conn_lib.cursor()
    except Exception as e:
        console.print(
            f"[bold red]UpdateDBgenre: Failed to connect to library DB:[/bold red] {e}"
        )
        conn_log.close()
        status_registry.update("Db", status="crashed", error=str(e))
        return {"status": "db_error"}

    listens_result = _update_listens_genre(cursor_log, data)
    lib_result = _update_library_genre(cursor_lib, data)

    if listens_result is None or lib_result is None:
        console.print(
            "[bold red]UpdateDBgenre: One or both updates failed after retries.[/bold red]"
        )
        conn_log.close()
        if close_lib:
            conn_lib.close()
        return {"status": "update_error"}

    try:
        conn_log.commit()
        conn_lib.commit()
        console.print(
            f"[bold green]UpdateDBgenre: Done.[/bold green] lib rows: {cursor_lib.rowcount} | log rows: {cursor_log.rowcount}"
        )
    except Exception as e:
        console.print(f"[bold red]UpdateDBgenre: Commit failed:[/bold red] {e}")
        status_registry.update("Db", status="crashed", error=str(e))
        return {"status": "commit_error"}
    finally:
        conn_log.close()
        if close_lib:
            conn_lib.close()

    return {
        "status": "success",
        "updated_rows_lib": cursor_lib.rowcount,
        "updated_rows_log": cursor_log.rowcount,
    }


# setup logger  

_initialized = False

def setup_logger():
    global _initialized
    if _initialized:
        return
    _initialized = True

    logger.remove()
    _setup_sinks()

def _setup_sinks():
    logger.add(
        sys.stderr,
        level="INFO",
        colorize=True,
        format="<green>{time:HH:mm:ss}</green> | <level>{level:<8}</level> | <cyan>{extra[source]:<10}</cyan> | {message}",
        filter=lambda r: "source" in r["extra"],
    )

    logger.add(
        MAIN_LOG_FILE,
        level=LOG_LEVEL,
        rotation=LOG_MAX_SIZE,
        retention=LOG_RETENTION,
        compression="zip",
        encoding="utf-8",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {message}",
        filter=lambda r: r["extra"].get("source") == "main",
    )

    def _jsonl_format(record):
        entry = {
            "time":    record["time"].isoformat(),
            "level":   record["level"].name,
            "source":  "playlist",
            "message": record["message"],
            **{k: v for k, v in record["extra"].items() if k != "source"}
        }
        record["extra"]["raw_json"] = json.dumps(entry)
        return "{extra[raw_json]}\n"

    logger.add(
        PLAYLIST_LOG_FILE,
        level=LOG_LEVEL,
        rotation=LOG_MAX_SIZE,
        retention=LOG_RETENTION,
        compression="zip",
        encoding="utf-8",
        format=_jsonl_format,
        filter=lambda r: r["extra"].get("source") == "playlist",
    )

_main_logger     = logger.bind(source="main")
_playlist_logger = logger.bind(source="playlist")

def log(level: str, message: str, source: str = "main", **kwargs):
    """Base logging function."""
    target = _playlist_logger if source == "playlist" else _main_logger
    if kwargs:
        target = target.bind(**kwargs)
    getattr(target, level.lower())(message)


# playlist logging helpers

def log_scores(user_id, scores, signal_contributions, titles):
    for song_id, data in scores.items():
        title = titles.get(song_id, "Unknown Title")
        log(
            "debug",
            f"[score] '{title}' ({song_id}) → score={data['score']:.2f}  dominant={data.get('dominant_signal')}  last_signal={data['signal']}",
            source="playlist",
            event="song_scored",
            user_id=user_id,
            song_id=song_id,
            title=title,
            score=data["score"],
            dominant_signal=data.get("dominant_signal"),
            last_signal=data["signal"],
            signal_breakdown=signal_contributions.get(song_id, {}),
        )

def log_slot(user_id, song_id, title, score, slot, accepted, reason):
    status = "ACCEPTED" if accepted else "REJECTED"
    log(
        "debug",
        f"[slot:{slot}] {status} '{title}' ({song_id})  score={score:.2f}  reason={reason}",
        source="playlist",
        event="slot_decision",
        user_id=user_id,
        song_id=song_id,
        title=title,
        score=score,
        slot=slot,
        accepted=accepted,
        reason=reason,
    )

def log_wildcard(user_id, wildcards, selected):
    log(
        "debug",
        f"[wildcard] pool={len(wildcards)}  selected={len(selected)}  ids={selected}",
        source="playlist",
        event="wildcard_selection",
        user_id=user_id,
        pool_size=len(wildcards),
        selected_count=len(selected),
    )

def log_genre_injection(user_id, genre_distribution, adjusted_size, selected):
    top_genres = genre_distribution[:5]
    log(
        "debug",
        f"[genre_injection] slots={adjusted_size}  got={len(selected)}  top_genres={top_genres}",
        source="playlist",
        event="genre_injection",
        user_id=user_id,
        requested_slots=adjusted_size,
        selected_count=len(selected),
        top_genres=top_genres,
    )

def log_pool(user_id, method, song_id, title, signal):
    log(
        "debug",
        f"[selection:{method}] '{title}' ({song_id})  signal={signal}",
        source="playlist",
        event="final_selection",
        user_id=user_id,
        method=method,
        song_id=song_id,
        title=title,
        signal=signal,
    )

def log_summary(user_id, size, counts):
    log(
        "info",
        f"[summary] user={user_id}  total={size}  distribution={counts}",
        source="playlist",
        event="playlist_summary",
        user_id=user_id,
        total=size,
        distribution=counts,
    )