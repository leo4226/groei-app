"""DB-independent digest tests (#137) — safe for CI's --noconftest job.

Covers the unsubscribe token, the hour/idempotence selection predicate, and
the email template. The endpoint/DB tests live in test_notifications_digest.py
(they need the conftest seam and a local run).
"""
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from models import CareTask
from services.digest import (
    account_is_due,
    build_digest_email,
    make_unsubscribe_token,
    verify_unsubscribe_token,
)

AMS = ZoneInfo("Europe/Amsterdam")
NOW = datetime(2026, 6, 11, 8, 30, tzinfo=AMS)


def _pref(digest_time="08:00", last_sent=None):
    return {"digest_time": digest_time, "last_digest_sent_on": last_sent}


def _task(**kw):
    defaults = dict(
        plant_id=1, plant_name="Monstera", plant_photo=None, location="Woonkamer",
        map_type="indoor", care_type="water", days_overdue=2, last_done_by=None,
        last_done_at=None, schedule_id=1, is_ephemeral=False,
    )
    return CareTask(**{**defaults, **kw})


# ── unsubscribe token ────────────────────────────────────────────────────

def test_token_roundtrip():
    assert verify_unsubscribe_token(make_unsubscribe_token(42)) == 42


def test_token_tampered_or_garbage():
    token = make_unsubscribe_token(42)
    assert verify_unsubscribe_token(token.replace("42", "43", 1)) is None
    assert verify_unsubscribe_token("garbage") is None
    assert verify_unsubscribe_token("") is None
    assert verify_unsubscribe_token("12.") is None


# ── selection predicate ──────────────────────────────────────────────────

def test_due_when_hour_matches_and_never_sent():
    assert account_is_due(_pref("08:00"), NOW) is True


def test_not_due_before_chosen_hour():
    # NOW is 08:30; a 19:00 digest is still in the future today.
    assert account_is_due(_pref("19:00"), NOW) is False


def test_due_after_chosen_hour_catches_up():
    # Sparse cron: the 06:00 hour has no tick, but the next run (08:30) still
    # delivers because now is at/after the chosen hour and it hasn't sent today.
    assert account_is_due(_pref("06:00"), NOW) is True


def test_not_due_when_already_sent_today():
    assert account_is_due(_pref("08:00", date(2026, 6, 11)), NOW) is False


def test_due_again_next_day():
    assert account_is_due(_pref("08:00", date(2026, 6, 10)), NOW) is True


def test_handles_pg_time_and_date_string():
    # PG TIME column yields datetime.time; SQLite yields TEXT for both fields.
    assert account_is_due(_pref(time(8, 0), "2026-06-10"), NOW) is True
    assert account_is_due(_pref(time(9, 0)), NOW) is False


# ── email template ───────────────────────────────────────────────────────

def test_email_lists_tasks_and_unsubscribe():
    subject, html = build_digest_email(
        "Leon",
        overdue=[_task(days_overdue=3)],
        due_today=[_task(plant_name="Basilicum", care_type="fertilize", days_overdue=0)],
        unsubscribe_url="https://api.floreren.app/api/notifications/unsubscribe?token=x",
    )
    assert subject
    assert "Monstera" in html
    assert "Basilicum" in html
    assert "unsubscribe?token=x" in html
    assert "Leon" in html


def test_email_uses_english_care_labels_when_lang_en():
    subject, html = build_digest_email(
        "Leon",
        overdue=[],
        due_today=[_task(plant_name="Basil", care_type="fertilize", days_overdue=0)],
        unsubscribe_url="https://api.floreren.app/api/notifications/unsubscribe?token=x",
        lang="en",
    )

    # The subject leads with the count now, so a week of digests is
    # skimmable instead of a wall of identical lines (#889).
    assert subject == "1 plant needs attention today"
    assert "Fertilize" in html
    assert "Mest" not in html


def test_email_task_line_uses_map_name_when_location_missing():
    _, html = build_digest_email(
        "Leon",
        overdue=[_task(location=None, map_name="Achtertuin", days_overdue=1)],
        due_today=[],
        unsubscribe_url="https://api.floreren.app/api/notifications/unsubscribe?token=x",
    )

    assert "Achtertuin" in html
