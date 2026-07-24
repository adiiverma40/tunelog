import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from core.crypto import decrypt_token
from core.db import (
    DB_PATH_MB,
    get_db_connection_lib,
    get_db_connection_Musicbrainz,
    get_db_connection_usr,
)
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
)
from rich.table import Table
from rich.text import Text
from scrobble.listenBrainz import batchMatchNavidromeTracks
from Workers.worker_queue import LB_queue, MB_queue, MBWork, lbWork

from .base_playlist import analyze_user_ratios

console = Console()

LB_BASE = "https://api.listenbrainz.org"
LB_HEADERS = {
    "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)",
    "Accept": "application/json",
}

MAX_COUNT = 1000


def resolve_lb_username(decrypted_token: str) -> str | None:
    try:
        r = LB_queue.addWork(
            work=lbWork(
                method="GET", endpoint="/1/validate-token", token=decrypted_token
            )
        )

        if r.get("status_code") == 200 and r.get("status") == "success":
            data = r.get("data", {})
            if data.get("valid"):
                return data.get("user_name")
            else:
                console.print(
                    f"    [red]✗ Token invalid: {data.get('message', 'unknown reason')}[/red]"
                )
                return None
        else:
            console.print(
                f"    [red]✗ validate-token returned HTTP {r.get('status_code')}: {r.get('error_msg')}[/red]"
            )
            return None

    except Exception as e:
        console.print(f"    [red]✗ validate-token request failed: {e}[/red]")
        return None


def fetch_cf_recordings(
    lb_username: str, decrypted_token: str
) -> tuple[list, Optional[int]]:
    url = f"/1/cf/recommendation/user/{lb_username}/recording"
    params = {"count": MAX_COUNT, "offset": 0}

    try:
        r = LB_queue.addWork(
            work=lbWork(
                method="GET", endpoint=url, params=params, token=decrypted_token
            )
        )

        status_code = r.get("status_code")

        if status_code == 200 and r.get("status") == "success":
            payload = r.get("data", {}).get("payload", {})
            mbids = payload.get("mbids", [])
            total = payload.get("total_mbid_count", len(mbids))
            cf_last_updated = payload.get("last_updated", int(time.time()))

            console.print(
                f"    [cyan]↳ Total CF tracks available: {total} | Fetched: {len(mbids)}[/cyan]"
            )
            return mbids, cf_last_updated

        elif status_code == 404:
            console.print(
                f"    [yellow]⚠ No CF recommendations found for '{lb_username}' (404 — model may not have run yet)[/yellow]"
            )
            return [], None

        else:
            console.print(
                f"    [red]✗ CF fetch returned HTTP {status_code}: {r.get('error_msg')}[/red]"
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


def fetchPendingSongs(limit: int | None = None):
    conn = get_db_connection_Musicbrainz()
    cursor = conn.cursor()

    query = "SELECT recording_mbid FROM hydration_cache WHERE fetch_status = 'PENDING'"
    if limit:
        query += f" LIMIT {limit}"
    cursor.execute(query)
    pending = [row["recording_mbid"] for row in cursor.fetchall()]
    conn.close()

    total = len(pending)
    if not total:
        console.print("[yellow]⚠ No PENDING rows in hydration_cache.[/yellow]")
        return

    console.print(
        Panel.fit(
            f"[bold cyan]MusicBrainz Hydration[/bold cyan]\n"
            f"[white]{total} tasks dispatched to background worker[/white]",
            box=box.DOUBLE_EDGE,
        )
    )

    params = {"inc": "artists releases release-groups", "fmt": "json"}

    for mbid in pending:
        url = f"/recording/{mbid}"
        MB_queue.addBackgroundTask(
            priority=4,
            work=MBWork(
                method="GET",
                endpoint=url,
                params=params,
                on_success=lambda data, m_id=mbid: handle_mb_success(data, m_id),
                on_error=lambda err, m_id=mbid: handle_mb_error(err, m_id),
            ),
        )


def handle_mb_success(raw_data: dict, mbid: str):
    """Fired by the worker when it gets a 200 OK from MusicBrainz."""
    console.print(f"  [green]✓[/green] [dim]{mbid[:8]}…[/dim] [white]Fetching…[/white]")
    
    parsed = parse_recording(raw_data) if raw_data else None
    conn = get_db_connection_Musicbrainz()

    update_row(conn, mbid, parsed)
    conn.commit()
    conn.close()

    if parsed:
        artist = parsed.get("artist") or "Unknown"
        title = parsed.get("title") or "Unknown"
        console.print(
            f"  [green]✓[/green] [dim]{mbid[:8]}…[/dim] [white]{artist} — {title}[/white]"
        )
    else:
        console.print(f"  [red]✗[/red] [dim]{mbid[:8]}…[/dim] [red]Parse FAILED[/red]")


def handle_mb_error(error_msg: str, mbid: str):
    """Fired by the worker if the API times out or 404s."""
    conn = get_db_connection_Musicbrainz()

    now = datetime.utcnow().isoformat(sep=" ", timespec="seconds")
    conn.execute(
        "UPDATE hydration_cache SET fetch_status = 'FAILED', last_synced = ? WHERE recording_mbid = ?",
        (now, mbid),
    )
    conn.commit()
    conn.close()

    console.print(
        f"  [red]✗[/red] [dim]{mbid[:8]}…[/dim] [red]API Error: {error_msg}[/red]"
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
    params = {"inc": "artists releases release-groups", "fmt": "json"}

    for index, mbid in enumerate(failed_rows, start=1):
        url = f"/recording/{mbid}"
        MB_queue.addBackgroundTask(
            priority=4,
            work=MBWork(
                method="GET",
                endpoint=url,
                params=params,
                on_success=lambda data, m_id=mbid: handle_mb_success(data, m_id),
                on_error=lambda err, m_id=mbid: handle_mb_error(err, m_id),
            ),
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


_console = Console()

_SIGNAL_META = {
    "cf_heard": ("Heard", "bright_cyan"),
    "cf_unheard": ("Unheard", "bright_magenta"),
    "cf_unheard_backfill": ("Unheard Backfill", "magenta"),
    "cf_blend_fallback": ("Blend Fallback", "yellow"),
}


def _log_cf_table(
    song_ids: list,
    song_signals: dict,
    candidates_by_id: dict,
    playlist_name: str,
    new_heard_score: float,
    new_unheard_score: float,
):
    table = Table(
        title=f"[bold orange1]LB CF — {playlist_name}[/]",
        box=box.SIMPLE_HEAD,
        show_lines=False,
        header_style="bold dim",
        title_justify="left",
        min_width=72,
    )
    table.add_column("#", style="dim", width=4, justify="right")
    table.add_column("Title", min_width=28)
    table.add_column("Type", width=18)
    table.add_column("Score", style="dim", width=10, justify="right")

    signal_counts: dict = {}

    for i, sid in enumerate(song_ids, 1):
        signal = song_signals.get(sid, "unknown")
        label, colour = _SIGNAL_META.get(signal, (signal, "white"))
        signal_counts[label] = signal_counts.get(label, 0) + 1

        song = candidates_by_id.get(sid)
        title = (song["title"] if song else sid) or sid
        score = song["score"] if song else None

        table.add_row(
            str(i),
            Text(title[:40] + ("…" if len(title) > 40 else ""), style="white"),
            Text(f"● {label}", style=colour),
            Text(f"{score:.4f}" if score is not None else "—", style="dim"),
        )

    _console.print(table)

    summary = "  ".join(
        f"[{_SIGNAL_META.get(k.lower().replace(' ', '_'), ('', 'white'))[1]}]{k}[/] [dim]{v}[/]"
        for k, v in signal_counts.items()
    )
    _console.print(
        f"  [dim]Total[/] [bold white]{len(song_ids)}[/]  |  {summary}\n"
        f"  [dim]Heard cursor  →[/] [bright_cyan]{new_heard_score:.4f}[/]"
        f"   [dim]Unheard cursor →[/] [bright_magenta]{new_unheard_score:.4f}[/]\n"
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
        selected.extend(remaining_pool[: target_size - len(selected)])

    return selected


def build_LB_CF_playlist(
    user_id: str,
    cf_config: dict,
    history_dict: dict,
    alias_to_cat: dict,
    standard_scores: dict,
) -> Tuple[List[str], Dict[str, str], float, float]:

    size = cf_config.get("size", 50)
    target_heard = cf_config.get("heard", 25)
    target_unheard = cf_config.get("unheard", 25)

    unheard_genre_inj = cf_config.get("unheard_genre_injection", True)
    heard_genre_inj = cf_config.get("heard_genre_injection", False)
    backfill_unheard = cf_config.get("backfill_unheard_song", True)
    use_blend = cf_config.get("use_blend", True)
    fallback_score = cf_config.get("fallbackScore", True)
    playlist_name = cf_config.get("Name", "Listenbrainz Playlist")

    heard_last_score = cf_config.get("heard_last_score", 0.0)
    unheard_last_score = cf_config.get("unheard_last_score", 0.0)

    conn = get_db_connection_lib()
    cursor = conn.cursor()

    try:
        cursor.execute(f"ATTACH DATABASE '{DB_PATH_MB}' AS mb_db")
    except Exception as e:
        _console.print(f"[red][LB_CF] Failed to attach musicbrainz database: {e}[/]")
        return [], {}, heard_last_score, unheard_last_score

    def fetch_cf_batch() -> list:
        query = """
            SELECT
                lb.recording_mbid,
                hc.nvid          AS song_id,
                lb.score,
                lb.latest_listened_at,
                lib.genre,
                lib.title
            FROM LB_CF lb
            JOIN mb_db.hydration_cache hc ON lb.recording_mbid = hc.recording_mbid
            JOIN library lib              ON hc.nvid = lib.song_id
            WHERE hc.nvid IS NOT NULL
            ORDER BY lb.score DESC
            LIMIT 500
        """
        cursor.execute(query)
        return [dict(row) for row in cursor.fetchall()]

    raw_candidates = fetch_cf_batch()

    all_heard_candidates = [c for c in raw_candidates if c["latest_listened_at"]]
    all_unheard_candidates = [c for c in raw_candidates if not c["latest_listened_at"]]

    _console.print(
        f"[dim][LB_CF] Candidate pool —[/] "
        f"[bright_cyan]heard: {len(all_heard_candidates)}[/]  "
        f"[bright_magenta]unheard: {len(all_unheard_candidates)}[/]"
    )

    def apply_score_cursor(pool: list, last_score: float) -> list:
        if last_score <= 0:
            return pool
        return [c for c in pool if c["score"] < last_score]

    heard_candidates = apply_score_cursor(all_heard_candidates, heard_last_score)
    unheard_candidates = apply_score_cursor(all_unheard_candidates, unheard_last_score)

    _console.print(
        f"[dim][LB_CF] After cursor —[/] "
        f"[bright_cyan]heard: {len(heard_candidates)}[/] [dim](cursor {heard_last_score:.4f})[/]  "
        f"[bright_magenta]unheard: {len(unheard_candidates)}[/] [dim](cursor {unheard_last_score:.4f})[/]"
    )

    heard_wrapped = False
    unheard_wrapped = False

    if len(heard_candidates) < target_heard and fallback_score:
        _console.print(
            "[yellow][LB_CF] Heard bucket ran dry — wrapping to top scores.[/]"
        )
        existing = {c["song_id"] for c in heard_candidates}
        for c in all_heard_candidates:
            if c["song_id"] not in existing:
                heard_candidates.append(c)
                existing.add(c["song_id"])
        heard_wrapped = True

    if len(unheard_candidates) < target_unheard and fallback_score:
        _console.print(
            "[yellow][LB_CF] Unheard bucket ran dry — wrapping to top scores.[/]"
        )
        existing = {c["song_id"] for c in unheard_candidates}
        for c in all_unheard_candidates:
            if c["song_id"] not in existing:
                unheard_candidates.append(c)
                existing.add(c["song_id"])
        unheard_wrapped = True

    cursor.execute("DETACH DATABASE mb_db")
    conn.close()

    if heard_genre_inj:
        _console.print("[dim][LB_CF] Applying genre injection to heard pool.[/]")
        heard_candidates = filter_pool_by_genre(
            heard_candidates, target_heard, user_id, history_dict, alias_to_cat
        )

    if unheard_genre_inj:
        _console.print("[dim][LB_CF] Applying genre injection to unheard pool.[/]")
        unheard_req = size if backfill_unheard else target_unheard
        unheard_candidates = filter_pool_by_genre(
            unheard_candidates, unheard_req, user_id, history_dict, alias_to_cat
        )

    final_ids = []
    song_signals = {}
    seen = set()

    used_heard_candidates = []
    used_unheard_candidates = []

    def add_song(song: dict, signal: str, bucket: str):
        sid = song["song_id"]
        if sid not in seen:
            final_ids.append(sid)
            song_signals[sid] = signal
            seen.add(sid)
            if bucket == "heard":
                used_heard_candidates.append(song)
            elif bucket == "unheard":
                used_unheard_candidates.append(song)

    for song in heard_candidates:
        if (
            len(
                [s for s in final_ids if song_signals.get(s, "").startswith("cf_heard")]
            )
            >= target_heard
        ):
            break
        add_song(song, "cf_heard", "heard")

    for song in unheard_candidates:
        if (
            len(
                [
                    s
                    for s in final_ids
                    if song_signals.get(s, "") in ("cf_unheard", "cf_unheard_backfill")
                ]
            )
            >= target_unheard
        ):
            break
        add_song(song, "cf_unheard", "unheard")

    if backfill_unheard and len(final_ids) < size:
        for song in unheard_candidates:
            if len(final_ids) >= size:
                break
            add_song(song, "cf_unheard_backfill", "unheard")

    if use_blend and len(final_ids) < size:
        needed = size - len(final_ids)
        _console.print(
            f"[yellow][LB_CF] Short on CF tracks ({len(final_ids)}/{size}). "
            f"Pulling {needed} from local blend scores.[/]"
        )
        fallback_songs = [
            sid
            for sid, data in sorted(
                standard_scores.items(), key=lambda x: x[1]["score"], reverse=True
            )
            if sid not in seen and data["score"] >= 0
        ][:needed]

        for sid in fallback_songs:
            if sid not in seen:
                final_ids.append(sid)
                song_signals[sid] = "cf_blend_fallback"
                seen.add(sid)

    new_heard_score = 0.0
    if used_heard_candidates:
        new_heard_score = min(c["score"] for c in used_heard_candidates)
    if heard_wrapped:
        new_heard_score = 0.0

    new_unheard_score = 0.0
    if used_unheard_candidates:
        new_unheard_score = min(c["score"] for c in used_unheard_candidates)
    if unheard_wrapped:
        new_unheard_score = 0.0

    _log_cf_table(
        song_ids=final_ids[:size],
        song_signals=song_signals,
        candidates_by_id={c["song_id"]: c for c in raw_candidates},
        playlist_name=playlist_name,
        new_heard_score=new_heard_score,
        new_unheard_score=new_unheard_score,
    )

    return final_ids[:size], song_signals, new_heard_score, new_unheard_score


def fetch_top_similar_user(lb_username: str, decrypted_token: str) -> str | None:
    url = f"/1/user/{lb_username}/similar-users"

    try:
        r = LB_queue.addWork(
            work=lbWork(method="GET", endpoint=url, token=decrypted_token)
        )

        if r.status_code == 200:
            payload = r.json().get("payload", [])
            if not payload:
                console.print(
                    f"  [yellow]⚠ No similar users found for '{lb_username}'[/yellow]"
                )
                return None

            top = payload[0]
            top_username = top.get("user_name")
            top_similarity = top.get("similarity", 0.0)

            console.print(
                f"  [green]✓ Top similar user: [bold]{top_username}[/bold] "
                f"[dim](similarity: {top_similarity:.2%})[/dim][/green]"
            )
            return top_username

        elif r.status_code == 404:
            console.print(
                f"  [yellow]⚠ No similar users data for '{lb_username}' (404)[/yellow]"
            )
            return None
        else:
            console.print(
                f"  [red]✗ similar-users returned HTTP {r.status_code}: "
                f"{r.text[:200]}[/red]"
            )
            return None

    except Exception as e:
        console.print(f"  [red]✗ similar-users request failed: {e}[/red]")
        return None


def FetchCF():
    console.print(
        Panel.fit(
            "[bold magenta]ListenBrainz CF Recommendation Fetcher[/bold magenta]",
            subtitle="TuneLog · multi-user",
            box=box.DOUBLE_EDGE,
        )
    )
    inserted = 0

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
    summary.add_column("Similar User", style="yellow", no_wrap=True)
    summary.add_column("Own CF Saved", style="green", justify="right")
    summary.add_column("Similar CF Saved", style="bright_yellow", justify="right")
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
            summary.add_row(
                db_username, "—", "—", "0", "0", "[red]Decrypt failed[/red]"
            )
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
                summary.add_row(
                    db_username, "—", "—", "0", "0", "[red]No LB username[/red]"
                )
                continue

        console.print(
            f"  [green]✓ LB username resolved: [bold]{lb_username}[/bold][/green]"
        )

        console.print(
            f"  [dim]→ Fetching own CF recommendations for '{lb_username}'...[/dim]"
        )
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TimeElapsedColumn(),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task(f"  Fetching CF for {lb_username}...", total=None)
            mbids, cf_last_updated = fetch_cf_recordings(lb_username, decrypted)
            progress.update(task, completed=True)

        own_saved = 0
        if not mbids:
            console.print(f"  [yellow]⚠ No own CF data for '{lb_username}'[/yellow]")
        else:
            console.print(
                f"  [dim]→ Saving {len(mbids)} own CF tracks (db_user='{db_username}')...[/dim]"
            )
            own_saved = save_cf_to_db(db_username, mbids, cf_last_updated)
            console.print(
                f"  [bold green]✓ Saved {own_saved} own CF tracks for '{db_username}'[/bold green]"
            )

        console.print(
            f"  [dim]→ Fetching top similar user for '{lb_username}'...[/dim]"
        )
        similar_username = fetch_top_similar_user(lb_username, decrypted)
        similar_saved = 0

        if not similar_username:
            console.print(
                f"  [yellow]⚠ No similar user found for '{lb_username}', skipping similar CF.[/yellow]"
            )
            summary.add_row(
                db_username,
                lb_username,
                "—",
                str(own_saved),
                "0",
                "[green]✓ Own only[/green]"
                if own_saved
                else "[yellow]No data[/yellow]",
            )
            inserted = own_saved
            continue

        console.print(
            f"  [dim]→ Fetching CF for similar user '{similar_username}'...[/dim]"
        )
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TimeElapsedColumn(),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task(
                f"  Fetching CF for {similar_username}...", total=None
            )
            sim_mbids, sim_cf_last_updated = fetch_cf_recordings(
                similar_username, decrypted
            )
            progress.update(task, completed=True)

        if not sim_mbids:
            console.print(
                f"  [yellow]⚠ No CF data for similar user '{similar_username}'[/yellow]"
            )
        else:
            sim_db_key = f"{db_username}__sim__{similar_username}"
            console.print(
                f"  [dim]→ Saving {len(sim_mbids)} similar-user CF tracks "
                f"(key='{sim_db_key}')...[/dim]"
            )
            similar_saved = save_cf_to_db(sim_db_key, sim_mbids, sim_cf_last_updated)
            console.print(
                f"  [bold bright_yellow]✓ Saved {similar_saved} similar-user CF tracks "
                f"for '{similar_username}'[/bold bright_yellow]"
            )

        inserted = own_saved + similar_saved
        summary.add_row(
            db_username,
            lb_username,
            similar_username,
            str(own_saved),
            str(similar_saved),
            "[green]✓ OK[/green]",
        )

    console.print()
    console.print(summary)
    console.print(
        Panel.fit("[bold green]CF fetch complete.[/bold green]", box=box.ROUNDED)
    )
    return inserted
