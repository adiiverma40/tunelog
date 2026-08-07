# Migration code for navidrome v0.63.2
#
## Migration Algorithm

# The migration will work like this:
# 1. fetch a random song_id, title, artist from db
# 2. fetch the song details from navidrome using title,
# 3. use fuzzy match to match the title from ND to the title from the db
# 4. if score is less then 95% assume the song is not found in ND, and skip it, and redo until a match is found or the threshold is reached
# 5. After the match is found, check if songId matches the songId from db. if it does then stop the migration or try a lil later again if version is greater then `0.63.2`
# 6. if songid does not match, meaning the migration has done.
# 7. Then, create a new column, old_song_id, copy the old song id, and then
# 8. Refresh the library db. this will make it so that library db has new song ids,
# 9. Now, using library db as source of truth, we can updated the rest of dbs using old_song_id to map the new song id, This will be faster then fetching from ND for each song.

from core.db import (
    DB_PATH_LIB,
    DB_PATH_MB,
    get_db_connection,
    get_db_connection_lib,
    get_db_connection_Musicbrainz,
    get_db_connection_usr,
)
from metadata.library import sync_library
from navidrome.misc import get_ND_token
from rapidfuzz import fuzz
from rich.console import Console
from Workers.worker_queue import ND_queue, NDWork

console = Console()
# TODO: CHANGE GET ND TOKEN TO A GLOBAL FUNCTION, INSTEAD OF BEING CALLED EVERYWHERE, WHEN NEEDING ND TOKEN
# Main Function


def v_0_63_2_migrate():
    console.print("[bold purple]\\[Migration](v0.63.2):: Migration Starting ::")
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    random_song = fetch_random_song(cursor)
    console.print(
        f"[bold purple]\\[Migration](v0.63.2):: Fetching ND song :: {random_song.get('title')}"
    )
    # nd_song = fetch_nd_song("asdfiugasbf asdfhuia sd hf;isjhasdbudvkmbdc")
    nd_song = fetch_nd_song(random_song.get("title"))
    console.print(
        f"[bold purple]\\[Migration](v0.63.2):: ND returned :: {len(nd_song)} responses"
    )
    console.print("[bold purple]\\[Migration](v0.63.2):: Matching Responses ::")

    if nd_song:
        for song in nd_song:
            title = song.get("title")
            artist = song.get("artist")
            album = song.get("album")
            song_id = song.get("id")
            console.print(
                f"[bold purple]\\[Migration](v0.63.2):: {song_id} :: {title} :: {artist:8}"
            )
            score = get_fuzz_score(random_song.get("title"), title)
            console.print(f"[bold purple]\\[Migration](v0.63.2):: score: {score}")
            if score >= 95:
                if random_song.get("song_id") == song_id:
                    console.print(
                        f"[bold purple]\\[Migration](v0.63.2):: Match Found :: \n:: ND: {song_id} :: DB: {random_song.get('song_id')} :: {score}%"
                    )
                    return False
                else:
                    console.print(
                        f"[bold red]\\[Migration](v0.63.2):: ND: {song_id} :: DB: {random_song.get('song_id')} :: {score}%"
                    )
                    return True
                return

    cursor.close()
    conn.close()


# Step 1.
def fetch_random_song(cursor):
    cursor.execute(
        "SELECT song_id, title, artist FROM library ORDER BY RANDOM() LIMIT 1"
    )
    song = cursor.fetchone()
    return {"song_id": song[0], "title": song[1], "artist": song[2]}


# 2. fetch song from navidrome
def fetch_nd_song(title):
    conn = get_db_connection_usr()
    cursor = conn.cursor()
    song = ND_queue.addWork(
        NDWork(
            method="get",
            endpoint="/api/song",
            params={"title": title},
            token=get_ND_token(cursor),
        )
    )
    cursor.close()
    conn.close()
    return song.get("data")


# 3. Create migration table
def create_migration_table(cursor):
    console.print("[bold purple]\\[Migration](v0.63.2)::Creating migration table ::")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS migration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            old_song_id TEXT,
            path TEXT,
            new_song_id TEXT
        )
        """
    )
    cursor.connection.commit()


# 4. Add old song id to table
def migrate_old_song_id(cursor):
    console.print(
        "[bold purple]\\[Migration](v0.63.2)::Adding old song id to migration table ::"
    )
    cursor.execute(
        """
        INSERT INTO migration (old_song_id, path)
        SELECT song_id, path FROM library
        """
    )
    cursor.connection.commit()


# 5. sync library for new ND songs
def start_librarySync():
    sync_library()


# 6. fill new song id into migration table
def migrate_new_song_id(cursor):
    console.print(
        "[bold purple]\\[Migration](v0.63.2)::Adding new song id to migration table ::"
    )

    cursor.execute(
        """
        UPDATE migration
        SET new_song_id = (
            SELECT song_id
            FROM library
            WHERE library.path = migration.path
        )
        WHERE EXISTS (
            SELECT 1
            FROM library
            WHERE library.path = migration.path
        )
        """
    )
    cursor.connection.commit()

# Whats better then importing two functions? YES!, correct, importing one function
def migrate_database():
    migrate_tunelog_db()
    migrate_mb_db()


# 7. changes the tunelog db
def migrate_tunelog_db():
    conn_history = get_db_connection()
    cursor_history = conn_history.cursor()

    console.print("[bold purple]\\[Migration](v0.63.2)::Updating tunelog db ::")
    cursor_history.execute(f"ATTACH DATABASE '{DB_PATH_LIB}' AS songlistDB")

    tables_to_update = ["listens", "listenbrainz", "timeout"]

    for table in tables_to_update:
        console.print(f"[bold purple]\\[Migration](v0.63.2)::Updating {table} ::")
        cursor_history.execute(
            f"""
            UPDATE {table}
            SET song_id = (
                SELECT new_song_id
                FROM songlistDB.migration
                WHERE songlistDB.migration.old_song_id = {table}.song_id
            )
            WHERE EXISTS (
                SELECT 1
                FROM songlistDB.migration
                WHERE songlistDB.migration.old_song_id = {table}.song_id
            )
            """
        )

    conn_history.commit()
    cursor_history.execute("DETACH DATABASE songlistDB")
    console.print("[bold green]Migration complete![/bold green]")


def migrate_mb_db():
    conn_mb = get_db_connection_Musicbrainz()
    cursor_mb = conn_mb.cursor()

    console.print(
        "[bold purple]\\[Migration](v0.63.2)::Updating musicbrainz db (hydration_cache) ::"
    )
    cursor_mb.execute(f"ATTACH DATABASE '{DB_PATH_LIB}' AS songlistDB")

    cursor_mb.execute(
        """
        UPDATE hydration_cache
        SET nvid = (
            SELECT new_song_id
            FROM songlistDB.migration
            WHERE songlistDB.migration.old_song_id = hydration_cache.nvid
        )
        WHERE EXISTS (
            SELECT 1
            FROM songlistDB.migration
            WHERE songlistDB.migration.old_song_id = hydration_cache.nvid
        )
        """
    )

    conn_mb.commit()

    cursor_mb.execute("DETACH DATABASE songlistDB")
    console.print("[bold green]MusicBrainz migration complete![/bold green]")


# HELPERS


def get_fuzz_score(t1, t2) -> float:
    return fuzz.ratio(t1, t2)
