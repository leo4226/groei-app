DEFAULT_LOCATIONS: list[tuple[str, str, int]] = [
    ("Tuin", "🌿", 0),
    ("Huis", "🏠", 1),
]

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from starlette.concurrency import run_in_threadpool
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
from auth import (
    capabilities_for_role,
    create_token,
    get_current_account,
    hash_password,
    require_editor,
    verify_password,
)
from services.db_transactions import database_transaction
from services.email import send_password_reset
from services.rate_limit import rate_limit
router = APIRouter(prefix="/auth", tags=["auth"])


def hash_reset_token(raw: str) -> str:
    """Reset links are stored as a SHA-256 digest, never as the link itself:
    whoever can read the table must not be able to take over accounts with it."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


_dummy_hash: str | None = None


def _verify_against_nothing(password: str) -> None:
    """Spend the same bcrypt time as a real check when the email is unknown,
    so login latency does not reveal which addresses have an account."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_urlsafe(16))
    verify_password(password, _dummy_hash)


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
    pw_hash = hash_password(body.password)
    try:
        # One unit: a failure halfway used to leave an orphaned household
        # (asyncpg runs in autocommit, so db.commit() does not group writes).
        async with database_transaction(db):
            cur = await db.execute(
                "INSERT INTO households (name) VALUES (?)", (household_name,)
            )
            household_id = cur.lastrowid

            # New accounts get the language chosen on the landing page (NL/EN
            # toggle, Dutch default) so the app opens in the signup language.
            cur2 = await db.execute(
                """INSERT INTO accounts
                   (household_id, email, name, password_hash, language, role)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (household_id, body.email.lower(), body.name.strip(), pw_hash, body.language, "owner"),
            )
            account_id = cur2.lastrowid

            # The account's own profile; account_id is the link between the two
            # tables (migration 0073), the name is just a label.
            await db.execute(
                "INSERT INTO users (name, household_id, language, account_id) VALUES (?, ?, ?, ?)",
                (body.name.strip(), household_id, body.language, account_id),
            )

            for name, icon, sort_order in DEFAULT_LOCATIONS:
                await db.execute(
                    "INSERT INTO locations (name, icon, sort_order, household_id) VALUES (?, ?, ?, ?)",
                    (name, icon, sort_order, household_id),
                )
    except asyncpg.exceptions.UniqueViolationError:
        # Two signups for one address raced past the check above.
        raise HTTPException(status_code=409, detail="Email already registered")

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
        (body.email.lower().strip(),),
    )
    if not rows:
        _verify_against_nothing(body.password)
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
            (account[0]["id"], hash_reset_token(token), expires_at),
        )
        await db.commit()

        app_url = os.environ.get("APP_URL", "http://localhost:5173")
        reset_link = f"{app_url}/reset-password?token={token}"
        # Resend's client is synchronous HTTP; off the event loop it goes.
        await run_in_threadpool(
            send_password_reset,
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

    # Validate password length before spending the token
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    rows = await db.execute_fetchall(
        """SELECT id, account_id, expires_at, used_at
           FROM password_reset_tokens
           WHERE token = ?""",
        (hash_reset_token(body.token),),
    )
    if not rows:
        raise HTTPException(
            status_code=400, detail="Reset link is invalid or has expired"
        )

    token_row = dict(rows[0])

    expires = token_row["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if token_row.get("used_at") is not None or now > expires:
        raise HTTPException(
            status_code=400, detail="Reset link is invalid or has expired"
        )

    pw_hash = hash_password(body.new_password)
    async with database_transaction(db):
        # Claim the token atomically: two requests racing with one link must
        # not both get to set a password.
        claimed = await db.execute(
            "UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL",
            (now, token_row["id"]),
        )
        if claimed.rowcount != 1:
            raise HTTPException(
                status_code=400, detail="Reset link is invalid or has expired"
            )
        await db.execute(
            "UPDATE accounts SET password_hash = ? WHERE id = ?",
            (pw_hash, token_row["account_id"]),
        )
        # Any other link sent to this account is now moot; an older one in an
        # inbox must not be able to undo the reset.
        await db.execute(
            """UPDATE password_reset_tokens SET used_at = ?
               WHERE account_id = ? AND used_at IS NULL""",
            (now, token_row["account_id"]),
        )

    return {"message": "Password updated"}





@router.post("/change-password")
async def change_password(body: ChangePasswordInput, current=Depends(require_editor), db=Depends(db_dep)):
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
        """SELECT a.id, a.household_id, a.email, a.name, a.avatar, a.is_admin, a.role,
                  h.name AS household_name
           FROM accounts a
           JOIN households h ON h.id = a.household_id
           WHERE a.id = ?""",
        (current["account_id"],),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    account = dict(rows[0])
    return {
        **account,
        "is_admin": bool(account["is_admin"]),
        "capabilities": capabilities_for_role(account["role"]),
    }
