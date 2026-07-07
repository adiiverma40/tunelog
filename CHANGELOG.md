# Changelog

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

