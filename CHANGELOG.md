# Changelog

## 8th August 2026

## changes
- migration clean up
- added whats new in UI
- Added check for `# VITE_API_URL=http://192.168.29.118:8000  ` is user has not yet migrated
- when user is not authencticated, server returns "" and thread fails

## 6th August 2026

## Migration
Migration script is ready. its the 1st version so there will be some ineficncies. I will fix those in future versions.

## Changes
- Implmented Migration
- Added code for migrating database
- Clean up. 

## 5th August 2026
## Side note

I fucking spend 30 minutes styling the terminal logs, i hate it, yet i dont regret it 


colors : purple
```bash
[Migration](v0.63.2):: Migration Starting ::
[Migration](v0.63.2):: Fetching ND song :: Freestyle #2
[Migration](v0.63.2):: ND returned :: 4 responses
[Migration](v0.63.2):: Matching Responses ::
[Migration](v0.63.2):: S5PGda4hMEA9Asrvotx5pi :: WYM Freestyle :: Doja Cat
[Migration](v0.63.2):: score: 72.0
[Migration](v0.63.2):: egvYZuzMQRluW5XE2n1TCz :: Freestyle (#2) (live at Tramps,
New York, 1999) :: Eminem  
[Migration](v0.63.2):: score: 40.67796610169492
[Migration](v0.63.2):: tEQLEjlEocngDm8AAJbw3W :: 2009 BET Hip Hop Awards 
Freestyle :: Eminem  
[Migration](v0.63.2):: score: 40.0
[Migration](v0.63.2):: MvOdbDJGEfRAydNx6fAZJS :: Freestyle #2 :: Eminem  
[Migration](v0.63.2):: score: 100.0
[Migration](v0.63.2):: Match Found :: 
:: ND: MvOdbDJGEfRAydNx6fAZJS :: DB: MvOdbDJGEfRAydNx6fAZJS :: 100.0%
```

>  I am proud of it, but there is some imporvementes that can be done, i will do it later 

## Bug:
- when the 1st user, probably admin login, there is no `isAdmin:true` in user db, so auth fails. 
- LB token not being saved correctly, cause frontend doesnt send user of the logged in user

## Fix:
- For now, i made it so db returns, a `nd token`, its only being used to fetch other users details form navidrome. So it doesnt matter if its not admin's token. 
- Its a hacky fix, i will fix it better later, right now the deadline is apporaching, the navidrome migration is the main focus.
- LB token fixed, by sending httponly cookie and getting username of logged in user from there
## 4th August 2026
I reinstalled arch, my whole time went there..




### Working
I am starting to work in the `migration` code for `navidrome`'s version greater then `v0.63.2`. According to Issue [#21](https://github.com/adiiverma40/tunelog/issues/21)

### Changes:
- Changed cred and user sync to verify and sync all the user for which password is present not only the admin
- removed unsed function from frotnend code
- removed old covermap system
- removed old coverart fetching 

## 3rd August 2026
### BUG:
- The old way to `push playlist` was using subsonic api, now i am shifted to navidrome, unlike subsonic, navidrome doesnt provide a way to regenerate playlist, so you will have to delete the songs in playlist then repush new songs. 
To do this, Navidrome uses `delete` method to `/api/playlist/{id}/tracks?id=1` endpoint

- The navidrome internal api returns status code `500` instead of `404` for not found, changing worker to handle it.
### Changes:
- Removed getSong Api from frontend.
- Added playlist id fetch instead of only discovery id 
- Added playlist fetch from navidrome in backend
- Added playlist tracks fetch from navidrome in backend
- Changed discovery playlist to use new way to fetch playlist
- Adding `delete` method in navidrome worker
- Adding regenreat option in new push playlist
- Added ND token saving in user db
- Added user profile api for user profie fetching such as name, username, avatar
- fixed user profile not loading image


## 2nd August 2026

### Shame
When i was creating the frontend, I rushed it and cramped all the apis in a single API.ts file, i regret that choice but its too big to do it manually, I used Claude ai to refactor the API into separate files, I am ashamed of this


### Changes:
- Switching from Subsonic to Navidrome API For Playlist creation
- Added new push playlist
- Added new api push playlist
- Changed to make it so only admin get to see all other users
- Refactored single API files into separate files, (Used Claude ai to refactor)
- Changing ND worker's get method to return image data properly
- Changing back to using direct navidrome api call from backend instead of worker, worker is slow
- changing complete



## 1st August 2026
### Changes:
- switching to HttpOnly cookies
- Changing `vite.config.ts` to use `VITE_URL` env var to set server host and port
- In `Push playlist` chaning to use token instead of username/password
- Changed API to use credentials from httpOnly Cookings, 

### Cleanup:
- Removing commented out code, 

### Bugs:
There are many bugs thats needs to be fixed, I will do it one by one, But for now, I made it usable. Some features might not work, 






## 31st July 2026
### Realisation:
- I blamed `/auth/login` endpoint but the real culprit was `getJwt` function that was called when getting users data, causing multiple requests simultaneously for n users, like 10 request in less then a sec
- I was an idiot to just make shift the auth when i was creating frontend..... I am ashamed



## 30th July 2026
### Added:
- `Misc.py` in Navidrome to Add functions that i dont know where to put
- Automatic user sync at the startup to sync users with Navidrome and remove hassle of manually Adding users



### Changes:
- Rate limit check commented out in `ND_Worker` As the entire Backend depends on Navidrome and Navidrome always reports 1 request per second, It was blocking, SSE Watcher, Auth check from Navidrome to Frontend, and other requests to Navidrome.


### Bug:
- The Frontend checks for login auth, multiple times in less then a sec causing Navidrome to rate limit
```bash
tunelog-backend   | Login attempt: 1 :  1785433656.33853
tunelog-backend   | Login attempt: 2 :  1785433656.3991342
tunelog-backend   | Worker API Error: 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | [WORKER](ERROR) : 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | Worker API Error: 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | [WORKER](ERROR) : 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | Worker API Error: 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | [WORKER](ERROR) : 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | Login attempt: 3 :  1785433659.8754923
tunelog-backend   | Worker API Error: 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | [WORKER](ERROR) : 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | Worker API Error: 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login
tunelog-backend   | [WORKER](ERROR) : 429 Client Error: Too Many Requests for url: 
tunelog-backend   | http://navidrome-navidrome-1:4533/auth/login

```

### Fix:
- Used a cached machanic if time is less then 2 seconds, to avoid multiple login attempts, returning the cached response instead of making a new request 
- I have planned to Add a proper fix when refactoring Login page. 
- frontend caching didnt solve it, Adding backend Caching as well
- Increased time.sleep for navidrome worker to avoid 429 errors


## 29th July 2026
### Bug Fix:
- Added proper integration of `ND Worker`

### Added:
- Added Navidrome worker `ND_worker`
- Check for cred in `.env` 
- Save `token` to database


## 24th July 2026
### Added:
- Tier Playlist v1
- A simple Ui to create tier playlists
- Added `timeout` table to database
- Added function to Add `timeout` to database

## 23rd July 2026
- Removed the timeout of 1 sec. This timeout casue to incorrectly report pause and play if user play and pause within a sec 

## 21st July 2026
- Added a timeout of 1 sec before next watcher gets called, before it was firing multiple times(3), it was not bad but it was annyoing to see in the logs 


## 20th July 2026
- Cleaning Up playlist generation 
- Diffrentiating playlist based on type to sepearate files 


## 15th July 2026
### Implementation
- CORN JOB FOR SCORING 
- CORN JOB to Save scoring 
- Changed Playlist generation to use Score From DB instead of calculating dynamically
- Added better logic for scoring
- Added better logic to find song with Null as score


## 14th July 2026
### Implementation
- `Luffy` as a manager to manage the worker threads
- `MB_worker`
- Inherit a `BaseQueue` class to other class
- Increased worker timeout to 10 min
- Added try..execpt block and error boundary for `queue.Empty()` 
- Changed the `watcher` and `log_history` from main to `navidrome.watcher` 
- Added `score` row in `tunelog.db`
- Added logic to Add `score` of listens(read in ALGO.md)

### Changes
- refactoring existing way to pool listenbrainz and musicbrainz to Worker 

> The code are in a mess, I would mind if it doesnt fail. 

## 12th July 2026
- Changed PushStarLB to use worker
- Added a `Background Worker Queue` for task that doesnt need imideate response
- I discovered `Python's GIL`, Increasing Reporting `Timeout` of `uvicorn` server from 30 to 120 as other `threads` were not giving time to report back hence exiting the program
- Added `POST` and `on_success` in `LB_worker`

## 9th July 2026

### Changes
- As it turns out i dont need asyncio.queue Normal queue works fine
- Changes Scoble/Listenbrainz to use Consumer/Producer model
- Implemented basic Worker Model
- In LB_worker switched to request.session for long handshakes and multiple 
- Added a tiny 0.2 wait for every worker requests

## 7th July 2026

### Changes

- Created a worker folder
- Created a basic priorty queue using asyncio
- Defined a basic class for the queues 

## 6th July 2026

### Changes

- Added Grace perido when initializing the project/docker container to not overload the cpu
- Removeed unwanted logs
- Previously `LB token` And `username` were stored diffrently, `username` in `config` and `token` in `db`, now removed the config username and used listenbrianz's ping to get username and store in `users.db`
- Added `config` and `master.key` in gitignore
- Created Sepearate `MD` files for Frontend, backend, algorithm, changes, Ideas, and dropped Ideas Instead of a whole clusted mess of `Algorithm.md`. All these files are empty, I will fill them as learn

