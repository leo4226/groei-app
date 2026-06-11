"""Notification preferences + daily digest endpoints (#137).

- GET/PUT /settings/notifications — per-account digest prefs (auth required)
- POST /internal/send-digests — cron trigger, X-Digest-Secret shared secret
- GET /notifications/unsubscribe — signed-token opt-out, no login required
"""
import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from auth import get_current_account
from database import db_dep
from services.digest import send_due_digests, verify_unsubscribe_token

router = APIRouter(tags=["notifications"])


class NotificationPrefs(BaseModel):
    digest_enabled: bool
    digest_time: str  # "HH:MM"


class NotificationPrefsUpdate(BaseModel):
    digest_enabled: bool
    digest_time: str = Field(default="08:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


def _to_prefs(row) -> NotificationPrefs:
    return NotificationPrefs(
        digest_enabled=bool(row["digest_enabled"]),
        digest_time=str(row["digest_time"])[:5],
    )


async def _get_or_create_prefs(db, account_id: int) -> dict:
    # Explicit RETURNING: the db adapter auto-appends "RETURNING id" to
    # bare INSERTs, but this table's PK is account_id (no id column).
    cur = await db.execute(
        "INSERT INTO notification_preferences (account_id) VALUES (?) "
        "ON CONFLICT (account_id) DO NOTHING RETURNING account_id",
        (account_id,),
    )
    await cur.fetchall()  # drain so sqlite can commit
    await db.commit()
    rows = await db.execute_fetchall(
        "SELECT digest_enabled, digest_time FROM notification_preferences WHERE account_id = ?",
        (account_id,),
    )
    return rows[0]


@router.get("/settings/notifications", response_model=NotificationPrefs)
async def get_notification_prefs(db=Depends(db_dep), account=Depends(get_current_account)):
    row = await _get_or_create_prefs(db, account["account_id"])
    return _to_prefs(row)


@router.put("/settings/notifications", response_model=NotificationPrefs)
async def update_notification_prefs(
    body: NotificationPrefsUpdate,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    cur = await db.execute(
        """
        INSERT INTO notification_preferences (account_id, digest_enabled, digest_time)
        VALUES (?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET
            digest_enabled = excluded.digest_enabled,
            digest_time = excluded.digest_time
        RETURNING account_id
        """,
        (account["account_id"], body.digest_enabled, body.digest_time),
    )
    await cur.fetchall()
    await db.commit()
    return NotificationPrefs(digest_enabled=body.digest_enabled, digest_time=body.digest_time)


@router.post("/internal/send-digests")
async def send_digests(
    db=Depends(db_dep),
    x_digest_secret: str = Header(default=""),
):
    expected = os.environ.get("DIGEST_CRON_SECRET", "")
    # Fail closed when the secret is unconfigured; constant-time compare otherwise.
    if not expected or not secrets.compare_digest(
        x_digest_secret.encode(), expected.encode()
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Counts only — never account data in the response.
    return await send_due_digests(db)


@router.get("/notifications/unsubscribe")
async def unsubscribe(token: str = "", db=Depends(db_dep)):
    account_id = verify_unsubscribe_token(token)
    if account_id is None:
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link")
    cur = await db.execute(
        """
        INSERT INTO notification_preferences (account_id, digest_enabled)
        VALUES (?, ?)
        ON CONFLICT (account_id) DO UPDATE SET digest_enabled = excluded.digest_enabled
        RETURNING account_id
        """,
        (account_id, False),
    )
    await cur.fetchall()
    await db.commit()
    return HTMLResponse(
        """<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8"><title>Afgemeld — Floreren</title></head>
<body style="margin:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="background:#fff;border-radius:16px;padding:40px;max-width:420px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<h1 style="font-family:Georgia,serif;color:#4a7c59;margin:0 0 12px;">Floreren</h1>
<p style="color:#333;font-size:16px;margin:0;">Je dagelijkse digest is uitgeschakeld. ✅</p>
<p style="color:#999;font-size:13px;margin:12px 0 0;">Je kunt dit altijd weer aanzetten in de app onder Instellingen.</p>
</div>
</body></html>"""
    )
