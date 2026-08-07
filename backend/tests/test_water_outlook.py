from datetime import date, timedelta

import pytest

from routers import calendar as calendar_router


TODAY = date(2026, 7, 16)


def _forecast(*, stale: bool = False):
    return {
        "available": True,
        "stale": stale,
        "source_timestamp": "2026-07-16T09:00:00+00:00",
        "location": {"lat": 52.3715, "lon": 4.8499},
        "days": [
            {
                "date": (TODAY + timedelta(days=offset)).isoformat(),
                "max_temp_c": 31.0,
                "min_temp_c": 20.0,
                "precipitation_mm": 0.0,
                "et0_mm": 5.0,
            }
            for offset in range(-2, 3)
        ],
    }


async def _seed_outlook_data(db):
    await db.execute("ALTER TABLE maps ADD COLUMN lat REAL")
    await db.execute("ALTER TABLE maps ADD COLUMN lon REAL")
    await db.execute("INSERT INTO households (id, name) VALUES (2, 'Other')")
    await db.executemany(
        "INSERT INTO maps (id, name, map_type, lat, lon, household_id) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (1, "Garden", "outdoor", 52.3715, 4.8499, 1),
            (2, "Living room", "indoor", None, None, 1),
            (3, "Garden without GPS", "outdoor", None, None, 1),
            (4, "Other garden", "outdoor", 51.9, 4.4, 2),
        ],
    )
    await db.executemany(
        """INSERT INTO plants
           (id, name, map_id, container_id, ground_zone_id, household_id, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)""",
        [
            (1, "Tomato", 1, 10, None, 1),
            (2, "Fern", 2, 11, None, 1),
            (3, "Lavender", 3, 12, None, 1),
            (4, "Foreign", 4, 13, None, 2),
        ],
    )
    await db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active)
           VALUES (?, ?, 'water', 7, ?, 1)""",
        [(1, 1, "2026-07-20"), (2, 2, "2026-07-22"), (3, 3, "2026-07-21"), (4, 4, "2026-07-19")],
    )
    await db.commit()


@pytest.mark.asyncio
async def test_water_outlook_is_household_scoped_and_uses_explicit_indoor_proxy(
    client, auth_header, seeded_db, monkeypatch,
):
    await _seed_outlook_data(seeded_db)
    calls = []

    async def fake_forecast(lat, lon):
        calls.append((lat, lon))
        return _forecast()

    monkeypatch.setattr(calendar_router, "get_map_forecast", fake_forecast)
    monkeypatch.setattr(calendar_router, "_water_pressure_today", lambda: TODAY)

    response = await client.get("/api/calendar/water-outlook", headers=auth_header)

    assert response.status_code == 200
    payload = response.json()
    assert payload["generated_at"] == "2026-07-16"
    assert [item["map_id"] for item in payload["maps"]] == [1, 3, 2]
    assert calls == [(52.3715, 4.8499)]

    maps = {item["map_id"]: item for item in payload["maps"]}
    assert maps[1]["temperature_source"] == "own_map"
    assert maps[1]["level"] == "high"
    assert maps[1]["plants"][0]["recommended_check_date"] == "2026-07-16"

    assert maps[2]["temperature_source"] == "outdoor_proxy"
    assert maps[2]["level"] == "high"
    assert "rough guide" in maps[2]["plants"][0]["reason_en"].lower()

    assert maps[3]["weather_status"] == "missing_coordinates"
    assert maps[3]["level"] == "unknown"
    assert maps[3]["plants"][0]["recommended_check_date"] == "2026-07-21"
    assert 4 not in maps


@pytest.mark.asyncio
async def test_stale_weather_is_visible_but_neutral_for_recommendations(
    client, auth_header, seeded_db, monkeypatch,
):
    await _seed_outlook_data(seeded_db)

    async def stale_forecast(lat, lon):
        return _forecast(stale=True)

    monkeypatch.setattr(calendar_router, "get_map_forecast", stale_forecast)
    monkeypatch.setattr(calendar_router, "_water_pressure_today", lambda: TODAY)

    response = await client.get("/api/calendar/water-outlook", headers=auth_header)

    assert response.status_code == 200
    maps = {item["map_id"]: item for item in response.json()["maps"]}
    assert maps[1]["weather_status"] == "stale"
    assert maps[1]["level"] == "unknown"
    assert maps[1]["plants"][0]["recommended_check_date"] == "2026-07-20"
    assert maps[2]["level"] == "unknown"


@pytest.mark.asyncio
async def test_water_outlook_requires_authentication(client):
    response = await client.get("/api/calendar/water-outlook")

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("hours", "expected"),
    [
        (None, None),
        (5.0, "sun"),
        (4.0, "sun"),
        (3.5, "partial"),
        (2.0, "partial"),
        (1.0, "shade"),
        (0.0, "shade"),
        ("bad", None),
    ],
)
def test_exposure_from_sun_hours_maps_unified_thresholds(hours, expected):
    # Unified 4h/2h light thresholds (#811): >=4h sun, 2-4h partial, <2h shade.
    assert calendar_router._exposure_from_sun_hours(hours) == expected
