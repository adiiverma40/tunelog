This Note shows the Future Ideas and Plans for **Tunelog** project

## Listenbrainz - YTDLP

The Idea is to show a demo song to user from the data fetched from listenbrainz collabrative fillering And youtube music. The main idea is that a user cant have all the songs, so after listening a demo they can add them 

The basic Workflow is to do this : 
- Fetch LB-CF
- Detemine which songs are in library
- Assign a temp songId to not library song, prefeably, yt-mbid
- Create a Fake Playlist consist of the songs
- When used thourgh the **proxy**, send the songs from Tunelog Db after changing Navidrome's response
- when song is played, using **ytdlp** fetch the youtube music audio stream of the songs
- Server the song stream 
- If able to get whole song link instead of just stream server that
- If only stream use **FFMPEG** to generate a stream link to usable audio



## LIDDARR ADD

The Basic Idea is that after listening to a demo song, if they star the song, the song will get queued in `LIADDAR` For Downloading and the rest will be taken care by the liddarr and user's config

Workflow: 
- Using the Proxy, If user Star the song with a songId of yt-mbid 
- Stop the star request, 
- Add them to Lidarr