# ALGORITHMS

## WATCHER

## LOG HISTORY

The Log history func used to log the history in database. But now it is changed to log score as well

## SCORING CORN

This function is used for Scoring and writing that in Database for a song.
The basic algo is following

1. Fetch Unique `Song Id` And `Count` For each song id
2. From heighest to low, Fetch All the History of all the Song Id in loop
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

Here is the updated README section you can add to your repository. It highlights the introduction of the new Tiered Playlist feature while clearly communicating that the classic Blend logic remains fully intact and optional.

---

## Playlist Generation Methods

TuneLog supports multiple methods for generating your personalized playlists. You can choose between a curated single-mix experience or a comprehensive multi-tiered library breakdown.

### 1. Standard Blend Playlist (Classic)

The original TuneLog Blend logic remains completely unchanged. This method creates a single, highly curated playlist by mixing your top tracks with discovery elements. The workflow operates as follows:

- Retrieves your configuration and listen history from the database.
- Scores your songs based on repeat, positive, partial, and skip signals.
- Injects wildcard tracks and genre-matched unheard songs to keep the mix fresh.
- Builds and pushes a single, unified playlist to your Navidrome server.

### 2. Tiered Playlist System (New!)

If you have a massive library where tracks with high listen counts dominate your top scores, the Tiered System prevents new or moderately-scored songs from being permanently pushed out of your rotation.

Instead of generating one single playlist, this feature creates **multiple playlists** segmented by score tiers.

**How it works:**

- **The Cursor Mechanism:** The system groups your songs by their listen score. It fills a playlist up to your configured size limit (e.g., 100 songs), starting from your absolute highest-scored tracks.
- **Dynamic Tiers:**
- **Tier 1 (Absolute Best):** Fills the first 100 slots with your highest-scoring songs. If the 100th song has a score of 38, it passes this score (the cursor) to the next tier.
- **Tier 2:** Fills the next 100 slots starting from the 38 score cursor. If the 100th song here has a score of 33, it passes that to Tier 3.
- **Tier 3+:** Continues this exact pattern, generating as many tiered playlists as needed.

- **Bottoming Out at -1:** The loop generates successive playlists until the score cursor reaches `-1`. This ensures that positively received and partial-listen tracks are cataloged into a tier, while skipped or negatively scored songs are strictly excluded.
- **Zero Fine-Tuning Required:** You no longer need to rely on complex score-decay tuning to surface hidden gems. Your heavy hitters live safely in Tier 1, leaving room for rising tracks in the subsequent tiers.
