# Proxy for navidrome.

# 1. instead of directly sending navidrome's coverart link to frontend


import hashlib
import random
import string

import httpx
from core.config import Navidrome_admin, navidrome_password
from core.config import Navidrome_url as ND_BASE
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from Workers.worker_queue import ND_queue, NDWork

from .auth_router import get_current_user, get_ND_Token

router = APIRouter(tags=["navidrome"])


SUBSONIC_CLIENT = "Tunelog"
SUBSONIC_VERSION = "1.16.1"


def get_subsonic_auth():
    salt = "".join(random.choices(string.ascii_letters + string.digits, k=6))
    token = hashlib.md5((navidrome_password + salt).encode("utf-8")).hexdigest()
    return {
        "u": Navidrome_admin,
        "t": token,
        "s": salt,
        "v": SUBSONIC_VERSION,
        "c": SUBSONIC_CLIENT,
    }




@router.get("/api/coverart/{cover_id}")
async def get_cover_art(cover_id: str):
    auth_params = get_subsonic_auth()
    params = {**auth_params, "id": cover_id}

    url = f"{ND_BASE}/rest/getCoverArt.view"

    async def stream_image():
        async with httpx.AsyncClient() as client:
            try:
                async with client.stream(
                    "GET", url, params=params, timeout=15.0
                ) as response:
                    if response.status_code == 404:
                        raise HTTPException(
                            status_code=404, detail="Cover art not found"
                        )
                    response.raise_for_status()

                    content_type = response.headers.get("Content-Type", "")
                    if content_type.startswith("text/xml"):
                        raise HTTPException(
                            status_code=400, detail="Navidrome API error"
                        )

                    async for chunk in response.aiter_bytes():
                        yield chunk

            except httpx.RequestError as e:
                raise HTTPException(
                    status_code=500, detail=f"Navidrome connection error: {str(e)}"
                )

    return StreamingResponse(stream_image(), media_type="image/jpeg")


@router.get("/api/playlist/{playlist_id}")
def get_playlist(playlist_id: str, username: str = Depends(get_current_user)):
    try:
        token = get_ND_Token(username=username)
        response = ND_queue.addWork(
            NDWork(method="get", endpoint=f"/api/playlist/{playlist_id}", token=token)
        )
        
        return response
    except Exception as e:
        return HTTPException(
            status_code=500, detail=f"Navidrome connection error: {str(e)}"
        )


@router.get("/api/playlist/{playlist_id}/tracks")
def get_playlist_tracks(playlist_id: str, username: str = Depends(get_current_user)):
    try:
        token = get_ND_Token(username=username)
        response = ND_queue.addWork(
            NDWork(method="get", endpoint=f"/api/playlist/{playlist_id}/tracks", token=token)
        )
        
        return response
    except Exception as e:
        return HTTPException(
            status_code=500, detail=f"Navidrome connection error: {str(e)}"
        )

