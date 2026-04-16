
import socket
import base64
import requests
import time
from dotenv import load_dotenv
import os
import threading
import queue

load_dotenv()

HOST = os.getenv("HOST", "localhost")
PORT = int(os.getenv("RADIO_PORT", 8001))
BITRATE_KBPS = int(os.getenv("BITRATE_KBPS", 128))
CHUNK_SIZE = 4096
BYTES_PER_SEC = (BITRATE_KBPS * 1000) / 8
SLEEP_PER_CHUNK = (CHUNK_SIZE / BYTES_PER_SEC) * 0.85

NAVIDROME_URL = "http://localhost:4534"
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
LOADING_MUSIC = os.getenv("LOADING_MUSIC")

auth = base64.b64encode(b"source:hackme").decode()
headers = (
    f"SOURCE /stream HTTP/1.0\r\n"
    f"Authorization: Basic {auth}\r\n"
    f"Content-Type: audio/mpeg\r\n"
    f"\r\n"
)

sock = socket.socket()
sock.connect((HOST, PORT))
sock.send(headers.encode())
response = sock.recv(1024)
print("Icecast response:", response.decode())

song_queue = queue.Queue()
stop_event = threading.Event()
current_mode = None  
stream_thread = None
stream_lock = threading.Lock()


def add_to_queue(song_id: str, title: str):
    song_queue.put((song_id, title))
    print(f"Queued: {title} ({song_id})")


def _stream_song(song_id: str, title: str, stop: threading.Event):
    url = (
        f"{NAVIDROME_URL}/rest/stream"
        f"?id={song_id}&maxBitRate={BITRATE_KBPS}&format=mp3"
        f"&u={ADMIN_USERNAME}&p={ADMIN_PASSWORD}&v=1.16.1&c=tunelog"
    )
    print(f"Now streaming: {title}")
    try:
        r = requests.get(url, stream=True)
        for chunk in r.iter_content(chunk_size=CHUNK_SIZE):
            if stop.is_set():
                r.close()
                return
            if chunk:
                sock.send(chunk)
                time.sleep(SLEEP_PER_CHUNK)
    except Exception as e:
        print(f"Streaming error: {e}")


def _loading_worker(stop: threading.Event):
    while not stop.is_set():
        _stream_song(LOADING_MUSIC, "Loading music", stop)


def _queue_worker(stop: threading.Event):
    while not stop.is_set():
        try:
            song_id, title = song_queue.get(timeout=0.3)
        except queue.Empty:
            return  
        _stream_song(song_id, title, stop)
        if not stop.is_set():
            song_queue.task_done()


def _start_mode(mode: str):
    
    global stream_thread, current_mode, stop_event

    with stream_lock:
        
        if current_mode == mode:
            return  

        stop_event.set()
        if stream_thread and stream_thread.is_alive():
            stream_thread.join(timeout=2)

        stop_event = threading.Event()
        current_mode = mode

        if mode == "loading":
            print("[radio] Switching to LOADING mode")
            target = _loading_worker
        else:
            print("[radio] Switching to QUEUE mode")
            target = _queue_worker

        stream_thread = threading.Thread(
            target=target, args=(stop_event,), daemon=True
        )
        stream_thread.start()


def check_users() -> int:
    try:
        r = requests.get(f"http://{HOST}:{PORT}/status-json.xsl", timeout=2)
        data = r.json()
        source = data.get("icestats", {}).get("source", {})
        if isinstance(source, list):
            source = source[0] if source else {}
        return int(source.get("listeners", 0))
    except Exception as e:
        print(f"Error checking users: {e}")
        return 0


if __name__ == "__main__":
    _start_mode("loading")
    last_check = 0
    add_to_queue("KzZcKr1LU4EPcymeMIZ4FU" , "ccccBunny Girl")
    add_to_queue("GuHqPJQlEXVY5izHvGHqOp" , "ddddddshake na baby")

    while True:
        now = time.time()

        if now - last_check >= 3:
            users = check_users()
            last_check = time.time()
            print(f"Listeners: {users}")

            if users == 0:
                _start_mode("loading")
            else:
                if not song_queue.empty() and current_mode != "queue":
                    _start_mode("queue")
            
        if (
            current_mode == "queue"
            and stream_thread
            and not stream_thread.is_alive()
        ):
            print("[radio] Queue finished, falling back to loading.")
            _start_mode("loading")

        time.sleep(0.3)