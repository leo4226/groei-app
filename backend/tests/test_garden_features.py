"""Physical garden features (insect hotel, nestkast, water, …) — advice-only.

Counts map to the fauna groups a garden supports, and to the high-value
features it's still missing. Never folded into the 0-100 score.
"""
import aiosqlite
import pytest

from services.garden_features import FEATURE_TYPES, summarize, features_for_map

BASE = "/api"


def _dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


def test_empty_garden_supports_nothing_and_misses_the_priority_features():
    s = summarize({})
    assert s.total == 0 and s.distinct == 0
    assert s.supported_groups == []
    # the cheap/high-value ones are suggested first
    assert s.missing[0] == "water"
    assert set(s.missing) == {"water", "insect_hotel", "log_pile", "bird_house"}


def test_features_map_to_fauna_groups():
    s = summarize({"insect_hotel": 1, "water": 1})
    assert s.total == 2 and s.distinct == 2
    # insect hotel → solitary bees + insects; water → birds, insects, amphibians
    assert set(s.supported_groups) == {"solitary_bees", "insects", "birds", "amphibians"}
    # both are now present, so neither is still "missing"
    assert "water" not in s.missing and "insect_hotel" not in s.missing


def test_counts_are_summed_and_unknown_or_zero_entries_ignored():
    s = summarize({"bird_house": 3, "bat_box": 1, "not_a_feature": 9, "log_pile": 0})
    assert s.counts == {"bird_house": 3, "bat_box": 1}
    assert s.total == 4 and s.distinct == 2
    assert set(s.supported_groups) == {"birds", "bats"}
    assert "log_pile" in s.missing          # zero count means absent


def test_feature_vocabulary_is_stable():
    # The UI renders this exact set; a silent change would break its labels.
    assert FEATURE_TYPES == (
        "insect_hotel", "bird_house", "water", "log_pile",
        "stone_pile", "hedgehog_house", "bat_box",
    )


@pytest.mark.asyncio
async def test_features_for_map_reads_counts_and_is_guarded():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.execute(
        "CREATE TABLE garden_features (id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "map_id INTEGER, feature_type TEXT, count INTEGER)"
    )
    await db.execute("INSERT INTO garden_features (map_id, feature_type, count) VALUES (7, 'water', 2)")
    await db.commit()
    s = await features_for_map(db, 7)
    assert s.counts == {"water": 2}
    assert "birds" in s.supported_groups
    await db.close()

    # no table at all → empty summary, never raises
    db2 = await aiosqlite.connect(":memory:")
    db2.row_factory = _dict_row
    assert (await features_for_map(db2, 7)).total == 0
    await db2.close()


# ── endpoint ──

async def _prepare(db):
    await db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await db.execute(
        "CREATE TABLE garden_features (id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "map_id INTEGER, feature_type TEXT, count INTEGER)"
    )
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) VALUES (1, 'Tuin', 'outdoor', 1, 'mijn-tuin')"
    )
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) VALUES (2, 'Anders', 'outdoor', 999, 'anders')"
    )
    await db.commit()


@pytest.mark.asyncio
async def test_put_feature_sets_updates_and_removes(client, seeded_db, auth_header):
    await _prepare(seeded_db)

    r = await client.put(f"{BASE}/maps/mijn-tuin/features",
                         json={"feature_type": "insect_hotel", "count": 1}, headers=auth_header)
    assert r.status_code == 200, r.text
    assert r.json()["counts"] == {"insect_hotel": 1}

    # updating replaces rather than duplicating
    r = await client.put(f"{BASE}/maps/mijn-tuin/features",
                         json={"feature_type": "insect_hotel", "count": 3}, headers=auth_header)
    assert r.json()["counts"] == {"insect_hotel": 3}
    rows = await seeded_db.execute_fetchall("SELECT COUNT(*) AS n FROM garden_features WHERE map_id = 1")
    assert rows[0]["n"] == 1

    # count 0 removes it
    r = await client.put(f"{BASE}/maps/mijn-tuin/features",
                         json={"feature_type": "insect_hotel", "count": 0}, headers=auth_header)
    assert r.json()["counts"] == {}


@pytest.mark.asyncio
async def test_put_feature_rejects_unknown_type_and_other_household(client, seeded_db, auth_header):
    await _prepare(seeded_db)

    r = await client.put(f"{BASE}/maps/mijn-tuin/features",
                         json={"feature_type": "swimming_pool", "count": 1}, headers=auth_header)
    assert r.status_code == 422

    r = await client.put(f"{BASE}/maps/anders/features",
                         json={"feature_type": "water", "count": 1}, headers=auth_header)
    assert r.status_code == 404
