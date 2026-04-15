
#  TuneLog
**A self-hosted music recommendation system for Navidrome.** TuneLog learns your taste by watching how you actually interact with your music tracking skips, finishes, and replays to build evolving, personalized playlists without you ever touching a "Like" button.

---

## Update :
It is recommened to delete or alter the existing database to inculde the changes
Changes : two new tables in songlist.db,  
- in library table, new colmns : `artistId` ,  `albumId` , `artistJSON`
  
The new update includes a proxy layer between navidrome and the client,
- It can improve search results
- Added a new `lyrics` search option, when you search songs, with the lyrics, if the song has lyrics it will be in the results
- Using the `tunelog` history of listens, the search results can be ranked.
- A improved searches for songs like `AAAHHHHA! MEN` now you only need to type `ah Men` for the result

## Proxy :
Proxy layer is optional, but recommened, I am planning future updates based on the proxy layer

### Setup :
- TO set up proxy, define `PROXY_PORT` in `.env` or defaults to `4534`
- In subsonic/navidrome client, change server url to match the `port`
- Done
All the url request will be routed through `proxy to navidrome` , when any search request comes it will use `my script` or fallback to the Default `navidrome results`
It is recommened to run both servers in `same computer` or will might see `latency issue`
  
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
* **Proxy** `http://localhost:4534`
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
MY_DOMAIN=localhost


# Allowed origins to make api request to backend
# This is to allow user to access website form diffrent ip or devices,. just add your ip here 
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.29.118:5173   #add more as you need or add * to allow everyone



# Logging 
# Forces the logs to save exactly where Docker is listening for the volume mount
LOG_DIR=/app/logs
LOG_MAX_SIZE=10 MB
LOG_RETENTION_DAYS=7 days
LOG_LEVEL=DEBUG


# Proxy for search result alteration in clients 
PROXY_PORT=4534

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
5. Do a full library scan inside navidrome 

> Note: if you have diffrent tag for your own need, i m currently trying to add that to this, i planned to give a option to add your custom tag

## Warning
- I think i implemented musicbrainz api as it was written in the docs but i got ip blocked, if you are dev, can you review it? if you are user, try using vpn before doing fuzzy matching 

## TODO:
- ISSUE : after reviewing playlist.jsonl, if a song has plays, and was choosen because of unheard pool or genre injection, meaning its faling 
- Cold start: in ui. ask user to give location of navidrome.db, using db as a reference map out the past listen history, using the tunelog.db and navidrome.db check if the navidrome last listen song is in tunelog.db if not then add it in tunelog.db with score of 1 for every plays, song a with 5 plays will get score of 5 to counter the cold start probelm
- Add A proxy btw client and navidrome backend, when client search for any music, intercept the request, use lyrics and tunelog db to suggest the best songs 'the weekend' look for most heard song of artist in tunelog db as well as song that contain it in lyrics

- Add Auto playlist reload
- Add config for all the settings
- Add music sessions
- Add Mood detector - 5 skips in a row means bad mood
  


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



## **Gloabal configration**
Added a page to change the global config of the backend, like every variable that user can use
## **Genre injection rework** 

Before genre injection used to get all distcint genre from `tunelog.db` then make ratio , and inject those ratio from `songlist.db`

 - currently it takes genre, (hindi ost, rap) converts  it in hindi ost , rap, gets ratio of hindi ost and rap from listens and inject them
 - this creates ineficeny, i changed my method of genre mapping, now i dont write genre in db according to genre.json but i take that and

Now : - 
 - create a `translation` layer in `playlist`, 
 -  get all `distinct genre`
 -  use `genre.json` (if there is no genre.json thne use og genre) as refrance and map them , `hindi ost , rap` to `bollywood , rap`
 -  then using this count ratio, now get all song from library , song id and genre 
 -  map the genre using genre.json , 
 -  calculate the unheard song , 
 -  get the genre needed from the pool , if needed genre are bollywood - songs, rap - 4 songs, and a song has bollywood, rap as the mapped genre, give priorty to iter
 -  and then decrease the pool bollywood 4 , rap - 3 song, but doing so will create a risk of less song in playlist so we will inject two song of unknown genre, and 
 -  the rest will go to artist injection(new) , artist injection will do this, take all the artists from listens, then calculate the ratio, finds the artist which
 -  which is listened the most artist(60%) and least artist(40%) and inject 1 song from the artist and that user has never listened, till the list of artist is exchausted
 - might encounter multiple artist (badsha , honey signh) , count them as separate artist and separate ratio,
 - if still pool is empty then god knows what cause i sure dont


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


### Notification
Uses an SSE to report event live to the frontend notification section


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
