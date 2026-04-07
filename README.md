#  TuneLog
**A self-hosted music recommendation system for Navidrome.** TuneLog learns your taste by watching how you actually interact with your music tracking skips, finishes, and replays to build evolving, personalized playlists without you ever touching a "Like" button.

---
## New Update will come after new version of navidrome 
- Navidrome new version will include  `now playing` endpoint which will futher increase the accuracy of my project

##  Getting Started

### 1. Prerequisites
* **Navidrome** instance (Running and accessible via API).
* **Docker & Docker Compose** (Recommended) OR **Python 3.10+**.
* A Navidrome client that supports scrobbling/Now Playing reporting.

### 2. Installation (Docker - Recommended)
>  **Critical:** Docker and manual runs (`python main.py`) are mutually exclusive. Docker marks the `data/` folder as `rootowned`. If you switch between them, run `sudo chown -R $USER:$USER data/` to fix permissions.

### DOCKER
- This will create two containers, use manual way if you dont want that

```bash
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
- Use this if you dont want to run two containers

```bash
git clone https://github.com/adiiverma40/tunelog
cd tunelog
```
- Backend
```bash
cd backend

pip install -r requirements.txt

python3 main.py
```
- Frontend
```bash
cd frontend

npm install 

npm run dev
```

### .env
`issue #3`
by default port `5173` of localhost is allowed to access the backend api, to add more devices or ip, add it in `.env`

```bash
#Navidrome Server
BASE_URL=http://192.168.29.118:4533 #Chnage your ip 
ADMIN_USERNAME=adii # change username
ADMIN_PASSWORD=1234 # Change password

# Frontend / API
VITE_API_URL=http://192.168.29.118:8000 # change ip


# Allowed origins to make api request to backend
# This is to allow user to access website form diffrent ip or devices,. just add your ip here 
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.29.118:5173   #add more as you need or add * to allow everyone



# Logging 
# Forces the logs to save exactly where Docker is listening for the volume mount
LOG_DIR=/app/logs
LOG_MAX_SIZE=10 MB
LOG_RETENTION_DAYS=7 days
LOG_LEVEL=DEBUG

```
- You can get your ip address by doing, `ipconfig` in windows and `ip a` in linux or use `localhost` if its works for you


### Additionally 
`issue 5`
To improve efficieny and better artist mapping you can add a `custom tag` for navidrome

Steps : 
1. locate your `navidrome` folder.
2. go to `data` folder
3. Create a `navidrome.toml` file
4. Add the following
```bash
Tags.Artist.Aliases = ["artist", "artists"]
```

> Note: if you have diffrent tag for your own need, i m currently trying to add that to this, i planned to give a option to add your custom tag


## How It Works
TuneLog uses **Implicit Feedback**. Instead of manual ratings, it watches "Signals" via the Navidrome SSE (Server-Sent Events) stream to judge your interest.

### The Signal System
- Can Be changed

| Behavior | Signal | Weight | Logic |
| :--- | :--- | :--- | :--- |
| **Skipped < 30%** | `skip` | -5 | Heavy penalty; removes from high-rotation. |
| **Played 30–80%** | `partial` | +1 | Interest shown; kept in "Discovery" rotation. |
| **Played 80–100%** | `positive` | +2 | Solid interest; increases playlist frequency. |
| **Replayed < 24h** | `repeat` | +3 | Highest signal; moves to "Heavy Rotation." |

### Smart Playlist Generation 
- Can be changed from DashBoard
* TuneLog manages a balanced "Diet" of music across several slots:
* **Scored Songs:** Ranked by (Signal Weight × Recency Decay). Yesterday's favorite counts more than last year's.
* **Genre Injection:** Scans for unheard songs in your top genres (e.g., Bollywood, Rap) and injects them as discoveries.
* **Wildcards:** Resurrects "Lost Favorites" you haven't heard in 60+ days.
* **Second Chances:** Occasional re-exposure to "Skips" (configurable via UI) to account for changing moods.

- updated check architecture.md
---

### **Auto Genre Match**
Added a option to match genre automatically, this is needed for better genre injection of songs, if there is a messy genre in db, song recommended becomes in accurate.
- Currently there is no option for multiple genre like `rap, hip hop`
- you can create a category genre and map noisy genre in it,
- The Auto match features take the noisy genre and its data and matches it against genre in db, the one with heightest score gets added in Genre.json file
- you can get a sample genre from `architecture.md`
- If there is data in genre.json, when doing library sync, it will automatically change the matching genre to the category genre

---

### **CSV IMPORT**
Added a option to import playlist from csv files, you can download csv for spotify from [Exportify](https://exportify.net/).
- Currently I dont know how it works, My library has limited songs and Messy meta data, so I am getting matching results of 14 songs out of 50
- I havent tested with other csv file. But I think it can handle other files as well, as long as it have Title, artist name and album name
- For workings read `Architecture.md`

### **ERROR HANDLING**
Added better error handling, i took some help from ai
- `error.py` is now the entry point
- Using Supervisor pattern to ensure it dont crash when navidrome is down
- it will exit if `port 8000` is taken
- if `port  5173` is taken
- uses a heartbeat mechanism
For more info read architecture.md


### **Logging**
Added a loging system that logs the info, its purpose is to refine the playlist generation script better
- Before this i was not able to distinguish btw why this song was choosen to be in playlist and why this was not choosen
- This can also be used to get the reason of why script broke
- By default the scrip is set `INFO` for Main and `DEBUG` for playlist
- If you want to contirebute you can do so by sumbitting `playlist.jsonl` so that i can make the script better
 

### **Library Sync**
Library sync was intially used to get all the song from navidrome and store it in db for playlist genreation

Changes :
- Genre auto match : Intitally it was using `genre auto match` function to categories messy or noise genre in one catergory, removed it so that it wont change the db and db will be the `source of truth`
- Batch updating : Initially it was updating and commiting songs every 5 song creating a massive read and write, - fixed : by adding `batch : 100` for fast sync and `batch : 5` for slow sync(dont want the api result get waste if any error and batch is 100)
- Delete : if the song is deleted from navidrome during sync delete them from db
- Diffrance : if the song meta data and db meta data is diffrent taking `navidrome as source of truth` update db to the navidrome
- Artist : Change artist meta data form `issue #5` to include only artist name 

## Roadmap & TODO

- [] **Notification Bridge:** Real-time "Now Playing" popups on the React Dashboard.
- [] **Rnadom Song Toggle:** Add a Better toggle to turn of random song integration in playlist


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
