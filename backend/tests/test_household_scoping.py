"""Regression tests for household scoping (IDOR prevention).

The JWT carries the caller's household_id. Every by-id data endpoint must
refuse access to another household's rows — otherwise a logged-in user could
read, mutate, or delete a stranger's plants by guessing integer ids. These
tests lock in the household scoping added to the plant CRUD endpoints and the
auth requirement added to previously-public routers.
"""
import pytest

from auth import create_token


def _token(household_id: int, account_id: int = 1) -> dict:
    return {"Authorization": f"Bearer {create_token(account_id=account_id, household_id=household_id)}"}


async def _seed_neighbour_plant(db):
    """A plant owned by a DIFFERENT household (id 2) than the test caller (id 1)."""
    # get_plant LEFT JOINs plant_species — the conftest schema omits it, so
    # create a minimal version here just so the SELECT can parse.
    await db.execute(
        """CREATE TABLE IF NOT EXISTS plant_species (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phenology_json TEXT,
            common_name_nl TEXT,
            common_name_en TEXT
        )"""
    )
    await db.execute("INSERT INTO households (id, name) VALUES (2, 'Neighbour')")
    await db.execute(
        "INSERT INTO plants (id, name, household_id, is_active) VALUES (500, 'Neighbour Fern', 2, 1)"
    )
    await db.commit()


@pytest.mark.asyncio
async def test_cannot_read_other_households_plant(client, seeded_db):
    await _seed_neighbour_plant(seeded_db)
    res = await client.get("/api/plants/500", headers=_token(1))
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_cannot_update_other_households_plant(client, seeded_db):
    await _seed_neighbour_plant(seeded_db)
    res = await client.put("/api/plants/500", json={"name": "hacked"}, headers=_token(1))
    assert res.status_code == 404
    cur = await seeded_db.execute("SELECT name FROM plants WHERE id = 500")
    rows = await cur.fetchall()
    assert rows[0]["name"] == "Neighbour Fern"  # untouched


@pytest.mark.asyncio
async def test_cannot_archive_other_households_plant(client, seeded_db):
    await _seed_neighbour_plant(seeded_db)
    res = await client.delete("/api/plants/500", headers=_token(1))
    assert res.status_code == 404
    cur = await seeded_db.execute("SELECT is_active FROM plants WHERE id = 500")
    rows = await cur.fetchall()
    assert rows[0]["is_active"] == 1  # still active


@pytest.mark.asyncio
async def test_bulk_archive_ignores_other_households_plants(client, seeded_db):
    await _seed_neighbour_plant(seeded_db)
    res = await client.post("/api/plants/bulk-archive", json={"plant_ids": [500]}, headers=_token(1))
    assert res.status_code == 200
    assert res.json()["count"] == 0
    cur = await seeded_db.execute("SELECT is_active FROM plants WHERE id = 500")
    rows = await cur.fetchall()
    assert rows[0]["is_active"] == 1


@pytest.mark.asyncio
async def test_owner_can_bulk_archive_own_plant(client, seeded_db):
    """Positive control — scoping must not over-block the legitimate owner."""
    await seeded_db.execute(
        "INSERT INTO plants (id, name, household_id, is_active) VALUES (600, 'My Basil', 1, 1)"
    )
    await seeded_db.commit()
    res = await client.post("/api/plants/bulk-archive", json={"plant_ids": [600]}, headers=_token(1))
    assert res.status_code == 200
    assert res.json()["count"] == 1
    cur = await seeded_db.execute("SELECT is_active FROM plants WHERE id = 600")
    rows = await cur.fetchall()
    assert rows[0]["is_active"] == 0


@pytest.mark.asyncio
async def test_objects_endpoint_requires_auth(client, seeded_db):
    """objects.py had no auth at all before — every route is now protected."""
    res = await client.get("/api/objects")
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_weed_sightings_endpoint_requires_auth(client, seeded_db):
    res = await client.get("/api/weed-sightings")
    assert res.status_code in (401, 403)
