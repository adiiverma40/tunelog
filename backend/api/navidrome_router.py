# Proxy for navidrome.

# 1. instead of directly sending navidrome's coverart link to frontend


import hashlib
import random
import string

import httpx
from core.config import Navidrome_admin, navidrome_password
from core.config import Navidrome_url as ND_BASE
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

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


router = APIRouter()


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
