# to fetch and create library database from navidrome
# uses SEARCH3 api endpoint to build library database
# works by runing a loop thourgh the api

# TODO : ADD CHECKS FOR IF SONG ALDREADY EXISTS WITH DIFFRENT METADATA
# artist name : arijit singh ,
# artist name : arjeet singh may be recorded diffrently


# ISSUES AND FIXES
# Issue : Genre with slight diffrent name gets diffrent values, bollywood music and bollywood
# fix : used genre aliases to make bollywood and bollywood music same

import requests
from config import build_url
from db import init_db_lib, get_db_connection_lib

GENRE_ALIASES = {
    "bollywood music": "bollywood",
    "hindi": "bollywood",
    "hindi ost": "bollywood",
    "indian": "bollywood",
    "bandes originales de films": "soundtrack",
    "filme": "soundtrack",
    "films": "soundtrack",
    "ost": "soundtrack",
    "hip hop": "rap",
    "поп": "pop",
    "hits": "pop",
    "compilation": "pop",
    "musiques du monde": "world",
    "r&b": "rnb",
    "quran recitation": "quran",
    "bengali movie music": "bengali",
    "фильмы": "soundtrack",
    "indian music":"bollywood",
    "asian music" : "default"
}


def normalise_genre(raw):
    if not raw:
        return "default"
    parts = raw.split("/")
    result = []
    for g in parts:
        print(g)

        g = g.strip().lower()
        
        print(g)
        g = GENRE_ALIASES.get(g, g)  # if not in aliases, keep as-is
        
        print(g)
        if g not in result:
            result.append(g)
    return ",".join(result)


def url(batch, offset):
    url = build_url("search3")
    song_url = url + f"&query=&songCount={batch}&songOffset={offset}"
    print(song_url)
    return song_url


def fetch_all_song():
    all_song = []
    offset = 0
    batch = 100

    while True:
        response = requests.get(url(batch, offset))
        data = response.json()

        songs = data["subsonic-response"].get("searchResult3", {}).get("song", [])

        if not songs:
            break

        all_song.extend(songs)
        offset += batch
        print(f"[SYNC] fetched {len(all_song)} songs so far...")

    return all_song


def sync_library():
    songs = fetch_all_song()

    conn = get_db_connection_lib()
    cursor = conn.cursor()

    for song in songs:
        cursor.execute(
            """
            INSERT INTO library (song_id, title, artist, album, genre, duration)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(song_id) DO UPDATE SET
                title       = excluded.title,
                artist      = excluded.artist,
                album       = excluded.album,
                genre       = excluded.genre,
                duration    = excluded.duration,
                last_synced = CURRENT_TIMESTAMP
        """,
            (
                song["id"],
                song.get("title", ""),
                song.get("artist", ""),
                song.get("album", ""),
                normalise_genre(song.get("genre")),
                song.get("duration", 0),
            ),
        )

    conn.commit()
    conn.close()

    print(f"[SYNC] done — {len(songs)} songs synced to library")


if __name__ == "__main__":
    init_db_lib()
    sync_library()
