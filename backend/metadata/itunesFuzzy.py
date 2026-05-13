from rapidfuzz import fuzz, process
from collections import defaultdict
from time import sleep
import requests
import re
import time
import urllib.parse
import json

from core.db import get_db_connection_lib
from navidrome.state import app_state
from rich.console import Console
from navidrome.state import tune_config

console = Console(log_time=False, log_path=False)

_api_conf = tune_config.get("api_and_performance", {})
_sync_conf = _api_conf.get("sync_confidence", {})

MAX_RETRIES: int = _api_conf.get("api_max_retries", 3)
RETRY_DELAY: int = _api_conf.get("api_retry_delay_sec", 2)
MIN_MATCH_SCORE: float = _sync_conf.get("min_match_score", 70.0)
OVERWRITE_SCORE: float = _sync_conf.get("metadata_overwrite_score", 85.0)

ITUNES_SEARCH_LIMIT = 200


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


def getSongs(tag: str = "notInItunes"):
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
            SET explicit    = ?,
                genre       = ?,
                artist      = ?,
                last_synced = CURRENT_TIMESTAMP
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


def _itunes_request(url: str) -> list | None:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            sleep(1)
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            results = resp.json().get("results", [])
            return results if results else None
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else "?"
            if status in (400, 403, 404):
                return None
        except Exception:
            pass
        if attempt < MAX_RETRIES:
            sleep(RETRY_DELAY * attempt)
    return None


def generalItunesSearch(
    title: str,
    artist: str = "",
    limit: int = ITUNES_SEARCH_LIMIT,
    entity: str = "song",
    search_type: str = "search",
    term_param: str = "term",
    trim_text: bool = True,
) -> list | None:
    if trim_text:
        title = re.sub(r"\(.*?\)", "", str(title)).strip()
        term = f"{title} {artist}".strip().replace(" ", "+")
    else:
        term = str(title)

    url = (
        f"https://itunes.apple.com/{search_type}"
        f"?{term_param}={term}&entity={entity}&limit={limit}"
    )
    return _itunes_request(url)


def musicbrainz_search(
    query: str,
    entity: str = "recording",
    limit: int = 10,
    max_retries: int = MAX_RETRIES,
) -> dict | None:
    base_url = f"https://musicbrainz.org/ws/2/{entity}"
    headers = {"User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog/)"}
    encoded_query = urllib.parse.quote(query)
    url = f"{base_url}?query={encoded_query}&fmt=json&limit={limit}"

    for attempt in range(1, max_retries + 1):
        try:
            time.sleep(1)
            resp = requests.get(url, headers=headers, timeout=10)
            if 400 <= resp.status_code < 500:
                return None
            resp.raise_for_status()
            return resp.json()
        except Exception:
            pass
        if attempt < max_retries:
            time.sleep(2**attempt)
    return None


def mb_to_itunes_format(mb_response: dict) -> list | None:
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


def _build_itunes_dataset(results: list) -> dict:

    dataset = {
        "raw": results,
        "exact": {},
        "title_dict": defaultdict(list),
        "artist_dict": defaultdict(list),
        "album_dict": defaultdict(list),
        "title_pool": {},
    }

    for i, res in enumerate(results):
        t = clean_text(res.get("trackName", ""))
        a = clean_text(res.get("artistName", ""))
        al = clean_text(res.get("collectionName", ""))

        if not t:
            continue

        key = f"{a} - {t}"
        if key not in dataset["exact"]:
            dataset["exact"][key] = res

        dataset["title_dict"][t].append(res)
        if a:
            dataset["artist_dict"][a].append(res)
        if al:
            dataset["album_dict"][al].append(res)

        dataset["title_pool"][i] = t

    return dataset


def _score_pair(
    input_title: str,
    input_artist: str,
    res_title: str,
    res_artist: str,
) -> float:
    t_score = fuzz.token_set_ratio(input_title, res_title)
    a_score = fuzz.token_set_ratio(input_artist, res_artist)

    if input_artist and a_score < 50:
        return 0.0
    if len(input_title) <= 4 and a_score < 70:
        return 0.0
    if t_score < 40:
        return 0.0

    return round((t_score * 0.6) + (a_score * 0.4), 2)


def _score_pair_album(
    input_title: str,
    input_artist: str,
    input_album: str,
    res_title: str,
    res_artist: str,
    res_album: str,
) -> float:
    base = _score_pair(input_title, input_artist, res_title, res_artist)
    if base == 0:
        return 0.0
    if input_album and res_album:
        al_score = fuzz.token_set_ratio(input_album, res_album)
        return round(base * 0.85 + al_score * 0.15, 2)
    return base


def _best_from_pool(
    candidates: list,
    input_title: str,
    input_artist: str,
    input_album: str = "",
    use_album: bool = False,
) -> tuple:
    best_score = 0.0
    best_result = None

    for res in candidates:
        rt = clean_text(res.get("trackName", ""))
        ra = clean_text(res.get("artistName", ""))
        ral = clean_text(res.get("collectionName", ""))

        if not rt or not ra:
            continue

        sc = (
            _score_pair_album(input_title, input_artist, input_album, rt, ra, ral)
            if use_album
            else _score_pair(input_title, input_artist, rt, ra)
        )

        if sc > best_score:
            best_score = sc
            best_result = res

    if best_score >= MIN_MATCH_SCORE:
        return best_result, best_score
    return None, best_score


def _stage_0_exact(dataset: dict, input_title: str, input_artist: str):
    key = f"{input_artist} - {input_title}"
    result = dataset["exact"].get(key)
    if result:
        console.print(f"[bold green]  ↳ Stage 0 exact hit[/bold green]")
        return result, 100.0
    return None, 0.0


def _stage_1_title_index(dataset: dict, input_title: str, input_artist: str):
    candidates = dataset["title_dict"].get(input_title, [])
    if candidates:
        match, sc = _best_from_pool(candidates, input_title, input_artist)
        if match:
            console.print(
                f"[bold blue]  ↳ Stage 1 title-index hit (score {sc})[/bold blue]"
            )
            return match, sc

    title_pool = dataset["title_pool"]
    if title_pool:
        top = process.extractOne(input_title, title_pool, scorer=fuzz.token_set_ratio)
        if top and top[1] >= 75.0:
            idx = top[2]
            candidate = dataset["raw"][idx]
            ra = clean_text(candidate.get("artistName", ""))
            a_sc = fuzz.token_set_ratio(input_artist, ra) if input_artist else 60
            if a_sc >= 50:
                sc = round(top[1] * 0.6 + a_sc * 0.4, 2)
                if sc >= MIN_MATCH_SCORE:
                    console.print(
                        f"[bold blue]  ↳ Stage 1 fuzzy-title hit (score {sc})[/bold blue]"
                    )
                    return candidate, sc

    return None, 0.0


def _stage_2_artist_index(dataset: dict, input_title: str, input_artist: str):
    known_artists = list(dataset["artist_dict"].keys())
    if not known_artists:
        return None, 0.0

    artist_matches = process.extract(
        input_artist, known_artists, scorer=fuzz.token_set_ratio, limit=10
    )
    title_pool = {}
    full_pool = []

    for match in artist_matches:
        if match[1] >= 75.0:
            for res in dataset["artist_dict"][match[0]]:
                title_pool[id(res)] = clean_text(res.get("trackName", ""))
                full_pool.append(res)

    if title_pool:
        top = process.extractOne(input_title, title_pool, scorer=fuzz.token_set_ratio)
        if top and top[1] >= 75.0:
            matched_res = next((r for r in full_pool if id(r) == top[2]), None)
            if matched_res:
                ra = clean_text(matched_res.get("artistName", ""))
                a_sc = fuzz.token_set_ratio(input_artist, ra)
                sc = round(top[1] * 0.6 + a_sc * 0.4, 2)
                if sc >= MIN_MATCH_SCORE:
                    console.print(
                        f"[bold magenta]  ↳ Stage 2 artist-index hit (score {sc})[/bold magenta]"
                    )
                    return matched_res, sc

    return None, 0.0


def _stage_3_album_tracklist(song: dict):
    album = clean_text(song.get("album", ""))
    if not album or album == "unknown album":
        return None, 0.0

    response = generalItunesSearch(album, "", ITUNES_SEARCH_LIMIT, "album")
    if not response:
        return None, 0.0

    input_title = clean_text(song.get("title", ""))
    input_artist = clean_text(song.get("artist", ""))
    input_album = album

    best_match, best_score = None, 0.0

    for res in response:
        album_id = res.get("collectionId")
        track_count = res.get("trackCount", 50)
        tracklist = generalItunesSearch(
            title=album_id,
            limit=track_count,
            search_type="lookup",
            term_param="id",
            trim_text=False,
        )
        if not tracklist:
            continue

        dataset = _build_itunes_dataset(tracklist)
        match, sc = _best_from_pool(
            dataset["raw"], input_title, input_artist, input_album, use_album=True
        )
        if match and sc > best_score:
            best_score = sc
            best_match = match

    if best_match and best_score >= MIN_MATCH_SCORE:
        console.print(
            f"[bold cyan]  ↳ Stage 3 album-tracklist hit (score {best_score})[/bold cyan]"
        )
        return best_match, best_score

    return None, best_score


def _stage_4_musicbrainz(song: dict):
    title = clean_text(song.get("title", ""))
    artist = clean_text(song.get("artist", ""))
    album = clean_text(song.get("album", ""))

    if title and artist != "unknown artist" and album != "unknown album":
        res = musicbrainz_search(
            f'recording:"{title}" AND artist:"{artist}" AND release:"{album}"'
        )
        use_album = True
    elif album == "unknown album" and artist != "unknown artist":
        res = musicbrainz_search(f'recording:"{title}" AND artist:"{artist}"')
        use_album = False
    elif album == "unknown album" and artist == "unknown artist":
        res = musicbrainz_search(f'recording:"{title}"')
        use_album = False
    else:
        res = musicbrainz_search(f'release:"{album}" AND artist:"{artist}"')
        use_album = True

    converted = mb_to_itunes_format(res)
    if not converted:
        return None, 0.0

    for mb_res in converted:
        enriched_song = {
            "title": mb_res.get("trackName") or song.get("title"),
            "artist": mb_res.get("artistName") or song.get("artist"),
            "album": mb_res.get("collectionName") or song.get("album"),
        }
        match, sc = _stage_3_album_tracklist(enriched_song)
        if match:
            console.print(
                f"[bold yellow]  ↳ Stage 4 MB-enriched hit (score {sc})[/bold yellow]"
            )
            return match, sc

    return None, 0.0


def _run_primary_search(song: dict) -> dict | None:
    title = clean_text(song.get("title", ""))
    artist = clean_text(song.get("artist", ""))

    raw = generalItunesSearch(title, artist, ITUNES_SEARCH_LIMIT)
    if not raw:
        return None

    return _build_itunes_dataset(raw)


def useFallBackMethods(
    song: dict, tries: int, data: dict = None, returnData: bool = False
):
    if app_state.fallback_stop:
        console.print("[bold red]Sync Stopping Command Received (in Fuzzy)[/bold red]")
        return

    if data is not None:
        song = {**song, **data}

    song_id = song.get("song_id", "")
    input_title = clean_text(song.get("title", ""))
    input_artist = clean_text(song.get("artist", ""))

    console.print(
        f"[bold cyan]Processing:[/bold cyan] "
        f"{song.get('title', '?')} | {song.get('artist', '?')}"
    )

    match, sc = None, 0.0
    dataset = _run_primary_search(song)

    if dataset:
        match, sc = _stage_0_exact(dataset, input_title, input_artist)

        if not match:
            match, sc = _stage_1_title_index(dataset, input_title, input_artist)

        if not match:
            match, sc = _stage_2_artist_index(dataset, input_title, input_artist)

    if not match:
        match, sc = _stage_3_album_tracklist(song)

    if not match:
        match, sc = _stage_4_musicbrainz(song)

    if match:
        explicit = match.get("trackExplicitness") or "notInItunes"
        itunes_artist = match.get("artistName")
        itunes_genre = match.get("primaryGenreName")

        if returnData:
            console.log(
                f"[green]Matched (returnData)[/green] (Score: {sc}) -> explicit: {explicit}"
            )
            return {
                "title": match.get("trackName") or song.get("title"),
                "artist": itunes_artist or song.get("artist"),
                "album": match.get("collectionName") or song.get("album"),
                "genre": itunes_genre or song.get("genre"),
                "explicit": explicit,
                "score": sc,
            }

        if sc >= OVERWRITE_SCORE:
            updateSong(
                song_id=song_id,
                explicit=explicit,
                genre=itunes_genre or song.get("genre"),
                artist=itunes_artist or song.get("artist"),
            )
        else:
            updateSong(song_id=song_id, explicit=explicit)

        console.log(f"[green]Matched[/green] (Score: {sc}) -> explicit: {explicit}")
        return f"Song matched with a score of : {sc}"

    else:
        if returnData:
            console.log("[yellow]Skipped[/yellow] No match found. Returning None.")
            return None

        updateSong(song_id=song_id, explicit="manual")
        console.log("[yellow]Skipped[/yellow] No match found. Flagged as manual.")
        return "false"
