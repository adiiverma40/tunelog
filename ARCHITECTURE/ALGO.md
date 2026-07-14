# ALGORITHMS

## WATCHER 



## LOG HISTORY
The Log history func used to log the history in database. But now it is changed to log score as well 



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