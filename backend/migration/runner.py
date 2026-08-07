# Runner for all migrations


# from random import getstate
# from this import s

import re

from core.crypto import decrypt_token
from core.db import get_db_connection_lib, get_db_connection_usr
from migration.v_0_63_2 import (
    create_migration_table,
    migrate_database,
    migrate_new_song_id,
    migrate_old_song_id,
    start_librarySync,
    v_0_63_2_migrate,
)
from packaging.version import Version
from rich.console import Console
from Workers.worker_queue import ND_queue, NDWork

console = Console()


# we can get server version from any user
def getUser(cursor):
    cursor.execute("SELECT username , password from user limit 1")
    return cursor.fetchone()


def get_server_version(cursor) -> str:

    user = getUser(cursor)
    if user:
        console.print("[bold purple]\\[migration](runner):: Fetching Server Version ::")
        password = decrypt_token(user["password"])
        username = user["username"]

        response = ND_queue.addWork(
            NDWork(
                method="get",
                endpoint=f"/rest/ping?u={username}&p={password}&v=1.16.1&c=curl&f=json",
            )
        )
        server_version = (
            response.get("data", "")
            .get("subsonic-response", "")
            .get("serverVersion", "")
        )
        # import re
        # print(server_version)
        # if server_version == "" or server_version == " ":
        #     server_version= '0.0.0'

        sversion = re.sub(r"[^0-9.].*$", "", server_version)
        # sversion = server_version.partition("(")[0].strip()
        console.print(
            f"[bold green]\\[migration](runner):: Server Version :: {sversion}"
        )
        return sversion
    else:
        console.print("[bold red]\\[migration](runner):: No User Found ::")
        return "0.0.0"


def run_migration_v_0_63_2():
    console.print("[bold purple]\\[migration](runner):: Running Migration v0.63.2 ::")
    conn = get_db_connection_usr()
    cursor = conn.cursor()
    # print(get_server_version(cursor))
    sv= get_server_version(cursor)
    if not sv.strip():
        sv = "0.0.0"
    version = Version(sv)
    cursor.close()
    conn.close()
    conn_lib = get_db_connection_lib()
    cursor_lib = conn_lib.cursor()

    if version < Version("0.63.2"):
        console.print("[bold red]\\[migration](runner):: Server Version Too Old ::")
        return
    elif version >= Version("0.63.2"):
        console.print(
            "[bold purple]\\[migration](runner):: Running Migration v0.63.2 ::"
        )
        migrate = v_0_63_2_migrate()  # False if song Id matched meaning no migration, True means navidrome migrated and song needs to be updated
        if migrate is False:
            console.print(
                "[bold green]\\[migration](runner):: Navidrome Has Not Migrated yet ::"
            )
        elif migrate is True:
            console.print(
                "[bold purple]\\[migration](runner):: Navidrome Has Migrated ::"
            )
            console.print("[bold red]\\[migration](runner):: Re-verifying.. ::")
            migrate_final = v_0_63_2_migrate()
            if migrate_final is True:
                console.print(
                    "[bold purple]\\[migration](runner):: Verified ::\n :: Navidrome has migrated ::"
                )
                create_migration_table(cursor=cursor_lib)
                migrate_old_song_id(cursor=cursor_lib)
                console.print(
                    "[bold purple]\\[migration](runner):: Starting Library Sync ::"
                )
                start_librarySync()
                migrate_new_song_id(cursor=cursor_lib)
                migrate_database()
