"""Dead-man's switch for Leon's home-PC watchdog (see Projects/watchdog).

- POST /internal/watchdog/heartbeat — the PC checks in every 30 min
- POST /internal/watchdog/check — GitHub Actions cron; alerts via Telegram
  when the heartbeat is stale (>90 min) during awake hours (08:00–23:30
  Europe/Amsterdam), exactly once per outage, with one recovery message.

Same shared-secret pattern as the digest cron (X-Digest-Secret): fail
closed, constant-time compare. The Fly machine auto-stops, so the cadence
comes from GitHub Actions, not an in-app scheduler.
"""
import datetime
import os
import secrets
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from database import db_dep

router = APIRouter(prefix="/internal/watchdog", tags=["watchdog"])

STALE_AFTER = datetime.timedelta(minutes=90)
WINDOW_START = datetime.time(8, 0)
WINDOW_END = datetime.time(23, 30)
AMS = ZoneInfo("Europe/Amsterdam")


def _now_ams() -> datetime.datetime:
    return datetime.datetime.now(AMS)


def _require_secret(provided: str) -> None:
    expected = os.environ.get("WATCHDOG_SECRET", "")
    if not expected or not secrets.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="bad watchdog secret")


async def _send_telegram(text: str) -> bool:
    token = os.environ.get("WATCHDOG_TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("WATCHDOG_TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
        )
        return resp.status_code == 200


class Heartbeat(BaseModel):
    summary: str = ""


@router.post("/heartbeat")
async def heartbeat(
    body: Heartbeat,
    db=Depends(db_dep),
    x_watchdog_secret: str = Header(default=""),
):
    _require_secret(x_watchdog_secret)
    # Naive UTC datetime object — repo convention for TIMESTAMP columns.
    # Use _now_ams() so tests can monkeypatch the clock.
    now = _now_ams().astimezone(datetime.timezone.utc).replace(tzinfo=None)
    await db.execute(
        "UPDATE watchdog_state SET last_heartbeat = ?, summary = ? WHERE id = 1",
        (now, body.summary),
    )
    await db.commit()
    return {"ok": True}


@router.post("/check")
async def check(
    db=Depends(db_dep),
    x_watchdog_secret: str = Header(default=""),
):
    _require_secret(x_watchdog_secret)
    row = await (
        await db.execute(
            "SELECT last_heartbeat, outage_alerted FROM watchdog_state WHERE id = 1"
        )
    ).fetchone()
    last_hb, outage_alerted = row["last_heartbeat"], bool(row["outage_alerted"])
    if isinstance(last_hb, str):  # aiosqlite (tests) returns TEXT
        last_hb = datetime.datetime.fromisoformat(last_hb)

    now_ams = _now_ams()
    now_utc = now_ams.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    stale = last_hb is None or (now_utc - last_hb) > STALE_AFTER
    in_window = WINDOW_START <= now_ams.time() <= WINDOW_END

    alerted = False
    if stale and in_window and not outage_alerted:
        since = last_hb.strftime("%a %H:%M UTC") if last_hb else "ever (no heartbeat yet)"
        if await _send_telegram(
            f"🚨 Watchdog dead-man's switch: your PC hasn't checked in since {since}. "
            "The watchdog, the PC, or the internet connection is down."
        ):
            await db.execute(
                "UPDATE watchdog_state SET outage_alerted = ? WHERE id = 1", (True,)
            )
            await db.commit()
            alerted = True
    elif not stale and outage_alerted:
        await _send_telegram("✅ Watchdog: PC is back online and heartbeating again.")
        await db.execute(
            "UPDATE watchdog_state SET outage_alerted = ? WHERE id = 1", (False,)
        )
        await db.commit()

    return {"stale": stale, "in_window": in_window, "alerted": alerted}
