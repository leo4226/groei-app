"""Dead-man's switch for Leon's home-PC watchdog (see Projects/watchdog).

- POST /internal/watchdog/heartbeat — the PC checks in every 30 min
- POST /internal/watchdog/check — GitHub Actions cron; alerts via Telegram
  when the heartbeat is stale (>90 min) during awake hours (08:00–23:30
  Europe/Amsterdam), exactly once per outage, with one recovery message.

State (last heartbeat + outage flag) lives in R2, not Postgres: these two
callers fire every ~30 min around the clock, and keeping the Neon compute
awake for them helped blow its free-tier quota. R2 is essentially free for a
handful of tiny ops a day. Same shared-secret pattern as the digest cron
(X-Digest-Secret): fail closed, constant-time compare. The Fly machine
auto-stops, so the cadence comes from GitHub Actions, not an in-app scheduler.
"""
import datetime
import os
import secrets
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from services.watchdog_state import read_state, write_state

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
    x_watchdog_secret: str = Header(default=""),
):
    _require_secret(x_watchdog_secret)
    # Naive UTC — repo convention for stored timestamps. Use _now_ams() so
    # tests can monkeypatch the clock. Read-modify-write preserves the
    # outage_alerted flag the check owns.
    now = _now_ams().astimezone(datetime.timezone.utc).replace(tzinfo=None)
    state = await read_state()
    state.last_heartbeat = now
    state.summary = body.summary
    await write_state(state)
    return {"ok": True}


@router.post("/check")
async def check(
    x_watchdog_secret: str = Header(default=""),
):
    _require_secret(x_watchdog_secret)
    state = await read_state()
    last_hb = state.last_heartbeat

    now_ams = _now_ams()
    now_utc = now_ams.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    stale = last_hb is None or (now_utc - last_hb) > STALE_AFTER
    in_window = WINDOW_START <= now_ams.time() <= WINDOW_END

    alerted = False
    if stale and in_window and not state.outage_alerted:
        since = last_hb.strftime("%a %H:%M UTC") if last_hb else "ever (no heartbeat yet)"
        if await _send_telegram(
            f"🚨 Watchdog dead-man's switch: your PC hasn't checked in since {since}. "
            "The watchdog, the PC, or the internet connection is down."
        ):
            state.outage_alerted = True
            await write_state(state)
            alerted = True
    elif not stale and state.outage_alerted:
        await _send_telegram("✅ Watchdog: PC is back online and heartbeating again.")
        state.outage_alerted = False
        await write_state(state)

    return {"stale": stale, "in_window": in_window, "alerted": alerted}
