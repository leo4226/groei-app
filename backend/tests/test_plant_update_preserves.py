import pytest


@pytest.mark.asyncio
async def test_update_plant_preserves_omitted_nullable_fields(client, seeded_db, auth_header):
    db = seeded_db
    await db.execute("CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, phenology_json TEXT)")
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
async def test_update_plant_binds_dates_as_objects_not_strings(client, seeded_db, auth_header, monkeypatch):
    # Regression for the avocado-edit hang: asyncpg requires real date objects
    # for DATE columns and raises DataError on ISO strings (#142), which the
    # frontend's silent catch turned into a stuck Save button. The sqlite test
    # DB accepts both, so assert the binding TYPE directly to guard the
    # prod-only failure.
    import datetime
    db = seeded_db
    await db.execute("CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, phenology_json TEXT)")
    await db.execute("INSERT INTO plants (id, name, household_id) VALUES (1, 'Avocado', 1)")
    await db.commit()

    captured: list = []
    original_execute = db.execute

    async def spy(sql, params=()):
        if "UPDATE plants SET" in sql:
            captured.append(list(params))
        return await original_execute(sql, params)

    monkeypatch.setattr(db, "execute", spy)

    res = await client.put(
        "/api/plants/1",
        json={"acquired_date": "2024-06-01", "plant_type": "pot"},
        headers=auth_header,
    )
    assert res.status_code == 200

    assert captured, "expected an UPDATE plants statement"
    params = captured[-1]
    assert any(isinstance(p, datetime.date) for p in params), (
        f"acquired_date must bind as a date object (asyncpg rejects strings); got {params!r}"
    )
    assert "2024-06-01" not in params, "date was bound as a string — asyncpg would 500"


@pytest.mark.asyncio
async def test_update_plant_explicit_null_still_clears_nullable_fields(client, seeded_db, auth_header):
    db = seeded_db
    await db.execute("CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, phenology_json TEXT)")
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
