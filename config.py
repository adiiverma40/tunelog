# config file, use for creating url
# API CALL

# TODO : idk how but implement a dynamic users list, i have 3 users i can add it mannualy,
# if someone is reviewing this, add a way to implement multiple users

# TODO : implement Itunes API search for the songs and write the metadata, add columns for explict content


from dotenv import load_dotenv
import os
import requests
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
# def getMusicMetaData(term ):
#     respone = requests(
#         f"https://itunes.apple.com/search?term={term}&entity=song&limit=5"
#     )
