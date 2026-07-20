import re
from collections import defaultdict

import pandas as pd
from core.db import db_supervisor, get_db_connection_lib
from navidrome.state import status_registry
from rapidfuzz import fuzz, process
from rich.console import Console

console = Console()
TITLE_THRESH = 85.0
ARTIST_THRESH = 80.0
ALBUM_THRESH = 80.0
DUR_THRESH_PCT = 10.0
GLOBAL_MIN = 75.0


def clean_string(text) -> str:
    if not text or (isinstance(text, float) and pd.isna(text)):
        return ""
    text = re.sub(r"[\(\-]\s*From.*", "", str(text), flags=re.IGNORECASE)
    text = text.replace(";", " ").replace("&", " ").replace(",", " ").replace("•", " ")
    return " ".join(text.lower().split())


def _score(a: str, b: str) -> float:
    return fuzz.token_set_ratio(a, b)


def _album_score(a: str, b: str) -> float:
    return fuzz.token_sort_ratio(a, b)


def _dur_diff_pct(db_duration_sec: int, csv_duration_ms: int) -> float:
    db_ms = db_duration_sec * 1000
    if csv_duration_ms <= 0:
        return 100.0
    return abs(db_ms - csv_duration_ms) / csv_duration_ms * 100


NOT_ALBUM = clean_string("[Unknown Album]")
NOT_ARTIST = clean_string("[Unknown Artist]")


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
        best_col, best_sc = None, 0
        for col in actual_columns:
            for alias in aliases:
                sc = round(fuzz.token_set_ratio(col.lower(), alias.lower()))
                if sc > best_sc:
                    best_sc, best_col = sc, col
        if best_sc >= THRESHOLD:
            column_map[goal] = best_col
        else:
            console.print(
                f"[yellow]readCSVdata: No column match for '{goal}' "
                f"(best score: {best_sc})[/yellow]"
            )

    missing = {"Track Name", "Artist Name", "Duration"} - set(column_map.keys())
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


def _build_db_index(db_songs: list) -> dict:

    index = {
        "songs": [],
        "exact": {},
        "artist_dict": defaultdict(list),
        "album_dict": defaultdict(list),
        "title_dict": defaultdict(list),
        "title_pool": {},
        "song_by_id": {},
    }

    for s in db_songs:
        ct = clean_string(s.get("title", ""))
        ca = clean_string(s.get("artist", ""))
        cal = clean_string(s.get("album", ""))
        sid = s["song_id"]

        enriched = {**s, "_ct": ct, "_ca": ca, "_cal": cal}
        index["songs"].append(enriched)
        index["song_by_id"][sid] = enriched

        if ct:
            key = f"{ca} - {ct}"
            index["exact"].setdefault(key, enriched)
            index["title_dict"][ct].append(enriched)
            index["title_pool"][sid] = ct

        if ca and ca != NOT_ARTIST:
            index["artist_dict"][ca].append(enriched)

        if cal and cal != NOT_ALBUM:
            index["album_dict"][cal].append(enriched)

    return index


def _score_candidate(s, csv_title, csv_artist, csv_album, csv_dur_ms):
    t = _score(s["_ct"], csv_title)
    a = _score(s["_ca"], csv_artist) if s["_ca"] != NOT_ARTIST else 0
    al = _album_score(s["_cal"], csv_album) if s["_cal"] != NOT_ALBUM else 0
    dd = _dur_diff_pct(s.get("duration", 0), csv_dur_ms)

    has_artist = s["_ca"] != NOT_ARTIST
    has_album = s["_cal"] != NOT_ALBUM

    if has_artist and has_album:
        if a >= ARTIST_THRESH and al >= ALBUM_THRESH and t >= TITLE_THRESH:
            return True, "High Confidence (A+ALB+T)"
        if (
            a >= ARTIST_THRESH
            and al >= ALBUM_THRESH
            and t >= 70
            and dd <= DUR_THRESH_PCT
        ):
            return True, "Duration Fallback (Artist/Album OK)"
        if a >= ARTIST_THRESH and t >= TITLE_THRESH and dd <= DUR_THRESH_PCT:
            return True, f"Artist-Heavy (A={a:.0f} T={t:.0f} D={dd:.1f}%)"
        if a >= 95 and t >= 95:
            return True, "Strict Artist/Title Tie-break"

    elif not has_artist:
        if has_album and al >= ALBUM_THRESH and t >= TITLE_THRESH:
            return True, "Album/Title (Artist Unknown)"
        if not has_album and t >= 95 and dd <= 5:
            return True, "Blind Title/Duration"

    return False, None


def _try_pool(pool, csv_title, csv_artist, csv_album, csv_dur_ms):
    for s in pool:
        matched, strategy = _score_candidate(
            s, csv_title, csv_artist, csv_album, csv_dur_ms
        )
        if matched:
            return s, strategy
    return None, None


def _match_song(csv_title, csv_artist, csv_album, csv_dur_ms, index):
    key = f"{csv_artist} - {csv_title}"
    exact = index["exact"].get(key)
    if exact:
        matched, strategy = _score_candidate(
            exact, csv_title, csv_artist, csv_album, csv_dur_ms
        )
        if matched:
            return exact, f"Exact key → {strategy}"

    known_artists = list(index["artist_dict"].keys())
    if csv_artist and known_artists:
        artist_hits = process.extract(
            csv_artist, known_artists, scorer=fuzz.token_set_ratio, limit=10
        )
        pool = []
        for hit in artist_hits:
            if hit[1] >= ARTIST_THRESH:
                pool.extend(index["artist_dict"][hit[0]])

        if pool:
            s, strategy = _try_pool(pool, csv_title, csv_artist, csv_album, csv_dur_ms)
            if s:
                return s, f"Artist-index → {strategy}"

    known_albums = list(index["album_dict"].keys())
    if csv_album and known_albums:
        album_hits = process.extract(
            csv_album, known_albums, scorer=fuzz.token_sort_ratio, limit=5
        )
        pool = []
        for hit in album_hits:
            if hit[1] >= ALBUM_THRESH:
                pool.extend(index["album_dict"][hit[0]])

        if pool:
            s, strategy = _try_pool(pool, csv_title, csv_artist, csv_album, csv_dur_ms)
            if s:
                return s, f"Album-index → {strategy}"

    title_pool = index["title_dict"].get(csv_title, [])
    if title_pool:
        s, strategy = _try_pool(
            title_pool, csv_title, csv_artist, csv_album, csv_dur_ms
        )
        if s:
            return s, f"Title-index → {strategy}"

    if index["title_pool"]:
        top = process.extractOne(
            csv_title, index["title_pool"], scorer=fuzz.token_set_ratio
        )
        if top and top[1] >= GLOBAL_MIN:
            candidate = index["song_by_id"].get(top[2])
            if candidate:
                matched, strategy = _score_candidate(
                    candidate, csv_title, csv_artist, csv_album, csv_dur_ms
                )
                if matched:
                    return candidate, f"Global-title-sweep → {strategy}"

    return None, None


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
        f"[bold green]fuzzymatching:[/bold green] "
        f"{len(df_csv)} CSV rows vs {len(db_songs)} DB songs"
    )
    index = _build_db_index(db_songs)
    console.print(
        f"[dim]Index built: "
        f"{len(index['artist_dict'])} artists, "
        f"{len(index['album_dict'])} albums, "
        f"{len(index['title_dict'])} titles[/dim]"
    )

    matched_ids = []
    results = []
    n = 0

    for idx, csv_row in df_csv.iterrows():
        try:
            csv_title = clean_string(csv_row["Track Name"])
            csv_artist = clean_string(csv_row["Artist Name"])
            csv_album = clean_string(csv_row.get("Album Name", ""))
            csv_dur_ms = int(csv_row["Duration"])
        except (ValueError, KeyError) as e:
            console.print(
                f"[yellow]fuzzymatching: Skipping row {idx} — bad data: {e}[/yellow]"
            )
            continue

        match, strategy = _match_song(
            csv_title, csv_artist, csv_album, csv_dur_ms, index
        )

        if match:
            n += 1
            matched_ids.append(match["song_id"])
            console.print(
                f"[green]✔[/green] '{csv_row['Track Name']}' [dim]({strategy})[/dim]"
            )
            results.append(
                {
                    "title": csv_row["Track Name"],
                    "artist": csv_row["Artist Name"],
                    "found": True,
                    "song_id": match["song_id"],
                }
            )
        else:
            console.print(f"[yellow]✘[/yellow] '{csv_row['Track Name']}' — no match")
            results.append(
                {
                    "title": csv_row["Track Name"],
                    "artist": csv_row["Artist Name"],
                    "found": False,
                    "song_id": None,
                }
            )

    console.print(
        f"[bold green]fuzzymatching: Done.[/bold green] "
        f"Matched {n}/{len(df_csv)} tracks."
    )
    status_registry.update("sync", status="idle")

    return {
        "matched_ids": matched_ids,
        "results": results,
        "summary": {"total": len(df_csv), "matched": n, "not_found": len(df_csv) - n},
    }
