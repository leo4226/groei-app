"""Tests for #137: daily care digest — prefs endpoints, digest selection,
idempotence stamp, cron-secret auth, and unsubscribe tokens."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

AMS = ZoneInfo("Europe/Amsterdam")


# ── helpers ──────────────────────────────────────────────────────────────

async def _ensure_join_tables(db):
    # The schedule query LEFT JOINs locations and maps; conftest's shared
    # schema doesn't define them (several test files add their own variants).
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY, name TEXT, map_type TEXT);
    """)


async def _seed_overdue_plant(db, household_id=1):
    await _ensure_join_tables(db)
    await db.execute(
        "INSERT INTO plants (id, name, is_active, household_id) VALUES (10, 'Monstera', 1, ?)",
        (household_id,),
    )
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (10, 'water', 7, '2026-06-09', 1)"
    )
    await db.commit()


async def _enable_digest(db, account_id=1, digest_time="08:00", last_sent=None):
    await _ensure_join_tables(db)
    await db.execute(
        "INSERT INTO notification_preferences (account_id, digest_enabled, digest_time, last_digest_sent_on) "
        "VALUES (?, 1, ?, ?)",
        (account_id, digest_time, last_sent),
    )
    await db.commit()


@pytest.fixture
def sent_emails(monkeypatch):
    """Capture outgoing digest emails instead of hitting Resend."""
    sent = []

    def fake_send(to_email, subject, html):
        sent.append({"to": to_email, "subject": subject, "html": html})
        return True

    import services.digest as digest
    monkeypatch.setattr(digest, "send_email", fake_send)
    return sent


@pytest.fixture
def at_digest_hour(monkeypatch):
    """Freeze 'now' at 2026-06-11 08:30 Europe/Amsterdam (digest hour 8)."""
    import services.digest as digest
    monkeypatch.setattr(digest, "_now", lambda: datetime(2026, 6, 11, 8, 30, tzinfo=AMS))


@pytest.fixture
def cron_secret(monkeypatch):
    monkeypatch.setenv("DIGEST_CRON_SECRET", "test-cron-secret")
    return {"X-Digest-Secret": "test-cron-secret"}


# ── preferences endpoints ────────────────────────────────────────────────

async def test_get_prefs_requires_auth(client, seeded_db):
    res = await client.get("/api/settings/notifications")
    assert res.status_code in (401, 403)


async def test_put_prefs_requires_auth(client, seeded_db):
    res = await client.put("/api/settings/notifications", json={"digest_enabled": True})
    assert res.status_code in (401, 403)


async def test_get_prefs_creates_defaults_on_first_read(client, seeded_db, auth_header):
    res = await client.get("/api/settings/notifications", headers=auth_header)
    assert res.status_code == 200
    body = res.json()
    assert body["digest_enabled"] is False
    assert body["digest_time"] == "08:00"

    rows = await (await seeded_db.execute(
        "SELECT * FROM notification_preferences WHERE account_id = 1"
    )).fetchall()
    assert len(rows) == 1


async def test_put_prefs_updates_and_persists(client, seeded_db, auth_header):
    res = await client.put(
        "/api/settings/notifications",
        json={"digest_enabled": True, "digest_time": "19:00"},
        headers=auth_header,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["digest_enabled"] is True
    assert body["digest_time"] == "19:00"

    res = await client.get("/api/settings/notifications", headers=auth_header)
    assert res.json()["digest_enabled"] is True
    assert res.json()["digest_time"] == "19:00"


async def test_put_prefs_rejects_bad_time(client, seeded_db, auth_header):
    res = await client.put(
        "/api/settings/notifications",
        json={"digest_enabled": True, "digest_time": "25:99"},
        headers=auth_header,
    )
    assert res.status_code == 422


# ── /internal/send-digests auth ──────────────────────────────────────────

async def test_send_digests_rejects_missing_secret(client, seeded_db, cron_secret):
    res = await client.post("/api/internal/send-digests")
    assert res.status_code == 401


async def test_send_digests_rejects_wrong_secret(client, seeded_db, cron_secret):
    res = await client.post(
        "/api/internal/send-digests", headers={"X-Digest-Secret": "wrong"}
    )
    assert res.status_code == 401


async def test_send_digests_rejects_when_secret_unconfigured(client, seeded_db, monkeypatch):
    monkeypatch.delenv("DIGEST_CRON_SECRET", raising=False)
    res = await client.post(
        "/api/internal/send-digests", headers={"X-Digest-Secret": "anything"}
    )
    assert res.status_code == 401


# ── digest selection + idempotence ───────────────────────────────────────

async def test_digest_sent_to_opted_in_account_with_tasks(
    client, seeded_db, cron_secret, sent_emails, at_digest_hour
):
    await _seed_overdue_plant(seeded_db)
    await _enable_digest(seeded_db)

    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.status_code == 200
    assert res.json()["sent"] == 1
    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == "test@example.com"
    assert "Monstera" in sent_emails[0]["html"]
    # counts only — no account data in the response
    assert "test@example.com" not in res.text

    row = await (await seeded_db.execute(
        "SELECT last_digest_sent_on FROM notification_preferences WHERE account_id = 1"
    )).fetchone()
    assert str(row["last_digest_sent_on"])[:10] == "2026-06-11"


async def test_digest_idempotent_within_same_day(
    client, seeded_db, cron_secret, sent_emails, at_digest_hour
):
    await _seed_overdue_plant(seeded_db)
    await _enable_digest(seeded_db)

    res1 = await client.post("/api/internal/send-digests", headers=cron_secret)
    res2 = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res1.json()["sent"] == 1
    assert res2.json()["sent"] == 0
    assert len(sent_emails) == 1


async def test_digest_skips_non_matching_hour(
    client, seeded_db, cron_secret, sent_emails, at_digest_hour
):
    await _seed_overdue_plant(seeded_db)
    await _enable_digest(seeded_db, digest_time="19:00")

    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.json()["sent"] == 0
    assert sent_emails == []


async def test_digest_skips_disabled_accounts(
    client, seeded_db, cron_secret, sent_emails, at_digest_hour
):
    await _seed_overdue_plant(seeded_db)
    # No prefs row at all → not opted in.
    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.json()["sent"] == 0
    assert sent_emails == []


async def test_no_email_on_task_free_day(
    client, seeded_db, cron_secret, sent_emails, at_digest_hour
):
    await _enable_digest(seeded_db)  # no plants → no tasks

    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.json()["sent"] == 0
    assert sent_emails == []


async def test_digest_sent_again_next_day(
    client, seeded_db, cron_secret, sent_emails, at_digest_hour
):
    await _seed_overdue_plant(seeded_db)
    await _enable_digest(seeded_db, last_sent=date(2026, 6, 10))

    res = await client.post("/api/internal/send-digests", headers=cron_secret)
    assert res.json()["sent"] == 1


# ── unsubscribe ──────────────────────────────────────────────────────────

def test_unsubscribe_token_roundtrip():
    from services.digest import make_unsubscribe_token, verify_unsubscribe_token

    token = make_unsubscribe_token(42)
    assert verify_unsubscribe_token(token) == 42


def test_unsubscribe_token_tampered():
    from services.digest import make_unsubscribe_token, verify_unsubscribe_token

    token = make_unsubscribe_token(42)
    assert verify_unsubscribe_token(token.replace("42", "43", 1)) is None
    assert verify_unsubscribe_token("garbage") is None
    assert verify_unsubscribe_token("") is None


async def test_unsubscribe_endpoint_disables_digest(client, seeded_db):
    from services.digest import make_unsubscribe_token

    await _enable_digest(seeded_db)
    token = make_unsubscribe_token(1)
    res = await client.get(f"/api/notifications/unsubscribe?token={token}")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]

    row = await (await seeded_db.execute(
        "SELECT digest_enabled FROM notification_preferences WHERE account_id = 1"
    )).fetchone()
    assert not row["digest_enabled"]


async def test_unsubscribe_endpoint_rejects_bad_token(client, seeded_db):
    res = await client.get("/api/notifications/unsubscribe?token=not-a-token")
    assert res.status_code == 400


async def test_digest_email_contains_unsubscribe_link(
    client, seeded_db, cron_secret, sent_emails, at_digest_hour
):
    await _seed_overdue_plant(seeded_db)
    await _enable_digest(seeded_db)

    await client.post("/api/internal/send-digests", headers=cron_secret)
    assert len(sent_emails) == 1
    assert "/api/notifications/unsubscribe?token=" in sent_emails[0]["html"]
