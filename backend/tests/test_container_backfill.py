"""Migration 0064 backfills only what can be derived without guessing.

Runs the migration's own SQL (imported from the revision, so there is one
source of truth) against the seeded test database.
"""
import importlib.util
import pathlib

import pytest

_REVISION = (
    pathlib.Path(__file__).resolve().parents[1]
    / "alembic" / "versions" / "0064_backfill_plant_container_details.py"
)
_spec = importlib.util.spec_from_file_location("_rev_0064", _REVISION)
_rev = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rev)


async def _run_backfill(db):
    for statement in _rev.BACKFILL_STATEMENTS:
        await db.execute(statement)
    await db.commit()


@pytest.fixture
async def plants_before_0063(seeded_db):
    """Plants as they looked before the container columns existed."""
    await seeded_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active, icon_key, pot_size_cm)
        VALUES
          (101, 'Potted monstera', 1, 1, 1, 'monstera',      18),
          (102, 'In the ground',   1, 1, 1, 'monstera_bare', NULL),
          (103, 'No icon yet',     1, 1, 1, NULL,            NULL),
          (104, 'Potted no size',  1, 1, 1, 'hosta',         NULL);
    """)
    await seeded_db.commit()
    return seeded_db


async def _rows(db):
    rows = await db.execute_fetchall(
        """SELECT id, form_type, pot_diameter_cm, pot_material, pot_height_cm,
                  has_drainage, substrate, acquired_from
           FROM plants ORDER BY id"""
    )
    return {row["id"]: dict(row) for row in rows}


@pytest.mark.asyncio
async def test_bare_icon_becomes_ground(plants_before_0063):
    await _run_backfill(plants_before_0063)
    assert (await _rows(plants_before_0063))[102]["form_type"] == "ground"


@pytest.mark.asyncio
async def test_other_icons_become_pot(plants_before_0063):
    await _run_backfill(plants_before_0063)
    rows = await _rows(plants_before_0063)
    assert rows[101]["form_type"] == "pot"
    assert rows[104]["form_type"] == "pot"


@pytest.mark.asyncio
async def test_plant_without_icon_is_left_alone(plants_before_0063):
    """No icon, no evidence — better NULL than a guess."""
    await _run_backfill(plants_before_0063)
    assert (await _rows(plants_before_0063))[103]["form_type"] is None


@pytest.mark.asyncio
async def test_pot_size_copies_to_diameter(plants_before_0063):
    await _run_backfill(plants_before_0063)
    rows = await _rows(plants_before_0063)
    assert rows[101]["pot_diameter_cm"] == 18
    assert rows[104]["pot_diameter_cm"] is None


@pytest.mark.asyncio
async def test_unknowable_fields_stay_null(plants_before_0063):
    """Material, height, drainage, substrate and provenance are never invented."""
    await _run_backfill(plants_before_0063)
    for row in (await _rows(plants_before_0063)).values():
        assert row["pot_material"] is None
        assert row["pot_height_cm"] is None
        assert row["has_drainage"] is None
        assert row["substrate"] is None
        assert row["acquired_from"] is None


@pytest.mark.asyncio
async def test_never_overwrites_a_users_own_answer(plants_before_0063):
    db = plants_before_0063
    await db.execute(
        """UPDATE plants SET form_type = 'ground', pot_diameter_cm = 30
           WHERE id = 101"""
    )
    await db.commit()

    await _run_backfill(db)

    rows = await _rows(db)
    assert rows[101]["form_type"] == "ground"      # not flipped back to 'pot'
    assert rows[101]["pot_diameter_cm"] == 30      # not clobbered by pot_size_cm 18


@pytest.mark.asyncio
async def test_is_idempotent(plants_before_0063):
    await _run_backfill(plants_before_0063)
    first = await _rows(plants_before_0063)
    await _run_backfill(plants_before_0063)
    assert await _rows(plants_before_0063) == first
