# Migration

This file contains the docs for migration codes for `navidrome` or any other exteranal APIs.

# Navidrome v0.63.2

Here are the migration code and my reason behind it explained.

## What is the migration?

The migration that is happening in `navidrome` v0.63.2 is of `song_id`. They are changing from the random song id to a 128-bit base62 encoded string. 

you can read more in the [navidrome pr 5824](https://github.com/navidrome/navidrome/pull/5824)


## How to detect?

we can detect the migration by using two methods, 

1. Navidrome's server version: When doing a GET request to `/rest/ping` endpoint, the server will return the version of the server.

```json
{
    "subsonic-response": {
        "status": "failed",
        "version": "1.16.1",
        "type": "navidrome",
        "serverVersion": "0.63.0 (6c95a66a)",
        "openSubsonic": true,
    }
}
```
2. Song ID format: we can fetch a `song_id` from Navidrome, and the check format of the song_id, if the formate is base62 encoded, then it is likely that the migration has occurred.

**Better version**: We can combine methods 1 and 2 to detect the migration. we can first check sever verison if its greater then `0.63.2`, then we can assume that either migration is running or has already occurred. we can futher be more sure by checking the song_id format.

## File Structure

```text
.
├── Migration
│   ├── __init__.py
│   ├── runner.py
│   └── v0_63_2.py
```

**Runner.py**
Runner file will contain the manin function that will run the migration and the be imported by the main file.




## Migration Algorithm

The migration will work like this:
1. fetch a random song_id, title, artist from db
2. fetch the song details from navidrome using title, 
3. use fuzzy match to match the title from ND to the title from the db
4. if score is less then 95% assume the song is not found in ND, and skip it, and redo until a match is found or the threshold is reached
5. After the match is found, check if songId matches the songId from db. if it does then stop the migration or try a lil later again if version is greater then `0.63.2`
6. if songid does not match, meaning the migration has done. 
7. Then, create a new column, old_song_id, copy the old song id, and then  
8. Refresh the library db. this will make it so that library db has new song ids, 
9. Now, using library db as source of truth, we can updated the rest of dbs using old_song_id to map the new song id, This will be faster then fetching from ND for each song.


### Migration table

Instead of adding a new column in `library` table i will create temp table, cause i can alter it without affecting the running system. 
After creating new table, i will copy songID from library to new table as `old_song_id`. And then Run the library sync script. 


### Problem

After filling the migration table with old song id and fetching the new song id from ND, how will we know which old id belongs to which new id?
We can not use `mbzid` cause Every song might not have a `mbzid`.
Instead, i have thought of using `path` of the song as identifier, This solves the problems but introduces a new problem that if any file moves it will crash.

### Path edge case

We can Solve the new problem by using `tunelog.db` as the source of truth for songs that get messed up, meaning, if a song's path changes, That song id will not have new songid. 
After the migration table is filled, we can use tunelogdb to get title, artist and album of that song,
1. If tunelog doesnt have that entry meaning the song is new and we can skip
2. if tunelog has it, we can use it to query library db to get new song id. 