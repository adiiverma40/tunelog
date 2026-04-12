# ALGO :
# use fuzzy matching and multiple tries to get not in itunes song,
# the possible reason for not in itunes are either song is not in database or the song title is false
# in case title or metadata is false use this  loop
# it ties multiples itunes , ig. fallback1, 2 , 3 and one musicbrainz_search , if fallback 1, 2 , 3 works no need for musicbrainz_search
# after musicbrainz search use the metadata to get song, using album info from fallback 3
# and loop in every response for the best match using fuzzyScoreMatch


# for songs that has too much messy names like mix of punjabi hindi and english or other lang. + random stuff like yt channal name and
#  stuff that using this method is not able to get in that case i will let user mannaully choose , its better that way


from rapidfuzz import fuzz
from time import sleep

# from random import shuffle
import requests
import re
import time
import urllib.parse

# import library

from db import get_db_connection_lib
from state import app_state
from rich.console import Console
from state import tune_config

console = Console(log_time=False, log_path=False)
totalTries = 0


def score(input_title, input_artist, album="", restitle="", resartist="", resalbum=""):
    t_score = fuzz.token_set_ratio(input_title, restitle)
    a_score = fuzz.token_set_ratio(input_artist, resartist)

    if input_artist and a_score < 50:
        return 0
    if len(input_title) <= 4:
        if a_score < 70:
            return 0
    if t_score < 40:
        return 0

    return round((t_score * 0.6) + (a_score * 0.4), 2)


def getSongs(tag="notInItunes"):
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    songs = cursor.execute(
        "SELECT * FROM library WHERE explicit = ?", (tag,)
    ).fetchall()
    conn.close()
    return [dict(song) for song in songs]


def updateSong(song_id: str, explicit: str, genre: str = None, artist: str = None):
    conn = get_db_connection_lib()
    cursor = conn.cursor()

    if genre and artist:
        cursor.execute(
            """
            UPDATE library
            SET explicit     = ?,
                genre        = ?,
                artist       = ?,
                last_synced  = CURRENT_TIMESTAMP
            WHERE song_id = ?
            """,
            (explicit, genre, artist, song_id),
        )
    else:
        cursor.execute(
            """
            UPDATE library
            SET explicit    = ?,
                last_synced = CURRENT_TIMESTAMP
            WHERE song_id = ?
            """,
            (explicit, song_id),
        )

    conn.commit()
    conn.close()


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"https?://\S+|www\.\S+|\S+\.(com|net|org|in|co)\S*", " ", text)
    junk_patterns = [
        r"\b(official|video|audio|lyrics|hd|hq|4k|8k)\b",
        r"\b(full\s?song|music\s?video)\b",
        r"\b\d{2,4}\s?(kbps|kb)\b",
        r"\b(download|free|mp3)\b",
        r"\b(from)\b",
        r"\b(pagalnew|pagalworld|djpunjab|mrjatt|downloadming|songslover|djmaza)\b",
        r"\b(remix|dj|mix)\b",
    ]
    for pattern in junk_patterns:
        text = re.sub(pattern, " ", text)

    def clean_brackets(match):
        content = match.group(1)
        if re.search(r"feat|ft|prod|remix|mix|edit|version", content):
            return " "
        return content

    text = re.sub(r"\((.*?)\)", clean_brackets, text)
    text = re.sub(r"\[(.*?)\]", clean_brackets, text)
    text = re.sub(r"\b(feat|ft)\.?[^-–|]*", " ", text)
    text = re.sub(r"[-–|•,]+", " ", text)
    text = re.sub(r"&", " ", text)
    text = re.sub(r"[\"" "''']", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def generalItunesSearch(
  title,
    artist="",
    limit=5,
    entity="song",
    type="search",
    termApi="term",
    trimText=True,
    maxRetries=tune_config["api_and_performance"]["api_max_retries"],
    retryDelay=tune_config["api_and_performance"]["api_retry_delay_sec"],
):
    if trimText:
        title = re.sub(r"\(.*?\)", "", str(title)).strip()
        term = f"{title} {artist}".replace(" ", "+")
        url = f"https://itunes.apple.com/{type}?{termApi}={term}&entity={entity}&limit={limit}"
    else:
        term = str(title)
        url = f"https://itunes.apple.com/{type}?{termApi}={term}&entity={entity}&limit={limit}"

    for attempt in range(1, maxRetries + 1):
        try:
            sleep(1)
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            results = response.json().get("results", [])
            return results if results else None

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else "?"
            if status in (400, 403, 404):
                return None
        except Exception:
            pass

        if attempt < maxRetries:
            sleep(retryDelay * attempt)

    return None


def mb_to_itunes_format(mb_response):
    if not mb_response or "recordings" not in mb_response:
        return None
    results = []
    for r in mb_response["recordings"]:
        title = r.get("title")
        artist_list = r.get("artist-credit", [])
        artist = artist_list[0].get("name", "") if artist_list else ""
        releases = r.get("releases", [])
        album = releases[0].get("title", "") if releases else ""
        results.append(
            {
                "trackName": title,
                "artistName": artist,
                "collectionName": album,
                "trackExplicitness": None,
                "kind": "song",
            }
        )
    return results


def musicbrainz_search(
    query: str, entity: str = "recording", limit: int = 10, max_retries: int = tune_config["api_and_performance"]["api_max_retries"]
):
    base_url = f"https://musicbrainz.org/ws/2/{entity}"
    headers = {"User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog/)"}
    encoded_query = urllib.parse.quote(query)
    url = f"{base_url}?query={encoded_query}&fmt=json&limit={limit}"

    for attempt in range(1, max_retries + 1):
        try:
            time.sleep(1)
            response = requests.get(url, headers=headers, timeout=10)

            if 400 <= response.status_code < 500:
                return None

            response.raise_for_status()
            return response.json()
        except Exception:
            pass

        if attempt < max_retries:
            wait = 2**attempt
            time.sleep(wait)

    return None


def fuzzyScoreMatch(response, song, isAlbum=False, tryLimit: int = 500):
    global totalTries

    if not response:
        return None, 0

    inputTitle = clean_text(song.get("title", ""))
    inputArtist = clean_text(song.get("artist", ""))
    inputAlbum = clean_text(song.get("album", ""))

    results = []

    for res in response:
        if totalTries >= tryLimit:
            return None, 0

        messytitle = res.get("trackName")
        messyartist = res.get("artistName")
        messyalbum = res.get("collectionName")

        if not messytitle or not messyartist:
            continue

        title = clean_text(messytitle)
        artist = clean_text(messyartist)
        album = clean_text(messyalbum) if messyalbum else ""

        fuzzyScore = (
            score(inputTitle, inputArtist, inputAlbum, title, artist, album)
            if isAlbum
            else score(
                input_title=inputTitle,
                input_artist=inputArtist,
                restitle=title,
                resartist=artist,
            )
        )
        totalTries += 1

        results.append((fuzzyScore, res))

    if not results:
        return None, 0

    results.sort(key=lambda x: x[0], reverse=True)
    bestScore, bestMatch = results[0]

    min_score = tune_config["api_and_performance"]["sync_confidence"]["min_match_score"]
    return (bestMatch, bestScore) if bestScore >= min_score else (None, bestScore)

def fallback1(song):
    title = clean_text(song["title"])
    return generalItunesSearch(title, "", 200)


def fallback2(song):
    artist = clean_text(song["artist"])
    return generalItunesSearch(artist, "", 200)


def fallback3(song, tries=500):
    album = clean_text(song.get("album", ""))
    if not album or album == "unknown album":
        return None

    response = generalItunesSearch(album, "", 200, "album")
    if not response:
        return None

    for res in response:
        album_id = res.get("collectionId")
        track_count = res.get("trackCount", 20)
        lookup = generalItunesSearch(
            type="lookup",
            termApi="id",
            title=album_id,
            limit=track_count,
            trimText=False,
        )
        if lookup:
            match, sc = fuzzyScoreMatch(lookup, song, True, tryLimit=500)
            if match:
                return match, sc
    return None, 0


def fallback4(song, trie=500):
    title = clean_text(song.get("title", ""))
    artist = clean_text(song.get("artist", ""))
    album = clean_text(song.get("album", ""))

    if title and artist != "unknown artist" and album != "unknown album":
        res = musicbrainz_search(
            f'recording:"{title}" AND artist:"{artist}" AND release:"{album}"'
        )
        is_album = True
    elif album == "unknown album" and artist != "unknown artist":
        res = musicbrainz_search(f'recording:"{title}" AND artist:"{artist}"')
        is_album = False
    elif album == "unknown album" and artist == "unknown artist":
        res = musicbrainz_search(f'recording:"{title}"')
        is_album = False
    else:
        res = musicbrainz_search(f'release:"{album}" AND artist:"{artist}"')
        is_album = True

    r = mb_to_itunes_format(res)
    return fuzzyScoreMatch(r, song, is_album, tryLimit=trie)


def itunes_to_song_format(res):
    if not res:
        return None
    return {
        "title": res.get("trackName"),
        "artist": res.get("artistName"),
        "album": res.get("collectionName", "Unknown Album"),
    }


def useFallBackMethods(song, tries):
    global totalTries
    totalTries = 0
    if app_state.fallback_stop:
        console.log("[bold red]Sync Stopping Command Received (in Fuzzy)[/bold red]")
        return

    song_id = song["song_id"]
    console.print(
        f"[bold cyan]Processing:[/bold cyan] {song['title']} | {song['artist']}"
    )

    artist = clean_text(song["artist"])
    title = clean_text(song["title"])

    match, sc = None, 0

    raw = generalItunesSearch(title, artist, 100)
    if raw:
        match, sc = fuzzyScoreMatch(raw, song, tryLimit=tries)

    if not match and totalTries < tries:
        raw = fallback1(song)
        if raw:
            match, sc = fuzzyScoreMatch(raw, song, tryLimit=tries)

    if not match and totalTries < tries:
        raw = fallback2(song)
        if raw:
            match, sc = fuzzyScoreMatch(raw, song, tryLimit=tries)

    if not match and totalTries < tries:
        result = fallback3(song, tries)
        if result and isinstance(result, tuple):
            match, sc = result

    if not match and totalTries < tries:
        mb_match, mb_sc = fallback4(song, trie=tries)
        if mb_match:
            itunes_song = itunes_to_song_format(mb_match)
            if itunes_song:
                result = fallback3(itunes_song, tries)
                if result and isinstance(result, tuple):
                    match, sc = result

    if match:
        explicit = match.get("trackExplicitness", "notInItunes") or "notInItunes"
        itunes_artist = match.get("artistName")
        itunes_genre = match.get("primaryGenreName")
        
        overwrite_score = tune_config["api_and_performance"]["sync_confidence"]["metadata_overwrite_score"]
        
        if sc >= overwrite_score:
            
            updateSong(
                song_id=song_id,
                explicit=explicit,
                genre=itunes_genre or song.get("genre"),
                artist=itunes_artist or song.get("artist"),
            )
            console.log(f"[green]Matched[/green] (Score: {sc}) -> explicit: {explicit}")
            return f"Song matched with a score of : {sc}"
        else:
            updateSong(song_id=song_id, explicit=explicit)
            console.log(f"[green]Matched[/green] (Score: {sc}) -> explicit: {explicit}")
            return f"Song matched with a score of : {sc}"
    else:
        updateSong(song_id=song_id, explicit="manual")
        console.log("[yellow]Skipped[/yellow] No match found. Flagged as manual.")
        return "false"
