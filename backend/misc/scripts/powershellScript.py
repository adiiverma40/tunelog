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


def ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def PowerShellScript(song_ids):
    songs = get_multiple_songs_info(song_ids)
    if not songs:
        return 'Write-Output "No songs found to process."'

    base_path = skip_config.get("base_path", "")
    action = skip_config.get("action", "move")

    if base_path:
        trash_path = str(Path(base_path).parent / "tunelogTrash")
    else:
        trash_path = "./tunelogTrash"

    lines = [
        "#!/usr/bin/env pwsh",
        "Write-Output ''",
        "Write-Output '╔══════════════════════╗'",
        "Write-Output '║      TUNELOG         ║'",
        "Write-Output '╚══════════════════════╝'",
        f"Write-Output 'Action: {action.capitalize()} selected songs'",
        "Write-Output ''",
        "Write-Output 'Selected songs:'",
    ]

    for idx, song in enumerate(songs, 1):
        title = song.get("title", "Unknown Title")
        artist = song.get("artist", "Unknown Artist")
        path = song.get("path", "")
        lines.append(f'Write-Output "{idx}. {title} by {artist} - {path}"')

    lines.append("Write-Output ''")
    lines.append("$reply = Read-Host 'Are you sure you want to proceed? (y/N)'")
    lines.append("if ($reply -match '^[Yy]$') {")
    
    if action == "move":
        lines.append(f"    New-Item -ItemType Directory -Force -Path {ps_quote(trash_path)} | Out-Null")
        for song in songs:
            song_path = song.get("path")
            if song_path:
                full_path = str(Path(base_path) / song_path) if base_path else song_path
                lines.append(
                    f"    Move-Item -LiteralPath {ps_quote(full_path)} -Destination {ps_quote(trash_path)} -Force"
                )
        lines.append("    Write-Output 'Songs moved to trash successfully.'")

    elif action == "delete":
        for song in songs:
            song_path = song.get("path")
            if song_path:
                full_path = str(Path(base_path) / song_path) if base_path else song_path
                lines.append(f"    Remove-Item -LiteralPath {ps_quote(full_path)} -Force")
        lines.append("    Write-Output 'Songs deleted successfully.'")

    else:
        lines.append(f"    Write-Output 'Error: Unknown action ({action})'")

    lines.append("} else {")
    lines.append("    Write-Output 'Operation cancelled.'")
    lines.append("}")

    return "\n".join(lines)