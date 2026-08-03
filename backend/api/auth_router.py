from datetime import datetime, timedelta

from core.config import getJWT
from core.crypto import decrypt_token, encrypt_token, get_secret_key
from core.db import get_db_connection_usr
from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Response,
    status,
)
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from rich.console import Console

console = Console()
router = APIRouter(tags=["Auth"])

# ------------------ AUTHENTICATION ------------------

SECRET_KEY = get_secret_key()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

OAUTH2_SCHEME = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_ND_Token(username: str):
    conn = get_db_connection_usr()
    cursor = conn.cursor()
    token = cursor.execute(
        "SELECT ND_token FROM user WHERE username = ?", (username,)
    ).fetchone()
    if token is not None:
        token = token[0]

    conn.close()
    return token


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(access_token: str = Cookie(None)):
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. No session cookie found.",
        )
    try:
        payload = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        # print("auth check username", username)
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload.",
            )
        return username

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )


@router.post("/auth/login")
def login(response: Response, data: OAuth2PasswordRequestForm = Depends()):
    admin = data.username
    password = data.password
    print(admin, password)

    conn = get_db_connection_usr()
    try:
        cursor = conn.cursor()
        user = cursor.execute(
            "SELECT username, password FROM user WHERE username = ?", (admin,)
        ).fetchone()
        # print(user)
        if user:
            try:
                decrypted_db_pw = decrypt_token(user["password"])
                if decrypted_db_pw == password:
                    console.log(f"[dim]Local DB auth successful for: {admin}[/dim]")
                    access_token = create_access_token(data={"sub": admin})
                    response.set_cookie(
                        key="access_token",
                        value=access_token,
                        httponly=True,
                        secure=False,
                        samesite="lax",
                        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                    )
                    return {
                        "status": "success",
                        "message": "Login successful via local DB",
                    }
            except Exception:
                console.log(
                    f"[dim]Decryption failed for {admin}. Falling back to Navidrome...[/dim]"
                )

        console.log(
            f"[dim]DB check failed/missing for {admin}. Contacting Navidrome...[/dim]"
        )
        token = getJWT(admin, password)

        if token:
            encrypted_password = encrypt_token(password)
            access_token = create_access_token(data={"sub": admin})
            cursor.execute(
                """
                INSERT INTO user (username, password, ND_token) VALUES (?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    password = excluded.password,
                    ND_token = excluded.ND_token
                """,
                (admin, encrypted_password, token),
            )
            conn.commit()
            response.set_cookie(
                key="access_token",
                value=access_token,
                httponly=True,
                secure=False,
                samesite="lax",
                max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            )
            return {
                "status": "success",
                "message": "Login successful via Navidrome",
            }
        else:
            return {"status": "failed", "message": "Invalid Credentials"}

    except Exception as e:
        console.log(f"[bold red]Login Route Error:[/bold red] {e}")
        return {"status": "failed", "reason": "Internal Error"}
    finally:
        conn.close()


@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=False,
        samesite="lax",
    )
    return {"status": "success", "message": "Logged out successfully"}
