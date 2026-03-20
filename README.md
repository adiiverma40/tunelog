# TuneLog
A lightweight, self-hosted music recommendation system that learns your taste from how you actually listen — no ratings, no manual input.

# 🤖 AI Usage

This project was built by me, with AI assistance in specific areas:

- **SQL queries** — helped write and optimise some of the SQLite queries
- **Boilerplate code** — repetitive setup code like DB connection handlers and URL builders
- **Documentation** — README formatting and wording

The core logic — signal system, scoring formula, genre injection, playlist slot system, and architecture decisions — was designed and written by me.

## How It Works
TuneLog watches your Navidrome listening activity in the background. It tracks whether you skip, finish, or replay songs, and uses that behavior to build personalised playlists automatically — one per user.

| Listening Behavior | Signal | Weight |
|---|---|---|
| Skipped before 30% | skip | -2 |
| Played 30–80% | partial | +1 |
| Played to end | positive | +2 |
| Replayed after 10 min | repeat | +3 |

Scores are weighted by recency — a listen from yesterday counts more than one from 3 months ago.

Generated playlists include:
- **Scored songs** — ranked by signal weight × recency
- **Genre-injected unheard songs** — new songs from genres you already listen to
- **Wildcards** — songs you liked but haven't heard in 60+ days
- **Skip re-exposure** — occasional re-surfacing of skipped songs (tastes change)

## Stack
- **Navidrome** — self-hosted music server (Subsonic API)
- **Python** — watcher + playlist generator
- **SQLite** — two local databases (listen history + full library)
- **FastAPI** — REST API layer (early stage)
- **React + TypeScript + Vite** — web dashboard (early stage, TailAdmin base)

## Project Structure
```
TuneLog/
├── backend/
│   ├── main.py          # entry point — watcher loop + playlist trigger
│   ├── playlist.py      # scores songs, builds + pushes playlist to Navidrome
│   ├── library.py       # syncs full song library from Navidrome into SQLite
│   ├── db.py            # SQLite schema and connection helpers
│   ├── config.py        # builds Navidrome API URLs + per-user credentials
│   ├── api.py           # FastAPI backend — exposes SQLite data to dashboard
│   └── Data/
│       ├── tunelog.db   # listen history (auto-created)
│       └── songlist.db  # full library cache (auto-created)
├── frontend/            # web dashboard (TailAdmin + React + Vite)
│   ├── src/
│   └── ...
├── .env                 # your credentials (never commit this)
├── .env.example         # template — copy this to .env
├── compose.yaml         # docker compose for backend + frontend
└── Dockerfile
```

## Requirements
- Python 3.10+
- Navidrome instance (local or remote)
- Docker (optional, recommended for Navidrome)

## Setup

### Web UI (early stage — work in progress)

> ⚠️ The web dashboard is in early development. Data is connected but UI still needs significant polishing. Not production-ready.

**1. Start the API server**
```bash
cd backend
pip install fastapi uvicorn
uvicorn api:app --reload --port 8000
```

**2. Start the frontend**
```bash
cd frontend
npm install
npm run dev
```

Dashboard will be available at `http://localhost:5173`. Requires the API server running on port 8000.

---

### Docker (recommended for backend)

> Note: Frontend is not yet integrated into Docker. Run it manually as above.

**1. Clone the repo**

**2. Configure your environment**
```bash
cp .env.example .env
# Edit .env with your Navidrome URL, credentials, etc.
```
**3. Run**
```bash
docker compose up --build
```

### Manual
**1. Clone the repo**

**2. Configure your environment**
```bash
cp .env.example .env
# Edit .env with your Navidrome URL, credentials, etc.
```
**3. Install dependencies**
```bash
cd backend
pip install -r requirements.txt
```
**4. Configure `.env`**
```env
base_url=http://localhost:4533
admin_username=your_admin_username
admin_password=your_admin_password

# per-user credentials for personalised playlists
USER_youruser=youruser
PASSWORD_youruser=yourpassword
```

For multiple users add the following in `config.py`:
```python
USER_CREDENTIALS = {
    os.getenv("admin_username"): os.getenv("admin_password"),
    os.getenv("USER_youruser"): os.getenv("PASSWORD_youruser"),
    ## Manually add as many users as you have
}
```

**5. Change playlist size**
```python
# playlist.py
PLAYLIST_SIZE = 10
```

**6. Run**
```bash
python main.py
```

> **Note:** If you are using a Navidrome client, turn on the scrobbling feature or it will not report back.

TuneLog will:
- Start watching what's playing in real time via SSE
- Log listen history to SQLite
- Automatically regenerate personalised playlists every hour (when no one is playing)

## Playlist Generation
Playlists are pushed directly to Navidrome and appear under each user's account as **"Tunelog - username"**. They are private — only visible to the playlist owner.

| Slot | Share | Notes |
|---|---|---|
| Unheard (genre-filtered) | up to 35% | shrinks as library gets explored |
| Positive | ~20% | songs you finished |
| Repeat | ~20% | songs you came back to |
| Partial | ~12% | songs worth another chance |
| Wildcard | ~8% | good songs not heard in 60+ days |
| Skip | ~5% | rare re-exposure |

## Database
![Database](Screenshots/tunelog_db.png)

## Playlist
![Playlist](Screenshots/playlist_1.png)

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

## Why TuneLog?
Most self-hosted music servers either have no recommendations or rely on external APIs like Last.fm. TuneLog is fully offline, stores everything locally, and is built around implicit feedback — your listening behaviour is the only input needed.

---
> Built for Navidrome. Inspired by how early Last.fm and Spotify worked before they had millions of users.

## Credits
- UI built on [TailAdmin React](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard) (MIT)
