DEFAULT_LOCATIONS: list[tuple[str, str, int]] = [
    ("Tuin", "🌿", 0),
    ("Huis", "🏠", 1),
]

import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from database import db_dep
from models import (
    RegisterInput,
    LoginInput,
    AuthResponse,
    AccountOut,
    ForgotPasswordInput,
    ResetPasswordInput,
    ChangePasswordInput,
)
from auth import hash_password, verify_password, create_token, get_current_account
from services.email import send_password_reset
from services.rate_limit import rate_limit
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=AuthResponse,
    dependencies=[Depends(rate_limit("register", limit=5, window_s=3600))],
)
async def register(body: RegisterInput, db=Depends(db_dep)):
    existing = await db.execute_fetchall(
        "SELECT id FROM accounts WHERE email = ?", (body.email.lower(),)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    household_name = body.household_name.strip() or f"{body.name.strip()}'s Garden"
    cur = await db.execute(
        "INSERT INTO households (name) VALUES (?)", (household_name,)
    )
    household_id = cur.lastrowid

    pw_hash = hash_password(body.password)
    # New accounts get the language chosen on the landing page (NL/EN toggle,
    # Dutch default) so the app opens in the language the visitor signed up in.
    cur2 = await db.execute(
        "INSERT INTO accounts (household_id, email, name, password_hash, language) VALUES (?, ?, ?, ?, ?)",
        (household_id, body.email.lower(), body.name.strip(), pw_hash, body.language),
    )
    account_id = cur2.lastrowid

    # Create a user entry for this account so the language endpoint works
    cur3 = await db.execute(
        "INSERT INTO users (name, household_id, language) VALUES (?, ?, ?)",
        (body.name.strip(), household_id, body.language),
    )
    user_id = cur3.lastrowid

    # Create default locations for the new household
    for name, icon, sort_order in DEFAULT_LOCATIONS:
        await db.execute(
            "INSERT INTO locations (name, icon, sort_order, household_id) VALUES (?, ?, ?, ?)",
            (name, icon, sort_order, household_id),
        )

    await db.commit()

    token = create_token(account_id=account_id, household_id=household_id)
    return AuthResponse(token=token, account_id=account_id, household_id=household_id, name=body.name.strip())


@router.post(
    "/login",
    response_model=AuthResponse,
    dependencies=[Depends(rate_limit("login", limit=10, window_s=300))],
)
async def login(body: LoginInput, db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, household_id, name, password_hash FROM accounts WHERE email = ?",
        (body.email.lower(),),
    )
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    account = dict(rows[0])
    if not verify_password(body.password, account["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(account_id=account["id"], household_id=account["household_id"])
    return AuthResponse(
        token=token,
        account_id=account["id"],
        household_id=account["household_id"],
        name=account["name"],
    )


@router.post(
    "/forgot-password",
    dependencies=[Depends(rate_limit("forgot-password", limit=5, window_s=900))],
)
async def forgot_password(body: ForgotPasswordInput, db=Depends(db_dep)):
    """Send a password reset email if the account exists.
    Always returns 200 to prevent account enumeration.
    """
    account = await db.execute_fetchall(
        "SELECT id, language FROM accounts WHERE email = ?", (body.email.lower().strip(),)
    )

    if account:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)
        await db.execute(
            "INSERT INTO password_reset_tokens (account_id, token, expires_at) VALUES (?, ?, ?)",
            (account[0]["id"], token, expires_at),
        )
        await db.commit()

        app_url = os.environ.get("APP_URL", "http://localhost:5173")
        reset_link = f"{app_url}/reset-password?token={token}"
        send_password_reset(
            body.email.lower().strip(), reset_link,
            lang=account[0]["language"] or "nl",
        )

    return {"message": "If that email exists, a reset link has been sent."}


@router.post(
    "/reset-password",
    dependencies=[Depends(rate_limit("reset-password", limit=10, window_s=900))],
)
async def reset_password(body: ResetPasswordInput, db=Depends(db_dep)):
    """Validate a reset token and update the account password."""
    now = datetime.utcnow()

    rows = await db.execute_fetchall(
        """SELECT id, account_id, expires_at, used_at
           FROM password_reset_tokens
           WHERE token = ?""",
        (body.token,),
    )
    if not rows:
        raise HTTPException(
            status_code=400, detail="Reset link is invalid or has expired"
        )

    token_row = dict(rows[0])

    # Already used?
    if token_row.get("used_at") is not None:
        raise HTTPException(
            status_code=400, detail="Reset link is invalid or has expired"
        )

    # Expired?
    expires = token_row["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if now > expires:
        raise HTTPException(
            status_code=400, detail="Reset link is invalid or has expired"
        )

    # Validate password length
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # Hash and update
    pw_hash = hash_password(body.new_password)
    await db.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (pw_hash, token_row["account_id"]),
    )
    await db.execute(
        "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
        (now, token_row["id"]),
    )
    await db.commit()

    return {"message": "Password updated"}





@router.post("/change-password")
async def change_password(body: ChangePasswordInput, current=Depends(get_current_account), db=Depends(db_dep)):
    """Change the current account's password. Requires current password verification."""
    rows = await db.execute_fetchall(
        "SELECT id, password_hash FROM accounts WHERE id = ?",
        (current["account_id"],)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")

    account = dict(rows[0])
    if not verify_password(body.current_password, account["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    pw_hash = hash_password(body.new_password)
    await db.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (pw_hash, current["account_id"])
    )
    await db.commit()
    return {"message": "Password updated"}


@router.get("/me", response_model=AccountOut)
async def me(current=Depends(get_current_account), db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        """SELECT a.id, a.household_id, a.email, a.name, a.avatar, a.is_admin,
                  h.name AS household_name
           FROM accounts a
           JOIN households h ON h.id = a.household_id
           WHERE a.id = ?""",
        (current["account_id"],),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    account = dict(rows[0])
    return {**account, "is_admin": bool(account["is_admin"])}
