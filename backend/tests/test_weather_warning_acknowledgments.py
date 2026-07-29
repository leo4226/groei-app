"""HTTP contracts for per-account weather-warning acknowledgment."""
from datetime import date
import json

import pytest

from auth import create_token
from routers import calendar as calendar_router
from routers import warnings as warnings_router
from services.warnings import (
    CareWarning,
    canonical_weather_warning_id,
    canonical_weather_warning_id_for_fields,
)


def _heat_warning() -> CareWarning:
    return CareWarning(
        care_type="heat_protect",
        severity="warning",
        trigger="weather_event",
        days_overdue=None,
        message_nl="Morgen hitte op komst — max 33°C",
        message_en="Heat building tomorrow — max 33°C",
        icon="🌡️",
        color="#E07040",
        forecast_date=date(2026, 7, 30),
    )


@pytest.mark.asyncio
async def test_acknowledge_weather_warning_is_idempotent_per_account(
    client,
    seeded_db,
    auth_header,
):
    warning = _heat_warning()
    warning_id = canonical_weather_warning_id(1, warning)
    payload = {
        "care_type": warning.care_type,
        "forecast_date": warning.forecast_date.isoformat(),
        "severity": warning.severity,
    }
    schedules_before = await seeded_db.execute_fetchall(
        "SELECT * FROM care_schedules"
    )

    first = await client.post(
        f"/api/weather-warnings/{warning_id}/acknowledgment",
        json=payload,
        headers=auth_header,
    )
    second = await client.post(
        f"/api/weather-warnings/{warning_id}/acknowledgment",
        json=payload,
        headers=auth_header,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["warning_id"] == warning_id
    assert first.json()["acknowledged_at"] is not None
    rows = await seeded_db.execute_fetchall(
        "SELECT * FROM weather_warning_account_state WHERE account_id = ?",
        (1,),
    )
    assert len(rows) == 1
    assert await seeded_db.execute_fetchall("SELECT * FROM care_schedules") == schedules_before


@pytest.mark.asyncio
async def test_acknowledge_rejects_noncanonical_warning_id(
    client, seeded_db, auth_header
):
    warning = _heat_warning()
    response = await client.post(
        "/api/weather-warnings/not-a-canonical-id/acknowledgment",
        json={
            "care_type": warning.care_type,
            "forecast_date": warning.forecast_date.isoformat(),
            "severity": warning.severity,
        },
        headers=auth_header,
    )

    assert response.status_code == 422
    assert await seeded_db.execute_fetchall(
        "SELECT * FROM weather_warning_account_state"
    ) == []


@pytest.mark.asyncio
async def test_restore_weather_warning_clears_acknowledgment_but_keeps_state(
    client,
    seeded_db,
    auth_header,
):
    warning = _heat_warning()
    warning_id = canonical_weather_warning_id(1, warning)
    payload = {
        "care_type": warning.care_type,
        "forecast_date": warning.forecast_date.isoformat(),
        "severity": warning.severity,
    }
    await client.post(
        f"/api/weather-warnings/{warning_id}/acknowledgment",
        json=payload,
        headers=auth_header,
    )

    response = await client.delete(
        f"/api/weather-warnings/{warning_id}/acknowledgment",
        headers=auth_header,
    )

    assert response.status_code == 204
    rows = await seeded_db.execute_fetchall(
        """
        SELECT acknowledged_at
        FROM weather_warning_account_state
        WHERE account_id = ? AND warning_id = ?
        """,
        (1, warning_id),
    )
    assert len(rows) == 1
    assert rows[0]["acknowledged_at"] is None


@pytest.mark.asyncio
async def test_restore_is_scoped_to_current_account(
    client, seeded_db, auth_header
):
    warning = _heat_warning()
    warning_id = canonical_weather_warning_id(1, warning)
    response = await client.post(
        f"/api/weather-warnings/{warning_id}/acknowledgment",
        json={
            "care_type": warning.care_type,
            "forecast_date": warning.forecast_date.isoformat(),
            "severity": warning.severity,
        },
        headers=auth_header,
    )
    assert response.status_code == 200

    await seeded_db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash) "
        "VALUES (2, 1, 'member@example.com', 'Member', 'hash')"
    )
    await seeded_db.commit()
    member_header = {
        "Authorization": f"Bearer {create_token(2, 1)}",
    }

    restored = await client.delete(
        f"/api/weather-warnings/{warning_id}/acknowledgment",
        headers=member_header,
    )
    assert restored.status_code == 204
    rows = await seeded_db.execute_fetchall(
        "SELECT acknowledged_at FROM weather_warning_account_state "
        "WHERE account_id = 1 AND warning_id = ?",
        (warning_id,),
    )
    assert rows[0]["acknowledged_at"] is not None


@pytest.mark.asyncio
async def test_warning_summary_groups_weather_and_projects_account_acknowledgment(
    client,
    seeded_db,
    auth_header,
    monkeypatch,
):
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (1, 'Back Garden', 'outdoor', 1)"
    )
    await seeded_db.execute(
        """
        INSERT INTO plants (
            id, name, map_id, container_id, care_thresholds, household_id, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (1, "Lemon", 1, 10, json.dumps({"max_temp_c": 35}), 1, 1),
    )
    await seeded_db.execute(
        """
        INSERT INTO care_schedules (plant_id, care_type, next_due, is_active)
        VALUES (?, ?, ?, ?)
        """,
        (1, "water", date(2026, 7, 28), 1),
    )
    await seeded_db.commit()

    async def fake_weather(*_args, **_kwargs):
        return {
            "temp": {
                "days": [
                    {"date": "2026-07-30", "min": 18, "max": 33},
                ]
            }
        }

    monkeypatch.setattr(warnings_router, "_fetch_weather_safely", fake_weather)

    initial = await client.get(
        "/api/warnings/summary?today=2026-07-28",
        headers=auth_header,
    )

    assert initial.status_code == 200
    body = initial.json()
    assert len(body["weather_warnings"]) == 1
    advisory = body["weather_warnings"][0]
    assert advisory["care_type"] == "heat_protect"
    assert advisory["forecast_date"] == "2026-07-30"
    assert advisory["affected_plant_ids"] == [1]
    assert advisory["map_names"] == ["Back Garden"]
    assert advisory["acknowledged_at"] is None
    assert any(
        plant["care_type"] == "water"
        for bucket in body["buckets"].values()
        for plant in bucket
    )

    acknowledged = await client.post(
        f"/api/weather-warnings/{advisory['warning_id']}/acknowledgment",
        json={
            "care_type": advisory["care_type"],
            "forecast_date": advisory["forecast_date"],
            "severity": advisory["severity"],
        },
        headers=auth_header,
    )
    assert acknowledged.status_code == 200

    projected = await client.get(
        "/api/warnings/summary?today=2026-07-28",
        headers=auth_header,
    )
    seen = projected.json()["weather_warnings"][0]
    assert seen["warning_id"] == advisory["warning_id"]
    assert seen["acknowledged_at"] is not None


@pytest.mark.asyncio
async def test_expired_stored_warning_state_is_not_projected(
    client, seeded_db, auth_header, monkeypatch
):
    await seeded_db.execute(
        "INSERT INTO maps (id, household_id, name, map_type) "
        "VALUES (1, 1, 'Back Garden', 'outdoor')"
    )
    await seeded_db.execute(
        "INSERT INTO plants (id, household_id, map_id, name, is_active, care_thresholds) "
        "VALUES (1, 1, 1, 'Lavender', 1, ?)",
        ('{"max_temp_c": 30}',),
    )
    expired_id = canonical_weather_warning_id_for_fields(
        1,
        care_type="heat_protect",
        forecast_date=date(2026, 7, 27),
        severity="urgent",
    )
    await seeded_db.execute(
        "INSERT INTO weather_warning_account_state "
        "(account_id, warning_id, care_type, forecast_date, severity, acknowledged_at) "
        "VALUES (1, ?, 'heat_protect', '2026-07-27', 'urgent', CURRENT_TIMESTAMP)",
        (expired_id,),
    )
    await seeded_db.commit()

    async def fake_weather(_db, _household_id):
        return {
            "temp": {
                "days": [{
                    "date": "2026-07-29",
                    "min_temp_c": 15,
                    "max_temp_c": 22,
                }],
            },
        }

    monkeypatch.setattr(warnings_router, "_fetch_weather_safely", fake_weather)
    response = await client.get(
        "/api/warnings/summary?today=2026-07-28",
        headers=auth_header,
    )

    assert response.status_code == 200
    assert response.json()["weather_warnings"] == []


@pytest.mark.asyncio
async def test_calendar_event_projects_same_canonical_weather_warning_state(
    client, seeded_db, auth_header, monkeypatch
):
    target = date.today()
    warning_id = canonical_weather_warning_id_for_fields(
        1,
        care_type="heat_protect",
        forecast_date=target,
        severity="urgent",
    )
    notes = json.dumps({
        "kind": "weather_warning",
        "weather_warning_id": warning_id,
        "care_type": "heat_protect",
        "forecast_date": target.isoformat(),
        "severity": "urgent",
        "weather_metric": "max_temp_c",
        "weather_value_c": 36.0,
        "threshold_c": 35.0,
    })
    await seeded_db.execute(
        "INSERT INTO maps (id, household_id, name, map_type) "
        "VALUES (1, 1, 'Back Garden', 'outdoor')"
    )
    await seeded_db.execute(
        "INSERT INTO plants (id, household_id, map_id, name, is_active, care_thresholds) "
        "VALUES (1, 1, 1, 'Lavender', 1, ?)",
        ('{"max_temp_c": 35}',),
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules "
        "(id, plant_id, care_type, next_due, interval_days, is_active, is_ephemeral, notes) "
        "VALUES (1, 1, 'heat_protect', ?, 0, 1, 1, ?)",
        (target, notes),
    )
    await seeded_db.execute(
        "INSERT INTO weather_warning_account_state "
        "(account_id, warning_id, care_type, forecast_date, severity, acknowledged_at) "
        "VALUES (1, ?, 'heat_protect', ?, 'urgent', CURRENT_TIMESTAMP)",
        (warning_id, target),
    )
    await seeded_db.commit()

    async def fake_sync(_db):
        return {
            "warning_weather": {
                "temp": {
                    "days": [{
                        "date": target.isoformat(),
                        "min_temp_c": 18,
                        "max_temp_c": 36,
                    }],
                },
            },
        }

    async def fake_outlook(*_args, **_kwargs):
        return None

    async def fake_moisture(*_args, **_kwargs):
        return None

    monkeypatch.setattr(calendar_router, "sync_ephemeral_schedules", fake_sync)
    monkeypatch.setattr(calendar_router, "build_water_outlook", fake_outlook)
    monkeypatch.setattr(calendar_router, "sync_moisture_checks", fake_moisture)

    response = await client.get(
        "/api/calendar/events",
        params={"from": target.isoformat(), "to": target.isoformat()},
        headers=auth_header,
    )

    assert response.status_code == 200
    event = next(item for item in response.json() if item["type"] == "heat_protect")
    assert event["weather_warning_id"] == warning_id
    assert event["acknowledged_at"] is not None
