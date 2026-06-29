"""Web push v2 (#139): subscriptions, prefs, daily dispatch, dead-endpoint pruning.

The actual webpush send is mocked at the services.push boundary — these tests
never talk to a push service.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio

AMS = ZoneInfo("Europe/Amsterdam")

SUB = {
    "endpoint": "https://push.example/abc123",
    "keys": {"p256dh": "key-p256dh", "auth": "key-auth"},
}


async def _seed_overdue_plant(db, household_id=1):
    await db.execute(
        "INSERT INTO plants (id, name, is_active, household_id) VALUES (10, 'Monstera', 1, ?)",
        (household_id,),
    )
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (10, 'water', 7, '2026-06-09', 1)"
    )
    await db.commit()


async def _enable_push(db, account_id=1, digest_time="08:00"):
    await db.execute(
        "INSERT INTO notification_preferences (account_id, push_enabled, digest_time) "
        "VALUES (?, 1, ?) "
        "ON CONFLICT (account_id) DO UPDATE SET push_enabled = 1, digest_time = excluded.digest_time",
        (account_id, digest_time),
    )
    await db.commit()


@pytest.fixture
def sent_pushes(monkeypatch):
    """Capture outgoing pushes instead of hitting a push service."""
    sent = []

    def fake_send(subscription, payload):
        sent.append({"endpoint": subscription["endpoint"], "payload": payload})
        return "ok"

    import services.digest as digest
    monkeypatch.setattr(digest, "send_push", fake_send)
    return sent


@pytest.fixture
def at_digest_hour(monkeypatch):
    import services.digest as digest
    monkeypatch.setattr(digest, "_now", lambda: datetime(2026, 6, 11, 8, 30, tzinfo=AMS))


@pytest.fixture
def cron_secret(monkeypatch):
    monkeypatch.setenv("DIGEST_CRON_SECRET", "test-cron-secret")
    return {"X-Digest-Secret": "test-cron-secret"}


# ── prefs ────────────────────────────────────────────────────────────────

async def test_prefs_include_push_enabled(client, seeded_db, auth_header):
    res = await client.get("/api/settings/notifications", headers=auth_header)
    assert res.status_code == 200
    assert res.json()["push_enabled"] is False

    res = await client.put(
        "/api/settings/notifications",
        json={"digest_enabled": False, "digest_time": "08:00", "push_enabled": True},
        headers=auth_header,
    )
    assert res.status_code == 200
    assert res.json()["push_enabled"] is True

    res = await client.get("/api/settings/notifications", headers=auth_header)
    assert res.json()["push_enabled"] is True


# ── subscription endpoints ───────────────────────────────────────────────

async def test_subscription_requires_auth(client, seeded_db):
    assert (await client.post("/api/push/subscription", json=SUB)).status_code in (401, 403)
    assert (
        await client.request("DELETE", "/api/push/subscription", json={"endpoint": SUB["endpoint"]})
    ).status_code in (401, 403)


async def test_subscribe_upserts_by_endpoint(client, seeded_db, auth_header):
    res = await client.post("/api/push/subscription", json=SUB, headers=auth_header)
    assert res.status_code == 200
    # Same endpoint again (e.g. re-subscribe after permission re-grant) — no dupe
    res = await client.post("/api/push/subscription", json=SUB, headers=auth_header)
    assert res.status_code == 200

    rows = await seeded_db.execute_fetchall("SELECT account_id, endpoint FROM push_subscriptions")
    assert len(rows) == 1
    assert rows[0]["account_id"] == 1


async def test_unsubscribe_deletes_own_row(client, seeded_db, auth_header):
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)
    res = await client.request(
        "DELETE", "/api/push/subscription",
        json={"endpoint": SUB["endpoint"]}, headers=auth_header,
    )
    assert res.status_code == 200
    rows = await seeded_db.execute_fetchall("SELECT id FROM push_subscriptions")
    assert rows == []


async def test_unsubscribe_cannot_delete_foreign_subscription(client, seeded_db, auth_header):
    # Subscription belongs to account 2; account 1 (auth_header) must not remove it.
    await seeded_db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other');
        INSERT INTO accounts (id, household_id, email, name, password_hash)
        VALUES (2, 2, 'other@example.com', 'Other', 'x');
        INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth)
        VALUES (2, 'https://push.example/foreign', 'k', 'a');
    """)
    await seeded_db.commit()

    res = await client.request(
        "DELETE", "/api/push/subscription",
        json={"endpoint": "https://push.example/foreign"}, headers=auth_header,
    )
    assert res.status_code == 200  # idempotent response shape
    rows = await seeded_db.execute_fetchall("SELECT account_id FROM push_subscriptions")
    assert len(rows) == 1 and rows[0]["account_id"] == 2  # row survived


async def test_vapid_public_key_endpoint(client, seeded_db, monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "test-public-key")
    res = await client.get("/api/push/vapid-public-key")
    assert res.status_code == 200
    assert res.json()["key"] == "test-public-key"


# ── dispatch via the cron endpoint ───────────────────────────────────────

async def test_push_sent_to_opted_in_account(
    client, seeded_db, cron_secret, sent_pushes, at_digest_hour, auth_header
):
    await _seed_overdue_plant(seeded_db)
    await _enable_push(seeded_db)
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)

    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.status_code == 200
    assert res.json()["push_sent"] == 1
    assert len(sent_pushes) == 1
    assert "/maps" in sent_pushes[0]["payload"]["url"]
    assert "Monstera" in sent_pushes[0]["payload"]["body"]

    # The due schedule is stamped with its due date so it won't re-ping until
    # completion advances next_due.
    row = (await seeded_db.execute_fetchall(
        "SELECT notified_for_due FROM care_schedules WHERE plant_id = 10"
    ))[0]
    assert str(row["notified_for_due"])[:10] == "2026-06-09"


async def test_push_idempotent_within_day(
    client, seeded_db, cron_secret, sent_pushes, at_digest_hour, auth_header
):
    await _seed_overdue_plant(seeded_db)
    await _enable_push(seeded_db)
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)

    await client.post("/api/internal/send-digests", headers=cron_secret)
    res2 = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res2.json()["push_sent"] == 0
    assert len(sent_pushes) == 1


async def test_no_push_without_tasks_or_subscription(
    client, seeded_db, cron_secret, sent_pushes, at_digest_hour, auth_header
):
    # enabled + subscribed but no tasks → nothing
    await _enable_push(seeded_db)
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)
    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.json()["push_sent"] == 0
    assert sent_pushes == []


async def test_gone_subscription_is_pruned(
    client, seeded_db, cron_secret, at_digest_hour, auth_header, monkeypatch
):
    await _seed_overdue_plant(seeded_db)
    await _enable_push(seeded_db)
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)

    import services.digest as digest
    monkeypatch.setattr(digest, "send_push", lambda sub, payload: "gone")

    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.status_code == 200
    rows = await seeded_db.execute_fetchall("SELECT id FROM push_subscriptions")
    assert rows == []  # 410 Gone → row pruned at send time


@pytest.fixture
def at_night(monkeypatch):
    import services.digest as digest
    monkeypatch.setattr(digest, "_now", lambda: datetime(2026, 6, 11, 3, 30, tzinfo=AMS))


async def test_no_care_push_overnight(
    client, seeded_db, cron_secret, sent_pushes, at_night, auth_header
):
    # A due task at 3:30am must not ping — care pushes are daytime-only.
    await _seed_overdue_plant(seeded_db)
    await _enable_push(seeded_db)
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)

    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.json()["push_sent"] == 0
    assert res.json().get("off_hours") is True
    assert sent_pushes == []


async def test_care_push_renotifies_after_completion(
    client, seeded_db, cron_secret, sent_pushes, at_digest_hour, auth_header
):
    # Notify once for the current due cycle…
    await _seed_overdue_plant(seeded_db)
    await _enable_push(seeded_db)
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)
    await client.post("/api/internal/send-digests", headers=cron_secret)
    assert len(sent_pushes) == 1

    # …completing the task advances next_due to a new (still-due) date, which no
    # longer matches notified_for_due → the next cycle pings again.
    await seeded_db.execute(
        "UPDATE care_schedules SET next_due = '2026-06-10' WHERE plant_id = 10"
    )
    await seeded_db.commit()
    await client.post("/api/internal/send-digests", headers=cron_secret)
    assert len(sent_pushes) == 2


# ── manual test-push endpoint (#295) ─────────────────────────────────────

async def test_test_push_requires_auth(client, seeded_db):
    assert (await client.post("/api/push/test")).status_code in (401, 403)


async def test_test_push_no_subscription(client, seeded_db, auth_header):
    res = await client.post("/api/push/test", headers=auth_header)
    assert res.status_code == 200
    assert res.json()["result"] == "no_subscription"


async def test_test_push_reports_unconfigured_vapid(
    client, seeded_db, auth_header, monkeypatch
):
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)
    res = await client.post("/api/push/test", headers=auth_header)
    assert res.json()["result"] == "vapid_unconfigured"


async def test_test_push_delivers(client, seeded_db, auth_header, monkeypatch):
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "test-private-key")
    import routers.notifications as notif
    monkeypatch.setattr(notif, "send_push", lambda sub, payload: "ok")
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)

    res = await client.post("/api/push/test", headers=auth_header)
    body = res.json()
    assert body["result"] == "ok"
    assert body["delivered"] == 1


async def test_test_push_reports_all_failed(client, seeded_db, auth_header, monkeypatch):
    # VAPID configured but the push service rejects every send → all_failed,
    # and the (live) subscription must NOT be pruned.
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "test-private-key")
    import routers.notifications as notif
    monkeypatch.setattr(notif, "send_push", lambda sub, payload: "error")
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)

    res = await client.post("/api/push/test", headers=auth_header)
    body = res.json()
    assert body["result"] == "all_failed"
    assert body["failed"] == 1
    rows = await seeded_db.execute_fetchall("SELECT id FROM push_subscriptions")
    assert len(rows) == 1  # transient error → subscription left intact


async def test_test_push_prunes_gone_subscription(
    client, seeded_db, auth_header, monkeypatch
):
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "test-private-key")
    import routers.notifications as notif
    monkeypatch.setattr(notif, "send_push", lambda sub, payload: "gone")
    await client.post("/api/push/subscription", json=SUB, headers=auth_header)

    res = await client.post("/api/push/test", headers=auth_header)
    assert res.json()["result"] == "all_gone"
    rows = await seeded_db.execute_fetchall("SELECT id FROM push_subscriptions")
    assert rows == []
