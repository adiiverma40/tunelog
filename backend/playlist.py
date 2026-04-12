# build playlist depending on user interaction
# song that user havent listened in 60 days, gets a chance in playlist
# implemented genre injection, it maps out most song listened from specif genre and give them a high chance in playlist,
# genre injection sometimes gives songs without metadata less priortiy
# this can be fixed by listening that song once

# tried to give song that user havent heared a lost of priorty

# playlist  maps like this
# repated song high priorty
# fully listened less priorty
# skipped less priorty
# song from most listened genre high priorty

# #IMPLEMENETATION:
# Implemented genre distrubution system
#  - default gets 1 point
# - song with every genre other then default gets 2 point
# - bollywood/rap gets 2 and 2 points each
# - / gets changed into ,

# Implementing star system to grade and push it in navidrome


# implementation : explict song filter
# input from frontend, if they want explict or cleaned or all

# to implement : custom slider for diffrent values of signals like skip : 0 , it never gets in the playlist ever again

# idea is to make slots dynmaic instead of hardcoding this make it take from ui


# [ slots = {
#         "unheard": max(1, round(n * unheard_pct)),
#         "wildcard": max(1, round(n * wildcard_pct)),
#         "positive": max(1, round(n * remaining * 0.35)),
#         "repeat": max(1, round(n * remaining * 0.35)),
#         "partial": max(1, round(n * remaining * 0.20)),
#         "skip": max(1, round(n * remaining * 0.10)),
#     } ]
# and this also
# SIGNAL_WEIGHTS = {
#     "repeat": 3,
#     "positive": 2,
#     "partial": 1,
#     "skip": -2,
# }


# slots give the slot in playlist if playlist is has 10 song, 3.5 must be from unheard tag
# signal weight define the weight of specific song, skip is -2 and repate is +3 so repeat is 5 times better then skip


# - songs with a genre tag gets priorities
# - after genre fitlration it gets back to the default pointing system of skip, listented, partial and repeated

# #ISSUES AND FIXES##

# issue : in slots when using int it was giving less then the amount in PLAYLIST_SIZE
# fix : used round instead of int

# Issue : Every time it chooses playlist alphabetically
# fix : added a random function , random.shuffle()

# Issue : timezone diffrent gets error
# fixed : by adding max

# Issue : Not generating exact no of song in playlist as playlist size
# Fix : Added a check loop, if counter is less then playlist size, run the loop again

# ISSUE : if user deletes playlist from navidrome and try to create a new playlist it gives error cause there is no playlist of that id but it is store in database
# fixed : createPlaylistIfDeleteByNavidrome() functions create new playlist if the playlist is delete or not exists

# ISSUE : if user deletes playlist from navidrome and then try to append in it it will fail,
# fix : use playlist database to create a new playlist with createPlaylistIfDeleteByNavidrome()  and then appened new list in it


# TODO add an playlist id in userdatabase so when playlist is created it updates it
# DONE


# re work on  playlist creation
# switching form time decay to normal index addition
# total intearaction of a song will be 20, so the max score will be repate * 20
# we will take 3 times the playlist size in the pool, if its not satify the playlist size we will take another 40 some

# REWORK ON GENRE INJECTION
# - currently it takes genre, (hindi ost, rap) converts  it in hindi ost , rap, gets ratio of hindi ost and rap from listens and inject them
# - this creates ineficeny, i changed my method of genre mapping, now i dont write genre in db according to genre.json but i take that and
# - create a translation layer in playlist, 
# - 1. get all distinct genre
# - 2. use genre.json as regrance and map them , hindi ost , rap to bollywood , rap
# - 3. then using this count ratio, now get all song from library , song id and genre 
# - 4. map the genre using genre.json , 
# - 5. calculate the unheard song , 
# - 6. get the genre needed from the pool , if needed genre are bollywood - 5 songs, rap - 4 songs, and a song has bollywood, rap as the mapped genre, give priorty to iter
# - 7. and then decrease the pool bollywood 4 , rap - 3 song, but doing so will create a risk of less song in playlist so we will inject two song of unknown genre, and 
# - 8. the rest will go to artist injection(new) , artist injection will do this, take all the artists from listens, then calculate the ratio, finds the artist which
# - 9. which is listened the most artist(60%) and least artist(40%) and inject 1 song from the artist and that user has never listened, till the list of artist is exchausted
# - 10. might encounter multiple artist (badsha , honey signh) , count them as separate artist and separate ratio,
# - 11. if still pool is empty then god knows what cause i sure dont



from datetime import datetime
import requests
import random
import heapq
from rich.console import Console
from rich.table import Table


from genre import readJson as readJSON

from misc import (
    log,
    log_scores,
    log_slot,
    log_wildcard,
    log_genre_injection,
    log_pool,
    log_summary,
)

from db import (
    get_db_connection,
    get_db_connection_lib,
    get_db_connection_usr,
    get_db_connection_playlist,
)
from config import build_url, build_url_for_user, getAllUser
from state import notification_status

console = Console(log_path=False, log_time=False)


PLAYLIST_NAME = "Tunelog - {}"
PLAYLIST_SIZE = 40
WILDCARD_DAY = 60

SIGNAL_WEIGHTS = {
    "repeat": 3,
    "positive": 2,
    "partial": 0,
    "skip": -2,
}

slotsValue = {
    "positive": 0.35,
    "repeat": 0.35,
    "partial": 0.25,
    "skip": 0.05,
}


def signalWeights(weights: dict):
    global SIGNAL_WEIGHTS
    SIGNAL_WEIGHTS = {
        "repeat": weights.get("repeat", 3),
        "positive": weights.get("positive", 2),
        "partial": weights.get("partial", 0),
        "skip": weights.get("skip", -2),
    }


def songSlots(values):
    global slotsValue
    slotsValue = {
        "positive": values["positive"],
        "repeat": values["repeat"],
        "partial": values["partial"],
        "skip": values["skip"],
    }


def getDataFromDb():
    conn_lib = get_db_connection_lib()
    conn_hist = get_db_connection()
    cursor_lib = conn_lib.cursor()
    cursor_hist = conn_hist.cursor()
    
    libraryData = cursor_lib.execute("SELECT * FROM library").fetchall()
    historyData = cursor_hist.execute('SELECT * FROM listens').fetchall()
    
    library = {
        row[0] : {
            'title' : row[1],
            'artist' : row[2],
            'album' : row[3],
            'genre' : row[4],
            'explict' : row[7]
        }
        for row in libraryData
    } 
     
    history = {}
    for row in historyData:
        sid = row[1]
        if sid not in history:
            history[sid] = []
        
        history[sid].append({
                "id" : row[0],
                 'title' : row[2],
                 'artist' : row[3],
                 'album' : row[4],
                 'genre' : row[5],
                 'signal' : row[9],
                 'timestamp' : row[10],
                 'user_id' : row[11]
        })
    
    for sid in history:
        history[sid].sort(key=lambda x: x['timestamp'], reverse=True)
        
    return library , history


def score_batch(user_id, song_ids, history_dict):
    scores = {}
    for sid in song_ids:
        song_history = history_dict.get(sid, [])
        user_listens = [h for h in song_history if h['user_id'] == user_id][:20]

        if not user_listens:
            continue
            
        scores[sid] = {"score": 0, "signal": None}
        listen_count = 0
        for record in user_listens:
            signal = record['signal']
            signal_weight = SIGNAL_WEIGHTS.get(signal, 0)
            listen_count += 1

            if listen_count <= 3:
                signal_weight *= 2

            scores[sid]["score"] += signal_weight
            scores[sid]["signal"] = signal  

    return scores


def score_song(user_id, library_dict, history_dict):
    user_songs_latest = []
    for sid, listens in history_dict.items():
        user_listens = [l for l in listens if l['user_id'] == user_id]
        if user_listens:
            latest_id = max(l['id'] for l in user_listens)
            user_songs_latest.append((sid, latest_id))

    if not user_songs_latest:
        return {}

    user_songs_latest.sort(key=lambda x: x[1], reverse=True)

    user_song_ids = [sid for sid, max_id in user_songs_latest[:PLAYLIST_SIZE * 3]]

    scores = {}
    signal_contributions = {}

    for sid in user_song_ids:
        listens = [l for l in history_dict.get(sid, []) if l['user_id'] == user_id]
        
        listens.sort(key=lambda x: x['id'], reverse=True) 
        listens = listens[:20]                            
        listens.sort(key=lambda x: x['id'])               

        if not listens:
            continue

        scores[sid] = {"score": 0, "signal": None}
        signal_contributions[sid] = {}
        listen_count = 0

        for record in listens:
            signal = record['signal']
            signal_weight = SIGNAL_WEIGHTS.get(signal, 0)

            listen_count += 1
            multiplier = 2 if listen_count <= 3 else 1
            weighted = signal_weight * multiplier

            scores[sid]["score"] += weighted
            scores[sid]["signal"] = signal
            signal_contributions[sid][signal] = (
                signal_contributions[sid].get(signal, 0) + weighted
            )

    for sid in scores:
        contribs = signal_contributions[sid]
        positive_contribs = {s: v for s, v in contribs.items() if v > 0}
        
        if positive_contribs:
            scores[sid]["dominant_signal"] = max(positive_contribs, key=positive_contribs.get)
        elif contribs:
            scores[sid]["dominant_signal"] = max(contribs, key=contribs.get)
        else:
            scores[sid]["dominant_signal"] = scores[sid]["signal"]

    titles = {sid: library_dict[sid]['title'] for sid in scores if sid in library_dict}
    log_scores(user_id, scores, signal_contributions, titles)
    
    return scores

def fill_slots(scores, slots, slot_sizes, allowed_songs=None, user_id="unknown"):
    for song_id, data in scores.items():
        score = data["score"]
        target_slot = data.get("dominant_signal") or data["signal"]
        title = (
            allowed_songs.get(song_id, "Unknown Title")
            if allowed_songs
            else "Unknown Title"
        )

        if score < 0 or target_slot is None:
            log_slot(user_id, song_id, title, score, target_slot or "none", False, "score_negative_or_no_signal")
            continue

        if allowed_songs is not None and song_id not in allowed_songs:
            log_slot(user_id, song_id, title, score, target_slot, False, "not_in_allowed_ids")
            continue

        if target_slot not in slots:
            log_slot(user_id, song_id, title, score, target_slot, False, "slot_not_found")
            continue

        max_size = slot_sizes[target_slot]
        heap = slots[target_slot]

        if len(heap) < max_size:
            heapq.heappush(heap, (score, song_id))
            log_slot(user_id, song_id, title, score, target_slot, True, "accepted")
        else:
            if score > heap[0][0]:
                heapq.heapreplace(heap, (score, song_id))
                log_slot(user_id, song_id, title, score, target_slot, True, "replaced_min")
            else:
                log_slot(user_id, song_id, title, score, target_slot, False, "slot_full_low_score")


def get_translation_maps(genre_json):
    alias_to_cat = {}
    for category, aliases in genre_json.items():
        for alias in aliases:
            alias_to_cat[alias.lower()] = category.lower()
        alias_to_cat[category.lower()] = category.lower()
    return alias_to_cat

def analyze_user_ratios(user_id, history_dict, alias_to_cat):
    cat_counts = {}
    artist_counts = {}
    
    for sid, listens in history_dict.items():
        for l in listens:
            if l['user_id'] != user_id: continue
            
            raw_genres = l.get('genre', "")
            if raw_genres:
                genres = [g.strip().lower() for g in raw_genres.split(",") if g.strip()]
                for g in genres:
                    clean_cat = alias_to_cat.get(g, g)
                    cat_counts[clean_cat] = cat_counts.get(clean_cat, 0) + 1
            else:
                cat_counts["unknown"] = cat_counts.get("unknown", 0) + 1
            
            raw_artists = l.get('artist', "")
            if raw_artists:
                artists = [a.strip() for a in raw_artists.split(",")]
                for a in artists:
                    artist_counts[a] = artist_counts.get(a, 0) + 1
                
    return cat_counts, artist_counts



def fill_genre_slots(target_counts, library_dict, heard_ids, alias_to_cat):
    playlist = []
    unheard_pool = []
    
    for sid, info in library_dict.items():
        if sid in heard_ids: continue
        
        raw_genres = info.get('genre', "")
        if raw_genres:
            clean_genres = [g.strip().lower() for g in raw_genres.split(",") if g.strip()]
            mapped_cats = {alias_to_cat.get(g, g) for g in clean_genres}
        else:
            mapped_cats = {"unknown"}
        
        priority = len(mapped_cats.intersection(target_counts.keys()))
        unheard_pool.append({'id': sid, 'cats': mapped_cats, 'priority': priority})

    unheard_pool.sort(key=lambda x: x['priority'], reverse=True)

    unknowns = [s for s in unheard_pool if "unknown" in s['cats']][:2]
    playlist.extend([s['id'] for s in unknowns])
    for s in unknowns: 
        unheard_pool.remove(s)

    for song in unheard_pool:
        matches = [c for c in song['cats'] if target_counts.get(c, 0) > 0]
        if matches:
            playlist.append(song['id'])
            for m in matches:
                target_counts[m] -= 1
                
    return playlist

def fill_artist_slots(artist_ratios, library_dict, heard_ids, playlist_ids, limit):
    sorted_artists = sorted(artist_ratios.items(), key=lambda x: x[1], reverse=True)
    
    artist_playlist = []
    current_heard = set(heard_ids) | set(playlist_ids)
    
    for artist, count in sorted_artists:
        if len(artist_playlist) >= limit: break
        
        for sid, info in library_dict.items():
            if sid in current_heard: continue
            song_artists = [a.strip() for a in info.get('artist', "").split(",")]
            
            if artist in song_artists:
                artist_playlist.append(sid)
                current_heard.add(sid)
                break
                
    return artist_playlist


def get_unheard_songs(scored_ids):
    conn = get_db_connection_lib()
    all_songs = conn.execute("SELECT song_id FROM library").fetchall()
    conn.close()

    all_ids = {row[0] for row in all_songs}
    heard_ids = set(scored_ids.keys())
    unheard = list(all_ids - heard_ids)
    unheard_ratio = len(unheard) / len(all_ids) if all_ids else 0

    return unheard, unheard_ratio


def get_wildcard_songs(scores, user_id):
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT song_id, MAX(timestamp) as last_played FROM listens WHERE user_id = ? GROUP BY song_id",
        (user_id,),
    ).fetchall()
    conn.close()

    wildcards = []
    for row in rows:
        song_id = row[0]
        last_played = row[1]
        days_since = max((datetime.now() - datetime.fromisoformat(last_played)).days, 0)
        song_score = scores.get(song_id, {}).get("score", 0)

        if days_since >= WILDCARD_DAY and song_score > 0:
            wildcards.append(song_id)
    return wildcards


def weighted_sample(pool, scores, k):
    if not pool or k <= 0:
        return []
    k = min(k, len(pool))
    weights = [max(scores.get(sid, 0.01), 0.01) for sid in pool]
    selected = []
    seen = set()
    pool_copy = list(pool)
    weights_copy = list(weights)
    for _ in range(k):
        if not pool_copy:
            break
        chosen = random.choices(pool_copy, weights=weights_copy, k=1)[0]
        idx = pool_copy.index(chosen)
        if chosen not in seen:
            selected.append(chosen)
            seen.add(chosen)
        pool_copy.pop(idx)
        weights_copy.pop(idx)
    return selected


def get_allowed_songs(explicit_filter: str) -> dict:
    conn = get_db_connection_lib()
    if explicit_filter == "strict":
        rows = conn.execute(
            "SELECT song_id, title FROM library WHERE explicit = 'notExplicit'"
        ).fetchall()
    elif explicit_filter == "allow_cleaned":
        rows = conn.execute(
            "SELECT song_id, title FROM library WHERE explicit IN ('notExplicit', 'cleaned', 'notInItunes')"
        ).fetchall()
    else:
        rows = conn.execute("SELECT song_id, title FROM library").fetchall()
    conn.close()
    return {row[0]: row[1] for row in rows}


def getPlaylistId(username):
    conn = get_db_connection_usr()
    cursor = conn.cursor()
    result = cursor.execute(
        "SELECT playlistId FROM user WHERE username = ?", (username,)
    ).fetchone()
    conn.close()
    if result:
        return result[0]
    return None


def createPlaylistIfDeleteByNavidrome(base_url, name, data, user_id):
    try:
        create_url = f"{base_url}&name={name}"
        r2 = requests.post(create_url, data=data).json()

        if (
            "subsonic-response" not in r2
            or r2["subsonic-response"]["status"] == "failed"
        ):
            print("[ERROR] Failed to recreate playlist")
            return

        new_id = r2["subsonic-response"]["playlist"]["id"]
        conn_usr = get_db_connection_usr()
        conn_usr.execute(
            "UPDATE user SET playlistId = ? WHERE username = ?", (new_id, user_id)
        )
        conn_usr.commit()
        conn_usr.close()

        print(f"[TuneLog] Recreated playlist with new ID {new_id}")
        return new_id
    except Exception as e:
        print(f"[ERROR] Failed to recreate playlist: {e}")
        return


def build_playlist(
    library,
    history,
    scores,
    unheard,
    wildcards,
    unheard_ratio,
    user_id,
    explicit_filter,
    size,
    injection=True,
):
    allowed_songs = get_allowed_songs(explicit_filter)
    song_signals = {}

    if injection:
        signal_size = round(size * 0.57)
        unheard_size = round(size * 0.35)
        wildcard_size = round(size * 0.08)
    else:
        signal_size = size
        unheard_size = 0
        wildcard_size = 0

    slot_sizes = {
        signal: max(1, round(ratio * signal_size))
        for signal, ratio in slotsValue.items()
    }
    slots = {signal: [] for signal in slotsValue}

    fill_slots(scores, slots, slot_sizes, allowed_songs, user_id=user_id)

    signal_songs = []
    for signal, heap in slots.items():
        for score, song_id in heap:
            signal_songs.append(song_id)
            song_signals[song_id] = scores.get(song_id, {}).get(
                "dominant_signal", signal
            )

    for sid in signal_songs:
        log_pool(
            user_id,
            "signal_slot",
            sid,
            allowed_songs.get(sid, "Unknown"),
            song_signals.get(sid, "unknown"),
        )

    wildcard_songs = []
    if injection:
        wildcard_pool = [
            sid for sid in wildcards if sid in allowed_songs and sid not in song_signals
        ]
        wildcard_songs = weighted_sample(
            wildcard_pool,
            {sid: scores.get(sid, {}).get("score", 1) for sid in wildcard_pool},
            wildcard_size,
        )

        for sid in wildcard_songs:
            song_signals[sid] = "wildcard"
            log_pool(
                user_id,
                "wildcard_random",
                sid,
                allowed_songs.get(sid, "Unknown"),
                "wildcard",
            )
        log_wildcard(user_id, wildcard_pool, wildcard_songs)

    leftover = wildcard_size - len(wildcard_songs)

    genre_songs = []
    if injection:
        heard_so_far = set(song_signals.keys())
        adjusted_unheard_size = unheard_size + leftover        
        alias_to_cat = get_translation_maps(readJSON())
        cat_counts, artist_counts = analyze_user_ratios(user_id, history, alias_to_cat)
        
        total_cat_listens = sum(cat_counts.values())
        target_counts = {}
        if total_cat_listens > 0:
            for cat, count in cat_counts.items():
                slots_needed = max(1, round((count / total_cat_listens) * adjusted_unheard_size))
                target_counts[cat] = slots_needed
                
        genre_playlist = fill_genre_slots(target_counts, library, heard_so_far, alias_to_cat)
        
        remaining_slots = adjusted_unheard_size - len(genre_playlist)
        artist_playlist = []
        if remaining_slots > 0:
            artist_playlist = fill_artist_slots(artist_counts, library, heard_so_far, set(genre_playlist), remaining_slots)

        combined_new_songs = genre_playlist + artist_playlist
        
        genre_songs = [
            sid for sid in combined_new_songs 
            if sid in allowed_songs and sid not in heard_so_far
        ][:adjusted_unheard_size]

        for sid in genre_songs:
            song_signals[sid] = "unheard"
            log_pool(
                user_id,
                "genre_artist_injection",
                sid,
                allowed_songs.get(sid, "Unknown"),
                "unheard",
            )
            
        mock_distribution = sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)
        log_genre_injection(
            user_id, mock_distribution, adjusted_unheard_size, genre_songs
        )

    seen = set()
    final_ids = []
    for sid in signal_songs + wildcard_songs + genre_songs:
        if sid not in seen:
            seen.add(sid)
            final_ids.append(sid)

    if len(final_ids) < size:
        needed = size - len(final_ids)
        backfill = [
            sid
            for sid, data in sorted(
                scores.items(), key=lambda x: x[1]["score"], reverse=True
            )
            if sid not in seen 
            and sid in allowed_songs 
            and data["score"] >= 0 
            and data["signal"] != "skip"
        ][:needed]

        for sid in backfill:
            song_signals[sid] = scores[sid]["signal"]
            log_pool(
                user_id,
                "score_backfill",
                sid,
                allowed_songs.get(sid, "Unknown"),
                scores[sid]["signal"],
            )
            final_ids.append(sid)
            seen.add(sid)

    if len(final_ids) < size:
        needed = size - len(final_ids)
        remaining_unheard = [
            sid for sid in unheard if sid in allowed_songs and sid not in seen
        ]
        random.shuffle(remaining_unheard)

        for sid in remaining_unheard[:needed]:
            song_signals[sid] = "unheard"
            log_pool(
                user_id,
                "unheard_random",
                sid,
                allowed_songs.get(sid, "Unknown"),
                "unheard",
            )
            final_ids.append(sid)
            seen.add(sid)

    if len(final_ids) < size:
        console.log(
            f"[yellow]Failsafe triggered:[/yellow] {len(final_ids)}/{size}, expanding window..."
        )
        conn = get_db_connection()
        extra_rows = conn.execute(
            "SELECT DISTINCT song_id FROM listens WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, size * 10),
        ).fetchall()
        conn.close()

        extra_ids = [row[0] for row in extra_rows if row[0] not in seen]
        if extra_ids:
            extra_scores = score_batch(user_id, extra_ids, history)
            for sid, data in sorted(
                extra_scores.items(), key=lambda x: x[1]["score"], reverse=True
            ):
                if len(final_ids) >= size:
                    break
                if sid not in seen and sid in allowed_songs and data["score"] >= 0:
                    song_signals[sid] = data["signal"]
                    log_pool(
                        user_id,
                        "failsafe_fallback",
                        sid,
                        allowed_songs.get(sid, "Unknown"),
                        data["signal"],
                    )
                    final_ids.append(sid)
                    seen.add(sid)

    signal_color = {
        "repeat": "green",
        "positive": "cyan",
        "partial": "yellow",
        "skip": "red",
        "wildcard": "magenta",
        "unheard": "blue",
    }

    counts = {}
    for sid in final_ids[:size]:
        sig = song_signals.get(sid, "unheard")
        counts[sig] = counts.get(sig, 0) + 1

    table = Table(
        title=f"Playlist · {user_id} · {len(final_ids[:size])} songs", show_header=True
    )
    table.add_column("Type", style="bold")
    table.add_column("Songs", justify="right")

    for sig, count in sorted(counts.items(), key=lambda x: x[1], reverse=True):
        color = signal_color.get(sig, "white")
        table.add_row(f"[{color}]{sig}[/{color}]", str(count))

    console.print(table)
    log_summary(user_id, len(final_ids[:size]), counts)

    return final_ids[:size], song_signals


def appendPlaylist(user_id, password, explicit_filter, size, injection=True):
    library , history = getDataFromDb()
    scores = score_song(user_id , library , history)
    unheard, unheard_ratio = get_unheard_songs(scores)
    wildcards = get_wildcard_songs(scores, user_id)
    playlist, song_signals = build_playlist(
        library, 
        history,
        scores,
        unheard,
        wildcards,
        unheard_ratio,
        user_id,
        explicit_filter,
        size,
        injection,
    )

    stored_playlist_id = getPlaylistId(user_id)
    name = PLAYLIST_NAME.format(user_id)

    if stored_playlist_id and stored_playlist_id != "no users/playlist id":
        url = (
            build_url_for_user("updatePlaylist", user_id, password)
            + f"&playlistId={stored_playlist_id}"
        )
        data = [("songIdToAdd", sid) for sid in playlist]
    else:
        url = build_url_for_user("createPlaylist", user_id, password) + f"&name={name}"
        data = [("songId", sid) for sid in playlist]

    try:
        r = requests.post(url, data=data).json()
        notification_status.playlist.append({"username" : user_id, "size" : len(data) , "type" : "append"})
        if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
            error = (
                r.get("subsonic-response", {})
                .get("error", {})
                .get("message", "Unknown error")
            )
            log(
                "error",
                f"Append failed: {error}",
                source="playlist",
                user_id=user_id,
                event="error",
            )
            return False

        if not stored_playlist_id or stored_playlist_id == "no users/playlist id":
            new_id = r["subsonic-response"]["playlist"]["id"]
            conn_usr = get_db_connection_usr()
            conn_usr.execute(
                "UPDATE user SET playlistId = ? WHERE username = ?", (new_id, user_id)
            )
            conn_usr.commit()
            conn_usr.close()
    except Exception as e:
        log(
            "error",
            f"Navidrome communication failed: {e}",
            source="playlist",
            user_id=user_id,
            event="error",
        )
        return False

    conn_lib = get_db_connection_lib()
    placeholders = ",".join("?" * len(playlist))
    rows = conn_lib.execute(
        f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
        playlist,
    ).fetchall()
    conn_lib.close()

    lib_data = {row[0]: row for row in rows}
    conn = get_db_connection_playlist()
    insert_data = []
    for sid in playlist:
        row = lib_data.get(sid)
        if row:
            insert_data.append(
                (
                    user_id,
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    song_signals.get(sid, "unheard"),
                    row[4],
                )
            )

    conn.executemany(
        "INSERT OR IGNORE INTO playlist (username, song_id, title, artist, genre, signal, explicit) VALUES (?, ?, ?, ?, ?, ?, ?)",
        insert_data,
    )
    conn.commit()
    conn.close()
    return True


def push_playlist(song_ids, user_id, song_signals, playname=None, newPlaylist=False):
    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    if not password:
        return

    stored_playlist_id = None if newPlaylist else getPlaylistId(user_id)
    name = playname if playname else PLAYLIST_NAME.format(user_id)
    base_url = build_url_for_user("createPlaylist", user_id, password)

    if stored_playlist_id and stored_playlist_id != "no users/playlist id":
        url = f"{base_url}&playlistId={stored_playlist_id}"
    else:
        url = f"{base_url}&name={name}"

    data = [("songId", sid) for sid in song_ids]
    try:
        r = requests.post(url, data=data).json()
        notification_status.playlist.append({"username" : user_id, "size" : len(data) , "type" : "regenerate"})
        if "subsonic-response" not in r or r["subsonic-response"]["status"] == "failed":
            error = (
                r.get("subsonic-response", {})
                .get("error", {})
                .get("message", "Unknown error")
            )
            log(
                "error",
                f"Navidrome API failed: {error}",
                source="playlist",
                user_id=user_id,
                event="error",
            )
            return

        final_playlist_id = r["subsonic-response"]["playlist"]["id"]
        if not newPlaylist and final_playlist_id != stored_playlist_id:
            conn_usr = get_db_connection_usr()
            conn_usr.execute(
                "UPDATE user SET playlistId = ? WHERE username = ?",
                (final_playlist_id, user_id),
            )
            conn_usr.commit()
            conn_usr.close()

        requests.get(
            build_url_for_user("updatePlaylist", user_id, password)
            + f"&playlistId={final_playlist_id}&public=false"
        )

    except Exception as e:
        log(
            "error",
            f"Failed to push playlist: {e}",
            source="playlist",
            user_id=user_id,
            event="error",
        )
        return

    conn_lib = get_db_connection_lib()
    placeholders = ",".join("?" * len(song_ids))
    rows = conn_lib.execute(
        f"SELECT song_id, title, artist, genre, explicit FROM library WHERE song_id IN ({placeholders})",
        song_ids,
    ).fetchall()
    conn_lib.close()

    lib_data = {row[0]: row for row in rows}
    conn = get_db_connection_playlist()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM playlist WHERE username = ?", (user_id,))

    insert_data = []
    for sid in song_ids:
        row = lib_data.get(sid)
        if row:
            insert_data.append(
                (
                    user_id,
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    song_signals.get(sid, "unheard"),
                    row[4],
                )
            )

    cursor.executemany(
        "INSERT INTO playlist (username, song_id, title, artist, genre, signal, explicit) VALUES (?, ?, ?, ?, ?, ?, ?)",
        insert_data,
    )
    conn.commit()
    conn.close()


def get_all_users():
    listens_conn = get_db_connection()
    users_conn = get_db_connection_usr()

    listening_users = set(
        row[0]
        for row in listens_conn.execute(
            "SELECT DISTINCT user_id FROM listens"
        ).fetchall()
    )
    registered_users = set(
        row[0] for row in users_conn.execute("SELECT username FROM user").fetchall()
    )

    listens_conn.close()
    users_conn.close()
    return list(registered_users & listening_users)


def API_push_playlist(song_ids, user_id, playname="New CSV Playlist"):
    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    if not password:
        return False
    base_url = build_url_for_user("createPlaylist", user_id, password)
    url = f"{base_url}&name={playname}"
    payload = [("songId", sid) for sid in song_ids]

    try:
        response = requests.post(url, data=payload)
        r_json = response.json()
        if (
            "subsonic-response" in r_json
            and r_json["subsonic-response"]["status"] == "ok"
        ):
            new_id = r_json["subsonic-response"]["playlist"]["id"]
            update_url = build_url_for_user("updatePlaylist", user_id, password)
            requests.get(f"{update_url}&playlistId={new_id}&public=false")
            return True
        return False
    except Exception:
        return False