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
