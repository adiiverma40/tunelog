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


