"""Persistent state for the dead-man's-switch watchdog, stored as a tiny JSON
object in R2 instead of a Postgres row.

The heartbeat (~every 30 min from Leon's PC) and the GitHub Actions check
(twice an hour) are the most frequent DB touchers in the app; routing them
through Neon kept its compute from ever auto-suspending and helped exhaust the
free-tier compute quota. R2 is effectively free for a few tiny ops a day and
doesn't gate the primary database. Same three fields as the old row:
last_heartbeat (naive UTC), summary, outage_alerted.
"""
import asyncio
import datetime
import json
from dataclasses import dataclass

from services.storage import Storage, build_storage_from_env

STATE_KEY = "watchdog/state.json"


@dataclass
class WatchdogState:
    last_heartbeat: datetime.datetime | None  # naive UTC, repo convention
    summary: str
    outage_alerted: bool


# Lazily-built singleton so importing this module never requires R2 env vars
# (tests inject a fake via set_storage; production builds from env on first use).
_storage: Storage | None = None


def set_storage(storage: Storage | None) -> None:
    """Inject a storage backend (tests) or reset to None to rebuild from env."""
    global _storage
    _storage = storage


def _get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = build_storage_from_env()
    return _storage


def _parse(raw: bytes | None) -> WatchdogState:
    if not raw:
        # No object yet (first run / fresh bucket) → empty state. A stale read
        # here just means "no heartbeat seen", which the check handles.
        return WatchdogState(last_heartbeat=None, summary="", outage_alerted=False)
    data = json.loads(raw)
    hb = data.get("last_heartbeat")
    return WatchdogState(
        last_heartbeat=datetime.datetime.fromisoformat(hb) if hb else None,
        summary=data.get("summary", ""),
        outage_alerted=bool(data.get("outage_alerted", False)),
    )


def _serialize(state: WatchdogState) -> bytes:
    return json.dumps(
        {
            "last_heartbeat": state.last_heartbeat.isoformat() if state.last_heartbeat else None,
            "summary": state.summary,
            "outage_alerted": state.outage_alerted,
        }
    ).encode()


async def read_state() -> WatchdogState:
    # boto3 is blocking; off-load to a thread so the event loop stays free.
    raw = await asyncio.to_thread(_get_storage().get, STATE_KEY)
    return _parse(raw)


async def write_state(state: WatchdogState) -> None:
    await asyncio.to_thread(
        _get_storage().put, STATE_KEY, _serialize(state), "application/json"
    )
