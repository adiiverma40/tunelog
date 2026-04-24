# TuneLog

TuneLog is a self-hosted music recommendation system for Navidrome. It learns from listening behavior such as skips, partial plays, full plays, and repeats to generate personalized playlists and improve search results.

### AI USAGES:
- AI were used in some `sql Query`
- Some part in debuggin and some assistance in building frontend like `socketio`
- Assistance in some of the `research` like which python module to use and stuff


## Features

- Personalized playlist generation from listening history
- Navidrome library sync
- Optional proxy layer for improved search and ranking
- Lyrics-aware search
- Fuzzy metadata matching
- CSV playlist import
- Logging and error handling
- Web dashboard and API backend
- Navidrome jam

### Navidrome jam
In the dashboard there is a jam section, if you wish to use jam go to jam and `now playing` section in the dashboard

**features**
- sync play , pause , skip
- Queue reorder
- Transfer host
- Chats for joined user - chats are not end to end encripted, do not share personal/private info
- Queue can be added from library or playlist
- In `config` you can toggle some features for jam like `only host reorder queue`, `only host clear queue` and more

**Requirements**
- Navidrome Running
- `VITE_NAVIDROME_URL` in .env for search and album arts
- All users in same server/dashboard

**Setup**
- Start the navidrome server
- start tunelog server and frontend
- go to dashboard
- do a library sync if havent
- Add or create users in users
- go to jam/nowplaying
- start jam
- users that have logged in the dashboard will see join jam option in nowplaying page,
- join it and enjoy


## Requirements

- Navidrome instance with API access
- Docker and Docker Compose, or Python 3.10+
- Node.js for the frontend if running manually

## Installation

### Option 1: Docker Compose

```bash
mkdir tunelog && cd tunelog
curl -o .env https://raw.githubusercontent.com/adiiverma40/tunelog/main/.env.example
curl -o ghcr-compose.yaml https://raw.githubusercontent.com/adiiverma40/tunelog/main/ghcr-compose.yaml
docker compose -f ghcr-compose.yaml up -d
```
**Update:**
```bash
docker compose -f ghcr-compose.yaml pull
```


Edit `.env` before starting the stack.

### Option 2: Build from source

```bash
git clone https://github.com/adiiverma40/tunelog
cd tunelog
cp .env.example .env
docker compose up --build
```

### Option 3: Run without Docker

Backend:

```bash
cd backend
pip install -r requirements.txt
python3 main.py
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Configuration

Update `.env` with your Navidrome details and the addresses you want to allow.

```bash
# Navidrome Server
BASE_URL=http://192.168.29.118:4533  # your navidrome ip
ADMIN_USERNAME=adii                  # your admin username
ADMIN_PASSWORD=1234                  # your admin password



# Allowed origins to make api request to backend
# This is to allow user to access website form diffrent ip or devices,. just add your ip here 
ALLOWED_ORIGINS=http://localhost:5173, http://192.168.29.118

# change the allowed origins as needed, use "*" for everyone



#Frontend / API 
VITE_API_URL=http://localhost:8000            # if local host doesnt work then use your server's ip
VITE_NAVIDROME_URL=http://localhost:4534      # Give here the proxy port if you want search enchancment
MY_DOMAIN=localhost

# Logging 
# Forces the logs to save exactly where Docker is listening for the volume mount
LOG_DIR=/app/logs
LOG_MAX_SIZE=10 MB
LOG_RETENTION_DAYS=7 days
LOG_LEVEL=DEBUG

# Proxy for search result alteration in clients 

PROXY_PORT=4534

```

### Optional Navidrome tag mapping

For better artist mapping, you can add this to `navidrome.toml`:

```bash
Tags.Artist.Aliases = ["artist", "artists"]
```

Then run a full library scan in Navidrome.

## Proxy mode

The proxy layer is optional. When enabled, client search requests are routed through TuneLog before falling back to Navidrome.

To use it:

1. Set `PROXY_PORT` in `.env` if needed
2. Point your client to the proxy port instead of Navidrome directly
3. Keep the proxy and Navidrome on the same machine when possible

## How it works

TuneLog uses implicit feedback from Navidrome activity to score tracks:

- Skipped tracks are penalized
- Partially played tracks get a small positive score
- Fully played tracks get a higher score
- Replayed tracks get the highest score

The playlist engine combines those scores with recency and discovery logic to keep playlists balanced.

## Project structure

```text
TuneLog/
├── backend/
│   ├── main.py
│   ├── playlist.py
│   ├── library.py
│   ├── db.py
│   └── Data/
├── frontend/
└── compose.yaml
```

## Notes

- If you switch between Docker and manual runs, fix permissions on `data/` if needed.
- Some features depend on Navidrome scanning and event support.
- Search quality depends on the metadata in your library.
- Speeding up or slowing down playback can affect listening detection.

## Credits

- Navidrome
- FastAPI
- RapidFuzz
- TailAdmin
