# ALGORITHMS

## WATCHER 



## LOG HISTORY
The Log history func used to log the history in database. But now it is changed to log score as well 


## SCORING CORN
This function is used for Scoring and writing that in Database for a song. 
The basic algo is following

1. Fetch Unique `Song Id`  And `Count` For each song id
2. From heighest to low, Fetch All the History of all the  Song Id in loop
3. Score it, 
4. Use Executemany to update them
5. And repeate

So it will look something like this: 

Fetch uninque songs and its count-> From high to low, Fetch history of those unique songs -> Calculate the score -> use ExecuteMany to update -> Repeate

Some Things to keep in mind:
- **Always overwrite** : If a Song has any missing score, drop every other score and calculate again, why? cause of data inconsistancy
- **Run As bg Corn**

## n Skip timeout
The work of this Algo is to timeout a song after n(3) skips interaction.
This is to prevent the song from high listen count and score to get many skips to stay out of the Playlist, If a song has 50 score, it would need to be skipped 25 times

The minimum listen count required for timeout is 10 listens. 

1. Added `timeout` table to database
2. Added `timeout` function to write to database




## PLAYLIST: TUNELOG

The `Tunelog Blend` Playlist remap. 
It is working as follow. 
1. Get config
2. Get Listen history from database
3. Score them 
4. Get genre injection
5. Build Playlist 
6. Push Playlist 

**PROBLEM:** This add a `rich get richer problem`(issue : #18). The songs with higher listen and score will always be at the top and at one point it will stop new songs from comming in the playlist

**SOLUTIONS:**
The 1st solution is to decrease the score addition the higher the listen count is.
For a song with 1 listen will get +2 while a song with 20 count will get +0.5


**REFACTOR:**
1. Add score directly in db using the func `calculate_dynamic_score`