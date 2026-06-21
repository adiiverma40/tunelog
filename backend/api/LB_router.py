import threading
from typing import List, Literal, Optional

import requests
from core.crypto import decrypt_token, encrypt_token
from core.db import (
    DB_PATH_MB,
    get_db_connection,
    get_db_connection_lib,
    get_db_connection_usr,
)
from core.main import Auto_LB_CF, generate_listenbrainz_playlist
from fastapi import APIRouter, Query
from navidrome.state import automation_config, save_automation_config
from playlists.playlist import API_push_playlist
from pydantic import BaseModel
from scrobble.listenBrainz import batchMatchNavidromeTracks

router = APIRouter(tags=["listenbrainz"])


class LBPlaylist(BaseModel):
    id: str
    title: str
    creator: str
    track_count: int
    type: Literal["user", "created_for_you"]


class LBTrack(BaseModel):
    title: str
    artist: str
    album: Optional[str] = None
    mbid: Optional[str] = None
    navidrome_id: Optional[str] = None
    cover_art_url: Optional[str] = None


class PlaylistResponse(BaseModel):
    status: Literal["ok", "error"]
    playlists: List[LBPlaylist]
    reason: Optional[str] = None


class PlaylistTracksResponse(BaseModel):
    status: Literal["ok", "error"]
    tracks: List[LBTrack]
    reason: Optional[str] = None


class LBMatchRequest(BaseModel):
    tracks: List[LBTrack]


class LBMatchResponse(BaseModel):
    status: Literal["ok", "error"]
    tracks: List[LBTrack]
    matched_count: int
    reason: Optional[str] = None


class CreatePlaylistRequest(BaseModel):
    name: str
    song_ids: list[str]
    dashboard_user: str = ""


class CreatePlaylistResponse(BaseModel):
    status: Literal["ok", "error"]
    reason: Optional[str] = None
    playlist_id: Optional[str] = None


class LBCFConfig(BaseModel):
    size: int
    heard: int
    unheard: int
    unheard_genre_injection: bool
    heard_genre_injection: bool
    last_generated: int
    auto_generate_time: int
    Name: str
    backfill_unheard_song: bool
    use_blend: bool
    unheard_last_score: float
    heard_last_score: float
    fallbackScore: bool
    for_users: list[str]


class WeeklyLBFetch(BaseModel):
    last_synced: int
    check_interval: int


class LBCFConfigPayload(BaseModel):
    cf_playlist_config: Optional[dict] = None
    weekly_LB_fetch: Optional[dict] = None


class SetTokenRequest(BaseModel):
    user: str
    token: str


LB_HEADERS = {
    "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)",
    "Accept": "application/json",
}


@router.get("/api/listenbrainz")
def getListenbrainz():
    conn = get_db_connection()
    cursor = conn.cursor()

    rows = cursor.execute("SELECT * FROM listenbrainz ORDER BY id DESC").fetchall()
    conn.close()

    return [dict(row) for row in rows]


@router.get(
    "/api/listenbrainz/playlist/{playlist_id}/tracks",
    response_model=PlaylistTracksResponse,
)
def get_playlist_tracks(playlist_id: str, username: str = Query("")):
    url = f"https://api.listenbrainz.org/1/playlist/{playlist_id}?fetch_metadata=true"

    try:
        res = requests.get(url, headers=LB_HEADERS)

        if res.status_code != 200:
            return PlaylistTracksResponse(
                status="error",
                tracks=[],
                reason=f"ListenBrainz API returned {res.status_code}",
            )

        data = res.json()
        playlist_data = data.get("playlist", {})
        raw_tracks = playlist_data.get("track", [])

        parsed_tracks = []
        for track in raw_tracks:
            identifiers = track.get("identifier", [])
            mbid = None
            if identifiers and len(identifiers) > 0:
                mbid = identifiers[0].split("/")[-1]

            cover_art_url = None
            try:
                extensions = track.get("extension", {})
                track_ext = extensions.get("https://musicbrainz.org/doc/jspf#track", {})
                metadata = track_ext.get("additional_metadata", {})
                caa_release_mbid = metadata.get("caa_release_mbid")

                if caa_release_mbid:
                    cover_art_url = (
                        f"https://coverartarchive.org/release/{caa_release_mbid}/front"
                    )
                    print(cover_art_url)
            except Exception:
                pass

            parsed_tracks.append(
                LBTrack(
                    title=track.get("title", "Unknown Title"),
                    artist=track.get("creator", "Unknown Artist"),
                    album=track.get("album"),
                    mbid=mbid,
                    navidrome_id=None,
                    cover_art_url=cover_art_url,
                )
            )

        return PlaylistTracksResponse(status="ok", tracks=parsed_tracks)

    except Exception as e:
        return PlaylistTracksResponse(status="error", tracks=[], reason=str(e))


@router.post("/api/listenbrainz/match", response_model=LBMatchResponse)
def match_tracks(payload: LBMatchRequest):
    output_tracks, matched_count = batchMatchNavidromeTracks(payload.tracks)

    return {
        "status": "ok",
        "tracks": output_tracks,
        "matched_count": matched_count,
    }


def get_lb_token_for_user(dashboard_user: str) -> str | None:
    conn = get_db_connection_usr()
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT LB_token FROM user WHERE username = ?", (dashboard_user,)
    ).fetchone()
    conn.close()
    if not row or not row[0]:
        return None
    return decrypt_token(row[0])


def resolve_lb_username(token: str) -> str | None:
    try:
        res = requests.get(
            "https://api.listenbrainz.org/1/validate-token",
            headers={**LB_HEADERS, "Authorization": f"Token {token}"},
        )
        if res.status_code == 200:
            data = res.json()
            if data.get("valid"):
                return data.get("user_name")
    except Exception:
        pass
    return None


@router.get("/api/listenbrainz/playlists", response_model=PlaylistResponse)
def get_playlists(
    lb_username: str = Query(""),
    dashboard_user: str = Query(""),
):
    token = get_lb_token_for_user(dashboard_user) if dashboard_user else None

    if not lb_username:
        if not token:
            return PlaylistResponse(
                status="error",
                playlists=[],
                reason="No LB username and no token available.",
            )
        resolvedUsername = resolve_lb_username(token)

        if not resolvedUsername:
            return PlaylistResponse(
                status="error",
                playlists=[],
                reason="Could not resolve LB username from token.",
            )
        lb_username = resolvedUsername

    auth_headers = {**LB_HEADERS}
    if token:
        auth_headers["Authorization"] = f"Token {token}"

    all_playlists = []

    try:
        user_url = f"https://api.listenbrainz.org/1/user/{lb_username}/playlists"
        user_res = requests.get(user_url, headers=auth_headers)

        if user_res.status_code == 200:
            for item in user_res.json().get("playlists", []):
                pl = item.get("playlist", {})
                identifier_url = pl.get("identifier", "")
                all_playlists.append(
                    LBPlaylist(
                        id=(
                            identifier_url.split("/")[-1]
                            if identifier_url
                            else "unknown"
                        ),
                        title=pl.get("title", "Unknown Title"),
                        creator=pl.get("creator", ""),
                        track_count=len(pl.get("track", [])),
                        type="user",
                    )
                )

        created_for_url = (
            f"https://api.listenbrainz.org/1/user/{lb_username}/playlists/createdfor"
        )
        created_res = requests.get(created_for_url, headers=auth_headers)

        if created_res.status_code == 200:
            for item in created_res.json().get("playlists", []):
                pl = item.get("playlist", {})
                identifier_url = pl.get("identifier", "")
                all_playlists.append(
                    LBPlaylist(
                        id=(
                            identifier_url.split("/")[-1]
                            if identifier_url
                            else "unknown"
                        ),
                        title=pl.get("title", "Unknown Title"),
                        creator=pl.get("creator", ""),
                        track_count=len(pl.get("track", [])),
                        type="created_for_you",
                    )
                )

        return PlaylistResponse(status="ok", playlists=all_playlists)

    except Exception as e:
        return PlaylistResponse(status="error", playlists=[], reason=str(e))


@router.post("/api/navidrome/playlist/create", response_model=CreatePlaylistResponse)
def create_navidrome_playlist(payload: CreatePlaylistRequest):
    user_id = payload.dashboard_user
    if not user_id:
        return CreatePlaylistResponse(
            status="error",
            reason="No dashboard_user provided.",
        )

    success = API_push_playlist(
        song_ids=payload.song_ids,
        user_id=user_id,
        playname=payload.name,
    )

    if success:
        return CreatePlaylistResponse(status="ok", reason=None)

    return CreatePlaylistResponse(
        status="error", reason="Failed to create playlist in Navidrome."
    )


def run_generation_task():
    try:
        cf_config = automation_config.get("cf_playlist_config", {})
        cf_users = cf_config.get("for_users", [])

        if not cf_users:
            return

        for user in cf_users:
            generate_listenbrainz_playlist(user, saveConfig=True)
            cf_config = automation_config.get("cf_playlist_config", {})

        print(f"Background generation complete for users: {cf_users}")

    except Exception as e:
        print(f"Background generation failed: {e}")


@router.get("/api/lb-cf/config")
async def fetch_lb_cf_config():
    try:
        return {
            "status": "ok",
            "cf_playlist_config": automation_config.get("cf_playlist_config", {}),
            "weekly_LB_fetch": automation_config.get("weekly_LB_fetch", {}),
        }
    except Exception as e:
        return {"status": "error", "reason": str(e)}


@router.post("/api/lb-cf/config")
async def save_lb_cf_config(payload: LBCFConfigPayload):
    try:
        success, message = save_automation_config(payload.dict(exclude_unset=True))

        if not success:
            return {"status": "error", "reason": message}

        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "reason": str(e)}


@router.post("/api/lb-cf/generate")
async def generate_lb_cf_playlist():
    try:
        cf_config = automation_config.get("cf_playlist_config", {})
        if not cf_config.get("for_users"):
            return {"status": "error", "reason": "No users configured for generation."}

        thread = threading.Thread(target=run_generation_task)
        thread.start()

        return {"status": "ok", "message": "Generation started in the background."}
    except Exception as e:
        return {"status": "error", "reason": str(e)}


@router.get("/api/lb-cf/has-token")
async def check_lb_token(user: str):
    try:
        conn = get_db_connection_usr()

        cursor = conn.execute("SELECT LB_token FROM user WHERE username=?", (user,))
        row = cursor.fetchone()
        conn.close()
        has_token = bool(row and row["LB_token"])

        return {"status": "ok", "has_token": has_token}

    except Exception as e:
        return {"status": "error", "reason": str(e)}


@router.post("/api/lb-cf/set-token")
async def set_lb_token(payload: SetTokenRequest):
    try:
        encrypted_token = encrypt_token(payload.token)

        conn = get_db_connection_usr()
        conn.execute(
            "UPDATE user SET LB_token=? WHERE username=?",
            (encrypted_token, payload.user),
        )
        if conn.total_changes == 0:
            conn.close()
            return {"status": "error", "reason": "User not found"}

        conn.commit()
        conn.close()
        print("stating auto lb cf")
        # BackgroundTasks(Auto_LB_CF(False))
        background = threading.Thread(target=Auto_LB_CF(False), daemon=True)
        background.start()
        return {"status": "ok"}

    except Exception as e:
        return {"status": "error", "reason": str(e)}


@router.get("/api/lb-cf/library")
async def fetch_lb_library_recommendations():
    try:
        conn = get_db_connection_lib()
        cursor = conn.cursor()
        cursor.execute(f"ATTACH DATABASE '{DB_PATH_MB}' AS mb")
        query = """
            SELECT
                cf.recording_mbid,
                h.title,
                h.artist,
                h.album,
                h.release_mbid,
                cf.username,
                cf.score,
                h.nvid
            FROM LB_CF cf
            INNER JOIN mb.hydration_cache h ON cf.recording_mbid = h.recording_mbid
            ORDER BY cf.score DESC
        """

        cursor.execute(query)
        rows = cursor.fetchall()

        response = {
            "status": "ok",
            "in_library": [],
            "not_in_library": [],
            "reason": None,
        }

        for row in rows:
            mbid, title, artist, album, release_mbid, for_user, score, nvid = row

            item = {
                "recording_mbid": mbid,
                "title": title,
                "artist": artist,
                "album": album,
                "for_user": for_user,
                "score": round(score, 3) if score is not None else 0.0,
            }

            if nvid:
                item["navidrome_id"] = nvid
                response["in_library"].append(item)
            else:
                item["release_mbid"] = release_mbid
                response["not_in_library"].append(item)

        conn.close()
        return response

    except Exception as e:
        return {
            "status": "error",
            "in_library": [],
            "not_in_library": [],
            "reason": f"Database error: {str(e)}",
        }
