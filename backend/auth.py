import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext

from database import db_dep

SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
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
    """Returns {"account_id": int, "household_id": int} or raises JWTError."""
    payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    return {"account_id": int(payload["sub"]), "household_id": int(payload["household_id"])}


async def get_current_account(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """FastAPI dependency — injects {"account_id": int, "household_id": int}."""
    try:
        return decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


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
