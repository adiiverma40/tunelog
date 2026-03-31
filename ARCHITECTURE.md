# TuneLog Architecture & Design Decisions

This document outlines the technical architecture, data flow, and design decisions made during TuneLog development.

## TODO

- Create a failsafe and change the songlist db depeneding on deleted songs, currently if some songs were delete, playlist will created and based on those deleted songs



## Roadmap
- [x] Navidrome API connection
- [x] SQLite listen logger
- [x] Multi-user support
- [x] INSERT on new song, UPDATE within 10 min window
- [x] Signal scoring (skip / partial / positive / repeat)
- [x] Recency-weighted scoring
- [x] Genre-injected unheard song discovery
- [x] Wildcard resurrection (60-day decay)
- [x] Per-user personalised playlists
- [x] Playlist pushed directly to Navidrome (private, per-user)
- [x] Docker support
- [x] FastAPI backend (early stage)
- [ ] Web UI dashboard (in progress — needs polish)
- [x] Auto library sync scheduler
- [ ] M3U export
- [x] Add stop library sync
- [ ] Figure out why cpu spikes when using fast sync in docker but not when doing python3
- [x] Add more information to users in users page
- [ ] Add delete user option
- [x] Add playlist creation
- [x] Figure out if I can use updateplaylist api of navidrome
- [x] Use a better approach to the marking stat system, if user listen to one song and get one star and listen again completely it gets flagged as repeat and gets a 5 star



## CURRENTLY : 
- Currently building web ui dash board



## Key changes :-
- Instead of logging getNowPlaying api every 5 sec, use SSE to automate it


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
- [Known Limitations](#known-limitations)
  

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
```
score = signal_weight × recency_multiplier
recency_multiplier = 1 / (days_since + 1)
final_score = average of all contributions for that song
```
Recent listens are weighted higher. A repeat yesterday outweighs a repeat from 3 months ago.

---

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

## Playlist Slot System

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

### Configuration

TuneLog uses a `.env` file to store credentials. This file is **never committed to Git** — it lives only on your machine.

Create a `.env` file in the root directory:
```env
# User 1
USER1_USERNAME=alice
USER1_PASSWORD=yourpassword

# User 2
USER2_USERNAME=bob
USER2_PASSWORD=yourpassword
```

> Add as many `USERn_*` blocks as you have users. Each user must have both fields.

### In config.py
```python
# ADD MORE LINES IF YOU HAVE MORE USERS
USER_CREDENTIALS = {
    os.getenv("USER_ADITI"): os.getenv("PASSWORD_aditi"),
    os.getenv("USER_adii_mobile"): os.getenv("PASSWORD_adii_mobile"),
    os.getenv("admin_username"): os.getenv("admin_password"),
    # Add as many users as you want
}
```
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
- **Symfonium / third-party sync** — each playlist regeneration creates a new playlist ID in Navidrome. Apps that sync by ID (like Symfonium) require manual reimport each time.
- **No genre metadata** — songs without embedded genre tags receive `"default"` and score 1 point in the unheard pool, giving them lower priority than tagged songs.
- **Artist name variants** — `"Arijit Singh"` and `"Arjeet Singh"` are treated as different artists. No fuzzy matching implemented yet.
- **iTunes metadata sync is slow** — `sync_library()` makes one iTunes API call per song with a 0.5–1s delay to avoid rate limiting. For a 2000+ song library, a full sync takes 20–40 minutes. Re-syncing after adding new songs is fast since only songs with `explicit IS NULL` are fetched, but initial sync is a one-time long operation.
