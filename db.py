# Database initalization for recording history of played song


import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "Data", "tunelog.db")

# Database connection


def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS listens (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        genre TEXT,
        duration   INTEGER,
        played  INTEGER,
        percent_played  REAL,
        signal TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id     TEXT DEFAULT "default"
        
        
        )
        """
    )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
