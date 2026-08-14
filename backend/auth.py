import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext

from database import db_dep

SECRET = os.environ.get("JWT_SECRET")
if not SECRET:
    raise RuntimeError("JWT_SECRET must be configured")
ALGORITHM = "HS256"
EXPIRE_DAYS = 30

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = HTTPBearer()


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_token(account_id: int, household_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(account_id), "household_id": household_id, "exp": exp},
        SECRET,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    """Returns {"account_id": int, "household_id": int} or raises JWTError.

    Game guest tokens are signed with the same secret but carry no account, so
    they are rejected here rather than crashing on the int() cast — a guest
    presenting their token to an account-scoped endpoint must get a clean 401.
    """
    payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    try:
        return {
            "account_id": int(payload["sub"]),
            "household_id": int(payload["household_id"]),
        }
    except (KeyError, TypeError, ValueError):
        raise JWTError("Not an account token")


async def get_current_account(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """FastAPI dependency — injects {"account_id": int, "household_id": int}."""
    try:
        return decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


# ── Guest tokens (garden game) ───────────────────────────────────────────────
# Party guests play without a Floreren account. A guest token authorises
# exactly one game_players row in one session and nothing else in the app — it
# carries no account_id or household_id, so every account-scoped dependency
# rejects it. `game_secret` is checked against the stored value on each request
# so a host removing a player revokes their token immediately.

GUEST_EXPIRE_HOURS = 12


def create_guest_token(player_id: int, session_id: int, secret: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=GUEST_EXPIRE_HOURS)
    return jwt.encode(
        {
            "sub": f"guest:{player_id}",
            "kind": "game_guest",
            "player_id": player_id,
            "session_id": session_id,
            "game_secret": secret,
            "exp": exp,
        },
        SECRET,
        algorithm=ALGORITHM,
    )


def decode_guest_token(token: str) -> dict | None:
    """Returns the guest claims, or None if this isn't a guest token.

    Raises JWTError for a malformed or expired token, same as decode_token.
    """
    payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    if payload.get("kind") != "game_guest":
        return None
    return {
        "player_id": int(payload["player_id"]),
        "session_id": int(payload["session_id"]),
        "game_secret": payload.get("game_secret") or "",
    }


async def require_admin(account=Depends(get_current_account), db=Depends(db_dep)) -> dict:
    """FastAPI dependency — 403 unless the caller has admin privileges.

    Injects {"account_id", "household_id", "email", "is_admin"}.
    """
    rows = await db.execute_fetchall(
        "SELECT email, is_admin FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows or not bool(rows[0]["is_admin"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {**account, "email": rows[0]["email"], "is_admin": bool(rows[0]["is_admin"])}
