import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def admin_panel_fixture(seeded_db, monkeypatch):
    monkeypatch.setattr("auth.ADMIN_EMAIL", "test@example.com")
    db = seeded_db
    await db.executescript("""
        ALTER TABLE plants ADD COLUMN icon_requested BOOLEAN DEFAULT 0;

        CREATE TABLE care_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER,
            care_type TEXT,
            done_at TEXT,
            done_by INTEGER,
            notes TEXT
        );

        CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY,
            common_name_nl TEXT,
            latin_name TEXT,
            care_thresholds TEXT
        );

        INSERT INTO households (id, name) VALUES
            (2, 'Balcony'),
            (3, 'Garden');

        INSERT INTO accounts (id, household_id, email, name, password_hash, created_at) VALUES
            (2, 2, 'anna@example.com', 'Anna', 'x', '2026-06-01'),
            (3, 2, 'bob@example.com', 'Bob', 'x', '2026-06-02'),
            (4, 3, 'carla@example.com', 'Carla', 'x', '2026-06-03');

        INSERT INTO maps (id, name, household_id) VALUES
            (21, 'Balcony map', 2),
            (31, 'Garden map', 3);

        INSERT INTO plant_species (id, common_name_nl, latin_name, care_thresholds) VALUES
            (1, 'Basilicum', 'Ocimum basilicum', '{"water": 3}'),
            (2, 'Munt', NULL, NULL),
            (3, 'Roos', 'Rosa canina', NULL);

        INSERT INTO plants (
            id, name, species, household_id, is_active, created_at,
            icon_key, care_thresholds, phase, species_id, icon_requested
        ) VALUES
            (101, 'Aloë', 'Aloe vera', 1, 1, '2026-06-04', NULL, NULL, 'established', NULL, 0),
            (102, 'Basil', 'Ocimum basilicum', 2, 1, '2026-06-05', 'basil', '{"water": 3}', 'seedling', 1, 0),
            (103, 'Munt', 'Mentha', 2, 1, '2026-06-06', NULL, NULL, 'established', 2, 1),
            (104, 'Archived rose', 'Rosa canina', 3, 0, '2026-06-07', NULL, NULL, 'established', 3, 0);

        INSERT INTO care_log (plant_id, care_type, done_at, done_by) VALUES
            (102, 'water', '2026-06-10', 2);
    """)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_admin_users_page_search_and_sort(client, admin_panel_fixture, auth_header):
    res = await client.get(
        "/api/admin-panel/users?limit=2&offset=0&sort=name&dir=asc",
        headers=auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 4
    assert [row["name"] for row in body["rows"]] == ["Anna", "Bob"]

    res = await client.get(
        "/api/admin-panel/users?q=balcony&sort=email&dir=desc",
        headers=auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert [row["email"] for row in body["rows"]] == ["bob@example.com", "anna@example.com"]


@pytest.mark.asyncio
async def test_admin_plants_search_filter_sort_and_page(client, admin_panel_fixture, auth_header):
    res = await client.get(
        "/api/admin-panel/plants?q=balcony&filter=no_icon&sort=name&dir=asc",
        headers=auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert body["rows"][0]["name"] == "Munt"

    res = await client.get(
        "/api/admin-panel/plants?limit=1&offset=1&filter=no_thresholds&sort=name&dir=asc",
        headers=auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert [row["name"] for row in body["rows"]] == ["Munt"]


@pytest.mark.asyncio
async def test_admin_species_search_filter_and_sort(client, admin_panel_fixture, auth_header):
    res = await client.get(
        "/api/admin-panel/species?q=rosa",
        headers=auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert body["rows"][0]["common_name_nl"] == "Roos"

    res = await client.get(
        "/api/admin-panel/species?filter=no_thresholds&sort=plant_count&dir=desc",
        headers=auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert [row["common_name_nl"] for row in body["rows"]] == ["Munt", "Roos"]
