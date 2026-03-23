# Database initalization for recording history of played song
# NOTE : DOCKER MARK THE TUNELOG/DATA AS ROOT SO IF ONCE DONE DOCKER COMPOSE UP --BUILD, YOU CAN NOT RUN IT WITH PYTHON MAIN.PY
# SO CHOOSE ONE

import sqlite3
import os

if os.path.exists("/app/data"):
    DATA_DIR = "/app/data"
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))

DB_PATH_LOG = os.path.join(DATA_DIR, "tunelog.db")
DB_PATH_LIB = os.path.join(DATA_DIR, "songlist.db")
DB_PATH_USR = os.path.join(DATA_DIR, "users.db")
DB_PATH_PLTS = os.path.join(DATA_DIR, "playlist.db")


# db connection

# for song listen history
def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH_LOG), exist_ok=True)
    conn = sqlite3.connect(DB_PATH_LOG, timeout=30)  
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  
    return conn


# for library sync
def get_db_connection_lib():
    os.makedirs(os.path.dirname(DB_PATH_LIB), exist_ok=True)
    conn = sqlite3.connect(DB_PATH_LIB, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


# for users
def get_db_connection_usr():
    os.makedirs(os.path.dirname(DB_PATH_USR), exist_ok=True)
    conn = sqlite3.connect(DB_PATH_USR, timeout=30)  
    conn.row_factory = sqlite3.Row
    return conn


# for playlist
def get_db_connection_playlist():
    os.makedirs(os.path.dirname(DB_PATH_PLTS), exist_ok=True)
    conn = sqlite3.connect(DB_PATH_PLTS, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db_usr():
    conn = get_db_connection_usr()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user (
            username     TEXT PRIMARY KEY,
            password       TEXT,
            isAdmin     BOOLEAN
            
        )
    """
    )

    conn.commit()
    conn.close()


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


def init_db_lib():
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS library (
            song_id     TEXT PRIMARY KEY,
            title       TEXT,
            artist      TEXT,
            album       TEXT,
            genre       TEXT,
            duration    INTEGER,
            last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            explicit    TEXT
        )
    """
    )

    conn.commit()
    conn.close()


def init_db_playlist():
    conn = get_db_connection_playlist()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS playlist (
            username  TEXT NOT NULL,
            title     TEXT,
            artist    TEXT,
            genre     TEXT,
            signal    TEXT,
            explicit  TEXT,
            song_id   TEXT NOT NULL,
            generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (username, song_id)
        )
        """
    )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    init_db_lib()
    print("asdasd")
    init_db_usr()
    init_db_playlist()
