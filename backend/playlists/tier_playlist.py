from collections import defaultdict

from core.db import get_db_connection
from playlists.base_playlist import push_playlist
from rich.console import Console
from rich.table import Table

console = Console()


def get_songs(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute(
        """SELECT song_id, title, score
        FROM (
            SELECT
                song_id,
                title,
                score,
                timestamp,
                ROW_NUMBER() OVER (
                    PARTITION BY song_id
                    ORDER BY timestamp DESC
                ) AS rn
            FROM listens
            WHERE user_id = ?
        )
        WHERE rn = 1
          AND score >= 0
        ORDER BY score DESC;""",
        (user_id,),
    ).fetchall()
    print(rows)
    print(user_id)
    conn.close()
    return rows


def build_tier_playlist(size, rows):
    console.print(
        f"[bold green]Building tier playlist with {len(rows)} songs[/bold green]"
    )
    playlist = defaultdict(list)
    tier = 1

    for i, (song_id, title, score) in enumerate(rows):
        playlist[tier].append(
            {
                "song_id": song_id,
                "title": title,
                "score": score,
            }
        )
        if len(playlist[tier]) == size:
            tier += 1

    return dict(playlist)


def tierPlaylist(size, user):
    console.print(f"[bold green]Building tier playlist for {user}[/bold green]")

    rows = get_songs(user)
    print(rows)
    playlist = build_tier_playlist(size, rows)

    console.print(f"\n[bold cyan]User:[/bold cyan] {user}")
    console.print(f"[bold cyan]Total Tiers:[/bold cyan] {len(playlist)}\n")

    for tier, songs in playlist.items():
        song_ids = [song["song_id"] for song in songs]
        song_signals = {song["song_id"]: f"tier_{tier}" for song in songs}

        playname = f"Tunelog - Tier {tier}"
        playlist_type = f"tier_{tier}"

        table = Table(
            title=f"Tier {tier} Playlist",
            show_header=True,
            header_style="bold magenta",
            title_style="bold blue",
        )
        table.add_column("Sr", justify="right", style="dim", width=4)
        table.add_column("Title", min_width=30)
        table.add_column("Score", justify="right", style="green")

        for idx, song in enumerate(songs, start=1):
            title = song["title"] if song["title"] else "Unknown"
            score_str = (
                f"{song['score']:.2f}"
                if isinstance(song["score"], (int, float))
                else str(song["score"])
            )

            table.add_row(str(idx), title, score_str)

        console.print(table)
        console.print(
            f"[dim]Pushing Tier {tier} with {len(songs)} songs to server...[/dim]\n"
        )

        push_playlist(
            song_ids=song_ids,
            user_id=user,
            song_signals=song_signals,
            playname=playname,
            newPlaylist=False,
            playlist_type=playlist_type,
        )
