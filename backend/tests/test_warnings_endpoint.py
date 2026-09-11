"""HTTP-level test for GET /api/plants/{id}/warnings."""
import pytest


@pytest.mark.asyncio
async def test_get_plant_warnings_returns_state(client, seeded_db, auth_header):
    """Plant with overdue water → endpoint returns top_warning."""
    # Minimal maps table for the join (conftest's schema doesn't include maps).
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY, map_type TEXT, household_id INTEGER)"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, map_type, household_id) VALUES (1, 'indoor', 1)"
    )
    await seeded_db.execute(
        """INSERT INTO plants (id, name, map_id, container_id, care_thresholds, household_id, is_active)
           VALUES (1, 'Monstera', 1, 5, NULL, 1, 1)"""
    )
    await seeded_db.execute(
        """INSERT INTO care_schedules (plant_id, care_type, next_due, is_active)
           VALUES (1, 'water', '2026-05-13', 1)"""
    )
    await seeded_db.commit()

    resp = await client.get("/api/plants/1/warnings?today=2026-05-16", headers=auth_header)
    assert resp.status_code == 200
    body = resp.json()
    assert body["plant_id"] == 1
    assert body["environment"] == "indoor"
    assert body["top_warning"] is not None
    assert body["top_warning"]["care_type"] == "water"
    assert body["top_warning"]["severity"] == "urgent"


@pytest.mark.asyncio
async def test_get_plant_warnings_404_when_missing(client, seeded_db, auth_header):
    # Need the maps table to exist for the LEFT JOIN to parse.
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY, map_type TEXT, household_id INTEGER)"
    )
    await seeded_db.commit()

    resp = await client.get("/api/plants/999/warnings", headers=auth_header)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_a_wet_week_reaches_the_plant_page_as_still_moist(
    client, seeded_db, auth_header, monkeypatch
):
    """End to end: an overdue outdoor pot, a week of rain, and the plant page
    says "not yet" instead of "3 days late". The whole chain has to line up —
    the map's coordinates, the daily forecast rows, and the assessment — so a
    unit test on the model alone would not catch a broken link in it."""
    from datetime import timedelta

    from services.local_time import local_today

    today = local_today()

    async def fake_forecast(lat, lon):
        assert (lat, lon) == (52.3715, 4.8499), "the household's own garden"
        return [
            {
                "date": (today - timedelta(days=offset)).isoformat(),
                "max_temp_c": 15.0,
                "precipitation_mm": 9.0,
                "et0_mm": 0.8,
                "humidity_pct": 88.0,
                "soil_moisture_pct": None,
            }
            for offset in range(4, -1, -1)
        ]

    # Patched on the service, not the router: the router imports it inside the
    # function, so this is the name that is actually looked up.
    monkeypatch.setattr(
        "services.weather_forecast.get_usable_forecast_days", fake_forecast
    )

    # The shared schema's maps table has no coordinates; the still-moist
    # assessment needs them, so give this one a table that carries them.
    await seeded_db.execute("DROP TABLE IF EXISTS maps")
    await seeded_db.execute(
        "CREATE TABLE maps "
        "(id INTEGER PRIMARY KEY, map_type TEXT, household_id INTEGER, lat REAL, lon REAL)"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, map_type, household_id, lat, lon) "
        "VALUES (2, 'outdoor', 1, 52.3715, 4.8499)"
    )
    await seeded_db.execute(
        """INSERT INTO plants (id, name, map_id, container_id, care_thresholds,
                               household_id, is_active)
           VALUES (2, 'Hortensia', 2, 9, NULL, 1, 1)"""
    )
    await seeded_db.execute(
        """INSERT INTO care_schedules (plant_id, care_type, next_due, is_active)
           VALUES (2, 'water', ?, 1)""",
        ((today - timedelta(days=3)).isoformat(),),
    )
    await seeded_db.commit()

    resp = await client.get("/api/plants/2/warnings", headers=auth_header)

    assert resp.status_code == 200, resp.text
    water = [w for w in resp.json()["warnings"] if w["care_type"] == "water"]
    assert [w["code"] for w in water] == ["water_still_moist"]
    assert water[0]["action_en"], "and what to do instead"
