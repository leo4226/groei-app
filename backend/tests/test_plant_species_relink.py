"""Renaming a plant's species re-identifies it (#866 follow-up).

Editing the free-text `species` field used to change one text column and
nothing else: `species_id` kept pointing at the old species, so care
thresholds, the phenology calendar, ecology and the identification anchors all
still described the plant the user had just said it wasn't.
"""
import json

import pytest

from routers.plants import (
    _apply_species_relink,
    _find_species_by_name,
    _species_text_changed,
)

BASE = "/api"

SPECIES_TABLE = """
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        slug TEXT,
        common_name_nl TEXT,
        common_name_en TEXT,
        latin_name TEXT,
        care_thresholds TEXT,
        phenology_json TEXT
    );
"""

ANCHOR_TABLE = """
    CREATE TABLE user_confirmed_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        species_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        source_account_id INTEGER,
        source_photo_url TEXT,
        source_plant_id INTEGER
    );
"""


async def _setup(db, *, plant_species_id=1, thresholds_for_2=None):
    await db.executescript(SPECIES_TABLE + ANCHOR_TABLE)
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (1, 'Roos', 'Rosa canina')"
    )
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name, care_thresholds) "
        "VALUES (2, 'Brandnetel', 'Urtica dioica', ?)",
        (thresholds_for_2,),
    )
    await db.execute(
        "INSERT INTO plants (id, name, species, species_id, household_id, photo_path, is_active) "
        "VALUES (5, 'Stekkie', 'Rosa canina', ?, 1, 'https://r2/commit.jpg', 1)",
        (plant_species_id,),
    )
    await db.execute(
        "INSERT INTO user_confirmed_embeddings (species_id, embedding, source_plant_id) "
        "VALUES (1, ?, 5)",
        (b"\x00" * 2048,),
    )
    await db.commit()


async def _plant(db):
    rows = await db.execute_fetchall("SELECT * FROM plants WHERE id = 5")
    return dict(rows[0])


async def _anchor_count(db):
    rows = await db.execute_fetchall("SELECT COUNT(*) as n FROM user_confirmed_embeddings")
    return rows[0]["n"]


# ── what counts as a rename ─────────────────────────────────────────────────

@pytest.mark.parametrize("old,new", [
    ("Rosa canina", "Urtica dioica"),
    (None, "Urtica dioica"),
    ("Rosa canina", ""),
])
def test_a_different_name_is_a_rename(old, new):
    assert _species_text_changed(old, new) is True


@pytest.mark.parametrize("old,new", [
    ("Rosa canina", "Rosa canina"),
    ("Rosa canina", "  rosa canina "),   # whitespace + case are noise
    ("Rosa Canina", "rosa canina"),
    (None, None),
])
def test_cosmetic_edits_are_not_renames(old, new):
    """A capitalisation fix must not throw away the plant's anchors."""
    assert _species_text_changed(old, new) is False


# ── the relink itself ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_relink_moves_the_species_and_retracts_the_old_anchors(seeded_db):
    await _setup(seeded_db)

    await _apply_species_relink(seeded_db, 5, 1, 2, photo_path="https://r2/commit.jpg")

    assert (await _plant(seeded_db))["species_id"] == 2
    # The anchor was labelled with the species the user just moved away from.
    assert await _anchor_count(seeded_db) == 0


@pytest.mark.asyncio
async def test_relink_adopts_the_new_species_cached_thresholds(seeded_db):
    thresholds = json.dumps({"water_interval_days": 3})
    await _setup(seeded_db, thresholds_for_2=thresholds)

    await _apply_species_relink(seeded_db, 5, 1, 2)

    assert json.loads((await _plant(seeded_db))["care_thresholds"]) == {"water_interval_days": 3}


@pytest.mark.asyncio
async def test_relink_leaves_a_user_set_watering_interval_alone(seeded_db):
    """Species knowledge refines a provisional routine; it never overrides an
    interval the user chose."""
    await _setup(seeded_db, thresholds_for_2=json.dumps({"water_interval_days": 3}))
    await seeded_db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, is_active, interval_source) "
        "VALUES (5, 'water', 21, 1, 'manual')"
    )
    await seeded_db.commit()

    await _apply_species_relink(seeded_db, 5, 1, 2)

    rows = await seeded_db.execute_fetchall(
        "SELECT interval_days FROM care_schedules WHERE plant_id = 5 AND care_type = 'water'"
    )
    assert rows[0]["interval_days"] == 21


@pytest.mark.asyncio
async def test_relink_to_the_same_species_is_a_no_op(seeded_db):
    await _setup(seeded_db)

    await _apply_species_relink(seeded_db, 5, 1, 1)

    assert (await _plant(seeded_db))["species_id"] == 1
    assert await _anchor_count(seeded_db) == 1  # nothing retracted


# ── lookup ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["Urtica dioica", "urtica DIOICA", "Brandnetel"])
async def test_species_lookup_matches_latin_or_common_name(seeded_db, name):
    await _setup(seeded_db)
    assert await _find_species_by_name(seeded_db, name) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["", "   ", None, "Nothing like this"])
async def test_species_lookup_misses_cleanly(seeded_db, name):
    await _setup(seeded_db)
    assert await _find_species_by_name(seeded_db, name) is None


# ── through the endpoint ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_renaming_the_species_relinks_the_plant(client, seeded_db, auth_header):
    await _setup(seeded_db)

    res = await client.put(
        f"{BASE}/plants/5", json={"species": "Urtica dioica"}, headers=auth_header
    )

    assert res.status_code == 200, res.text
    plant = await _plant(seeded_db)
    assert plant["species"] == "Urtica dioica"
    assert plant["species_id"] == 2          # the actual bug: this stayed 1
    assert await _anchor_count(seeded_db) == 0


@pytest.mark.asyncio
async def test_editing_another_field_leaves_the_species_link_alone(client, seeded_db, auth_header):
    await _setup(seeded_db)

    res = await client.put(f"{BASE}/plants/5", json={"notes": "hoek bij de schuur"}, headers=auth_header)

    assert res.status_code == 200, res.text
    assert (await _plant(seeded_db))["species_id"] == 1
    assert await _anchor_count(seeded_db) == 1


@pytest.mark.asyncio
async def test_an_unknown_species_saves_now_and_relinks_in_the_background(
    client, seeded_db, auth_header
):
    """Creating a species calls the LLM, so the save must not wait on it. The
    plant keeps its old link until the deferred job lands (no-op under pytest)."""
    await _setup(seeded_db)

    res = await client.put(
        f"{BASE}/plants/5", json={"species": "Silene dioica"}, headers=auth_header
    )

    assert res.status_code == 200, res.text
    plant = await _plant(seeded_db)
    assert plant["species"] == "Silene dioica"   # the edit itself is never blocked
    assert plant["species_id"] == 1


@pytest.mark.asyncio
async def test_rewriting_the_same_species_keeps_the_anchors(client, seeded_db, auth_header):
    """Saving the edit form without changing the species must not cost the
    plant its accumulated anchors."""
    await _setup(seeded_db)

    res = await client.put(
        f"{BASE}/plants/5", json={"species": "rosa canina"}, headers=auth_header
    )

    assert res.status_code == 200, res.text
    assert (await _plant(seeded_db))["species_id"] == 1
    assert await _anchor_count(seeded_db) == 1
