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
from services.digest import (
    APP_URL,
    send_due_care_pushes,
    send_due_digests,
    verify_unsubscribe_token,
)
from services.push import send_push

router = APIRouter(tags=["notifications"])


_HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class NotificationPrefs(BaseModel):
    digest_enabled: bool
    digest_time: str  # "HH:MM" — the email digest hour
    push_enabled: bool = False
    # Care pushes are only sent inside [quiet_start, quiet_end). NULL → default
    # 08:00–21:00. muted_care_types lists care_type keys the user has silenced.
    quiet_start: str | None = None
    quiet_end: str | None = None
    muted_care_types: list[str] = []


class NotificationPrefsUpdate(BaseModel):
    digest_enabled: bool
    digest_time: str = Field(default="08:00", pattern=_HHMM)
    push_enabled: bool = False
    quiet_start: str | None = Field(default=None, pattern=_HHMM)
    quiet_end: str | None = Field(default=None, pattern=_HHMM)
    muted_care_types: list[str] = []


def _split_muted(value) -> list[str]:
    return [c.strip() for c in str(value).split(",") if c.strip()] if value else []


def _to_prefs(row) -> NotificationPrefs:
    return NotificationPrefs(
        digest_enabled=bool(row["digest_enabled"]),
        digest_time=str(row["digest_time"])[:5],
        push_enabled=bool(row["push_enabled"]),
        quiet_start=str(row["quiet_start"])[:5] if row["quiet_start"] else None,
        quiet_end=str(row["quiet_end"])[:5] if row["quiet_end"] else None,
        muted_care_types=_split_muted(row["muted_care_types"]),
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
        "SELECT digest_enabled, digest_time, push_enabled, quiet_start, quiet_end, "
        "muted_care_types FROM notification_preferences WHERE account_id = ?",
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
    muted_csv = ",".join(body.muted_care_types)
    cur = await db.execute(
        """
        INSERT INTO notification_preferences
            (account_id, digest_enabled, digest_time, push_enabled,
             quiet_start, quiet_end, muted_care_types)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET
            digest_enabled = excluded.digest_enabled,
            digest_time = excluded.digest_time,
            push_enabled = excluded.push_enabled,
            quiet_start = excluded.quiet_start,
            quiet_end = excluded.quiet_end,
            muted_care_types = excluded.muted_care_types
        RETURNING account_id
        """,
        (account["account_id"], body.digest_enabled, body.digest_time, body.push_enabled,
         body.quiet_start, body.quiet_end, muted_csv),
    )
    await cur.fetchall()
    await db.commit()
    return NotificationPrefs(
        digest_enabled=body.digest_enabled,
        digest_time=body.digest_time,
        push_enabled=body.push_enabled,
        quiet_start=body.quiet_start,
        quiet_end=body.quiet_end,
        muted_care_types=body.muted_care_types,
    )


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str


@router.get("/push/vapid-public-key")
async def vapid_public_key():
    """Public by definition — the browser needs it to create a subscription."""
    key = os.environ.get("VAPID_PUBLIC_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Push not configured")
    return {"key": key}


@router.post("/push/subscription")
async def save_push_subscription(
    body: PushSubscriptionIn,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    """Upsert by endpoint — a browser re-subscribing must not create dupes."""
    await db.execute(
        """
        INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (endpoint) DO UPDATE SET
            account_id = excluded.account_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth
        """,
        (account["account_id"], body.endpoint, body.keys.p256dh, body.keys.auth),
    )
    await db.commit()
    return {"ok": True}


@router.delete("/push/subscription")
async def delete_push_subscription(
    body: PushUnsubscribeIn,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    await db.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = ? AND account_id = ?",
        (body.endpoint, account["account_id"]),
    )
    await db.commit()
    return {"ok": True}


class PushTestResult(BaseModel):
    # result is a diagnostic verdict the Settings UI maps to a message:
    #   ok                 — at least one subscription accepted the push
    #   no_subscription    — this account has no saved subscription (re-toggle)
    #   vapid_unconfigured — server is missing VAPID_PRIVATE_KEY (Fly secret)
    #   all_gone           — every subscription was dead (404/410) and pruned
    #   all_failed         — push service / VAPID error on every subscription
    result: str
    subscriptions: int
    delivered: int
    failed: int
    pruned: int


@router.post("/push/test", response_model=PushTestResult)
async def send_test_push(db=Depends(db_dep), account=Depends(get_current_account)):
    """Send a one-off test push to the caller's own subscriptions and report
    the outcome. Makes the otherwise-invisible delivery path debuggable: the
    daily digest only runs at the user's chosen hour, so without this there is
    no way to tell whether push is broken in VAPID config, a dead subscription,
    or OS-level delivery (iOS install)."""
    subs = await db.execute_fetchall(
        "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE account_id = ?",
        (account["account_id"],),
    )
    if not subs:
        return PushTestResult(
            result="no_subscription", subscriptions=0, delivered=0, failed=0, pruned=0
        )
    if not os.environ.get("VAPID_PRIVATE_KEY"):
        return PushTestResult(
            result="vapid_unconfigured",
            subscriptions=len(subs),
            delivered=0,
            failed=0,
            pruned=0,
        )

    payload = {
        "title": "Floreren",
        "body": "Test — pushmeldingen werken op dit apparaat.",
        "url": f"{APP_URL}/maps",
    }
    delivered = failed = pruned = 0
    for sub in subs:
        outcome = send_push(dict(sub), payload)
        if outcome == "ok":
            delivered += 1
        elif outcome == "gone":
            await db.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub["id"],))
            await db.commit()
            pruned += 1
        else:
            failed += 1

    if delivered:
        result = "ok"
    elif pruned and not failed:
        result = "all_gone"
    else:
        result = "all_failed"
    return PushTestResult(
        result=result,
        subscriptions=len(subs),
        delivered=delivered,
        failed=failed,
        pruned=pruned,
    )


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
    # Two independent channels, same hourly trigger: the daily email digest
    # (fires at each account's chosen hour) and real-time care pushes (fire
    # the hour a task becomes due). Counts only — never account data.
    email_counts = await send_due_digests(db)
    push_counts = await send_due_care_pushes(db)
    return {**email_counts, **push_counts}


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
