"""Dead-man's switch endpoints (watchdog).

Heartbeat stores a timestamp; check alerts when the heartbeat is stale
during awake hours (08:00–23:30 Europe/Amsterdam), once per outage, with
one recovery message when heartbeats resume.

State lives in R2 (not Postgres); these tests inject an in-memory fake store
so nothing touches a real bucket.
"""
import datetime
import json
import os

import pytest

import routers.watchdog as wd
import services.watchdog_state as wstate

os.environ["WATCHDOG_SECRET"] = "test-secret"

AMS = datetime.timezone(datetime.timedelta(hours=2))  # CEST in June
HDR = {"X-Watchdog-Secret": "test-secret"}


class _FakeStorage:
    """Minimal in-memory stand-in for services.storage.Storage."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def get(self, key: str) -> bytes | None:
        return self.objects.get(key)

    def put(self, key: str, data: bytes, content_type: str) -> str:
        self.objects[key] = data
        return key

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)


@pytest.fixture
def store():
    fake = _FakeStorage()
    wstate.set_storage(fake)
    yield fake
    wstate.set_storage(None)


@pytest.fixture
def sent(monkeypatch):
    messages = []

    async def fake_send(text):
        messages.append(text)
        return True

    monkeypatch.setattr(wd, "_send_telegram", fake_send)
    return messages


def _at(hour, minute=0):
    """A fixed 'now' in Amsterdam time on 2026-06-12."""
    return datetime.datetime(2026, 6, 12, hour, minute, tzinfo=AMS)


def _stored(store) -> dict:
    return json.loads(store.objects[wstate.STATE_KEY])


async def test_heartbeat_requires_secret(client, store):
    r = await client.post("/api/internal/watchdog/heartbeat", json={"summary": "x"})
    assert r.status_code == 403


async def test_heartbeat_stores_timestamp(client, store):
    r = await client.post(
        "/api/internal/watchdog/heartbeat",
        json={"summary": "20/20 checks ok"},
        headers=HDR,
    )
    assert r.status_code == 200
    state = _stored(store)
    assert state["last_heartbeat"] is not None and state["summary"] == "20/20 checks ok"


async def test_check_fresh_heartbeat_no_alert(client, store, sent, monkeypatch):
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(14, 0))
    await client.post("/api/internal/watchdog/heartbeat", json={"summary": "ok"}, headers=HDR)
    r = await client.post("/api/internal/watchdog/check", headers=HDR)
    assert r.status_code == 200 and r.json()["alerted"] is False
    assert sent == []


async def test_check_stale_in_window_alerts_once(client, store, sent, monkeypatch):
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(10, 0))
    await client.post("/api/internal/watchdog/heartbeat", json={"summary": "ok"}, headers=HDR)
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(14, 0))  # 4h later: stale
    for _ in range(3):
        await client.post("/api/internal/watchdog/check", headers=HDR)
    assert len(sent) == 1 and "hasn't checked in" in sent[0]


async def test_check_stale_outside_window_silent(client, store, sent, monkeypatch):
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(3, 0))  # 03:00 — PC off at night
    r = await client.post("/api/internal/watchdog/check", headers=HDR)
    assert r.json()["alerted"] is False and sent == []


async def test_recovery_message_when_heartbeat_resumes(client, store, sent, monkeypatch):
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(8, 30))
    await client.post("/api/internal/watchdog/heartbeat", json={"summary": "ok"}, headers=HDR)
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(14, 0))
    await client.post("/api/internal/watchdog/check", headers=HDR)
    assert len(sent) == 1  # outage alert

    # PC comes back: heartbeat resumes, next check sends recovery and re-arms
    await client.post("/api/internal/watchdog/heartbeat", json={"summary": "ok"}, headers=HDR)
    await client.post("/api/internal/watchdog/check", headers=HDR)
    assert len(sent) == 2 and "back online" in sent[1]


async def test_check_with_no_state_yet_is_stale_but_safe(client, store, sent, monkeypatch):
    # Fresh bucket (no heartbeat object yet): an in-window check reports stale
    # and alerts once, with no crash on the missing state.
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(10, 0))
    r = await client.post("/api/internal/watchdog/check", headers=HDR)
    body = r.json()
    assert body["stale"] is True and body["alerted"] is True
    assert "no heartbeat yet" in sent[0]
