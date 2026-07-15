# CRON JOB FOR UPDATING SCORE IN DB
from sqlite3.dbapi2 import Cursor

from core.db import get_db_connection
from navidrome.watcher import calculate_dynamic_score
from numpy._core.umath import trunc
from rich.console import Console
from rich.table import Table

console = Console()


def cp(args: str):
    console.print(args)


def FetchUniqueEntery(cursor, username):
    raw = cursor.execute(
        """
        SELECT song_id, COUNT(*)
        FROM listens
        WHERE user_id = ?
        GROUP BY song_id
        HAVING SUM(CASE WHEN score IS NULL THEN 1 ELSE 0 END) > 0
        ORDER BY COUNT(*) DESC
        """,
        (username,),
    ).fetchall()
    song_counts = {row[0]: row[1] for row in raw}
    return song_counts


def FetchUniqueUser(cursor):
    raw = cursor.execute("SELECT distinct user_id from listens").fetchall()
    return {row[0] for row in raw}


def FetchHistory(cursor, songId, username):
    raw = cursor.execute(
        "SELECT id, song_id, signal, user_id from listens where song_id = ? and user_id = ? order by timestamp asc",
        (songId, username),
    ).fetchall()
    return {row["id"]: row["signal"] for row in raw}


def HasNullScore(cursor, songId, username):
    raw = cursor.execute(
        "SELECT 1 , title from listens where song_id = ? and user_id = ? and score is null limit 1",
        (songId, username),
    ).fetchone()
    return raw is not None


def FetchSongTitle(cursor, songId):
    try:
        raw = cursor.execute(
            "SELECT title FROM listens WHERE song_id = ?", (songId,)
        ).fetchone()
        return raw[0] if raw else "Unknown Title"
    except Exception:
        return "Unknown Title"


def UpdateScore(cursor, scoreDict):
    data = [(score, id) for id, score in scoreDict.items()]
    cursor.executemany("UPDATE listens SET score = ? WHERE id = ?", data)


def songScoringCorn_IDK_WHAT_TO_NAME_THE_FUNCTION():
    conn = get_db_connection()
    cursor = conn.cursor()

    cp("[bold blue][CORN] Song Scoring is Starting")
    cp("[bold blue][CORN] Fetching Users")
    users = FetchUniqueUser(cursor)
    cp(f"[dim green][CORN] Found Users {users}")

    scoreDict = {}
    for user in users:
        cp(f"[bold blue][CORN] Fetching Unique Songs Listened to by {user}")
        uniqueSongs = FetchUniqueEntery(cursor, user)

        for songId, _ in uniqueSongs.items():
            songTitle = FetchSongTitle(cursor, songId)
            if not HasNullScore(cursor, songId, user):
                short_id = songId[:8] + "..."
                cp(
                    f"[dim]\\[CORN] Skipping[/dim] [bold cyan]{songTitle}[/bold cyan] [dim]({short_id}) - No entries left to score.[/dim]"
                )
                continue

            cp("[bold red][CORN] Null Score Found, Calculating Score...")

            history = FetchHistory(cursor, songId, user)
            total_listens = len(history)

            cp(
                f"\n[bold magenta]Song ID:[/bold magenta] {songId}  |  [bold magenta]Name:[/bold magenta] {songTitle}  |  [bold magenta]Listens:[/bold magenta] {total_listens}"
            )

            table = Table(show_header=True, header_style="bold cyan")
            table.add_column("Sr.", justify="right", style="dim", width=6)
            table.add_column("Row ID", justify="center")
            table.add_column("Score", justify="right", style="green")

            listenCount = 0
            pastScore = 0

            for row_id, signal in history.items():
                score = calculate_dynamic_score(listenCount, signal)
                finalScore = pastScore + score
                pastScore = finalScore
                table.add_row(str(listenCount), str(row_id), str(round(finalScore, 2)))

                scoreDict[row_id] = finalScore
                listenCount += 1

            console.print(table)


    cp("[bold blue][CORN] Updating Database...")
    UpdateScore(cursor, scoreDict)
    conn.commit()
    conn.close()
    cp("[bold green][CORN] Scoring Complete. Database Updated![/bold green]")


# for new songs, that are imported from listenbrainz
#
# The ALGO will look like this
# after lb listens fetch, run the func to check if there is any row where score is null
# if there is , then run songScoringCorn again



def newNullScore(cursor):
    raw = cursor.execute(
        "SELECT 1 from listens where score is null limit 1",
    ).fetchone()
    return raw is not None


def songScoringCorn():
    conn = get_db_connection()
    cursor = conn.cursor()
    if not newNullScore(cursor):
        cp("[bold red]\\[CORN]No song to score")
        return
    songScoringCorn_IDK_WHAT_TO_NAME_THE_FUNCTION()
