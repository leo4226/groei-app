import pytest


@pytest.mark.asyncio
async def test_update_plant_preserves_omitted_nullable_fields(client, seeded_db, auth_header):
    db = seeded_db
    await db.execute("CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, phenology_json TEXT)")
    await db.execute("INSERT INTO locations (id, name, household_id) VALUES (7, 'Living room', 1)")
    await db.execute("INSERT INTO maps (id, name, map_type, household_id) VALUES (3, 'Back garden', 'outdoor', 1)")
    await db.execute(
        """
        INSERT INTO plants (
            id, name, species, household_id, location_id, map_id, map_x, map_y,
            pot_size_cm, notes
        ) VALUES (1, 'Old name', 'Monstera deliciosa', 1, 7, 3, 12.5, 33.5, 21, 'old')
        """
    )
    await db.commit()

    res = await client.put(
        "/api/plants/1",
        json={"name": "New name"},
        headers=auth_header,
    )

    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "New name"
    assert data["location_id"] == 7
    assert data["map_id"] == 3
    assert data["map_x"] == 12.5
    assert data["map_y"] == 33.5
    assert data["pot_size_cm"] == 21


@pytest.mark.asyncio
async def test_update_plant_explicit_null_still_clears_nullable_fields(client, seeded_db, auth_header):
    db = seeded_db
    await db.execute("CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, phenology_json TEXT)")
    await db.execute("INSERT INTO locations (id, name, household_id) VALUES (7, 'Living room', 1)")
    await db.execute("INSERT INTO maps (id, name, map_type, household_id) VALUES (3, 'Back garden', 'outdoor', 1)")
    await db.execute(
        """
        INSERT INTO plants (
            id, name, household_id, location_id, map_id, map_x, map_y, pot_size_cm
        ) VALUES (1, 'Plant', 1, 7, 3, 12.5, 33.5, 21)
        """
    )
    await db.commit()

    res = await client.put(
        "/api/plants/1",
        json={"map_x": None, "map_y": None, "pot_size_cm": None},
        headers=auth_header,
    )

    assert res.status_code == 200
    data = res.json()
    assert data["map_id"] == 3
    assert data["map_x"] is None
    assert data["map_y"] is None
    assert data["pot_size_cm"] is None
