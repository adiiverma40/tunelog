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

## Project Structure
```
TuneLog/
├── main.py          # entry point — watcher loop + playlist trigger
├── playlist.py      # scores songs, builds + pushes playlist to Navidrome
├── library.py       # syncs full song library from Navidrome into SQLite
├── db.py            # SQLite schema and connection helpers
├── config.py        # builds Navidrome API URLs + per-user credentials
├── .env             # your credentials (never commit this)
├── .env.example     # template — copy this to .env
└── Data/
    ├── tunelog.db   # listen history (auto-created)
    └── songlist.db  # full library cache (auto-created)
```

## Requirements
- Python 3.10+
- Navidrome instance (local or remote)
- Docker (optional, recommended for Navidrome)

## Setup
**1. Clone the repo**

**2. Download requiremnets**
```bash
pip install -r requirements.txt
```

**2. Configure your environment**
```bash
cp .env.example .env
```

Edit `.env` with your Navidrome details:
```env
base_url=http://localhost:4533
admin_username=your_admin_username
admin_password=your_admin_password

# per-user credentials for personalised playlists
USER_youruser=youruser
PASSWORD_youruser=yourpassword
```
**3. Change the Size of playlist**

Change the playlist size from `playlist.py`

```python

PLAYLIST_SIZE = 10
```

**4. Run**
```bash
python main.py
```

TuneLog will:
- Start watching what's playing every 5 seconds
- Log listen history to SQLite
- Automatically regenerate personalised playlists every hour (when no one is playing)

## Playlist Generation
Playlists are pushed directly to Navidrome and appear under each user's account as **"Tunelog - username"**. They are private — only visible to the playlist owner.

Slot distribution dynamically adjusts as your library gets explored:

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
- [ ] Web UI dashboard

## Why TuneLog?
Most self-hosted music servers either have no recommendations or rely on external APIs like Last.fm. TuneLog is fully offline, stores everything locally, and is built around implicit feedback — your listening behaviour is the only input needed.

---
> Built for Navidrome. Inspired by how early Last.fm and Spotify worked before they had millions of users.
