"""Notification preferences + daily digest endpoints (#137).

- GET/PUT /settings/notifications — per-account digest prefs (auth required)
- POST /internal/send-digests — cron trigger, X-Digest-Secret shared secret
- GET /notifications/unsubscribe — signed-token opt-out, no login required
- POST /notifications/snooze — signed-token care-push snooze, no login required
"""
import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

import services.digest as digest
import logging
logger = logging.getLogger(__name__)
from auth import get_current_account, require_editor
from care_types import parse_muted_care_types
from database import db_dep
from services import email_template as tpl
from services.digest import (
    APP_URL,
    SNOOZE_DURATIONS,
    send_due_care_pushes,
    send_due_digests,
    snooze_until,
    verify_snooze_token,
    verify_unsubscribe_token,
)
from services.push import send_push
from services.weather_task_service import sync_ephemeral_schedules

router = APIRouter(tags=["notifications"])


_HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"
# Quiet hours are whole-hour only (the UI offers hour selects), so the stored
# value always matches what the picker can show — no silent minute truncation.
_HH00 = r"^([01]\d|2[0-3]):00$"


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
    quiet_start: str | None = Field(default=None, pattern=_HH00)
    quiet_end: str | None = Field(default=None, pattern=_HH00)
    muted_care_types: list[str] = []


def _to_prefs(row) -> NotificationPrefs:
    return NotificationPrefs(
        digest_enabled=bool(row["digest_enabled"]),
        digest_time=str(row["digest_time"])[:5],
        push_enabled=bool(row["push_enabled"]),
        quiet_start=str(row["quiet_start"])[:5] if row["quiet_start"] else None,
        quiet_end=str(row["quiet_end"])[:5] if row["quiet_end"] else None,
        muted_care_types=parse_muted_care_types(row["muted_care_types"]),
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
    account=Depends(require_editor),
):
    # Same parser as the read path: trims + keeps only known care types so a
    # bad client can't pollute the stored set.
    muted = parse_muted_care_types(",".join(body.muted_care_types))
    muted_csv = ",".join(muted)
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
        muted_care_types=muted,
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
    account=Depends(require_editor),
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
    account=Depends(require_editor),
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
async def send_test_push(db=Depends(db_dep), account=Depends(require_editor)):
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
    # Refresh weather-driven ephemeral tasks (frost/heat) before dispatch so a
    # cold or hot forecast surfaces as a real-time push, not just on the next
    # dashboard open. Guarded: a weather-fetch hiccup must never block the
    # email/push channels below.
    weather_counts = {"weather_created": 0, "weather_deleted": 0}
    try:
        synced = await sync_ephemeral_schedules(db)
        weather_counts = {
            "weather_created": synced["created"],
            "weather_deleted": synced["deleted"],
        }
    except Exception:  # noqa: BLE001 — best-effort; never fail the digest run
        logger.warning("Weather ephemeral schedule sync failed (non-fatal)")
    # Two independent channels, same hourly trigger: the daily email digest
    # (fires at each account's chosen hour) and real-time care pushes (fire
    # the hour a task becomes due). Counts only — never account data.
    email_counts = await send_due_digests(db)
    push_counts = await send_due_care_pushes(db)
    return {**weather_counts, **email_counts, **push_counts}


@router.post("/notifications/snooze")
async def snooze_care_pushes(
    token: str = "",
    for_: str = Query(default="2h", alias="for"),
    db=Depends(db_dep),
):
    """Defer the household's currently-due care pushes (#181). Called by the
    service worker's notification action buttons, authenticated by the signed
    snooze token in the push payload — no login (the SW has no JWT)."""
    household_id = verify_snooze_token(token)
    if household_id is None:
        raise HTTPException(status_code=400, detail="Invalid snooze link")
    kind = for_ if for_ in SNOOZE_DURATIONS else "2h"
    # Resolve _now via the module so a frozen clock in tests is honoured (and so
    # the endpoint shares the dispatch's notion of "now").
    now = digest._now()
    until = snooze_until(kind, now)
    await db.execute(
        """
        UPDATE care_schedules SET snoozed_until = ?
        WHERE is_active = 1 AND next_due <= ?
          AND plant_id IN (
              SELECT id FROM plants WHERE household_id = ? AND is_active = 1
          )
        """,
        (until, now.date(), household_id),
    )
    await db.commit()
    return {"ok": True, "for": kind, "snoozed_until": until.isoformat() + "Z"}


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

    # The page was hardcoded Dutch, so an English reader unsubscribing from an
    # English email landed on a Dutch confirmation (#889).
    lang_rows = await db.execute_fetchall(
        "SELECT language FROM accounts WHERE id = ?", (account_id,)
    )
    row_lang = lang_rows[0]["language"] if lang_rows else "nl"
    lang = "en" if (row_lang or "nl") == "en" else "nl"
    copy = {
        "nl": {
            "title": "Afgemeld — Floreren",
            "done": "Je dagelijkse mail is uitgeschakeld.",
            "note": "Je kunt hem altijd weer aanzetten in de app, onder Instellingen.",
        },
        "en": {
            "title": "Unsubscribed — Floreren",
            "done": "Your daily email is switched off.",
            "note": "You can turn it back on any time in the app, under Settings.",
        },
    }[lang]
    body = (
        tpl.paragraph(f'{copy["done"]} ✅')
        + tpl.paragraph(copy["note"], muted=True, size=14)
        + tpl.button("Floreren", APP_URL)
    )
    return HTMLResponse(
        tpl.render_email(lang=lang, preheader="", body_html=body)
        .replace("<title>", "<title>")
        .replace("</head>", f"<title>{copy['title']}</title></head>", 1)
    )
