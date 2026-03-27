### for things i dont know where to put


# ISSUES : if user skip a song and then listen it once complete, one the 1st listen it will mark as 1 star but then he listen again so it will marked as repeated song and hence getting 5 star
# fix :  to use a percentage and priority system, lets say 1st listen was 1 star and 2nd time is 4 instead of giving it 5 stars get it avg of 1 and 4 star , also by prioriting when the song was listened,
# if song was listend 4 days ago get it less percentage,

# TODO : Add an option to update playlist from stars , plan is to get the song, and there stars, and use value defined by user to mark them as skip partial, complete and repeat


# # redo star sytem, lets instead of just writing the star on one intraction lets do in more intearactions like 2 or 3 and prioriting recent
# - take 2 or more intreaction as minimum to star
# - priorities recent interactions
# - decay to deplete  0.1 ^ days
# - add a buffer to check repeat, if a song is listen 2 times in 20 min then consider it a repeat
# - dont take data if its older then 2 months,


from config import build_url_for_user, getAllUser
import requests
from db import get_db_connection



import sqlite3
from datetime import datetime


def push_star(song, signal):
    song_id = song["song_id"]
    user_id = song["user_id"]
    format_str = "%Y-%m-%d %H:%M:%S"
    now = datetime.now()

    star_map = {
        "skip": -2.0,
        "partial": 0.5,
        "positive": 2.0,
        "repeat": 3.0,
    }

    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    rows = cursor.execute(
        "SELECT * FROM listens WHERE user_id = ? AND song_id = ?", (user_id, song_id)
    ).fetchall()

    totalListens = len(rows)
    if totalListens < 3:
        print(f"Song: {song['title']} needs at least 3 listens")
        conn.close() 
        return

    totalWeight = 0
    rowSongScore = 0

    for row in rows:
        hisTimeStamp = row["timestamp"]
        try:
            rowDt_object = datetime.strptime(hisTimeStamp, format_str)
        except ValueError:
            continue  


        timeDifference = now - rowDt_object
        days_diff = abs(timeDifference.days)

        if days_diff > 60:
            continue  
        
        weightage = 0.9**days_diff

        rowSignal = row["signal"]
        rating = star_map.get(rowSignal, 0)
        # print("song : " ,  song['title'] , "rating : ", rating , "signal : " , rowSignal , "weightage : " , weightage)
        
        rowSongScore += rating * weightage

        if (timeDifference.total_seconds() / 60) <= 30:
            rowSongScore += 3

        totalWeight += weightage

    if totalWeight <= 0:
        conn.close()
        return

    songScore = rowSongScore / totalWeight
    # print(f"Total calculated score: {songScore:.2f}")

    if songScore >= 2.5:
        final_rating = 5
    elif songScore >= 1.5:
        final_rating = 4
    elif songScore >= 0.5:
        final_rating = 3
    elif songScore >= 0:
        final_rating = 2
    else:
        final_rating = 1

    # print(f"Final score for {song['title']}: {final_rating}")

    conn.close()


    USER_CREDENTIALS = getAllUser()
    password = USER_CREDENTIALS.get(user_id)
    if not password:
        print(f"[STAR ERROR] No credentials found for {user_id}")
        return

    url = build_url_for_user("setRating", user_id, password)
    url += f"&id={song_id}&rating={final_rating}"

    try:
        requests.get(url)
        print(f"[STAR] {user_id} | {song['title']} --> {final_rating} stars")
    except Exception as e:
        print(f"[STAR ERROR] {user_id} | {e}")

