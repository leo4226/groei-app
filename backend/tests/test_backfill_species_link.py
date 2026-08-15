"""Linking plants that have no species row.

A plant with `species_id IS NULL` is invisible to icon generation, to the facts
and names backfills, and to BioCLIP coverage — all of those work per species.
It is the upstream gap behind the icon card reporting plants it "cannot reach".

There was already an endpoint for this, `POST /admin/backfill-species`, and it
had never worked: `get_or_create_species` was never imported into
`routers/admin.py`, so every plant raised NameError into a failure list nothing
rendered. Nothing in the UI called it, and it had no tests. It is replaced by a
job runner, scoped to the household like the other tools.
"""
import pytest


async def _run(db, *, household_id=1):
    from routers.admin_panel import _run_backfill_species

    progress: list[tuple[int, int]] = []

    async def on_progress(done, total):
        progress.append((done, total))

    result = await _run_backfill_species(db, {"household_id": household_id}, on_progress)
    return result, progress


@pytest.fixture
async def species_db(seeded_db):
    await seeded_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await seeded_db.execute("""
        CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            common_name_nl TEXT,
            common_name_en TEXT,
            latin_name TEXT,
            phenology_json TEXT,
            climate_zone TEXT
        )""")
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_links_plants_to_their_species(species_db, monkeypatch):
    calls: list[str] = []

    async def fake_get_or_create(db, plant_name):
        calls.append(plant_name)
        return 42

    monkeypatch.setattr("species_service.get_or_create_species", fake_get_or_create)

    await species_db.executemany(
        "INSERT INTO plants (id, name, species, household_id, is_active, species_id) "
        "VALUES (?, ?, ?, 1, 1, NULL)",
        [
            (1, "Oregon grape", "Mahonia aquifolium"),
            (2, "Bush nasturtium", None),
        ],
    )
    await species_db.commit()

    result, progress = await _run(species_db)

    assert result["processed"] == 2
    assert result["linked"] == 2
    assert result["failed"] == 0
    # The user-entered species text is the better hint; the display name is the
    # fallback when there is none.
    assert calls == ["Mahonia aquifolium", "Bush nasturtium"]
    assert progress == [(0, 2), (1, 2), (2, 2)]

    rows = await species_db.execute_fetchall(
        "SELECT species_id FROM plants WHERE id IN (1, 2) ORDER BY id")
    assert [r["species_id"] for r in rows] == [42, 42]


@pytest.mark.asyncio
async def test_leaves_already_linked_and_archived_plants_alone(species_db, monkeypatch):
    async def fake_get_or_create(db, plant_name):
        return 7

    monkeypatch.setattr("species_service.get_or_create_species", fake_get_or_create)

    await species_db.executemany(
        "INSERT INTO plants (id, name, household_id, is_active, species_id) VALUES (?, ?, 1, ?, ?)",
        [
            (1, "Needs linking", 1, None),
            (2, "Already linked", 1, 99),
            (3, "Archived", 0, None),
        ],
    )
    await species_db.commit()

    result, _ = await _run(species_db)

    assert result["processed"] == 1, "only the active, unlinked plant is a candidate"
    rows = await species_db.execute_fetchall(
        "SELECT id, species_id FROM plants ORDER BY id")
    by_id = {r["id"]: r["species_id"] for r in rows}
    assert by_id[1] == 7
    assert by_id[2] == 99, "an existing link must not be overwritten"
    assert by_id[3] is None, "archived plants are left alone"


@pytest.mark.asyncio
async def test_scopes_to_the_admins_household(species_db, monkeypatch):
    async def fake_get_or_create(db, plant_name):
        return 7

    monkeypatch.setattr("species_service.get_or_create_species", fake_get_or_create)

    await species_db.execute("INSERT INTO households (id, name) VALUES (2, 'Elders')")
    await species_db.executemany(
        "INSERT INTO plants (id, name, household_id, is_active, species_id) "
        "VALUES (?, ?, ?, 1, NULL)",
        [(1, "Mine", 1), (2, "Someone else's", 2)],
    )
    await species_db.commit()

    result, _ = await _run(species_db, household_id=1)

    assert result["processed"] == 1
    other = await species_db.execute_fetchall("SELECT species_id FROM plants WHERE id = 2")
    assert other[0]["species_id"] is None


@pytest.mark.asyncio
async def test_one_failing_plant_does_not_stop_the_run(species_db, monkeypatch):
    async def flaky(db, plant_name):
        if plant_name == "Boom":
            raise RuntimeError("LLM unavailable")
        return 5

    monkeypatch.setattr("species_service.get_or_create_species", flaky)

    await species_db.executemany(
        "INSERT INTO plants (id, name, household_id, is_active, species_id) "
        "VALUES (?, ?, 1, 1, NULL)",
        [(1, "Boom"), (2, "Fine")],
    )
    await species_db.commit()

    result, _ = await _run(species_db)

    assert result["linked"] == 1
    assert result["failed"] == 1
    detail = result["skipped_details"][0]
    assert detail["name"] == "Boom"
    assert "LLM unavailable" in detail["error"]
    assert detail["hint"], "a failure the admin cannot act on is not a report"
