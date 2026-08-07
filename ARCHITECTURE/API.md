# APPLICATION PROGRAMMING INTERFACE 



## Users 
previously, Users had to manually add users, that would get saved in the `users.db`

Now changing it to use, `/api/user` endpoint of navidrome.
This endpoint returns all the users in navidrome. My plan is to get users from Navidrome, And display it in login page, The user will choose a user in UI and then enter password to login.


## AUTHENTICATION

Previously, To ship the UI fast i used a make shift authentication system. 
Now, I am refactoring it to use JWT tokens, and Navidrome for verification.
Changing to HttpOnly cookies

Here's how the new auth will work: 
- User logs with their Navidrome creds from frontend, 
- Backend will take the username and password, and verify it with `user.db`.
- If `user.db` does not have password, or token from Navidrome, The backend will verify it with Navidrome And save it in `user.db`.
- If creds are valid, The backend will generate a JWT token and send it to frontend
- For next n minutes(30), Jwt will be used for validation instead of Navidrome itself.
- Reducing the number of calls to Navidrome, and improving security.


## Playlists  

I encountered a problem, I switched from subsonic to Navidrome for Auth, now Navidrome need token for API calls.
My old code such as `push playlist` that send the song ids to Navidrome for Playlist creation doesnt work anymore.
The old code needed `username` and `password` to be sent to Navidrome as subsonic API.
One way to solve this is just by decrypting the password from db and send it as old, but this creates a security risk and futher more,  I am thinking of switching from subsonic to Navidrome API for everything. I am Planning to make it Navidrome only.
I will have to remap whole push playlist func

### Frontend Playlist Fetching

Before the make shift playlist fetching was using diffrent ways to fetch in every diffrent playlist types. Like blend was fetching from backend's database, discovery was fetching from Navidrome API after fetching playlist id from backend's database.
Now changing it to so that every playlist type fetches in a single unified way.

1st, the Frontend will fetch playlist ids from backend, then using playlist id, it will fetch playlist tracks from backend using `/api/playlists/{playlist_id}/tracks`




### Descision 

I encountered a problem, What to do, the problem is that if a user is in Navidrome, I can create playlist for them, using cred of diffrent admins. 
For example, if there is three users, `user1`, `user2`, `user3`,  where user2 is admin, and user1 is trying to create playlist for user3, backend has no way to know which user is trying to create playlist for which user. 
And another problem, if user1 is trying to create playlist for user3, assuming that user3 has never logged in tunelog, the backend has no token or cred for user3 to create playlist for user3, in this case i can make it so backend uses which ever admin's cred is present, in this case user2's token, 

> What i think is to let frontend not know about other users if its not a admin, and for the other problem, i can do it so that if user3 is never logged in tunelog, then tunelog will not be able to create playlist for user3. 


### Navidrome Proxy

Created a proxy for fetching cover art, instead of giving base url, and sending creds for every request. now the frontend will send a get request to backend with song id for cover art. 