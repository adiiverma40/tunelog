import random
import re
from datetime import datetime, timedelta, timezone

from core.db import DB_PATH_LOG, get_db_connection_lib
from misc.misc import log_pool
from rich.console import Console
from rich.table import Table

from .base_playlist import analyze_user_ratios

pat = DB_PATH_LOG

console = Console(log_path=False, log_time=False)


def _to_utc_dt(iso_str: str) -> datetime:
    s = re.sub(r"(\.\d{6})\d+", r"\1", iso_str)
    s = s.replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def resolve_date_window(
    date_from, date_to, days_from, days_to
) -> tuple[datetime, datetime]:
    both_provided = (date_from is not None or date_to is not None) and (
        days_from is not None or days_to is not None
    )
    if both_provided:
        raise ValueError(
            "Provide either date_from/date_to OR days_from/days_to, not both."
        )

    today = datetime.now(timezone.utc)
    epoch = datetime.min.replace(tzinfo=timezone.utc)

    if days_from is not None or days_to is not None:
        start = (today - timedelta(days=days_from or 0)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end = (today - timedelta(days=days_to or 0)).replace(
            hour=23, minute=59, second=59, microsecond=999999
        )
        return start, end

    if date_from is not None or date_to is not None:
        start = epoch
        if date_from:
            start = _to_utc_dt(date_from).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

        end = today
        if date_to:
            end = _to_utc_dt(date_to).replace(
                hour=23, minute=59, second=59, microsecond=999999
            )

        return start, end

    return epoch, today.replace(hour=23, minute=59, second=59, microsecond=999999)


def _fmt_db(dt: datetime) -> str:
    s = dt.isoformat(timespec="microseconds").replace("+00:00", "Z")
    assert len(s) == 27, f"_fmt_db output unexpected length {len(s)}: {s}"
    return s


def get_discovery_pool(
    window_start: datetime,
    window_end: datetime,
    size: int,
    backtrack: bool,
    explicit_filter="notExplicit",
    pool_limit: int = 1000,
) -> tuple[list, bool, int]:

    metrics = {"filter_calls": 0, "backtrack_loops": 0}
    pool = []
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    start_str = _fmt_db(window_start)
    end_str = _fmt_db(window_end)

    print(f"[Discovery] Window: {start_str} → {end_str}")

    try:
        cursor.execute(f"ATTACH DATABASE '{pat}' AS history_db")

        def filter_pool() -> list:
            metrics["filter_calls"] += 1

            db_start = start_str[:27]
            db_end = end_str[:27]

            print(f"[Discovery] SQL comparing: {db_start} → {db_end}")

            cursor.execute(
                """
                SELECT lib.song_id, lib.title, lib.created, lib.genre
                FROM library lib
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM history_db.listens hist
                    WHERE hist.song_id = lib.song_id
                )
                AND substr(lib.created, 1, 27) >= ?
                AND substr(lib.created, 1, 27) <= ?
                ORDER BY lib.created DESC
                LIMIT ?
            """,
                (db_start, db_end, pool_limit),
            )

            rows = [dict(row) for row in cursor.fetchall()]
            print(f"[Discovery] filter_pool() → {len(rows)} rows")
            return rows

        pool = filter_pool()
        if len(pool) == 0:
            print("[Discovery] ⚠️  Pool returned 0 songs.")
            print(f"            Window start : {start_str}")
            print(f"            Window end   : {end_str}")
            print(f"            Pool limit   : {pool_limit}")
            print(f"            Backtrack    : {backtrack}")

        result_is_backtracked = False
        days_back = 0

        if backtrack and len(pool) < size:
            result_is_backtracked = True
            metrics["backtrack_loops"] += 1
            print("[Discovery] Pool too small, running backtrack query...")
            cursor.execute(
                """
                SELECT lib.song_id, lib.title, lib.created, lib.genre
                FROM library lib
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM history_db.listens hist
                    WHERE hist.song_id = lib.song_id
                )
                ORDER BY lib.created DESC
                LIMIT ?
            """,
                (pool_limit,),
            )

            seen_ids = {row["song_id"] for row in pool}
            backtrack_songs = [dict(row) for row in cursor.fetchall()]
            new_songs = [s for s in backtrack_songs if s["song_id"] not in seen_ids]
            pool += new_songs
            pool = pool[:pool_limit]

            if len(pool) == 0:
                print(
                    "[Discovery] Backtrack also returned 0 songs. Library may be empty or all songs are in listen history."
                )

        cursor.execute("DETACH DATABASE history_db")

    except Exception as e:
        print(f"[Discovery] Database error: {e}")
        pool, result_is_backtracked, days_back = [], False, 0
    finally:
        conn.close()

    print("\n" + "=" * 45)
    print("DISCOVERY POOL OPERATION SUMMARY")
    print("=" * 45)
    print(f"• filter_pool() Calls   : {metrics['filter_calls']}")
    print(f"• Backtrack Loops       : {metrics['backtrack_loops']}")
    print(f"• Target Size           : {size}")
    print(f"• Candidates Found      : {len(pool)}")
    print("=" * 45 + "\n")

    return pool, result_is_backtracked, days_back


def build_discovery_playlist(
    pool: list,
    history_dict: dict,
    user_id: str,
    size: int,
    alias_to_cat: dict,
) -> tuple[list, dict]:

    song_signals: dict = {}
    final_ids: list = []
    seen: set = set()

    cat_counts, _ = analyze_user_ratios(user_id, history_dict, alias_to_cat)
    total_listens = sum(cat_counts.values())

    def get_mapped_genres(song: dict) -> set:
        raw = song.get("genre", "")
        genres = [g.strip().lower() for g in raw.split(",") if g.strip()] if raw else []
        return {alias_to_cat.get(g, g) for g in genres} or {"unknown"}

    def add_song(sid: str, reason: str, song: dict):
        final_ids.append(sid)
        seen.add(sid)
        song_signals[sid] = "unheard"
        log_pool(user_id, reason, sid, song.get("title", "Unknown"), "unheard")

    if total_listens > 0:
        target_counts = {
            cat: max(1, round((count / total_listens) * size))
            for cat, count in cat_counts.items()
        }

        non_genre_pool = []
        for song in pool:
            if len(final_ids) >= size:
                break
            sid = song["song_id"]
            if sid in seen:
                continue

            mapped = get_mapped_genres(song)
            matches = [c for c in mapped if target_counts.get(c, 0) > 0]

            if matches:
                add_song(sid, "discovery_genre_match", song)
                for m in matches:
                    target_counts[m] = max(0, target_counts[m] - 1)
            else:
                non_genre_pool.append(song)

        for song in non_genre_pool:
            if len(final_ids) >= size:
                break
            sid = song["song_id"]
            if sid not in seen:
                add_song(sid, "discovery_pool_nongenre", song)

    else:
        for song in pool[:size]:
            add_song(song["song_id"], "discovery_pool_nohistory", song)
    if len(final_ids) < size:
        remaining = [s for s in pool if s["song_id"] not in seen]
        random.shuffle(remaining)
        for song in remaining:
            if len(final_ids) >= size:
                break
            add_song(song["song_id"], "discovery_fallback_random", song)

    if final_ids:
        table = Table(
            title=f"Discovery Playlist · {user_id} · {len(final_ids[:size])} songs",
            show_header=True,
        )
        table.add_column("#", style="dim", width=4)
        table.add_column("Song", min_width=20, max_width=35)
        table.add_column("Added", width=12)

        for i, sid in enumerate(final_ids[:size], 1):
            song = next((s for s in pool if s["song_id"] == sid), {})
            name = song.get("title", "Unknown")
            name = name if len(name) <= 32 else name[:29] + "..."
            raw_date = song.get("created", "")
            try:
                parsed = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                date_str = parsed.strftime("%-d %b %Y")
            except Exception:
                date_str = "Unknown"
            table.add_row(str(i), name, date_str)

        console.print(table)

    return final_ids[:size], song_signals
