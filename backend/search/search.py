
# search engine for the navidrome proxy 

from db import get_db_connection_lib, get_db_connection
import httpx
import asyncio
import os
from dotenv import load_dotenv
import re

load_dotenv()

NAVIDROME_URL = os.getenv("BASE_URL", "http://localhost:4533")

# you might be thinking why i am doing global instead of per user? where user_id = adii ? its not like i forgot, its not a bug its a feature
# if there is multiple user then it would improve search results, ("i just dont want to deal with managing user")

def fetchAllFromListens():
    conn = get_db_connection()
    cursor = conn.cursor()
    songs = cursor.execute(
        "SELECT song_id, count(*) as listen FROM listens GROUP BY song_id ORDER BY listen DESC"
    ).fetchall()
    song_counts = {row[0]: row[1] for row in songs}
    conn.close()
    return song_counts

async def fetchAll(request, song_ids, is_subsonic=False, type="global"):
    async with httpx.AsyncClient() as client:
        tasks = []
        for sid in song_ids:
            if is_subsonic:
                url = f"{NAVIDROME_URL}/rest/getSong"
                req_params = dict(request.state.mergedParams)
                req_params["id"] = sid
                tasks.append(client.get(url, params=req_params))
            else:
                url = f"{NAVIDROME_URL}/api/song/{sid}"
                tasks.append(client.get(url, headers=dict(request.headers)))

        responses = await asyncio.gather(*tasks)
        results = []
        for res in responses:
            if res.status_code == 200:
                data = res.json()
                if is_subsonic:
                    target = data.get("subsonic-response", {}).get("song")
                else:
                    target = data

                if target:
                    if type == "global":
                        target["comment"] = "BY TUNELOG PROXY - GLOBAL SEARCH RESULTS"
                    elif type == "song":
                        target["comment"] = "BY TUNELOG PROXY - Song TITLE and LYRICS RESULTS"
                    else:
                        target["comment"] = f"BY TUNELOG PROXY - {type} RESULTS"
                    results.append(target)

        return results

async def fetch_single_artist(client, request, artist_id):
    
    url = f"{NAVIDROME_URL}/api/artist/{artist_id}"
    try:
        resp = await client.get(url, headers=dict(request.headers))
        if resp.status_code == 200:
            data = resp.json()
            data["comment"] = "BY TUNELOG PROXY - ARTIST SEARCH RESULTS"
            return data
    except Exception:
        pass
    return None


async def fetchAllArtists(request, artist_ids):
    async with httpx.AsyncClient() as client:
        tasks = [fetch_single_artist(client, request, aid) for aid in artist_ids]
        responses = await asyncio.gather(*tasks)
        return [r for r in responses if r is not None]

async def fetch_single_album(client, request, album_id):
    url = f"{NAVIDROME_URL}/api/album/{album_id}"
    try:
        resp = await client.get(url, headers=dict(request.headers))
        if resp.status_code == 200:
            data = resp.json()
            data["comment"] = "BY TUNELOG PROXY - ALBUM SEARCH RESULTS"
            return data
    except Exception:
        pass
    return None


async def fetchAllAlbums(request, album_ids):
    async with httpx.AsyncClient() as client:
        tasks = [fetch_single_album(client, request, aid) for aid in album_ids]
        responses = await asyncio.gather(*tasks)
        return [r for r in responses if r is not None]


def fts_song_search(cursor, safe_query):
    return cursor.execute(
        "SELECT song_id, rank FROM song_search_index WHERE song_search_index MATCH ?",
        (safe_query,)
    ).fetchall()


def fts_song_title_lyrics(cursor, safe_query):
    return cursor.execute(
        "SELECT song_id, rank FROM song_search_index WHERE song_search_index MATCH ?",
        (f'{{lyrics title}} : {safe_query}',)
    ).fetchall()


def fts_artist_search(cursor, safe_query):
  
    return cursor.execute(
        """SELECT song_id, artistId, rank 
           FROM song_search_index 
           WHERE song_search_index MATCH ?""",
        (f'artist : {safe_query}',)
    ).fetchall()


def fts_album_search(cursor, safe_query):
    return cursor.execute(
        """SELECT song_id, albumId, rank 
           FROM song_search_index 
           WHERE song_search_index MATCH ?""",
        (f'album : {safe_query}',)
    ).fetchall()

LISTEN_WEIGHT = 5.0


def _rank_songs(fts_results, history):
    processed = []
    for song_id, rank in fts_results:
        listens = history.get(song_id, 0)
        blended_score = rank - (listens * LISTEN_WEIGHT)
        processed.append({"id": song_id, "rank": rank, "score": blended_score})
    processed.sort(key=lambda x: x["score"])
    return processed


def _rank_entities(fts_results, history, id_key_index):
    
    entity_scores: dict[str, dict] = {}

    for row in fts_results:
        song_id   = row[0]
        entity_id = row[id_key_index]
        rank      = row[2]

        if not entity_id:
            continue

        listens = history.get(song_id, 0)
        blended = rank - (listens * LISTEN_WEIGHT)

        if entity_id not in entity_scores:
            entity_scores[entity_id] = {"id": entity_id, "score": blended, "hits": 1}
        else:
            entity_scores[entity_id]["score"] = min(entity_scores[entity_id]["score"], blended)
            entity_scores[entity_id]["hits"] += 1

    ranked = list(entity_scores.values())
    ranked.sort(key=lambda x: (x["score"], -x["hits"]))
    return ranked

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text) 
    text = re.sub(r"([a-z])\1{1,}", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
   
    return text




async def searchTable(request, query, end=15, start=0, type: str = "global"):
    history = fetchAllFromListens()

    conn = get_db_connection_lib()
    cursor = conn.cursor()

    cleaned_query = normalize_text(query)
    if not cleaned_query:
        return []
    safe_query = f"{cleaned_query}*"
    print ("query = ", safe_query)

    try:
        if type == "global":
            raw = fts_song_search(cursor, safe_query)
            ranked = _rank_songs(raw, history)
            paginated_ids = [s["id"] for s in ranked[start:end]]
            if not paginated_ids:
                return []
            return await fetchAll(request, paginated_ids, is_subsonic=True, type=type)

        elif type == "song":
            raw = fts_song_title_lyrics(cursor, safe_query)
            ranked = _rank_songs(raw, history)
            paginated_ids = [s["id"] for s in ranked[start:end]]
            if not paginated_ids:
                return []
            return await fetchAll(request, paginated_ids, is_subsonic=False, type=type)

        elif type == "artist":
            print("type = artist")
            raw = fts_artist_search(cursor, safe_query)
            ranked = _rank_entities(raw, history, id_key_index=1)
            paginated_ids = [e["id"] for e in ranked[start:end]]
            print(paginated_ids)
            if not paginated_ids:
                return []
            return await fetchAllArtists(request, paginated_ids)

        elif type == "album":
            raw = fts_album_search(cursor, safe_query)
            ranked = _rank_entities(raw, history, id_key_index=1)
            paginated_ids = [e["id"] for e in ranked[start:end]]
            if not paginated_ids:
                return []
            return await fetchAllAlbums(request, paginated_ids)

        else:
            raw = cursor.execute(
                "SELECT song_id, rank FROM song_search_index WHERE song_search_index MATCH ?",
                (f'{type} : {safe_query}',)
            ).fetchall()
            ranked = _rank_songs(raw, history)
            paginated_ids = [s["id"] for s in ranked[start:end]]
            if not paginated_ids:
                return []
            return await fetchAll(request, paginated_ids, is_subsonic=False, type=type)

    finally:
        conn.close()