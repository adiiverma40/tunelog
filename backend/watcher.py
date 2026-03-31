## watches SSE for event triggers

import requests
from config import Navidrome_url , login , event_queue



def start_sse():
    creds = login()
    url = f"{Navidrome_url}/api/events?jwt={creds["jwt"]}"
    response = requests.get(url , stream=True , timeout=45)


    event_type = None
    for line in response.iter_lines(decode_unicode=True):
        if not line or line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_type = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data = line.split(":", 1)[1].strip()
            if event_type == "nowPlayingCount":
                event_queue.put("nowPlaying")

