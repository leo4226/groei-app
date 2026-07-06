"""Cross-surface care guardrails (2026-07-06 audit).

Floreren shows "what needs care" on four surfaces fed by the same
care_schedules table: the map (compute_plant_warnings), the calendar
(/calendar/events), and the email digest + push (classify_care_tasks). Twice
this month a surface silently diverged (map said "all on schedule" while the
calendar listed tasks — fixed in #420). These tests pin the invariant: one
seeded overdue task must be visible on every surface.

Also pins the digest email language: the template is bilingual but was sent in
Dutch to everyone because `lang` was never passed (fixed alongside this test).
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

AMS = ZoneInfo("Europe/Amsterdam")


async def _seed_overdue_water_plant(db):
    """Outdoor plant, water schedule 5 days overdue.

    care_profile marks water active but deliberately has NO interval_days —
    the exact shape that hid warnings from the map before #420.
    """
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (5, 'Tuin', 'outdoor', 1)"
    )
    await db.execute(
        """INSERT INTO plants (id, name, is_active, household_id, map_id, care_profile)
           VALUES (30, 'Lavendel', 1, 1, 5, '{"water": {"active": true}}')"""
    )
    overdue = (date.today() - timedelta(days=5)).isoformat()
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (30, 'water', 7, ?, 1)",
        (overdue,),
    )
    await db.commit()


async def test_overdue_task_visible_on_all_surfaces(client, seeded_db, auth_header):
    await _seed_overdue_water_plant(seeded_db)
    today = date.today()

    # 1. Email/push surface (classify_care_tasks over household schedule rows)
    from services.care_task_service import fetch_household_schedule_rows, classify_care_tasks
    rows = await fetch_household_schedule_rows(seeded_db, household_id=1)
    overdue, due_today, _ = classify_care_tasks(rows, today=today)
    email_types = [t.care_type for t in overdue + due_today]
    assert "water" in email_types, "email digest surface lost the overdue task"

    # 2. Map surface (compute_plant_warnings — schedule-driven since #420)
    from services.warnings import compute_plant_warnings
    plant = {
        "id": 30, "map_type": "outdoor", "container_id": None,
        "ground_zone_id": None, "care_profile": '{"water": {"active": true}}',
        "care_thresholds": None,
    }
    schedules = [dict(r) for r in await seeded_db.execute_fetchall(
        "SELECT care_type, next_due, last_done FROM care_schedules WHERE plant_id = 30"
    )]
    state = compute_plant_warnings(plant, schedules, weather=None, today=today)
    map_types = [w.care_type for w in state.warnings]
    assert "water" in map_types, "map surface lost the overdue task (pre-#420 regression)"

    # 3. Calendar surface (the HTTP endpoint the calendar page calls).
    #    The calendar renders occurrences on their dates, so the window must
    #    cover the (past) due date and the event must be flagged overdue.
    #    NB (audit F7): a window starting *today* omits overdue tasks entirely —
    #    known gap, tracked separately as a product decision.
    resp = await client.get(
        "/api/calendar/events",
        params={"from": (today - timedelta(days=7)).isoformat(), "to": today.isoformat()},
        headers=auth_header,
    )
    assert resp.status_code == 200, resp.text
    water_events = [e for e in resp.json() if e["type"] == "water"]
    assert water_events, "calendar surface lost the overdue task"
    assert water_events[0]["overdue"] is True


# ── digest email language ──────────────────────────────────────────────────

@pytest.fixture
def sent_emails(monkeypatch):
    sent = []

    def fake_send(to_email, subject, html):
        sent.append({"to": to_email, "subject": subject, "html": html})
        return True

    import services.digest as digest
    monkeypatch.setattr(digest, "send_email", fake_send)
    return sent


@pytest.fixture
def at_digest_hour(monkeypatch):
    import services.digest as digest
    monkeypatch.setattr(digest, "_now", lambda: datetime(2026, 7, 6, 8, 30, tzinfo=AMS))


async def test_digest_email_respects_user_language(
    client, seeded_db, auth_header, sent_emails, at_digest_hour, monkeypatch
):
    """An English profile gets the EN template — the digest used to be
    hardcoded Dutch because build_digest_email was called without `lang`."""
    monkeypatch.setenv("DIGEST_CRON_SECRET", "s")
    await _seed_overdue_water_plant(seeded_db)
    # The signup flow creates a users row mirroring the account (same name +
    # household); that profile carries the language preference.
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id, language) VALUES (9, 'Test', 1, 'en')"
    )
    await seeded_db.execute(
        "INSERT INTO notification_preferences (account_id, digest_enabled, digest_time) "
        "VALUES (1, 1, '08:00')"
    )
    await seeded_db.commit()

    resp = await client.post("/api/internal/send-digests", headers={"X-Digest-Secret": "s"})
    assert resp.status_code == 200
    assert len(sent_emails) == 1
    assert sent_emails[0]["subject"] == "Your plants need attention today 🌿"
    assert "Here are today's care tasks" in sent_emails[0]["html"]


async def test_digest_email_defaults_to_dutch_without_profile(
    client, seeded_db, auth_header, sent_emails, at_digest_hour, monkeypatch
):
    monkeypatch.setenv("DIGEST_CRON_SECRET", "s")
    await _seed_overdue_water_plant(seeded_db)
    await seeded_db.execute(
        "INSERT INTO notification_preferences (account_id, digest_enabled, digest_time) "
        "VALUES (1, 1, '08:00')"
    )
    await seeded_db.commit()

    resp = await client.post("/api/internal/send-digests", headers={"X-Digest-Secret": "s"})
    assert resp.status_code == 200
    assert len(sent_emails) == 1
    assert sent_emails[0]["subject"] == "Je planten hebben vandaag aandacht nodig 🌿"
