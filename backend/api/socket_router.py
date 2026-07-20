import asyncio
import uuid
from datetime import datetime, timezone

from api.api_entry import sio
from jam import (
    AddQueue,
    ClearQueue,
    currentQueue,
    future_queue_ids,
    past_queue_ids,
    sendSongPayload,
)
from navidrome.state import tune_config
from playlists.base_playlist import getDataFromDb
from playlists.blend_playlist import (
    build_playlist,
    get_unheard_songs,
    get_wildcard_songs,
    score_song,
)
from rich.console import Console

console = Console()

HOST_RECONNECT_GRACE = 20
host_reconnect_task = None

connected_users = {}

jam_state = {
    "host_sid": None,
    "host_name": None,
    "current_track": None,
    "is_playing": False,
}

jamConfig = tune_config["jam"]


async def broadcast_users():
    await sio.emit("users", connected_users)


async def end_jam_after_timeout():
    await asyncio.sleep(HOST_RECONNECT_GRACE)

    if jam_state["host_sid"] is None and jam_state["host_name"] is not None:
        jam_state["host_name"] = None
        jam_state["current_track"] = None
        jam_state["is_playing"] = False
        await sio.emit("jam_finished")
        console.print("[bold red]Jam ended — host did not reconnect")


@sio.event
async def leave_jam(sid):
    console.print("[bold red]Leaving jam")
    await sio.leave_room(sid, room="jam")
    await sio.emit("leaveJam", to=sid)


@sio.event
async def connect(sid, environ, auth):
    global host_reconnect_task
    username = (auth or {}).get("username") or "Anonymous"

    # console.print(f"[bold white]Client connected: {sid} ({username})")
    connected_users[sid] = {"username": username, "isHost": False}

    if (
        jam_state["host_name"]
        and username == jam_state["host_name"]
        and jam_state["host_sid"] is None
    ):
        jam_state["host_sid"] = sid
        connected_users[sid]["isHost"] = True

        if host_reconnect_task:
            host_reconnect_task.cancel()
            host_reconnect_task = None

        await sio.enter_room(sid, "jam")
        console.print("[bold green]Host reconnected and jam restored")
    await sio.emit(
        "jam_announced",
        {
            "hostName": jam_state.get("host_name"),
            "trackId": jam_state.get("current_track"),
            "isPlaying": jam_state.get("is_playing", False),
        },
        to=sid,
    )

    if connected_users[sid]["isHost"]:
        track_id = jam_state.get("current_track")
        payload = sendSongPayload(track_id) if track_id else None
        await sio.emit("now_playing", payload, to=sid)
        await sio.emit("queue_update", currentQueue(), to=sid)
    await broadcast_users()


@sio.event
async def disconnect(sid):
    global host_reconnect_task

    # console.print(f"[bold red]Client disconnected: {sid}")
    connected_users.pop(sid, None)

    if sid == jam_state["host_sid"]:
        jam_state["host_sid"] = None
        jam_state["is_playing"] = False
        await sio.emit(
            "jam_host_lost",
            {
                "hostName": jam_state["host_name"],
                "trackId": jam_state["current_track"],
            },
        )

        if host_reconnect_task:
            host_reconnect_task.cancel()

        host_reconnect_task = asyncio.create_task(end_jam_after_timeout())
        console.print("[bold yellow]Host disconnected — waiting for reconnect")
    await broadcast_users()


@sio.event
async def start_jam(sid, data):
    # print("start jam")
    user = connected_users.get(sid)
    if not user:
        return

    username = user["username"]

    jam_state["host_sid"] = sid
    jam_state["host_name"] = username
    jam_state["is_playing"] = True
    connected_users[sid]["isHost"] = True

    library, history = getDataFromDb()
    scores = score_song(
        username,
        history_dict=history,
        library_dict=library,
    )
    unheard, unheard_ratio, all_time_heard = get_unheard_songs(library, username)
    wildcards = get_wildcard_songs(scores, username)

    playlist, song_signals = build_playlist(
        library,
        history,
        scores,
        unheard,
        wildcards,
        unheard_ratio,
        all_time_heard,
        username,
        "all",
        10,
        False,
    )

    ClearQueue()
    for songId in playlist:
        AddQueue(songId, user=username)

    if future_queue_ids:
        jam_state["current_track"] = future_queue_ids.pop(0)
    else:
        jam_state["current_track"] = data.get("trackId")
    await sio.emit(
        "jam_announced",
        {
            "hostName": jam_state["host_name"],
            "trackId": jam_state["current_track"],
            "isPlaying": True,
        },
    )

    payload = (
        sendSongPayload(jam_state["current_track"])
        if jam_state["current_track"]
        else {}
    )
    await sio.enter_room(sid, "jam")
    await sio.emit("now_playing", payload, room="jam")
    await sio.emit("queue_update", currentQueue(), room="jam")

    await broadcast_users()
    console.print(f"[bold blue]Jam started by: {jam_state['host_name']}")


@sio.event
async def joinJam(sid):
    console.print("[bold green]User joined the jam")
    payload = (
        sendSongPayload(jam_state["current_track"])
        if jam_state["current_track"]
        else {}
    )

    await sio.enter_room(sid, "jam")
    await sio.emit("now_playing", payload, to=sid)
    await sio.emit("queue_update", currentQueue(), to=sid)
    await sio.emit("jam_playback", {"isPlaying": jam_state["is_playing"]}, to=sid)


@sio.event
async def get_queue(sid):
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def add_queue(sid, data):
    user = connected_users.get(sid)
    if not user:
        return
    username = user["username"]

    console.print(f"[bold yellow]Adding {data.get('title')} by {username} ")

    if jamConfig["only_host_add_queue"] and sid != jam_state["host_sid"]:
        console.print("[bold red]Only host can add to queue")
        return

    AddQueue(
        song_id=data["song_id"],
        title=data.get("title"),
        artist=data.get("artist", "Unknown"),
        user=username,
    )
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def reorder_queue(sid, data):
    if jamConfig["only_host_change_queue"]:
        if jam_state["host_sid"] != sid:
            console.print("[bold red]Unauthorized reorder attempt")
            return

    console.print("[bold green]Reordering queue")
    ClearQueue()
    for item in data:
        AddQueue(
            item["song_id"],
            item.get("title"),
            item.get("artist", "Unknown"),
            item.get("user", "unknown"),
        )
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def clear_queue(sid):
    if jamConfig["only_host_clear_queue"]:
        if jam_state["host_sid"] != sid:
            console.print("[bold red]Unauthorized Clear attempt")
            return

    console.print("[bold yellow]Clearing Queue")
    ClearQueue()
    jam_state["current_track"] = None
    jam_state["is_playing"] = False
    await sio.emit("now_playing", None, room="jam")
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def stop_jam(sid):
    if sid != jam_state["host_sid"]:
        return

    jam_state["host_sid"] = None
    jam_state["host_name"] = None
    jam_state["current_track"] = None
    jam_state["is_playing"] = False

    connected_users[sid]["isHost"] = False
    await sio.emit("jam_finished")
    await sio.emit("now_playing", None, room="jam")
    await sio.emit("queue_update", [], room="jam")

    await sio.close_room("jam")

    await broadcast_users()
    console.print("[bold yellow]Jam stopped by host")


@sio.event
async def jam_play(sid):
    if sid != jam_state["host_sid"]:
        return
    jam_state["is_playing"] = True
    await sio.emit("jam_playback", {"isPlaying": True}, room="jam")


@sio.event
async def jam_pause(sid):
    if sid != jam_state["host_sid"]:
        return
    jam_state["is_playing"] = False
    await sio.emit("jam_playback", {"isPlaying": False}, room="jam")


@sio.event
async def jam_next(sid):
    if sid != jam_state["host_sid"]:
        return

    if jam_state["current_track"]:
        past_queue_ids.append(jam_state["current_track"])

    if future_queue_ids:
        next_track_id = future_queue_ids.pop(0)
        jam_state["current_track"] = next_track_id
        jam_state["is_playing"] = True
        payload = sendSongPayload(next_track_id)
    else:
        jam_state["current_track"] = None
        jam_state["is_playing"] = False
        payload = None

    await sio.emit("now_playing", payload, room="jam")
    await sio.emit("jam_playback", {"isPlaying": jam_state["is_playing"]}, room="jam")
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def jam_prev(sid):
    if sid != jam_state["host_sid"]:
        return

    if not past_queue_ids:
        return
    if jam_state["current_track"]:
        future_queue_ids.insert(0, jam_state["current_track"])
    prev_track_id = past_queue_ids.pop()
    jam_state["current_track"] = prev_track_id
    jam_state["is_playing"] = True

    payload = sendSongPayload(prev_track_id)

    await sio.emit("now_playing", payload, room="jam")
    await sio.emit("jam_playback", {"isPlaying": jam_state["is_playing"]}, room="jam")
    await sio.emit("queue_update", currentQueue(), room="jam")


@sio.event
async def sync_time(sid, data):
    if sid != jam_state["host_sid"]:
        return
    await sio.emit("sync_room_time", {"positionMs": data.get("positionMs")}, room="jam")


@sio.event
async def chat_message(sid, data):
    if sid not in connected_users:
        return

    username = connected_users[sid]["username"]
    text = (data.get("text") or "").strip()
    if not text:
        return

    msg = {
        "id": str(uuid.uuid4()),
        "username": username,
        "text": text,
        "sentAt": datetime.now(timezone.utc).isoformat(),
    }

    await sio.emit("chat_message", msg, room="jam")


@sio.event
async def transfer_host(sid, data):
    if sid != jam_state["host_sid"]:
        console.print("[bold red]Unauthorized transfer_host attempt")
        return

    to_username = data.get("toUsername")
    if not to_username:
        return

    target_sid = next(
        (s for s, u in connected_users.items() if u["username"] == to_username), None
    )

    if target_sid is None:
        console.print(f"[bold red]transfer_host: {to_username} not connected")
        return

    connected_users[sid]["isHost"] = False
    jam_state["host_sid"] = target_sid
    jam_state["host_name"] = to_username
    connected_users[target_sid]["isHost"] = True

    await sio.enter_room(target_sid, "jam")
    await sio.emit(
        "jam_announced",
        {
            "hostName": to_username,
            "trackId": jam_state.get("current_track"),
            "isPlaying": jam_state.get("is_playing", False),
        },
    )

    await broadcast_users()
