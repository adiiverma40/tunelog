import requests
import time
from datetime import datetime
from rich.console import Console
from rich.table import Table
from rich.progress import (
    Progress,
    SpinnerColumn,
    BarColumn,
    TextColumn,
    TimeElapsedColumn,
    MofNCompleteColumn,
)
from rich.panel import Panel
from rich import box
from core.db import (
    get_db_connection_lib,
    get_db_connection_usr,
    get_db_connection_Musicbrainz,
    DB_PATH_MB,
)
from core.crypto import decrypt_token
from scrobble.listenBrainz import batchMatchNavidromeTracks
from typing import Any, Dict, List, Tuple
from dataclasses import dataclass
from .playlist import analyze_user_ratios

console = Console()

LB_BASE = "https://api.listenbrainz.org"
LB_HEADERS = {
    "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)",
    "Accept": "application/json",
}

MAX_COUNT = 1000


def resolve_lb_username(decrypted_token: str) -> str | None:
    url = f"{LB_BASE}/1/validate-token"
    headers = {**LB_HEADERS, "Authorization": f"Token {decrypted_token}"}
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data.get("valid"):
                return data.get("user_name")
            else:
                console.print(
                    f"    [red]✗ Token invalid: {data.get('message', 'unknown reason')}[/red]"
                )
                return None
        else:
            console.print(
                f"    [red]✗ validate-token returned HTTP {r.status_code}[/red]"
            )
            return None
    except Exception as e:
        console.print(f"    [red]✗ validate-token request failed: {e}[/red]")
        return None


def fetch_cf_recordings(lb_username: str, decrypted_token: str) -> list[dict]:

    url = f"{LB_BASE}/1/cf/recommendation/user/{lb_username}/recording"
    headers = {**LB_HEADERS, "Authorization": f"Token {decrypted_token}"}
    params = {"count": MAX_COUNT, "offset": 0}

    try:
        r = requests.get(url, headers=headers, params=params, timeout=30)
        if r.status_code == 200:
            payload = r.json().get("payload", {})
            mbids = payload.get("mbids", [])
            total = payload.get("total_mbid_count", len(mbids))
            cf_last_updated = payload.get("last_updated", int(time.time()))
            console.print(
                f"    [cyan]↳ Total CF tracks available: {total} | Fetched: {len(mbids)}[/cyan]"
            )
            return mbids, cf_last_updated
        elif r.status_code == 404:
            console.print(
                f"    [yellow]⚠ No CF recommendations found for '{lb_username}' (404 — model may not have run yet)[/yellow]"
            )
            return [], None
        else:
            console.print(
                f"    [red]✗ CF fetch returned HTTP {r.status_code}: {r.text[:200]}[/red]"
            )
            return [], None
    except Exception as e:
        console.print(f"    [red]✗ CF fetch request failed: {e}[/red]")
        return [], None


def save_cf_to_db(db_username: str, mbids: list[dict], cf_last_updated: int) -> int:
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    row = cursor.execute(
        "SELECT cf_last_updated FROM LB_CF WHERE username = ? LIMIT 1", (db_username,)
    ).fetchone()

    if row and row["cf_last_updated"] == cf_last_updated:
        console.print(
            f"  [yellow]⚠ CF data for '{db_username}' hasn't changed "
            f"(cf_last_updated={cf_last_updated}). Skipping insert.[/yellow]"
        )
        conn.close()
        return 0

    cursor.execute("DELETE FROM LB_CF WHERE username = ?", (db_username,))
    console.print(
        f"  [dim]↳ CF update detected, wiped old rows for '{db_username}'[/dim]"
    )

    fetched_at = datetime.utcnow().isoformat()
    rows = [
        (
            item.get("recording_mbid"),
            db_username,
            item.get("score", 0.0),
            cf_last_updated,
            fetched_at,
            item.get("latest_listened_at"),
        )
        for item in mbids
        if item.get("recording_mbid")
    ]

    cursor.executemany(
        """
        INSERT INTO LB_CF
            (recording_mbid, username, score, cf_last_updated, fetched_at, latest_listened_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()
    return len(rows)


def FetchCF():
    console.print(
        Panel.fit(
            "[bold magenta]ListenBrainz CF Recommendation Fetcher[/bold magenta]",
            subtitle="TuneLog · multi-user",
            box=box.DOUBLE_EDGE,
        )
    )

    usr_conn = get_db_connection_usr()
    cursor = usr_conn.cursor()
    cursor.execute(
        "SELECT username, LB_token, LB_username FROM user WHERE LB_token IS NOT NULL AND LB_token != ''"
    )
    users = cursor.fetchall()
    usr_conn.close()

    if not users:
        console.print(
            "[yellow]⚠ No users with LB_token found in the database. Exiting.[/yellow]"
        )
        return

    console.print(
        f"[bold green]✓ Found {len(users)} user(s) with LB token[/bold green]\n"
    )

    summary = Table(title="Fetch Summary", box=box.SIMPLE_HEAVY, show_lines=True)
    summary.add_column("DB User", style="cyan", no_wrap=True)
    summary.add_column("LB User", style="magenta", no_wrap=True)
    summary.add_column("Tracks Saved", style="green", justify="right")
    summary.add_column("Status", style="bold")

    for user in users:
        db_username = user["username"]
        raw_token = user["LB_token"]
        stored_lb_un = user["LB_username"]

        console.rule(f"[bold blue]User: {db_username}[/bold blue]")

        console.print("  [dim]→ Decrypting token...[/dim]")
        try:
            decrypted = decrypt_token(raw_token)
        except Exception as e:
            console.print(f"  [red]✗ Token decryption failed: {e}[/red]")
            summary.add_row(db_username, "—", "0", "[red]Decrypt failed[/red]")
            continue

        console.print("  [dim]→ Validating token + resolving LB username...[/dim]")
        lb_username = resolve_lb_username(decrypted)

        if not lb_username:
            if stored_lb_un:
                console.print(
                    f"  [yellow]⚠ Falling back to stored LB_username: '{stored_lb_un}'[/yellow]"
                )
                lb_username = stored_lb_un
            else:
                console.print(
                    f"  [red]✗ Could not determine LB username for '{db_username}'. Skipping.[/red]"
                )
                summary.add_row(db_username, "—", "0", "[red]No LB username[/red]")
                continue

        console.print(
            f"  [green]✓ LB username resolved: [bold]{lb_username}[/bold][/green]"
        )

        console.print(
            f"  [dim]→ Fetching CF recommendations for '{lb_username}'...[/dim]"
        )
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TimeElapsedColumn(),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task(f"  Fetching for {lb_username}...", total=None)
            mbids, cf_last_updated = fetch_cf_recordings(lb_username, decrypted)
            progress.update(task, completed=True)

        if not mbids:
            summary.add_row(db_username, lb_username, "0", "[yellow]No data[/yellow]")
            continue

        console.print(
            f"  [dim]→ Saving {len(mbids)} tracks to LB_CF (db_user='{db_username}')...[/dim]"
        )
        saved = save_cf_to_db(db_username, mbids, cf_last_updated)
        console.print(
            f"  [bold green]✓ Saved {saved} CF tracks for '{db_username}'[/bold green]"
        )

        summary.add_row(db_username, lb_username, str(saved), "[green]✓ OK[/green]")

    console.print()
    console.print(summary)
    console.print(
        Panel.fit("[bold green]CF fetch complete.[/bold green]", box=box.ROUNDED)
    )


def fillMusicBrainzDB():
    lib_conn = get_db_connection_lib()
    lib_cursor = lib_conn.cursor()
    lib_cursor.execute(
        "SELECT DISTINCT recording_mbid FROM LB_CF WHERE recording_mbid IS NOT NULL"
    )
    rows = lib_cursor.fetchall()
    lib_conn.close()

    if not rows:
        console.print("[yellow]⚠ LB_CF is empty — nothing to seed.[/yellow]")
        return 0

    mbids = [row["recording_mbid"] for row in rows]
    console.print(
        Panel.fit(
            f"[bold cyan]Seeding hydration_cache[/bold cyan]\n"
            f"Found [bold]{len(mbids)}[/bold] distinct mbids in LB_CF",
            box=box.ROUNDED,
        )
    )

    mb_conn = get_db_connection_Musicbrainz()
    mb_cursor = mb_conn.cursor()

    mb_cursor.executemany(
        """
        INSERT OR IGNORE INTO hydration_cache (recording_mbid, fetch_status)
        VALUES (?, 'PENDING')
        """,
        [(mbid,) for mbid in mbids],
    )
    inserted = mb_conn.total_changes
    mb_conn.commit()
    mb_conn.close()

    skipped = len(mbids) - inserted
    console.print(f"[bold green]✓ Inserted : {inserted}[/bold green]")
    console.print(f"[dim]  Skipped (already existed): {skipped}[/dim]")

    return inserted


MB_BASE = "https://musicbrainz.org/ws/2"
MB_HEADERS = {
    "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)",
    "Accept": "application/json",
}

RATE_LIMIT_DELAY = 1.1
BATCH_SIZE = 50


def fetch_recording(mbid: str, max_retries: int = 3) -> dict | None:
    url = f"{MB_BASE}/recording/{mbid}"
    params = {"inc": "artists releases release-groups", "fmt": "json"}

    for attempt in range(1, max_retries + 1):
        try:
            time.sleep(RATE_LIMIT_DELAY)
            response = requests.get(
                url,
                params=params,
                headers=MB_HEADERS,
                timeout=15,
            )

            if 400 <= response.status_code < 500:
                console.print(
                    f"  [red]✗ {mbid[:8]}… HTTP {response.status_code} "
                    f"(permanent, marking FAILED)[/red]"
                )
                return None

            response.raise_for_status()
            return response.json()

        except requests.exceptions.Timeout:
            console.print(
                f"  [yellow]⚠ {mbid[:8]}… timeout "
                f"(attempt {attempt}/{max_retries})[/yellow]"
            )

        except requests.exceptions.ConnectionError as e:
            console.print(
                f"  [yellow]⚠ {mbid[:8]}… connection error "
                f"(attempt {attempt}/{max_retries}): {e}[/yellow]"
            )

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else "?"
            console.print(
                f"  [yellow]⚠ {mbid[:8]}… HTTP {status} "
                f"(attempt {attempt}/{max_retries})[/yellow]"
            )

        except Exception as e:
            console.print(
                f"  [red]✗ {mbid[:8]}… unexpected error "
                f"(attempt {attempt}/{max_retries}): {e}[/red]"
            )

        if attempt < max_retries:
            backoff = 2**attempt
            console.print(f"  [dim]  retrying in {backoff}s...[/dim]")
            time.sleep(backoff)

    console.print(f"  [red]✗ {mbid[:8]}… exhausted retries, marking FAILED.[/red]")
    return None


def parse_recording(data: dict) -> dict:
    title = data.get("title")
    duration_ms = data.get("length")

    artist = None
    artist_mbid = None
    credits = data.get("artist-credit", [])
    if credits:
        first = credits[0]
        if isinstance(first, dict):
            a = first.get("artist", {})
            artist = a.get("name")
            artist_mbid = a.get("id")

    album = None
    release_mbid = None
    release_group_mbid = None
    releases = data.get("releases", [])
    if releases:
        rel = releases[0]
        album = rel.get("title")
        release_mbid = rel.get("id")
        rg = rel.get("release-group", {})
        release_group_mbid = rg.get("id") if rg else None

    return {
        "title": title,
        "artist": artist,
        "artist_mbid": artist_mbid,
        "album": album,
        "release_mbid": release_mbid,
        "release_group_mbid": release_group_mbid,
        "duration_ms": duration_ms,
    }


def update_row(conn, mbid: str, parsed: dict | None):
    now = datetime.utcnow().isoformat(sep=" ", timespec="seconds")
    if parsed:
        conn.execute(
            """
            UPDATE hydration_cache SET
                title               = ?,
                artist              = ?,
                artist_mbid         = ?,
                album               = ?,
                release_mbid        = ?,
                release_group_mbid  = ?,
                duration_ms         = ?,
                fetch_status        = 'DONE',
                last_synced         = ?
            WHERE recording_mbid = ?
            """,
            (
                parsed["title"],
                parsed["artist"],
                parsed["artist_mbid"],
                parsed["album"],
                parsed["release_mbid"],
                parsed["release_group_mbid"],
                parsed["duration_ms"],
                now,
                mbid,
            ),
        )
    else:
        conn.execute(
            """
            UPDATE hydration_cache SET
                fetch_status = 'FAILED',
                last_synced  = ?
            WHERE recording_mbid = ?
            """,
            (now, mbid),
        )


def fetchPendingSongs(max_retries: int = 3, limit: int | None = None):
    conn = get_db_connection_Musicbrainz()
    cursor = conn.cursor()

    query = "SELECT recording_mbid FROM hydration_cache WHERE fetch_status = 'PENDING'"
    if limit:
        query += f" LIMIT {limit}"
    cursor.execute(query)
    pending = [row["recording_mbid"] for row in cursor.fetchall()]

    total = len(pending)
    if not total:
        console.print("[yellow]⚠ No PENDING rows in hydration_cache.[/yellow]")
        conn.close()
        return

    console.print(
        Panel.fit(
            f"[bold cyan]MusicBrainz Hydration[/bold cyan]\n"
            f"[white]{total} PENDING rows to process[/white]",
            box=box.DOUBLE_EDGE,
        )
    )

    done = 0
    failed = 0
    BATCH_SIZE = 5

    for index, mbid in enumerate(pending, start=1):
        raw = fetch_recording(mbid, max_retries=max_retries)
        parsed = parse_recording(raw) if raw else None

        if not parsed:
            console.print(
                f"  [yellow]↻ Retrying {mbid[:8]}… ({index}/{total})[/yellow]"
            )
            time.sleep(2)
            raw = fetch_recording(mbid, max_retries=max_retries)
            parsed = parse_recording(raw) if raw else None

        update_row(conn, mbid, parsed)

        if parsed:
            done += 1
            artist = parsed.get("artist") or "Unknown"
            title = parsed.get("title") or "Unknown"
            console.print(
                f"  [green]✓[/green] [dim]{mbid[:8]}…[/dim] "
                f"[white]{artist} — {title}[/white] "
                f"[dim]({index}/{total})[/dim]"
            )
        else:
            failed += 1
            console.print(
                f"  [red]✗[/red] [dim]{mbid[:8]}…[/dim] "
                f"[red]FAILED[/red] "
                f"[dim]({index}/{total})[/dim]"
            )

        if index % BATCH_SIZE == 0:
            conn.commit()

    conn.commit()
    conn.close()

    console.print(
        Panel.fit(
            f"[bold green]✓ Done : {done}[/bold green]   "
            f"[bold red]✗ Failed : {failed}[/bold red]   "
            f"[dim]Total : {total}[/dim]",
            box=box.ROUNDED,
        )
    )


def retryFailedSongs(max_retries: int = 3, limit: int | None = None):
    conn = get_db_connection_Musicbrainz()
    cursor = conn.cursor()

    query = "SELECT recording_mbid FROM hydration_cache WHERE fetch_status = 'FAILED'"
    if limit:
        query += f" LIMIT {limit}"
    cursor.execute(query)
    failed_rows = [row["recording_mbid"] for row in cursor.fetchall()]

    total = len(failed_rows)
    if not total:
        console.print("[yellow]⚠ No FAILED rows in hydration_cache.[/yellow]")
        conn.close()
        return

    console.print(
        Panel.fit(
            f"[bold yellow]MusicBrainz — Retry Failed[/bold yellow]\n"
            f"[white]{total} FAILED rows to retry[/white]",
            box=box.DOUBLE_EDGE,
        )
    )

    cursor.executemany(
        "UPDATE hydration_cache SET fetch_status = 'PENDING' WHERE recording_mbid = ?",
        [(mbid,) for mbid in failed_rows],
    )
    conn.commit()

    done = 0
    still_failed = 0
    BATCH_SIZE = 5

    for index, mbid in enumerate(failed_rows, start=1):
        raw = fetch_recording(mbid, max_retries=max_retries)
        parsed = parse_recording(raw) if raw else None

        update_row(conn, mbid, parsed)

        if parsed:
            done += 1
            artist = parsed.get("artist") or "Unknown"
            title = parsed.get("title") or "Unknown"
            console.print(
                f"  [green]✓[/green] [dim]{mbid[:8]}…[/dim] "
                f"[white]{artist} — {title}[/white] "
                f"[dim]({index}/{total})[/dim]"
            )
        else:
            still_failed += 1
            console.print(
                f"  [red]✗[/red] [dim]{mbid[:8]}…[/dim] "
                f"[red]Still FAILED[/red] "
                f"[dim]({index}/{total})[/dim]"
            )

        if index % BATCH_SIZE == 0:
            conn.commit()

    conn.commit()
    conn.close()

    console.print(
        Panel.fit(
            f"[bold green]✓ Recovered : {done}[/bold green]   "
            f"[bold red]✗ Still Failed : {still_failed}[/bold red]   "
            f"[dim]Total retried : {total}[/dim]",
            box=box.ROUNDED,
        )
    )


BATCH_SIZE = 100


@dataclass
class _HydrationTrack:
    title: str | None
    artist: str | None
    album: str | None
    mbid: str

    def model_dump(self) -> dict:
        return {
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "mbid": self.mbid,
        }


def match_and_update_nvid(batch_size: int = BATCH_SIZE):
    conn = get_db_connection_Musicbrainz()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT recording_mbid, title, artist, album
        FROM   hydration_cache
        WHERE  fetch_status = 'DONE'
          AND  nvid IS NULL
          AND  title  IS NOT NULL
          AND  artist IS NOT NULL
    """)
    rows = cursor.fetchall()

    if not rows:
        console.print(
            "[yellow]⚠ No DONE rows without nvid found in hydration_cache.[/yellow]"
        )
        conn.close()
        return

    total = len(rows)
    console.print(
        Panel.fit(
            f"[bold cyan]Navidrome ID Matching[/bold cyan]\n"
            f"[white]{total} hydrated tracks to match[/white]",
            box=box.DOUBLE_EDGE,
        )
    )

    total_matched = 0
    total_unmatched = 0
    batch_num = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
        refresh_per_second=4,
    ) as progress:
        task = progress.add_task("Matching batches…", total=total)

        for offset in range(0, total, batch_size):
            batch_rows = rows[offset : offset + batch_size]
            batch_num += 1

            tracks: List[_HydrationTrack] = [
                _HydrationTrack(
                    title=row["title"],
                    artist=row["artist"],
                    album=row["album"],
                    mbid=row["recording_mbid"],
                )
                for row in batch_rows
            ]

            console.print(
                f"\n[bold blue]Batch {batch_num} "
                f"({offset + 1}–{min(offset + batch_size, total)} of {total})[/bold blue]"
            )

            output_tracks, matched_count = batchMatchNavidromeTracks(tracks)

            unmatched_count = len(batch_rows) - matched_count
            total_matched += matched_count
            total_unmatched += unmatched_count

            console.print(
                f"  [green]✓ Matched : {matched_count}[/green]  "
                f"[red]✗ Unmatched : {unmatched_count}[/red]"
            )

            updates = []
            for track_data in output_tracks:
                navidrome_id = track_data.get("navidrome_id")
                mbid = track_data.get("mbid")
                if navidrome_id and mbid:
                    updates.append((navidrome_id, mbid))

            if updates:
                cursor.executemany(
                    "UPDATE hydration_cache SET nvid = ? WHERE recording_mbid = ?",
                    updates,
                )
                conn.commit()
                console.print(f"  [cyan]↳ Wrote {len(updates)} nvid(s) to DB.[/cyan]")

            progress.advance(task, len(batch_rows))

    conn.close()

    console.print(
        Panel.fit(
            f"[bold green]✓ Matched   : {total_matched}[/bold green]\n"
            f"[bold red]✗ Unmatched : {total_unmatched}[/bold red]\n"
            f"[dim]Total processed : {total}[/dim]",
            box=box.ROUNDED,
        )
    )


def filter_pool_by_genre(
    pool: list, target_size: int, user_id: str, history_dict: dict, alias_to_cat: dict
) -> list:
    cat_counts, _ = analyze_user_ratios(user_id, history_dict, alias_to_cat)

    total_listens = sum(cat_counts.values())

    if total_listens == 0:
        return pool[:target_size]

    target_counts = {
        cat: max(1, round((count / total_listens) * target_size))
        for cat, count in cat_counts.items()
    }

    selected = []
    remaining_pool = []
    for song in pool:
        raw_genres = song.get("genre", "")
        clean_genres = (
            [g.strip().lower() for g in raw_genres.split(",") if g.strip()]
            if raw_genres
            else []
        )
        mapped_cats = {alias_to_cat.get(g, g) for g in clean_genres} or {"unknown"}

        matches = [c for c in mapped_cats if target_counts.get(c, 0) > 0]
        if matches:
            selected.append(song)
            for m in matches:
                target_counts[m] -= 1
        else:
            remaining_pool.append(song)

        if len(selected) >= target_size:
            break
    if len(selected) < target_size:
        needed = target_size - len(selected)
        selected.extend(remaining_pool[:needed])

    return selected


def build_LB_CF_playlist(
    user_id: str,
    cf_config: dict,
    history_dict: dict,
    alias_to_cat: dict,
    standard_scores: dict,
) -> Tuple[List[str], Dict[str, str], float]:

    size = cf_config.get("size", 50)
    target_heard = cf_config.get("heard", 25)
    target_unheard = cf_config.get("unheard", 25)

    unheard_genre_inj = cf_config.get("unheard_genre_injection", True)
    heard_genre_inj = cf_config.get("heard_genre_injection", False)
    backfill_unheard = cf_config.get("backfill_unheard_song", True)
    use_blend = cf_config.get("use_blend", True)
    last_score = cf_config.get("last_score", 0.0)
    fallback_score = cf_config.get("fallbackScore", True)

    conn = get_db_connection_lib()
    cursor = conn.cursor()

    try:
        cursor.execute(f"ATTACH DATABASE '{DB_PATH_MB}' AS mb_db")
    except Exception as e:
        print(f"[LB_CF] Failed to attach musicbrainz database: {e}")
        return [], {}, last_score

    def fetch_cf_batch(score_limit: float) -> list:
        query = """
            SELECT 
                lb.recording_mbid,
                hc.nvid as song_id,
                lb.score,
                lb.latest_listened_at,
                lib.genre,
                lib.title
            FROM LB_CF lb
            JOIN mb_db.hydration_cache hc ON lb.recording_mbid = hc.recording_mbid
            JOIN library lib ON hc.nvid = lib.song_id
            WHERE hc.nvid IS NOT NULL
        """
        params = []
        if score_limit > 0:
            query += " AND lb.score < ?"
            params.append(score_limit)

        query += " ORDER BY lb.score DESC LIMIT 500"
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    candidates = fetch_cf_batch(last_score)

    if len(candidates) < size and fallback_score:
        print("[LB_CF] Reached bottom of CF scores. Wrapping around to highest scores.")
        top_candidates = fetch_cf_batch(0.0)
        existing_ids = {c["song_id"] for c in candidates}
        for c in top_candidates:
            if c["song_id"] not in existing_ids:
                candidates.append(c)
                existing_ids.add(c["song_id"])

    cursor.execute("DETACH DATABASE mb_db")
    conn.close()

    heard_pool = []
    unheard_pool = []
    for song in candidates:
        if song["latest_listened_at"]:
            heard_pool.append(song)
        else:
            unheard_pool.append(song)

    if heard_genre_inj:
        heard_pool = filter_pool_by_genre(
            heard_pool, target_heard, user_id, history_dict, alias_to_cat
        )
    if unheard_genre_inj:
        unheard_req = size if backfill_unheard else target_unheard
        unheard_pool = filter_pool_by_genre(
            unheard_pool, unheard_req, user_id, history_dict, alias_to_cat
        )

    final_ids = []
    song_signals = {}
    seen = set()

    def add_song(sid: str, signal: str):
        if sid not in seen:
            final_ids.append(sid)
            song_signals[sid] = signal
            seen.add(sid)

    for song in heard_pool:
        if len(final_ids) >= target_heard:
            break
        add_song(song["song_id"], "cf_heard")

    for song in unheard_pool:
        if (
            len([s for s in final_ids if song_signals[s] == "cf_unheard"])
            >= target_unheard
        ):
            break
        add_song(song["song_id"], "cf_unheard")

    if backfill_unheard and len(final_ids) < size:
        for song in unheard_pool:
            if len(final_ids) >= size:
                break
            add_song(song["song_id"], "cf_unheard_backfill")

    if use_blend and len(final_ids) < size:
        print(
            f"[LB_CF] Short on CF tracks ({len(final_ids)}/{size}). Falling back to local top scores..."
        )
        needed = size - len(final_ids)

        fallback_songs = [
            sid
            for sid, data in sorted(
                standard_scores.items(), key=lambda x: x[1]["score"], reverse=True
            )
            if sid not in seen and data["score"] >= 0
        ][:needed]

        for sid in fallback_songs:
            add_song(sid, "cf_blend_fallback")

    used_cf_candidates = [c for c in candidates if c["song_id"] in final_ids]
    new_lowest_score = 0.0

    if used_cf_candidates:
        new_lowest_score = min(c["score"] for c in used_cf_candidates)

    if len(candidates) < size and fallback_score:
        new_lowest_score = 0.0

    return final_ids[:size], song_signals, new_lowest_score
