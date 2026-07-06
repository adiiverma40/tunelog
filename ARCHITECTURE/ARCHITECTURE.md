# TuneLog Architecture & Design Decisions

This document outlines the technical architecture, data flow, and design decisions made during TuneLog development.

## Recent changes : 
- changed scoring system 

## Changes/Idea to implement 
- Better scoring logic :- instead of just skip, repeate partial complete, add 'accidental < 10', 'hard skip < 30-50' , 'partial < 50 to 80', 'complete after 80' and repeat 
- 'mood & intent' :- Rather then just creating playlist on skips and listens, put mood and intent in logic , basic idea is that if user is skipping 5 song in a row, it's not that he don't like the song but rather he is not in the mood
- better genre mapping :- rather then replying in a single genre add a multiple genre system 
- Tunelog reporter :- to decrease the difference btw online listen and offline, it's a android app that will watch notification bar for music changes and send that when user is connected to the server
- Navidrome 0.61v :- it will add better reporting for play pause, then i will be able to improve my script further, until then i am working on tunelog reporter

### plugins :

I have plans to implement plugin for navidrome for better monitoring of user interaction, it should rank diffrently to a song that is user listening by searching them or for playing via a playlist, 


- dynamically changing playlist : plan is to implement a dynamically changing playlist, if user skips a song, scripts re calculate the score and change the playlist and queue of the song(don't know how will I implement it) 




## Dropped Idea 
- **Star Rating Import** - Navidrome does not support Star rating using api


## CURRENTLY : 
 - currently working on `tunelog reporter`


## Table of Contents

- [Data Flow](#data-flow)
- [The Ghost Flush Mechanism](#the-ghost-flush-mechanism)
- [Signal System](#signal-system)
- [Auto Genre Match](#auto-genre-match)
- [Genre Injection](#genre-injection)
- [Playlist Slot System](#playlist-slot-system)
- [Timezone Safety](#timezone-safety)
- [Web ui and API layer](#Web-UI-&-API-Layer)
- [Multi-User Setup](#multi-user-setup)
- [Error Handling](#error-handling)
- [Known Limitations](#known-limitations)
  

## PROXY 
The service acts as an HTTP proxy for a Navidrome instance and adds two main behaviors:

1. Custom search interception for endpoints such as `rest/search3`, `api/song`, `api/album`, and `api/artist`.
2. Special handling for SSE endpoints like `/api/events` so that streaming responses remain stable.

For all other endpoints, the proxy forwards the request to the upstream Navidrome server with minimal transformation.

### FastAPI application

The proxy is implemented as a single FastAPI app. It exposes a catch-all route:

* `/{path:path}`

This route receives nearly all incoming requests and decides whether to:

* return a locally generated search response,
* stream SSE data from the upstream server, or
* forward the request as a normal reverse proxy.

### Shared HTTPX client

A single global `httpx.AsyncClient` is used for outbound requests to the upstream Navidrome server. It is configured with `timeout=None` so long-lived requests, especially SSE, do not time out prematurely.

### Search layer

The proxy imports `searchTable` from `search.py`. This function is used to return custom search results before the request is sent upstream.

### Environment configuration

The upstream base URL is read from:

* `BASE_URL`

This is stored in `NAVIDROME_URL` and used to build the upstream target URL for every proxied request.

## Flow

### Incoming request

A client sends a request to the proxy. The request may be one of the following:

* normal API request,
* search request,
* SSE event stream request.

### Pre-processing

The proxy reads:

* raw request body,
* query parameters,
* form data for `application/x-www-form-urlencoded` POST requests.

It combines query parameters and form fields into `mergedParams` so downstream search logic can inspect them uniformly.

### Search interception

Before forwarding the request upstream, the proxy calls `handle_search_logic(path, mergedParams, request)`.

If this function finds a supported search endpoint and valid search term, it calls `searchTable(...)` and returns a local response.

### SSE handling

If the path contains `api/events`, the proxy does not use a normal buffered request. Instead, it:

* opens a streaming request to the upstream server,
* relays chunks as they arrive,
* returns a `StreamingResponse` with SSE headers.

### Normal proxying

If the request is not intercepted by search logic and is not an SSE endpoint, the proxy forwards the request to the upstream server using `httpx.AsyncClient.request(...)` and returns the upstream response body and headers.

### Catch-all route

The route decorator handles multiple HTTP methods:

* `GET`
* `POST`
* `PUT`
* `DELETE`

This makes the proxy generic and able to cover most Navidrome API traffic.

### Search endpoint mapping

The search logic uses a small mapping from path patterns to parameter names:

* `rest/search3` -> `query`
* `api/song` -> `title`
* `api/album` -> `name`
* `api/artist` -> `name`

The proxy only performs search interception when one of these path patterns matches and a usable search term is present.

## Search architecture

### Search term extraction

The proxy checks the relevant parameter for the endpoint, trims quotes and whitespace, and ignores empty strings.

### Pagination

The search helper uses different pagination rules depending on endpoint type:

* For Subsonic-style `rest/search3`, it derives `start` and `end` from `songOffset` and `songCount`.
* For JSON-style endpoints, it uses `_start` and `_end`.

### Response shaping

If a search result is produced, the proxy returns a local JSON payload rather than forwarding the request upstream.

For `rest/search3`, the response is wrapped in a Subsonic-compatible structure:

```json
{
  "subsonic-response": {
    "status": "ok",
    "version": "1.16.1",
    "searchResult3": {
      "song": [ ... ]
    }
  }
}
```

For other endpoints, the result is returned directly as JSON.

### Result metadata

The response includes:

* `X-Total-Count`
* `Access-Control-Expose-Headers: X-Total-Count`
* `Content-Type: application/json`

This allows clients to understand the total result count while consuming the custom search response.

## SSE architecture

### Problem addressed

The code comments indicate that `/event` or `/api/events` is an SSE endpoint and needs separate treatment so streaming does not break.

### Implementation

The proxy:

1. builds a streaming request to the upstream server,
2. sends it with `stream=True`,
3. yields chunks as they arrive,
4. closes the upstream response when the stream ends or is disconnected.

### SSE headers

The streaming response uses headers suited for event streams:

* `Content-Type: text/event-stream`
* `Cache-Control: no-cache`
* `Connection: keep-alive`
* `X-Accel-Buffering: no`

These headers reduce buffering and help preserve real-time delivery.

## Normal proxy path

When a request is not intercepted, the proxy performs a standard forward operation:

* copies request headers,
* removes `host`,
* forwards method, path, query params, and body to `BASE_URL`.

The response from upstream is returned to the client with most headers preserved, excluding hop-by-hop or body-length related headers such as:

* `content-length`
* `transfer-encoding`
* `content-encoding`

## Error and edge-case behavior

### Empty or invalid search terms

If the extracted search parameter is missing or empty after trimming, the proxy skips local search handling and continues with normal proxying.

### Requests with `id`

If the request includes an `id` parameter, search interception is skipped. This avoids overriding direct item lookups.

### Client disconnects on SSE

The streaming generator catches:

* `httpx.ReadError`
* `asyncio.CancelledError`

This prevents the proxy from crashing when the client closes the SSE connection.

## Configuration

### Required environment variable

* `BASE_URL`: upstream Navidrome base URL

### Optional assumptions

The proxy assumes the upstream server is compatible with the forwarded routes and request shapes used by Navidrome clients.

## Runtime lifecycle

### Startup

The HTTP client is created once at module load.

### Shutdown

A shutdown event handler closes the shared `httpx.AsyncClient` to release connections cleanly.

# Search Engine 

This module provides a hybrid search system that combines:

* SQLite FTS (Full-Text Search)
* User listening history
* External data from Navidrome APIs

The goal is to return relevant, ranked, and enriched results for songs, albums, and artists.

## Core Responsibilities

The search engine performs the following steps:

1. Normalize and sanitize user query
2. Run FTS queries against a local database
3. Blend ranking with listening history
4. Fetch full metadata from Navidrome
5. Return structured results to the proxy

## Data Sources

### SQLite FTS Index

The module queries a table:

* `song_search_index`

This table supports full-text search across:

* song title
* lyrics
* artist
* album

### Listening History

The `listens` table is used to boost frequently played songs.

Function:

* `fetchAllFromListens()`

It returns a mapping:

```
{ song_id: listen_count }
```

This is used during ranking.

### Navidrome API

The module fetches full entity data from Navidrome:

* `/rest/getSong`
* `/api/song/{id}`
* `/api/artist/{id}`
* `/api/album/{id}`

### Step 1: Normalization

Input query is cleaned using:

* lowercase conversion
* removal of special characters
* collapsing repeated characters
* trimming whitespace

Function:

* `normalize_text()`

Example:

```
"Heeellooo!!!" → "helo"
```

### Step 2: Safe Query Construction

The cleaned query is converted into an FTS-compatible prefix query:

```
safe_query = "query*"
```

This enables prefix matching in SQLite FTS.

### Step 3: FTS Execution

Different functions handle different entity types:

* Songs: `fts_song_search`
* Title + Lyrics: `fts_song_title_lyrics`
* Artist: `fts_artist_search`
* Album: `fts_album_search`

Each returns rows with:

* song_id
* rank (FTS relevance score)
* optional entity IDs

## 5. Ranking Strategy

### Blended Ranking Formula

The system combines:

* FTS rank (lower is better)
* Listening history (higher is better)

Formula:

```
score = rank - (listens * LISTEN_WEIGHT)
```

Where:

* `LISTEN_WEIGHT = 5.0`

This means frequently played songs are boosted significantly.

### Song Ranking

Function:

* `_rank_songs()`

Steps:

1. Attach listen counts
2. Compute blended score
3. Sort ascending by score

### Entity Ranking (Artist/Album)

Function:

* `_rank_entities()`

Steps:

1. Group by entity ID
2. Aggregate multiple song hits
3. Keep best score per entity
4. Track number of hits
5. Sort by:

   * score (ascending)
   * hits (descending)

This ensures both relevance and coverage.

## 6. Pagination

After ranking, results are sliced:

```
results[start:end]
```

Defaults:

* start = 0
* end = 15

## 7. Data Enrichment Layer

FTS only returns IDs. The module enriches results by calling Navidrome APIs.

### Song Fetching

Function:

* `fetchAll()`

Supports two modes:

* Subsonic (`/rest/getSong`)
* JSON API (`/api/song/{id}`)

### Artist Fetching

Function:

* `fetchAllArtists()`

### Album Fetching

Function:

* `fetchAllAlbums()`

All fetch operations are:

* asynchronous
* parallelized using `asyncio.gather`


## 9. Search Modes

The main entry point is:

* `searchTable(request, query, start, end, type)`

Supported types:

* `global` → general song search (Subsonic compatible)
* `song` → title + lyrics
* `artist` → artist-based grouping
* `album` → album-based grouping
* custom → field-specific search

## 10. Concurrency Model

* Uses `httpx.AsyncClient`
* Executes multiple API calls in parallel
* Improves latency when fetching multiple entities

## 11. Design Decisions

### Global history instead of per-user

The system intentionally uses shared listening history across all users.
(i just didnt want to mess with multiple users)
Rationale:

* simplifies architecture
* improves collective ranking
* avoids user-state complexity

### Prefix-based FTS

Using `query*` allows partial matching and improves usability.

### Rank blending

Combining FTS + listens gives better real-world relevance than pure text matching.


## Data Flow
```
Navidrome API → library.py → songlist.db (library table)
Navidrome API → main.py (Watcher) → tunelog.db (listens table)
tunelog.db + songlist.db → playlist.py → Navidrome API (playlist push)
```

---

### Library Sync Performance Note

iTunes API enforces rate limits (~20 req/min). TuneLog uses a 1s delay between calls + exponential backoff on 429 errors (5s, 10s, 15s). A full 2383-song library takes approximately **30–40 minutes** on first sync. Subsequent syncs only process songs missing metadata and complete in seconds.

To counter this, I have added A toggle for it in `library.py`

## The "Ghost Flush" Mechanism


### The Problem: API Reporting Latency
TuneLog interacts with the Navidrome (Subsonic) API to monitor real-time listening activity. However, the Subsonic API has a known limitation: it does not actively report a **"Paused"** state.
If a user pauses a track, the API continues to list that track as "Now Playing." If TuneLog simply calculated the difference between the `start_time` and the current `time.time()`, the "played duration" would continue to increase indefinitely — reaching 100%, 200%, or even more while the song is actually paused.

### The Solution
To prevent these "phantom listens" from polluting the SQLite database and skewing recommendation scores, the watcher implements a **Ghost Flush**.

#### Logic Implementation:
```python
for entry in entries:
    user_id = entry["username"]
    song_id = entry["id"]
    
    if user_id in active and active[user_id]["song_id"] == song_id:
        elapsed = time.time() - active[user_id]["start_time"]
        if elapsed >= active[user_id]["duration"]:
            active.pop(user_id)
            print(f"[DONE] {user_id} finished: {entry['title']}")
            continue
```

---

## Signal System

### The Problem: Binary Listen Data
A simple "played/not played" model loses nuance. A song played for 5 seconds and a song played to completion are not equivalent events, but a naive system would treat them identically.

### The Solution
TuneLog classifies every listen into one of five signals based on `percent_played`:

| Signal | Threshold | Weight |
|---|---|---|
| noise | `< 10%` | 0 (not logged) |
| skip | `10–30%` | −2 |
| partial | `30–80%` | +1 |
| positive | `80–100%` | +2 |
| repeat | replayed | +3 |

### Scoring Formula

- Before used time as a recency multipler
- changed to normal addition, when user click create playlist a hardcoded preset of songs or by ui gets to backend
- using the ratio and weightage the score of song is calculated
- for 1st 3 song(recent)  get a multipler of 2 
- also if the total score is less then 0 we skip this
- if the size of this is less then assian size then we do this again

**ISSUES** 
- issues ariases when genre injection is off and user tries to create a new playlist of only repeated song
- if db dont have enough song of repeat tag, it adds unheard song to fill the empty slots






## Auto Genre Match

### The Problem: Inconsistent Metadata
Navidrome stores genre tags exactly as embedded in audio files. This means the same genre can appear as `BOLLYWOOD`, `Bollywood Music`, `Hindi OST`, `Indian`, or `Фильмы` — all treated as separate genres, causing genre injection to miss matches entirely.

Additionally, songs tagged with multiple genres like `Bollywood/Rap` were stored as one string, never matching either genre pool.

### The Solution
Every genre string passes through `autoGenreMatch()` It takes pre existing genre category in `genre.json` , and uses fuzzy matching on `Distinct Genre` from database, when score is heigher then 95 it stores it in `genre.json` . After that ` sync_database_to_json()` updates it in database

- currently there is no implementation of multiple genre tags like `rap, hip hop` because i dont know how to.

  **Here is the my genre.json** create `genre.json` in `data` folder and paste this before runing docker container, as docker marks data as root folder and it wont let you write in it.
```JSON
{
    "desi": [
        "indian pop",
        "regional indian",
        "folk",
        "indian folk",
        "folk pop",
        "indie folk",
        "alternative folk",
        "hindi ost"
    ],
    "punjabi": [
        "punjabi pop",
        "punjabi",
        "punjabi r&b",
        "punjabi r&b "
    ],
    "default": [
        "default",
        "soundtrack",
        "singer,songwriter",
        "boom bap",
        "classique",
        "darksynth",
        "film soundtrack",
        "hindi soundtrack",
        "tv soundtrack",
        "soundtrack,games",
        "0",
        "uk drill",
        "singer-songwriter",
        "trap",
        "downtempo",
        "funk",
        "singer",
        "various",
        "club",
        "jazz",
        "ambient"
    ],
    "bollywood": [
        "bollywood",
        "bollywood music",
        "hindi"
    ],
    "bhojpuri": [
        "bhojpuri"
    ],
    "bhangra": [
        "bhangra"
    ],
    "worldwide": [
        "worldwide"
    ],
    "rap": [
        "old school rap",
        "rap",
        "pop rap"
    ],
    "hip hop": [
        "hip-hop,rap",
        "hip-hop",
        "hip-hop/rap",
        "southern hip hop",
        "rap,hip hop"
    ],
    "filmi": [
        "filmi",
        "filme",
        "filme,videospiele",
        "films",
        "films,games"
    ],
    "pop": [
        "pop",
        "indie pop",
        "alternative pop",
        "dream pop",
        "art pop",
        "synth-pop"
    ],
    "rnb": [
        "rnb,soul",
        "contemporary r&b",
        "r&b"
    ],
    "rock": [
        "rock",
        "hard rock",
        "progressive rock",
        "indie rock",
        "pop rock"
    ],
    "islamic": [
        "islamic",
        "musique indienne"
    ],
    "new age": [
        "new age"
    ],
    "metal": [
        "metal"
    ],
    "dance": [
        "dance",
        "dance-pop"
    ],
    "bengali": [
        "bangla",
        "bengali",
        "bangla rock"
    ],
    "country": [
        "country",
        "country pop"
    ],
    "vocal": [
        "vocal"
    ],
    "house": [
        "house",
        "future house",
        "electro house"
    ],
    "blues": [
        "blues"
    ],
    "children music": [
        "children's music"
    ],
    "sufi": [
        "sufi",
        "farsi",
        "ghazals",
        "ghazal"
    ],
    "asia": [
        "asia",
        "asian music"
    ],
    "alternative": [
        "alternative",
        "alternative r&b",
        "alternative rap"
    ],
    "techno": [
        "techno"
    ],
    "motivational": [
        "devotional & spiritual",
        "inspirational"
    ],
    "tollywood": [
        "tollywood",
        "tamil"
    ],
    "electronic": [
        "electronica",
        "electronic",
        "electro"
    ],
    "classical": [
        "classical"
    ],
    "indian": [
        "hindustani classical",
        "indian music"
    ],
    "soundtrack": [
        "soundtrack,videospiele"
    ],
    "african": [
        "african music",
        "afrobeats",
        "afro-pop"
    ],
    "world": [
        "world",
        "world music"
    ],
    "other": [
        "other",
        "\u0438\u043d\u0434\u0438\u0439\u0441\u043a\u0430\u044f \u043c\u0443\u0437\u044b\u043a\u0430",
        "soul",
        "music",
        "christmas music",
        "ballad",
        "christian",
        "musiques du monde",
        "compilation",
        "\u043f\u043e\u043f"
    ],
    "workout": [
        "fitness & workout"
    ],
    "karaoke": [
        "karaoke"
    ],
    "disco": [
        "disco"
    ],
    "international": [
        "international"
    ],
    "intrumental": [
        "instrumental"
    ]
}
```

Songs with no genre metadata are assigned `"default"`.

---

## Genre Injection

### The Problem: Cold Unheard Pool
A 2000+ song library means the unheard slot would randomly surface songs with no relation to the user's taste — wasting playlist slots on irrelevant tracks.

### The Solution
Instead of random sampling, the unheard slot is filled via **genre injection**:

1. `get_genre_distribution()` — counts listen history per genre, splitting comma-separated genres so `"bollywood,rap"` increments both `bollywood` and `rap` counters
2. `get_unheard_by_genre_weighted()` — allocates unheard slots proportionally to genre listen counts
3. `get_unheard_by_genre()` — `LIKE %genre%` match against library, shuffled before slicing to prevent alphabetical bias
4. Fallback to random unheard sample if genre pool doesn't fill the slot

### Genre Point System
Songs are ranked within the unheard pool by points:

| Genre state | Points |
|---|---|
| `"default"` (no metadata) | 1 |
| single genre | 2 |
| `"bollywood,rap"` (2 tags) | 4 |
| matched in multiple pools | stacks |

---

## Playlist Slot System - can be changed from ui 

### The Problem: Fixed Slot Truncation
Using `int()` to calculate slot sizes caused slots to truncate to 0 at small playlist sizes — `n=10` produced only 6 songs because `int(10 * 0.08) = 0` silently dropped the wildcard slot entirely.

### The Solution
Replace `int()` with `max(1, round(...))` to guarantee every slot gets at least 1 song, with a trim loop to bring the total back to `n` when `max(1,...)` causes overflow:
```python
slots = {
    "unheard":  max(1, round(n * unheard_pct)),
    "wildcard": max(1, round(n * wildcard_pct)),
    "positive": max(1, round(n * remaining * 0.35)),
    "repeat":   max(1, round(n * remaining * 0.35)),
    "partial":  max(1, round(n * remaining * 0.20)),
    "skip":     max(1, round(n * remaining * 0.10)),
}

# trim overflow, least important first
for key in ["skip", "wildcard", "partial", "positive", "repeat", "unheard"]:
    if total <= n:
        break
    if slots[key] > 1:
        diff = min(slots[key] - 1, total - n)
        slots[key] -= diff
        total -= diff
```

### Default Slot Distribution (n=50)

| Slot | % | Source |
|---|---|---|
| unheard | up to 35% | genre-injected unheard songs |
| wildcard | 8% | songs not played in 60+ days with positive score |
| positive | 35% of remaining | songs with positive signal |
| repeat | 35% of remaining | songs with repeat signal |
| partial | 20% of remaining | songs with partial signal |
| skip | 10% of remaining | songs with skip signal |

---

## Timezone Safety

### The Problem
Navidrome stores timestamps in UTC. Python's `datetime.now()` returns local time. In timezones behind UTC, the difference becomes negative — causing a divide-by-zero in `1 / (days_since + 1)` when `days_since = -1`.

### The Solution
```python
days_since = max((datetime.now() - datetime.fromisoformat(timestamp)).days, 0)
```
`max(..., 0)` clamps negative values to 0, treating same-day listens as recency = 1.

---

## Multi-User Setup - can be done by ui

TuneLog supports multiple Navidrome users. Each user gets their own independently generated playlist based on their personal listen history.


## Logging
using  `loguru` module to create log files for `playlist.py` and everything else



## Web UI & API Layer

TuneLog utilizes a FastAPI backend to bridge the Gap between the Navidrome API and the React-based Dashboard. It manages three distinct SQLite databases: `tunelog.db` (listens), `songlist.db` (library), and `users.db` (app users).

### 1. User & Admin Management
Endpoints for handling authentication and multi-user synchronization.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/auth/login` | `POST` | Validates against Navidrome; creates a local record in `users.db` on first success. Returns a JWT. |
| `/admin/create-user` | `POST` | Admin-only. Creates a new user in both Navidrome and the local TuneLog database. |
| `/admin/get-users` | `POST` | Returns a list of all users registered in the local system (includes Admin status). |
| `/admin/getUserData` | `GET` | Fetches a high-level "Stat Card" for a specific user (Skips, Repeats, Last Logged). |

---

### 2. Library Sync & Metadata
Handles the ingestion of Navidrome library data and optional enrichment via iTunes.

* **`GET /api/sync/status`**: Returns real-time sync state. 
    * Includes `explicit_counts` (Explicit, Cleaned, NotInItunes, Pending).
    * Shows `progress` percentage and `is_syncing` boolean.
* **`GET /api/sync/start`**: Triggers `library.triggerSync()`. 
    * Accepts `use_itunes` boolean to toggle slow metadata enrichment.
* **`GET /api/sync/stop`**: Sets `library._stopSync = True` to gracefully kill an active sync thread.
* **`GET /api/sync/setting`**: Persists `auto_sync_hour` and `use_itunes` preferences in memory.

## Fallback Matching Algorithm

This module is responsible for resolving songs marked as `notInItunes` by attempting multiple search strategies and selecting the best possible match using fuzzy scoring.

---

### Overview

The system uses a **multi-stage fallback pipeline** combined with **fuzzy matching** to identify songs from unreliable or messy metadata.

Common issues handled:
- Incorrect or incomplete song titles
- Mixed-language or noisy metadata (e.g., YouTube-style names)
- Missing album or artist information
- Songs not directly available in iTunes

---

### Core Strategy

1. Normalize and clean input metadata
2. Perform iTunes search with multiple fallback strategies
3. Score results using fuzzy matching
4. Select the best match based on confidence threshold
5. Update database accordingly

---

### Text Normalization

Before searching, all metadata is cleaned using `clean_text()`:

- Converts text to lowercase
- Removes:
  - URLs
  - common junk words (`official`, `lyrics`, `hd`, etc.)
  - download site names
  - remix / DJ tags
- Cleans brackets and featured artist patterns
- Normalizes spacing and symbols

This ensures consistent comparison across APIs.

---

### Fuzzy Matching

Matching is done using `rapidfuzz` with a weighted scoring system:

- Title match weight: **60%**
- Artist match weight: **40%**

#### Scoring Rules

- Reject if artist score < 50 (when artist exists)
- Reject if title score < 40
- Short titles (≤4 chars) require stricter artist match
- Final score must be ≥ 70 to qualify

```python
score = (title_score * 0.6) + (artist_score * 0.4)
````

---

### Search Pipeline

The system attempts multiple strategies in sequence:

#### 1. Primary iTunes Search

* Query: `title + artist`
* If match found → stop

---

#### 2. Fallback 1: Title-only Search

* Query: `title`
* Useful when artist metadata is incorrect

---

#### 3. Fallback 2: Artist-only Search

* Query: `artist`
* Useful when title is noisy or corrupted

---

#### 4. Fallback 3: Album-based Lookup

* Search album in iTunes
* Fetch all tracks from album
* Perform fuzzy matching on track list

This is effective when:

* Title is slightly incorrect
* Album metadata is reliable

---

#### 5. Fallback 4: MusicBrainz Integration

* Query MusicBrainz API using:

  * title
  * artist
  * album (if available)
* Convert response into iTunes-like format
* Retry matching via album lookup

Used as a **last resort** when iTunes fails.

---

### Fuzzy Matching Control

To prevent excessive computation:

* Global `totalTries` counter is maintained
* Hard limit (`tryLimit`, default 500)
* Stops processing once limit is reached

---

### Match Decision

After all attempts:

#### If match is found:

* Score ≥ 80:

  * Update:

    * explicit status
    * genre
    * artist
* Score < 80:

  * Update only explicit status

#### If no match:

* Mark song as `manual`
* Requires user intervention

---

### Database Updates

Handled via `updateSong()`:

Fields updated:

* `explicit`
* `genre` (optional)
* `artist` (optional)
* `last_synced` timestamp
### Example Flow

```
Input Song → Clean Metadata
          → iTunes Search
          → Fallback 1
          → Fallback 2
          → Fallback 3 (Album)
          → MusicBrainz
          → Final Match Decision
```



### 3. Playlist Engine
Interacts with the scoring logic to generate and retrieve personalized music.

* **`GET /api/playlist/songs`**: 
    * Retrieves the current cached playlist for a user.
    * **Live Aggregation**: Calculates `top_genre` and `total_songs` from the current playlist snapshot.
* **`GET /api/playlist/generate`**: 
    * Triggers the scoring algorithm.
    * Parameters: `explicit_filter` (string) and `size` (integer).
    * **Workflow**: Scores songs → Injects Unheard (Genre Weighted) → Adds Wildcards → Pushes to Navidrome.

---

### 4. Advanced User Analytics (The Profile Deep-Dive)
The `/api/user/profile` endpoint is the most complex, performing cross-database aggregation.

#### Data Aggregation Logic:
1.  **Signal Distribution**: Counts all `skip`, `partial`, `positive`, and `repeat` events from `listens`.
2.  **Top 20 Songs**: 
    * Groups by `song_id` in `tunelog.db`.
    * Hydrates titles/artists from `songlist.db`.
    * Determines the "Primary Signal" for each song (most frequent interaction type).
3.  **Top 20 Artists**: 
    * Aggregates counts across all songs.
    * **Normalization**: Splits semicolon-separated artist strings (e.g., `"Artist A; Artist B"`) to count toward the primary performer.
4.  **Top 15 Genres**: 
    * Ranks genres by total listen frequency.
5.  **Recent History**: 
    * Returns the last 100 events with full metadata, including the specific `listened_at` timestamp.

---

### CSV IMPORT 
- Currently it is using fuzzy matching to get the best choice.
- I have counted for situtation like Only title, only title and artist and title, artist, album
- If title, artist and album all are present it checks for fuzzy score of artist and album if they are higher then 80, it checks for title score
- If artist is high and album is low, it checks for title and duration diff, if title score is high and duration diff is +- 10% it passes it

I dont have enough data to test it fully, if you are willing to give me feedback it would be appriciated

---



### **ERROR HANDLING**
Added better error handling, i took some help from ai
- `error.py` is now the entry point
- Using Supervisor pattern to ensure it dont crash when navidrome is down
- it will exit if `port 8000` is taken
- if `port  5173` is taken
- uses a heartbeat mechanism

**Heartbeat Mechanism**

Every major components (API, SSE, Db, library Sync) is registered in a centeral `globalStatus` object. as long as a component is working, it updates its heartbeat(timestamp)

- SSE : Updates when navidrome registers a new event
- uvicorn : updates when frontend makes api request
- sync : when library sync (manual / auto) is triggered 

**Supervisoor** 

`error.py` works as a container, its run a infinite loop that checks the health of system every 15 sec 
- **Stall detection** : if a critical thread stops updating heartbeat for more then 120 sec , supervisor marks it as a `unresponsive`
- crash reporting : if a thread hits a unrecoverable error, it flags its status as a crashed in the registry
- if cirtical failure is detected it exists the program using `sys.exit(1)`

- Using `threading.lock` it ensures every other thread reports in same time without curpporting data

---








### API Design Decisions
* **Application-Level Joins**: Since metadata and listen logs reside in separate SQLite files, the API performs the "Join" logic in Python to keep the databases modular and portable.
* **Stateless Frontend**: The frontend never calculates stats. It receives pre-computed objects (e.g., `top_genre`, `signal_map`) to ensure the Dashboard remains fast on low-power devices.
* **Flag-Based Sync**: The API doesn't run the sync directly; it sets flags (`_startSyncSong`) that the main `Watcher` loop picks up. This prevents blocking the API thread during the long iTunes 429-backoff periods.

### Sync Flow
```
Frontend hits GET /api/sync/start?use_itunes=true
        ↓
api.py sets library._toggle_itune = True, library._startSyncSong = True
        ↓
main.py loop detects _startSyncSong = True
        ↓
Spawns sync_library() in background thread
        ↓
sync_library() updates _progress every song, sets _isSyncing = False when done
        ↓
Frontend polls GET /api/sync/status to show live progress
```

### Auto Sync Flow
```
main.py loop checks current hour every 30 seconds
        ↓
If current_hour == _auto_sync AND not already run today AND not syncing
        ↓
Spawns sync_library() in background thread
```

---

### Design Decisions
- All aggregation happens server-side in SQL — frontend receives only pre-computed results, never raw rows
- Single `/api/stats` endpoint covers the entire dashboard — one fetch on page load, no per-component API calls
- Sync is triggered by flag polling (`_startSyncSong`) rather than direct thread spawning from the API — keeps FastAPI stateless and lets `main.py` own the sync lifecycle
- CORS is restricted to `localhost:5173` (Vite dev server) — update for production deployment
- GET is used for sync endpoints instead of POST — TuneLog is local-only with no sensitive data in these calls
### Design Decisions
- All aggregation happens server-side in SQL — frontend receives only pre-computed results, never raw rows
- Single `/api/stats` endpoint covers the entire dashboard — one fetch on page load, no per-component API calls
- CORS is restricted to `localhost:5173` (Vite dev server) — update this for production deployment

---

## Known Limitations

- **Cold start** — recommendations improve only after sufficient listen history builds up. Initial playlists are genre-injected unheard songs with little signal weighting.
- **No genre metadata** — songs without embedded genre tags receive `"default"` and score 1 point in the unheard pool, giving them lower priority than tagged songs.
- **Artist name variants** — `"Arijit Singh"` and `"Arjeet Singh"` are treated as different artists. No fuzzy matching implemented yet.
- **iTunes metadata sync is slow** — `sync_library()` makes one iTunes API call per song with a 0.5–1s delay to avoid rate limiting. For a 2000+ song library, a full sync takes 20–40 minutes. Re-syncing after adding new songs is fast since only songs with `explicit IS NULL` are fetched, but initial sync is a one-time long operation.
