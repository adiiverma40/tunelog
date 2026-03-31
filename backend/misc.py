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


# Issues : the song's final score can be infinte, it will take ages to make it down,
# fix : take the last 15 song intreaction, max score = +3 and min = -2

# ISSUES : taking last 15 intreaction creates ineffiency if the user has listened to same song 15 times a day, the 1st intreaction and 15th has same weightage
# fix :  transistiong from times decay to  index

# tunelog-backend   | song :  Ranjha rating :  3.0 signal :  repeat     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  3.0 signal :  repeat     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  2.0 signal :  positive     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  2.0 signal :  positive     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0
# tunelog-backend   | song :  Ranjha rating :  -2.0 signal :  skip     |   weightage :  1.0


# ISSUES : DATABASE IS LOCKEd
# FIX : executemany()


from config import build_url_for_user, getAllUser
import requests
from db import get_db_connection , get_db_connection_lib


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
        """
    SELECT * FROM listens 
    WHERE user_id = ? AND song_id = ? 
    ORDER BY timestamp DESC 
    LIMIT 15
    """,
        (user_id, song_id),
    ).fetchall()
    totalListens = len(rows)
    if totalListens < 3:
        print(f"Song: {song['title']} needs at least 3 listens")
        conn.close()
        return

    totalWeight = 0
    rowSongScore = 0

    for i, row in enumerate(rows):
        hisTimeStamp = row["timestamp"]
      
        weightage = 0.9** i 

        rowSignal = row["signal"]

        rating = star_map.get(rowSignal, 0)

        print(
            "song : ",
            song["title"],
            "rating : ",
            rating,
            "signal : ",
            rowSignal,
            "    |  ",
            "weightage : ",
            weightage,
            " | Index : , " , i
        )
        rowSongScore += rating * weightage
        totalWeight += weightage

    if totalWeight <= 0:
        conn.close()
        return

    songScore = rowSongScore / totalWeight
   
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

    print(f"Final score for {song['title']}: {final_rating}")

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


def UpdateDBgenre(data, connLib=None):
    print("In update db genre")
    if not data:
        return {"status": "Category or value is empty"}
    conn_log = get_db_connection()
    cursor_log = conn_log.cursor()

    if connLib:
        conn_lib = connLib
        close_lib = False  
    else:
        conn_lib = get_db_connection_lib()
        close_lib = True

    cursor_lib = conn_lib.cursor()
    cursor_log.executemany("UPDATE listens SET genre = ? WHERE genre = ?", data)
    cursor_lib.executemany("UPDATE library SET genre = ? WHERE genre = ?", data)

    conn_log.commit()
    print("update made")
    if close_lib:
        conn_lib.commit()
        conn_lib.close()
    else:
        conn_lib.commit() 

    conn_log.close()

    return {
        "status": "success",
        "updated Rows lib": cursor_lib.rowcount,
        "updated rows log": cursor_log.rowcount,
    }
