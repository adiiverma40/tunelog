import sqlite3
import os
import time
import functools
from rich.console import Console

console = Console()


# import sqlite3
from state import status_registry

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
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user (
            username     TEXT PRIMARY KEY,
            name    Text,
            avatar Text,
            password       TEXT,
            isAdmin     BOOLEAN,
            playlistId  TEXT
            
        )
    """)
    try:
        console.print("[bold green]Trying to create name column")
        cursor.execute("ALTER TABLE user ADD COLUMN name TEXT")
        console.print("[bold green]Trying to create Avatar column")
        cursor.execute("ALTER TABLE user ADD COLUMN avatar TEXT")
    except Exception as e:
        console.print("[bold Red]COLUMN MAY ALREADY EXIST", e)
    conn.commit()
    conn.close()


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
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
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_listens_song_id ON listens(song_id);"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_listens_user_song ON listens(user_id, song_id);"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_listens_timestamp ON listens(timestamp);"
    )
    conn.commit()
    conn.close()


def init_db_lib():
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS library (
            song_id     TEXT PRIMARY KEY,
            title       TEXT,
            artist      TEXT,
            artistId    TEXT,
            artistJSON  TEXT,
            album       TEXT,
            albumId     TEXT, 
            genre       TEXT,
            duration    INTEGER,
            last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created     TIMESTAMP,
            explicit    TEXT
        )
    """)
    try:
        console.print("[bold green]Trying to create 'Created' column in Library table")
        cursor.execute("ALTER TABLE library ADD COLUMN created TIMESTAMP")

    except Exception as e:
        console.print(f"[bold red]Error in altering db : {e}")

    conn.commit()
    conn.close()


def init_db_playlist():
    conn = get_db_connection_playlist()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS playlist (
            username     TEXT NOT NULL,
            song_id      TEXT NOT NULL,
            title        TEXT,
            artist       TEXT,
            genre        TEXT,
            signal       TEXT,
            explicit     TEXT,
            type         TEXT NOT NULL DEFAULT 'blend',
            generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (username, song_id, type)
        )
    """)
    conn.commit()
    conn.close()


def db_supervisor(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        retries = 3
        last_error = None

        for attempt in range(retries):
            try:
                result = func(*args, **kwargs)
                status_registry.update("Db", status="running")
                return result

            except sqlite3.OperationalError as e:
                last_error = e
                if "locked" in str(e).lower():
                    status_registry.update(
                        "Db",
                        status="warning",
                        error=f"Lock detected, retry {attempt+1}",
                    )
                    time.sleep(1)
                    continue
                raise

            except Exception as e:
                status_registry.update("Db", status="crashed", error=str(e))
                raise e

        status_registry.update(
            "Db", status="crashed", error=f"Final Failure: {last_error}"
        )
        return None

    return wrapper


def init_search_db():
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS search_metadata (
            song_id       TEXT PRIMARY KEY,
            lyrics        TEXT,
            last_updated  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (song_id) REFERENCES library (song_id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS song_search_index USING fts5(
            song_id UNINDEXED, 
            title, 
            artist,
            actualArtist, 
            artistId UNINDEXED,
            artistJSON UNINDEXED, 
            album,
            actualAlbum, 
            albumId UNINDEXED, 
            lyrics,
            tokenize='unicode61 remove_diacritics 1'
        )
    """)

    conn.commit()
    conn.close()


def migrate_playlist_primary_key():
    conn = get_db_connection_playlist()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS playlist_new (
                username     TEXT NOT NULL,
                song_id      TEXT NOT NULL,
                title        TEXT,
                artist       TEXT,
                genre        TEXT,
                signal       TEXT,
                explicit     TEXT,
                type         TEXT NOT NULL DEFAULT 'blend',
                generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (username, song_id, type)
            )
        """)
        conn.execute("""
            INSERT OR IGNORE INTO playlist_new 
            SELECT username, song_id, title, artist, genre, signal, explicit, 
                   COALESCE(type, 'blend'), generated_at 
            FROM playlist
        """)
        conn.execute("DROP TABLE playlist")
        conn.execute("ALTER TABLE playlist_new RENAME TO playlist")
        console.print(
            "[bold green]Migrated playlist table primary key to (username, song_id, type)[/bold green]"
        )
    except Exception as e:
        console.print(f"[red]Playlist migration error: {e}[/red]")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    init_db_lib()
    init_db_usr()
    init_db_playlist()
