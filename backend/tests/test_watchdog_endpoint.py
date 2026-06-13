"""Dead-man's switch endpoints (watchdog).

Heartbeat stores a timestamp; check alerts when the heartbeat is stale
during awake hours (08:00–23:30 Europe/Amsterdam), once per outage, with
one recovery message when heartbeats resume.
"""
import datetime
import os

import pytest

import routers.watchdog as wd

os.environ["WATCHDOG_SECRET"] = "test-secret"

AMS = datetime.timezone(datetime.timedelta(hours=2))  # CEST in June


@pytest.fixture
async def watchdog_table(seeded_db):
    await seeded_db.execute(
        """CREATE TABLE watchdog_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            last_heartbeat TIMESTAMP,
            summary TEXT,
            outage_alerted BOOLEAN NOT NULL DEFAULT 0
        )"""
    )
    await seeded_db.execute("INSERT INTO watchdog_state (id) VALUES (1)")
    await seeded_db.commit()
    return seeded_db


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


async def test_heartbeat_requires_secret(client, watchdog_table):
    r = await client.post("/api/internal/watchdog/heartbeat", json={"summary": "x"})
    assert r.status_code == 403


async def test_heartbeat_stores_timestamp(client, watchdog_table):
    r = await client.post(
        "/api/internal/watchdog/heartbeat",
        json={"summary": "20/20 checks ok"},
        headers={"X-Watchdog-Secret": "test-secret"},
    )
    assert r.status_code == 200
    row = await (await watchdog_table.execute(
        "SELECT last_heartbeat, summary FROM watchdog_state WHERE id = 1"
    )).fetchone()
    assert row["last_heartbeat"] is not None and row["summary"] == "20/20 checks ok"


async def test_check_fresh_heartbeat_no_alert(client, watchdog_table, sent, monkeypatch):
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(14, 0))
    await client.post(
        "/api/internal/watchdog/heartbeat", json={"summary": "ok"},
        headers={"X-Watchdog-Secret": "test-secret"},
    )
    r = await client.post(
        "/api/internal/watchdog/check", headers={"X-Watchdog-Secret": "test-secret"}
    )
    assert r.status_code == 200 and r.json()["alerted"] is False
    assert sent == []


async def test_check_stale_in_window_alerts_once(client, watchdog_table, sent, monkeypatch):
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(10, 0))
    await client.post(
        "/api/internal/watchdog/heartbeat", json={"summary": "ok"},
        headers={"X-Watchdog-Secret": "test-secret"},
    )
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(14, 0))  # 4h later: stale
    for _ in range(3):
        await client.post(
            "/api/internal/watchdog/check", headers={"X-Watchdog-Secret": "test-secret"}
        )
    assert len(sent) == 1 and "hasn't checked in" in sent[0]


async def test_check_stale_outside_window_silent(client, watchdog_table, sent, monkeypatch):
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(3, 0))  # 03:00 — PC off at night
    r = await client.post(
        "/api/internal/watchdog/check", headers={"X-Watchdog-Secret": "test-secret"}
    )
    assert r.json()["alerted"] is False and sent == []


async def test_recovery_message_when_heartbeat_resumes(client, watchdog_table, sent, monkeypatch):
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(8, 30))
    await client.post(
        "/api/internal/watchdog/heartbeat", json={"summary": "ok"},
        headers={"X-Watchdog-Secret": "test-secret"},
    )
    monkeypatch.setattr(wd, "_now_ams", lambda: _at(14, 0))
    await client.post(
        "/api/internal/watchdog/check", headers={"X-Watchdog-Secret": "test-secret"}
    )
    assert len(sent) == 1  # outage alert

    # PC comes back: heartbeat resumes, next check sends recovery and re-arms
    await client.post(
        "/api/internal/watchdog/heartbeat", json={"summary": "ok"},
        headers={"X-Watchdog-Secret": "test-secret"},
    )
    await client.post(
        "/api/internal/watchdog/check", headers={"X-Watchdog-Secret": "test-secret"}
    )
    assert len(sent) == 2 and "back online" in sent[1]
