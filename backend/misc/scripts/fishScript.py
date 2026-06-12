import shlex
from pathlib import Path

from core.db import get_db_connection_lib
from navidrome.state import skip_config


def get_multiple_songs_info(song_ids: list[str]):
    if not song_ids:
        return []

    conn = get_db_connection_lib()
    cursor = conn.cursor()

    placeholders = ", ".join(["?"] * len(song_ids))

    query = f"""
        SELECT path, artist, title FROM library
        WHERE song_id IN ({placeholders})
    """

    cursor.execute(query, song_ids)
    rows = cursor.fetchall()

    columns = [column[0] for column in cursor.description]
    result = [dict(zip(columns, row)) for row in rows]

    conn.close()
    return result


def FishScript(song_ids):
    songs = get_multiple_songs_info(song_ids)
    if not songs:
        return "echo 'No songs found to process.'"

    base_path = skip_config.get("base_path", "")
    action = skip_config.get("action", "move")

    if base_path:
        trash_path = str(Path(base_path).parent / "tunelogTrash")
    else:
        trash_path = "./tunelogTrash"

    lines = [
        "#!/usr/bin/env fish",
        "echo ''",
        "echo -e '\\e[1;35m╔══════════════════════╗\\e[0m'",
        "echo -e '\\e[1;35m║      TUNELOG         ║\\e[0m'",
        "echo -e '\\e[1;35m╚══════════════════════╝\\e[0m'",
        f"echo -e '\\e[1;36mAction: {action.capitalize()} selected songs\\e[0m'",
        "echo ''",
        "echo -e '\\e[1mSelected songs:\\e[0m'",
    ]

    for idx, song in enumerate(songs, 1):
        title = song.get("title", "Unknown Title")
        artist = song.get("artist", "Unknown Artist")
        path = song.get("path", "")
        lines.append(f'echo "{idx}. {title} by {artist} - {path}"')

    lines.append("echo ''")
    lines.append("read -n 1 -P 'Are you sure you want to proceed? (y/N) ' REPLY")
    lines.append("echo ''")
    lines.append("if string match -rq '^[Yy]$' -- $REPLY")

    if action == "move":
        lines.append(f"    mkdir -p {shlex.quote(trash_path)}")
        for song in songs:
            song_path = song.get("path")
            if song_path:
                full_path = str(Path(base_path) / song_path) if base_path else song_path
                lines.append(f"    mv {shlex.quote(full_path)} {shlex.quote(trash_path)}/")
        lines.append("    echo 'Songs moved to trash successfully.'")

    elif action == "delete":
        for song in songs:
            song_path = song.get("path")
            if song_path:
                full_path = str(Path(base_path) / song_path) if base_path else song_path
                lines.append(f"    rm {shlex.quote(full_path)}")
        lines.append("    echo 'Songs deleted successfully.'")

    else:
        lines.append(f"    echo 'Error: Unknown action ({action})'")

    lines.append("else")
    lines.append("    echo 'Operation cancelled.'")
    lines.append("end")

    return "\n".join(lines)
