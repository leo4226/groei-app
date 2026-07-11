"""Canonical care-type compatibility and weather/calendar parity (#577)."""
from datetime import date
import json

import pytest

from care_types import normalize_care_type


@pytest.mark.parametrize(
    ("legacy", "canonical"),
    [
        ("repot_check", "repot"),
        ("protect_cold", "frost_protect"),
        ("protect_heat", "heat_protect"),
    ],
)
def test_legacy_care_types_normalize_to_canonical(legacy, canonical):
    assert normalize_care_type(legacy) == canonical
    assert normalize_care_type(canonical) == canonical


async def test_legacy_repot_done_payload_updates_canonical_schedule(
    client, seeded_db, auth_header,
):
    await seeded_db.executescript("""
        CREATE TABLE care_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER, care_type TEXT, done_by INTEGER, done_at TEXT,
            notes TEXT, skipped BOOLEAN DEFAULT FALSE
        );
        INSERT INTO plants (id, name, household_id, is_active)
        VALUES (41, 'Monstera', 1, 1);
        INSERT INTO users (id, name, household_id) VALUES (1, 'Test', 1);
        INSERT INTO care_schedules
            (plant_id, care_type, interval_days, next_due, is_active)
        VALUES (41, 'repot', 180, '2026-07-01', 1);
    """)
    await seeded_db.commit()

    response = await client.post(
        "/api/care/done",
        json={"plant_id": 41, "care_type": "repot_check", "user_id": 1},
        headers=auth_header,
    )

    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT care_type FROM care_log WHERE plant_id = 41"
    )
    assert [row["care_type"] for row in rows] == ["repot"]
    schedule = (await seeded_db.execute_fetchall(
        "SELECT care_type, last_done FROM care_schedules WHERE plant_id = 41"
    ))[0]
    assert schedule["care_type"] == "repot"
    assert schedule["last_done"] is not None


async def test_legacy_weather_skip_payload_logs_canonical_type(
    client, seeded_db, auth_header,
):
    await seeded_db.executescript("""
        CREATE TABLE care_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER, care_type TEXT, done_by INTEGER, done_at TEXT,
            notes TEXT, skipped BOOLEAN DEFAULT FALSE
        );
        INSERT INTO plants (id, name, household_id, is_active)
        VALUES (44, 'Oleander', 1, 1);
        INSERT INTO users (id, name, household_id) VALUES (1, 'Test', 1);
        INSERT INTO care_schedules
            (plant_id, care_type, interval_days, next_due, is_active, is_ephemeral)
        VALUES (44, 'heat_protect', 1, '2026-07-01', 1, 1);
    """)
    await seeded_db.commit()

    response = await client.post(
        "/api/care/skip",
        json={"plant_id": 44, "care_type": "protect_heat", "user_id": 1},
        headers=auth_header,
    )

    assert response.status_code == 200, response.text
    log = (await seeded_db.execute_fetchall(
        "SELECT care_type, skipped FROM care_log WHERE plant_id = 44"
    ))[0]
    assert log["care_type"] == "heat_protect"
    assert log["skipped"] == 1


def test_legacy_schedule_payload_is_canonicalized_on_validation():
    from models import CareScheduleCreate

    schedule = CareScheduleCreate(care_type="repot_check", interval_days=120)
    assert schedule.care_type == "repot"


def test_dashboard_task_classification_emits_canonical_type():
    from services.care_task_service import classify_care_tasks

    overdue, due_today, upcoming = classify_care_tasks(
        [{
            "plant_id": 1,
            "plant_name": "Ficus",
            "schedule_id": 10,
            "care_type": "repot_check",
            "next_due": "2026-07-01",
        }],
        today=date(2026, 7, 12),
    )

    assert due_today == []
    assert upcoming == []
    assert overdue[0].care_type == "repot"


async def test_legacy_care_profile_patch_persists_only_canonical_keys(
    client, seeded_db, auth_header,
):
    await seeded_db.execute(
        """INSERT INTO plants (id, name, household_id, is_active, care_profile)
           VALUES (45, 'Ficus', 1, 1, ?)""",
        (json.dumps({"repot_check": {"active": True}}),),
    )
    await seeded_db.commit()

    response = await client.patch(
        "/api/plants/45/care-profile",
        json={"care_types": {"protect_cold": {"active": True}}},
        headers=auth_header,
    )

    assert response.status_code == 200, response.text
    profile = response.json()["care_profile"]
    assert profile["repot"]["active"] is True
    assert profile["frost_protect"]["active"] is True
    assert "repot_check" not in profile
    assert "protect_cold" not in profile


async def test_calendar_refreshes_weather_tasks_from_canonical_profile(
    client, seeded_db, auth_header, monkeypatch,
):
    profile = {
        "heat_protect": {"active": True, "thresholds": {"max_temp_c": 25}},
        "frost_protect": {"active": True, "thresholds": {"bring_inside_below_c": 2}},
    }
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (12, 'Kas', 'outdoor', 1)"
    )
    await seeded_db.execute(
        """INSERT INTO plants
           (id, name, is_active, household_id, map_id, container_id,
            care_profile, care_thresholds)
           VALUES (42, 'Citroen', 1, 1, 12, 7, ?, ?)""",
        (json.dumps(profile), json.dumps({"max_temp_c": 99})),
    )
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (plant_id, care_type, interval_days, next_due, is_active, is_ephemeral)
           VALUES (42, 'protect_heat', 1, '2026-07-01', 1, 1)"""
    )
    await seeded_db.commit()

    weather = {"days": [{"min": 10.0, "max": 31.0}]}

    async def fake_temp_data(*args, **kwargs):
        return weather

    monkeypatch.setattr("services.environment.get_temp_data", fake_temp_data)
    today = date.today().isoformat()

    hot = await client.get(
        "/api/calendar/events",
        params={"from": today, "to": today},
        headers=auth_header,
    )
    assert hot.status_code == 200, hot.text
    heat_events = [event for event in hot.json() if event["type"] == "heat_protect"]
    assert len(heat_events) == 1
    assert heat_events[0]["weather_triggered"] is True

    weather["days"] = [{"min": 10.0, "max": 20.0}]
    mild = await client.get(
        "/api/calendar/events",
        params={"from": today, "to": today},
        headers=auth_header,
    )
    assert mild.status_code == 200, mild.text
    assert not [event for event in mild.json() if event["type"] == "heat_protect"]
    rows = await seeded_db.execute_fetchall(
        "SELECT care_type, is_active FROM care_schedules WHERE plant_id = 42"
    )
    assert rows == [{"care_type": "heat_protect", "is_active": 0}]


async def test_calendar_weather_refresh_fails_open(
    client, seeded_db, auth_header, monkeypatch,
):
    await seeded_db.execute(
        "INSERT INTO plants (id, name, household_id, is_active) VALUES (43, 'Pilea', 1, 1)"
    )
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (plant_id, care_type, interval_days, next_due, is_active)
           VALUES (43, 'repot', 180, ?, 1)""",
        (date.today().isoformat(),),
    )
    await seeded_db.commit()

    async def weather_failure():
        raise RuntimeError("weather unavailable")

    monkeypatch.setattr(
        "services.weather_task_service._get_cached_weather", weather_failure
    )
    today = date.today().isoformat()
    response = await client.get(
        "/api/calendar/events",
        params={"from": today, "to": today},
        headers=auth_header,
    )
    assert response.status_code == 200, response.text
    assert any(event["type"] == "repot" for event in response.json())


def test_migration_canonicalizes_schedules_and_logs_idempotently():
    import importlib.util
    import sqlite3
    from pathlib import Path

    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0039_canonicalize_care_types.py"
    )
    spec = importlib.util.spec_from_file_location("migration_0039", migration_path)
    migration = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(migration)

    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE TABLE care_schedules (care_type TEXT)")
    connection.execute("CREATE TABLE care_log (care_type TEXT)")
    for table in ("care_schedules", "care_log"):
        connection.executemany(
            f"INSERT INTO {table} (care_type) VALUES (?)",
            [
                ("repot_check",),
                ("protect_cold",),
                ("protect_heat",),
                ("water",),
            ],
        )

    class SqliteOp:
        @staticmethod
        def execute(sql):
            connection.execute(sql)

    migration.op = SqliteOp()
    migration.upgrade()
    migration.upgrade()

    expected = ["repot", "frost_protect", "heat_protect", "water"]
    for table in ("care_schedules", "care_log"):
        actual = [
            row[0]
            for row in connection.execute(
                f"SELECT care_type FROM {table} ORDER BY rowid"
            )
        ]
        assert actual == expected
