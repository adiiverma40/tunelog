# Changelog

## 15th July 2026
### Implementation
- CORN JOB FOR SCORING 
- CORN JOB to Save scoring 
- Changed Playlist generation to use Score From DB instead of calculating dynamically


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

