import pandas as pd
from core.db import get_db_connection_lib, db_supervisor
from navidrome.state import status_registry
from rapidfuzz import fuzz
from rich.console import Console
import re

console = Console()


def score(input, output):
    return round(fuzz.token_set_ratio(input.lower(), output.lower()))


def AlbumScoreFuzz(input, output):
    return round(fuzz.token_sort_ratio(input.lower(), output.lower()))


def clean_string(text):
    if not text or pd.isna(text):
        return ""
    text = re.sub(r"[\(\-]\s*From.*", "", str(text), flags=re.IGNORECASE)
    text = text.replace(";", " ").replace("&", " ").replace(",", " ").replace("•", " ")
    return " ".join(text.lower().split())


def readCSVdata(FILE_PATH):
    try:
        df = pd.read_csv(FILE_PATH)
    except FileNotFoundError:
        console.print(f"[bold red]readCSVdata: File not found:[/bold red] {FILE_PATH}")
        return None
    except pd.errors.EmptyDataError:
        console.print(f"[bold red]readCSVdata: CSV is empty:[/bold red] {FILE_PATH}")
        return None
    except Exception as e:
        console.print(f"[bold red]readCSVdata: Failed to read CSV:[/bold red] {e}")
        return None

    target_map_config = {
        "Track Name": ["Track Name", "Title", "Song", "Name"],
        "Album Name": ["Album Name", "Album", "Collection", "Record"],
        "Artist Name": ["Artist Name(s)", "Artist", "Band", "Singer", "Performer"],
        "Duration": ["Duration (ms)", "Duration", "Length", "Time"],
        "Explicit": ["Explicit", "Is Explicit", "Content Advisory", "Maturity"],
    }

    actual_columns = df.columns.tolist()
    column_map = {}
    THRESHOLD = 75

    for goal, aliases in target_map_config.items():
        best_match_for_goal = None
        highest_score_for_goal = 0

        for col in actual_columns:
            for alias in aliases:
                current_score = score(col, alias)
                if current_score > highest_score_for_goal:
                    highest_score_for_goal = current_score
                    best_match_for_goal = col

        if highest_score_for_goal >= THRESHOLD:
            column_map[goal] = best_match_for_goal
        else:
            console.print(
                f"[yellow]readCSVdata: No column match for '{goal}' (best score: {highest_score_for_goal})[/yellow]"
            )

    required = {"Track Name", "Artist Name", "Duration"}
    missing = required - set(column_map.keys())
    if missing:
        console.print(
            f"[bold red]readCSVdata: Missing required columns:[/bold red] {missing}"
        )
        return None

    df_subset = df[list(column_map.values())].copy()
    df_subset.columns = list(column_map.keys())
    return df_subset


@db_supervisor
def _fetch_library_songs(cursor):
    return cursor.execute(
        "SELECT song_id, title, artist, album, duration FROM library"
    ).fetchall()


def getSong():
    try:
        conn = get_db_connection_lib()
        cursor = conn.cursor()
    except Exception as e:
        console.print(f"[bold red]getSong: DB connection failed:[/bold red] {e}")
        status_registry.update("Db", status="crashed", error=str(e))
        return None

    rows = _fetch_library_songs(cursor)
    conn.close()

    if rows is None:
        console.print(
            "[bold red]getSong: Failed to fetch songs after retries.[/bold red]"
        )
        return None

    return [dict(row) for row in rows]


def fuzzymatching(filePath):
    df_csv = readCSVdata(filePath)
    if df_csv is None:
        console.print(
            "[bold red]fuzzymatching: Aborting — CSV could not be loaded.[/bold red]"
        )
        status_registry.update("sync", status="crashed", error="CSV load failed")
        return None

    db_songs = getSong()
    if db_songs is None:
        console.print(
            "[bold red]fuzzymatching: Aborting — could not load library from DB.[/bold red]"
        )
        status_registry.update("sync", status="crashed", error="DB fetch failed")
        return None

    console.print(
        f"[bold green]fuzzymatching:[/bold green] {len(df_csv)} CSV rows vs {len(db_songs)} DB songs"
    )

    matched_ids = []
    results = []
    n = 0

    NOT_ALBUM = clean_string("[Unknown Album]")
    NOT_ARTIST = clean_string("[Unknown Artist]")

    for index, csv_row in df_csv.iterrows():
        try:
            CSVtitle = clean_string(csv_row["Track Name"])
            CSVartist = clean_string(csv_row["Artist Name"])
            CSValbum = clean_string(csv_row.get("Album Name", ""))
            CSVdur = int(csv_row["Duration"])
        except (ValueError, KeyError) as e:
            console.print(
                f"[yellow]fuzzymatching: Skipping row {index} — bad data: {e}[/yellow]"
            )
            continue

        best_match_candidate = None
        max_score = -1
        final_strategy = "None"
        row_matched = False
        row_song_id = None

        for db_song in db_songs:
            try:
                dbTitle = clean_string(db_song["title"])
                dbArtist = clean_string(db_song["artist"])
                dbAlbum = clean_string(db_song["album"])
                dDur_ms = int(db_song["duration"]) * 1000
            except (ValueError, KeyError) as e:
                console.print(
                    f"[yellow]fuzzymatching: Skipping DB song '{db_song.get('title', '?')}' — bad data: {e}[/yellow]"
                )
                continue

            tScore = score(dbTitle, CSVtitle)
            aScore = score(dbArtist, CSVartist) if dbArtist != NOT_ARTIST else 0
            albScore = AlbumScoreFuzz(dbAlbum, CSValbum) if dbAlbum != NOT_ALBUM else 0
            dur_diff = abs(dDur_ms - CSVdur) / CSVdur * 100 if CSVdur > 0 else 100

            current_avg = (tScore + aScore + albScore) / 3

            match_found = False
            current_strategy = "None"

            if dbArtist != NOT_ARTIST and dbAlbum != NOT_ALBUM:
                if aScore >= 80 and albScore >= 80 and tScore >= 85:
                    match_found = True
                    current_strategy = "STRATEGY: [High Confidence Match (A+ALB+T)]"
                elif (
                    aScore >= 80
                    and albScore >= 80
                    and 70 <= tScore < 85
                    and dur_diff <= 10
                ):
                    match_found = True
                    current_strategy = "STRATEGY: [Duration Fallback (Artist/Album OK)]"
                elif aScore >= 80 and tScore >= 85 and dur_diff <= 10:
                    match_found = True
                    current_strategy = f"STRATEGY: [Artist-Heavy Match (A={aScore}, T={tScore}, D={round(dur_diff,2)}%)]"
                elif aScore >= 95 and tScore >= 95:
                    match_found = True
                    current_strategy = (
                        "STRATEGY: [Strict Artist/Title Tie-break (No Album)]"
                    )

            elif dbArtist == NOT_ARTIST:
                if albScore >= 80 and tScore >= 80:
                    match_found = True
                    current_strategy = "STRATEGY: [Album/Title Match (Artist Unknown)]"

            elif dbArtist == NOT_ARTIST and dbAlbum == NOT_ALBUM:
                if tScore >= 95 and dur_diff <= 5:
                    match_found = True
                    current_strategy = "STRATEGY: [Blind Title/Duration Match]"

            if current_avg > max_score:
                max_score = current_avg
                best_match_candidate = {
                    "title": dbTitle,
                    "artist": dbArtist,
                    "album": dbAlbum,
                    "t": tScore,
                    "a": aScore,
                    "alb": albScore,
                    "dur_p": dur_diff,
                    "dur_ms": dDur_ms,
                }
                final_strategy = (
                    current_strategy if match_found else "N/A - Below Thresholds"
                )

            if match_found:
                row_matched = True
                row_song_id = db_song["song_id"]
                break

        results.append(
            {
                "title": csv_row["Track Name"],
                "artist": csv_row["Artist Name"],
                "found": row_matched,
                "song_id": row_song_id,
            }
        )

        if row_matched:
            matched_ids.append(row_song_id)
            n += 1

    summary = {
        "total": len(df_csv),
        "matched": n,
        "not_found": len(df_csv) - n,
    }

    console.print(
        f"[bold green]fuzzymatching: Done.[/bold green] Matched {n}/{len(df_csv)} tracks."
    )
    status_registry.update("sync", status="idle")

    return {"matched_ids": matched_ids, "results": results, "summary": summary}
