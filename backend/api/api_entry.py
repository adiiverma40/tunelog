import os
from pathlib import Path

import socketio
from api import (
    LB_router,
    analaytic_router,
    auth_router,
    library_router,
    navidrome_router,
    playlist_router,
    system_router,
    user_router,
)
from core.db import init_db, init_db_lib, init_db_usr
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

CONFIG_DIR = "./config/users"
save_dir = Path(CONFIG_DIR)
save_dir.mkdir(parents=True, exist_ok=True)

SERVER_URL = os.getenv("VITE_API_URL", "http://localhost:8000")

allowedOriginsStr = os.getenv("ALLOWED_ORIGINS", "")
allowedOrigins = [
    origin.strip() for origin in allowedOriginsStr.split(",") if origin.strip()
]
if not allowedOrigins:
    allowedOrigins = ["http://localhost:5173"]

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app = FastAPI()


app.mount("/avatars", StaticFiles(directory=CONFIG_DIR), name="avatars")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
import api.socket_router

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowedOrigins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.on_event("startup")
def startup():
    init_db()
    init_db_lib()
    init_db_usr()


app.include_router(auth_router.router)
app.include_router(user_router.router)
app.include_router(library_router.router)
app.include_router(system_router.router)
app.include_router(analaytic_router.router)
app.include_router(LB_router.router)
app.include_router(playlist_router.router)
app.include_router(navidrome_router.router)
