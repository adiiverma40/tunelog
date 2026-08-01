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