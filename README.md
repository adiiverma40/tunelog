#  TuneLog
**A self-hosted music recommendation system for Navidrome.** TuneLog learns your taste by watching how you actually interact with your music tracking skips, finishes, and replays to build evolving, personalized playlists without you ever touching a "Like" button.

---

##  Getting Started

### 1. Prerequisites
* **Navidrome** instance (Running and accessible via API).
* **Docker & Docker Compose** (Recommended) OR **Python 3.10+**.
* A Navidrome client that supports scrobbling/Now Playing reporting.

### 2. Installation (Docker - Recommended)
>  **Critical:** Docker and manual runs (`python main.py`) are mutually exclusive. Docker marks the `data/` folder as `rootowned`. If you switch between them, run `sudo chown -R $USER:$USER data/` to fix permissions.

```bash
# Clone the repository
git clone https://github.com/adiiverma40/tunelog
cd tunelog

# Configure environment
cp .env.example .env
# Edit .env with your Navidrome URL and Admin credentials
```

**Launch the stack:**
```bash
docker compose up --build
```
* **Web UI:** `http://localhost:5173`
* **API Server:** `http://localhost:8000`

---

### Manual 
```bash
git clone https://github.com/adiiverma40/tunelog
cd tunelog
```

```bash
cd backend
python3 main.py
```

```bash
cd frontend
npm run dev
```


## How It Works
TuneLog uses **Implicit Feedback**. Instead of manual ratings, it watches "Signals" via the Navidrome SSE (Server-Sent Events) stream to judge your interest.

### The Signal System
| Behavior | Signal | Weight | Logic |
| :--- | :--- | :--- | :--- |
| **Skipped < 30%** | `skip` | -5 | Heavy penalty; removes from high-rotation. |
| **Played 30–80%** | `partial` | +1 | Interest shown; kept in "Discovery" rotation. |
| **Played 80–100%** | `positive` | +2 | Solid interest; increases playlist frequency. |
| **Replayed < 24h** | `repeat` | +3 | Highest signal; moves to "Heavy Rotation." |

### Smart Playlist Generation
TuneLog manages a balanced "Diet" of music across several slots:
* **Scored Songs:** Ranked by (Signal Weight × Recency Decay). Yesterday's favorite counts more than last year's.
* **Genre Injection:** Scans for unheard songs in your top genres (e.g., Bollywood, Rap) and injects them as discoveries.
* **Wildcards:** Resurrects "Lost Favorites" you haven't heard in 60+ days.
* **Second Chances:** Occasional re-exposure to "Skips" (configurable via UI) to account for changing moods.

---

## Roadmap & TODO

### **High Priority**
- [ ] **Spotify/External Import:** Support CSV imports (via Exportify) with fuzzy matching to Navidrome library.
- [ ] **Dynamic Genre Multiplier:** Replace hardcoded aliases with calculated weights based on total listen time per genre.
- [ ] **Notification Bridge:** Real-time "Now Playing" popups on the React Dashboard.
- [ ] **Star Migration:** Import existing Navidrome Star ratings into the DB to solve the "Cold Start" problem.

### **Features & UI**
- [x] **Manual Marking UI:** Allow users to manually override a signal if the automation gets it wrong.
- [x] **Sync Progress Bar:** Real-time visual feedback for library syncing on the dashboard.
- [ ] **M3U Export:** Option to download the generated playlist for offline/legacy players.

---

## Project Structure
```text
TuneLog/
├── backend/
│   ├── main.py          # Entry point (Watcher loop + SSE listener)
│   ├── playlist.py      # Scoring logic & Navidrome API push
│   ├── library.py       # Library sync & iTunes metadata fallback
│   ├── db.py            # SQLite schemas (History & Library)
│   └── Data/
│       ├── tunelog.db   # Listen history & signals
│       └── songlist.db  # Full library metadata cache
├── frontend/            # React + TypeScript + Vite (TailAdmin based)
└── compose.yaml         # Docker orchestration
```

---

## Credits & Stack
* **Navidrome:** Self-hosted music server (Subsonic API).
* **FastAPI:** REST layer for the Dashboard.
* **RapidFuzz:** High-performance fuzzy matching for metadata.
* **TailAdmin:** Base for the React Dashboard UI.
