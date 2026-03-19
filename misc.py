### for things i dont know where to put


from config import build_url_for_user, USER_CREDENTIALS
import requests


def push_star(song_id, user_id, signal):
    star_map = {
        "skip": 1,
        "partial": 2,
        "positive": 4,
        "repeat": 5,
    }
    rating = star_map.get(signal, 0)

    password = USER_CREDENTIALS.get(user_id)
    if not password:
        print(f"[STAR ERROR] No credentials found for {user_id}")
        return

    url = build_url_for_user("setRating", user_id, password)
    url += f"&id={song_id}&rating={rating}"

    try:
        requests.get(url)
        print(f"[STAR] {user_id} | {song_id} → {rating} stars ({signal})")
    except Exception as e:
        print(f"[STAR ERROR] {user_id} | {e}")
