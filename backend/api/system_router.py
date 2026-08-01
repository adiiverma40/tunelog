import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from navidrome.state import _subscribers, notification_status, save_config, tune_config
from pydantic import BaseModel
from rich.console import Console

from .auth_router import get_current_user

console = Console()
router = APIRouter(tags=["system"])


class configData(BaseModel):
    playlist_generation: dict
    behavioral_scoring: dict
    sync_and_automation: dict
    api_and_performance: dict
    jam: dict
    listenbrainz: dict


@router.get("/api/ping")
def ping(current_user: str = Depends(get_current_user)):
    return {"status": "OK", "user": current_user}


@router.get("/api/config")
def SendConfig():
    return tune_config


@router.post("/api/config/update")
def update_config(payload: configData):
    console.print("[bold blue]Received config update request...")
    success, message = save_config(payload.dict())
    if not success:
        raise HTTPException(status_code=500, detail=message)
    return {"status": "success", "message": "config.json updated"}


@router.get("/notifications/stream")
async def sse_stream():
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    subscriber_entry = (queue, loop)
    _subscribers.append(subscriber_entry)

    async def event_generator():
        try:
            for field in ("songState", "playlist", "starredSong"):
                existing = list(getattr(notification_status, field))
                if existing:
                    payload = json.dumps({field: existing})
                    yield f"data: {payload}\n\n"

            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"data: {data}\n\n"

                    field = list(json.loads(data).keys())[0]
                    getattr(notification_status, field).clear()

                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _subscribers.remove(subscriber_entry)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
