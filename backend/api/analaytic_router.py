from core.db import (
    get_db_connection,
    get_db_connection_lib,
)
from fastapi import APIRouter

router = APIRouter(tags=["analytics"])

@router.get("/api/library/getMonthlyListens")
def getMonthlyListens():
    # print("get monthly listen")
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT
            strftime('%Y-%m', timestamp) as month,
            COUNT(*) as count
        FROM listens
        WHERE timestamp >= date('now', '-6 months')
        GROUP BY month
        ORDER BY month ASC
    """
    rows = cursor.execute(query).fetchall()
    conn.close()
    return [{"month": row[0], "count": row[1]} for row in rows]

@router.get("/api/listens/skipped")
def get_skipped_songs():
    # print("get skipped songs")
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM listens WHERE signal = 'skip' ORDER BY timestamp DESC")
        rows = cursor.fetchall()
        conn.close()
        return rows
    except Exception as e:
        return {
            "status": "error",
            "reason": f"Database error: {str(e)}",
        }

@router.get("/api/stats")
def stats():
    # print("stats")
    conn_lib = get_db_connection_lib()
    conn_log = get_db_connection()

    countSongsLib = conn_lib.execute("SELECT COUNT(*) FROM library").fetchone()[0]
    countPlayedSongs = conn_log.execute(
        "SELECT COUNT(DISTINCT song_id) FROM listens"
    ).fetchone()[0]

    signal_rows = conn_log.execute(
        "SELECT signal, COUNT(*) as count FROM listens GROUP BY signal"
    ).fetchall()
    signals = {row[0]: row[1] for row in signal_rows}

    mostPlayedArtists_row = conn_log.execute(
        "SELECT artist, COUNT(*) as count FROM listens GROUP BY artist ORDER BY count DESC LIMIT 10"
    ).fetchall()
    mostPlayedArtists = {row[0]: row[1] for row in mostPlayedArtists_row}

    mostPlayedSongs_row = conn_log.execute("""
        SELECT title, artist, COUNT(*) as play_count
        FROM listens
        GROUP BY title
        ORDER BY play_count DESC
        LIMIT 10
        """).fetchall()

    mostPlayedSongs = [
        {"title": row[0], "artist": row[1], "play_count": row[2]}
        for row in mostPlayedSongs_row
    ]

    conn_lib.close()
    conn_log.close()

    return {
        "total_songs": countSongsLib,
        "total_listens": countPlayedSongs,
        "signals": signals,
        "most_played_artists": mostPlayedArtists,
        "most_played_songs": mostPlayedSongs,
    }
