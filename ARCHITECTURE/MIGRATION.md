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

## After detection





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


