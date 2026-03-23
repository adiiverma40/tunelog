# TuneLog Architecture & Design Decisions

This document outlines the technical architecture, data flow, and design decisions made during TuneLog development.

## TODO


- Added docker support for frontend


- Itunes support is broken, My thinking was that i will implement a rating system, if check if the song has metadata, and explicit metadata, If not then fetch it using itunes and add it songlist database, but its not completed yet

- SSE works fine but when using Navidrome client like Tempo it generate more then 1 event when playing music, this makes Watcher() run more then once, No imminnet problem yet, but it can create an overhead

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
- [ ] Auto library sync scheduler
- [ ] M3U export
- [ ] Add stop library sync
- [ ] Figure out why cpu spikes when using fast sync in docker but not when doing python3
- [ ] Add more information to users in users page
- [ ] Add delete user option
- [ ] Add playlist creation
- [ ] Figure out if I can use updateplaylist api of navidrome
- [ ] Use a better approach to the marking stat system, if user listen to one song and get one star and listen again completely it gets flagged as repeat and gets a 5 star



## CURRENTLY : 
- Currently building web ui dash board



## Key changes :-
- Instead of logging getNowPlaying api every 5 sec, use SSE to automate it


## Table of Contents

- [Data Flow](#data-flow)
- [The Ghost Flush Mechanism](#the-ghost-flush-mechanism)
- [Signal System](#signal-system)
- [Genre Normalisation Pipeline](#genre-normalisation-pipeline)
- [Genre Injection](#genre-injection)
- [Playlist Slot System](#playlist-slot-system)
- [Timezone Safety](#timezone-safety)
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

## Genre Normalisation Pipeline

### The Problem: Inconsistent Metadata
Navidrome stores genre tags exactly as embedded in audio files. This means the same genre can appear as `BOLLYWOOD`, `Bollywood Music`, `Hindi OST`, `Indian`, or `Фильмы` — all treated as separate genres, causing genre injection to miss matches entirely.

Additionally, songs tagged with multiple genres like `Bollywood/Rap` were stored as one string, never matching either genre pool.

### The Solution
Every genre string passes through `normalise_genre()` at ingest time in both `library.py` and `main.py`:

1. Lowercase + strip whitespace
2. Split on `/` → handle multi-genre tags
3. Map through `GENRE_ALIASES` dict → collapse variants to canonical names
4. Unknown genres pass through as-is (never silently dropped)
5. Store as comma-separated string e.g. `"bollywood,rap"`
```python
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

## Multi-User Setup

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

TuneLog includes a FastAPI backend that exposes SQLite data to the React dashboard.

### Stack
- **FastAPI** — Python REST API server
- **React + TypeScript + Vite** — frontend dashboard (TailAdmin base)
- **SQLite → FastAPI → React** — all data flows server-side, frontend only receives pre-computed results

### Running the API
```bash
cd backend
uvicorn api:app --reload --port 8000
```

### Endpoints

#### `GET /api/ping`
Health check. Returns `{"status": "OK"}`.

---

#### `GET /api/stats`
Main dashboard data endpoint. Queries both `tunelog.db` and `songlist.db`.

| Field | Source | Description |
|---|---|---|
| `total_songs` | `songlist.db` | Total songs in library |
| `total_listens` | `tunelog.db` | Total listen events logged |
| `signals` | `tunelog.db` | Count per signal type (skip/partial/positive/repeat) |
| `most_played_artists` | `tunelog.db` | Top 10 artists by play count |
| `most_played_songs` | `tunelog.db` | Top 10 songs by play count with title, artist, count |

---

#### `GET /api/sync/status`
Returns current sync state and library statistics.

| Field | Source | Description |
|---|---|---|
| `total_songs` | `songlist.db` | Total songs in library |
| `explicit_songs` | `songlist.db` | Songs with confirmed explicit tag |
| `last_sync` | `songlist.db` | Timestamp of most recently synced song |
| `is_syncing` | `library.py` | Whether sync is currently running |
| `progress` | `library.py` | Current sync progress (0–100) |
| `auto_sync` | `library.py` | Hour of day set for auto sync |
| `use_itunes` | `library.py` | Whether iTunes API is enabled for next sync |

---

#### `GET /api/sync/start?use_itunes=false`
Triggers a manual library sync.

| Param | Type | Default | Description |
|---|---|---|---|
| `use_itunes` | bool | false | If true, fetches explicit tags via iTunes API (slow ~35 min). If false, fast sync (~2 min) |

Sets `library._startSyncSong = True` — `main.py` picks this up and runs `sync_library()` in a background thread.

Returns `{"status": "started"}` or `{"status": "already_syncing"}` if sync is already running.

---

#### `GET /api/sync/setting?auto_sync_hour=2&use_itunes=false`
Updates sync settings in memory.

| Param | Type | Default | Description |
|---|---|---|---|
| `auto_sync_hour` | int | 2 | Hour of day (0–23) for automatic daily sync |
| `use_itunes` | bool | false | Whether to use iTunes API during auto sync |

> Note: Settings are stored in memory only — they reset on restart.

---

#### `POST /auth/login`
Authenticates against Navidrome and saves user to TuneLog's user DB.

**Request body:**
```json
{ "username": "admin", "password": "yourpassword" }
```

**Response:**
```json
{ "status": "success", "JWT": "<navidrome_token>" }
```

Verifies credentials against Navidrome's `/auth/login`. On success, saves user to `users.db` if not already present and returns the Navidrome JWT for session storage.

---

#### `POST /admin/create-user`
Creates a new user in both Navidrome and TuneLog's user DB.

**Request body:**
```json
{
  "username": "newuser",
  "password": "pass123",
  "isAdmin": false,
  "admin": "admin",
  "adminPD": "adminpass",
  "email": "",
  "name": "New User"
}
```

Flow: validates admin credentials via Navidrome JWT → creates user in Navidrome via `/api/user` → if Navidrome confirms success, inserts into `users.db`.

---

#### `POST /admin/get-users`
Returns all users registered in TuneLog's `users.db`.

**Request body:**
```json
{ "admin": "admin", "adminPD": "adminpass" }
```

**Response:**
```json
{
  "status": "ok",
  "users": [
    { "username": "admin", "password": "...", "isAdmin": true }
  ]
}
```

---

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
