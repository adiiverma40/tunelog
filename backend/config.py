# config file, use for creating url
# API CALL

# TODO : idk how but implement a dynamic users list, i have 3 users i can add it mannualy,
# to implement dynamic users we will get data from web ui and put it in database, already done, after that we will pull infro from database to make it dynamic


# if someone is reviewing this, add a way to implement multiple users

# implement Itunes API search for the songs and write the metadata, add columns for explict content
# uses best match from api, using artist name as a refrance, if no artist name, fall back to 1st result


from dotenv import load_dotenv
import os
from urllib.parse import urlencode
import requests
import re
from queue import Queue
from pathlib import Path
from db import get_db_connection_usr, db_supervisor
from time import sleep
from rich.console import Console

console = Console()


event_queue = Queue()

load_dotenv(Path(__file__).parent.parent / ".env")

Navidrome_url = os.getenv("BASE_URL")
Navidrome_admin = os.getenv("ADMIN_USERNAME")
navidrome_password = os.getenv("ADMIN_PASSWORD")
api_version = "1.16.1"
app_name = "tunelog"


@db_supervisor
def getAllUser():

    conn = get_db_connection_usr()
    users = conn.execute("SELECT * FROM user").fetchall()

    USER_CREDENTIALS = {
        dict(user)["username"]: dict(user)["password"] for user in users
    }

    return USER_CREDENTIALS


# default url to pull data from api
def build_url(endpoint):
    params = urlencode(
        {
            "u": Navidrome_admin,
            "p": navidrome_password,
            "v": api_version,
            "c": app_name,
            "f": "json",
        }
    )
    return f"{Navidrome_url.rstrip('/')}/rest/{endpoint}?{params}"


# url to create playlist for every user
def build_url_for_user(endpoint, username, password):
    params = urlencode(
        {
            "u": username,
            "p": password,
            "v": api_version,
            "c": app_name,
            "f": "json",
        }
    )
    return f"{Navidrome_url.rstrip('/')}/rest/{endpoint}?{params}"


def login():
    try:
        res = requests.post(
            f"{Navidrome_url}/auth/login",
            json={"username": Navidrome_admin, "password": navidrome_password},
        )
        data = res.json()
        return {
            "jwt": data["token"],
            "subsonic_token": data["subsonicToken"],
            "subsonic_salt": data["subsonicSalt"],
            "username": data["username"],
        }
    except Exception as e:
        console.print("[bold red] Unable to login Navidrome ", e)
        # print(e)


def itunesApi(title, artist, retries=3):
    title = re.sub(r"\(.*?\)", "", title).strip()
    term = f"{title} {artist}".replace(" ", "+")
    url = f"https://itunes.apple.com/search?term={term}&entity=song&limit=5"

    for attempt in range(retries):
        try:
            sleep(1.5)
            response = requests.get(url, timeout=10)
            response.raise_for_status()

        except requests.exceptions.Timeout:
            print(f"[ITUNES] Timeout — {title}")
            return None

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response else 0
            if status in (429, 403):
                wait = 5 * (attempt + 1)
                print(f"[ITUNES] Rate limited ({status}) — waiting {wait}s — {title}")
                sleep(wait)
                continue
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

        print(f"[ITUNES] No artist match, using first result — {title}")
        return _extract(results[0])

    print(f"[ITUNES] All retries exhausted — {title}")
    return None


def _extract(r):
    return {
        "artist": r.get("artistName"),
        "album": r.get("collectionName"),
        "genre": r.get("primaryGenreName"),
        "duration": r.get("trackTimeMillis"),
        "explicit": r.get("trackExplicitness"),
    }


# print(itunesApi(" Ma Belle (PMEDIA) "," AP Dhillon, Amari"))
