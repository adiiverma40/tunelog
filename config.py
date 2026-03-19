# config file, use for creating url
# API CALL

# TODO : idk how but implement a dynamic users list, i have 3 users i can add it mannualy,
# if someone is reviewing this, add a way to implement multiple users

# implement Itunes API search for the songs and write the metadata, add columns for explict content
# uses best match from api, using artist name as a refrance, if no artist name, fall back to 1st result


from dotenv import load_dotenv
import os
import requests
import re
from queue import Queue


event_queue = Queue()

load_dotenv()

Navidrome_url = os.getenv("base_url")
Navidrome_admin = os.getenv("admin_username")
navidrome_password = os.getenv("admin_password")
api_version = "1.16.1"
app_name = "tunelog"


# ADD MORE LINES IF YOU HAVE MORE USERS
USER_CREDENTIALS = {
    os.getenv("USER_ADITI"): os.getenv("PASSWORD_aditi"),
    os.getenv("USER_adii_mobile"): os.getenv("PASSWORD_adii_mobile"),
    os.getenv("admin_username"): os.getenv("admin_password"),
}


# default url to pull data from api
def build_url(endpoint):
    return(
        f"{Navidrome_url}/rest/{endpoint}"
        f"?u={Navidrome_admin}"
        f"&p={navidrome_password}"
        f"&v={api_version}"
        f"&c={app_name}"
        f"&f=json"
        
    )

# url to create playlist for every user
def build_url_for_user(endpoint, username, password):
    return (
        f"{Navidrome_url}/rest/{endpoint}"
        f"?u={username}"
        f"&p={password}"
        f"&v={api_version}"
        f"&c={app_name}"
        f"&f=json"
    )

def login():
    res= requests.post(f"{Navidrome_url}/auth/login", json={
        "username" : Navidrome_admin,
        "password" : navidrome_password
    }
    )
    data = res.json()
    return {
        "jwt": data["token"],
        "subsonic_token": data["subsonicToken"],
        "subsonic_salt": data["subsonicSalt"],
        "username": data["username"]
    }


# https://itunes.apple.com/search?term=tum+mere+ho&entity=song&limit=5


# Itunes api call
import time


def itunesApi(title, artist):
    title = re.sub(r"\(.*?\)", "", title).strip()
    term = f"{title} {artist}".replace(" ", "+")
    url = f"https://itunes.apple.com/search?term={term}&entity=song&limit=5"

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()  # catches 4xx/5xx errors
    except requests.exceptions.Timeout:
        print(f"[ITUNES] Timeout — {title}")
        return None
    except requests.exceptions.HTTPError as e:
        print(f"[ITUNES] HTTP error {e} — {title}")
        return None
    except requests.exceptions.ConnectionError:
        print(f"[ITUNES] No connection — {title}")
        return None

    results = response.json().get("results", [])
    if not results:
        print(f"[ITUNES] No results — {title} | {artist}")
        return None

    artist_words = set(artist.lower().split())
    for r in results:
        itunes_artist = r.get("artistName", "").lower()
        if any(word in itunes_artist for word in artist_words):
            return _extract(r)

    # fallback to first result
    print(f"[ITUNES] No artist match, using first result — {title}")
    return _extract(results[0])


def _extract(r):
    return {
        "artist": r.get("artistName"),
        "album": r.get("collectionName"),
        "genre": r.get("primaryGenreName"),
        "duration": r.get("trackTimeMillis"),
        "explicit": r.get("trackExplicitness"),
    }


# print(itunesApi(" Ma Belle (PMEDIA) "," AP Dhillon, Amari"))
