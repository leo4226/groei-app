"""Unit tests for `_seed_care_schedules` (backend/routers/plants.py).

Exercises the helper directly against an in-memory aiosqlite DB — no HTTP,
no app graph beyond the import. This is the regression guard for Task 6 (the
`$1/$2` → `?` placeholder fix that broke under dev SQLite).
"""
import json

import aiosqlite
import pytest_asyncio

from routers.plants import _seed_care_schedules

SCHEMA = """
CREATE TABLE care_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id INTEGER,
    care_type TEXT,
    interval_days INTEGER,
    next_due TEXT,
    is_active INTEGER DEFAULT 1,
    last_done_by INTEGER,
    last_done TEXT,
    notes TEXT,
    season_adjust TEXT,
    created_at TEXT,
    rhythm_opt_out INTEGER DEFAULT 0,
    interval_source TEXT NOT NULL DEFAULT 'manual'
);
"""


@pytest_asyncio.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(SCHEMA)
    try:
        yield conn
    finally:
        await conn.close()


async def _rows(db, care_type):
    return await db.execute_fetchall(
        "SELECT * FROM care_schedules WHERE plant_id = ? AND care_type = ? AND is_active = 1",
        (1, care_type),
    )


async def test_water_insert_runs_without_placeholder_error(db):
    # Regression for Task 6: the water insert used PG-style $1/$2 placeholders,
    # which qm_to_pg doesn't translate, so it errored under dev SQLite. With ?
    # placeholders it must just insert.
    await _seed_care_schedules(db, 1, json.dumps({"water_interval_days": 5}))
    rows = await _rows(db, "water")
    assert len(rows) == 1
    assert rows[0]["interval_days"] == 5
    assert rows[0]["interval_source"] == "species"


async def test_idempotent_no_duplicates(db):
    payload = json.dumps({"water_interval_days": 5, "fertilise_months": [4, 7]})
    await _seed_care_schedules(db, 1, payload)
    await _seed_care_schedules(db, 1, payload)
    assert len(await _rows(db, "water")) == 1
    assert len(await _rows(db, "fertilize")) == 0


async def test_fertilise_interval_and_next_due(db):
    # Historical test name retained for the additive test guard. Fertilising
    # advice remains data, but must no longer become an automatic routine.
    months = [3, 6, 9]  # len 3 -> interval = max(30, 365 // 3) = 121
    await _seed_care_schedules(db, 1, json.dumps({"fertilise_months": months}))
    rows = await _rows(db, "fertilize")
    assert rows == []


async def test_species_threshold_refines_only_provisional_water(db):
    await db.executemany(
        """INSERT INTO care_schedules
           (plant_id, care_type, interval_days, next_due, last_done, interval_source)
           VALUES (1, 'water', ?, ?, ?, ?)""",
        [
            (7, "2026-07-17", "2026-07-10T08:00:00", "provisional"),
            (4, "2026-07-14", "2026-07-10T08:00:00", "manual"),
        ],
    )

    await _seed_care_schedules(db, 1, json.dumps({"water_interval_days": 10}))

    rows = await db.execute_fetchall(
        """SELECT interval_days, next_due, interval_source
           FROM care_schedules WHERE plant_id = 1 ORDER BY id"""
    )
    assert rows[0]["interval_days"] == 10
    assert rows[0]["next_due"] == "2026-07-20"
    assert rows[0]["interval_source"] == "species"
    assert rows[1]["interval_days"] == 4
    assert rows[1]["next_due"] == "2026-07-14"
    assert rows[1]["interval_source"] == "manual"


async def test_manual_edit_wins_if_it_races_with_species_refinement(db):
    await db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, interval_source)
           VALUES (1, 1, 'water', 7, '2026-07-17', 'provisional')"""
    )

    class ManualEditBeforeCompareAndSet:
        async def execute_fetchall(self, sql, params=()):
            return await db.execute_fetchall(sql, params)

        async def execute(self, sql, params=()):
            if "SET interval_days = ?, next_due = ?, interval_source = 'species'" in sql:
                await db.execute(
                    """UPDATE care_schedules
                       SET interval_days = 14, interval_source = 'manual'
                       WHERE id = 1"""
                )
            return await db.execute(sql, params)

        async def commit(self):
            await db.commit()

    await _seed_care_schedules(
        ManualEditBeforeCompareAndSet(),
        1,
        json.dumps({"water_interval_days": 5}),
    )

    rows = await db.execute_fetchall(
        "SELECT interval_days, interval_source FROM care_schedules WHERE id = 1"
    )
    assert rows[0]["interval_days"] == 14
    assert rows[0]["interval_source"] == "manual"


async def test_species_refinement_does_not_recreate_disabled_water(db):
    await db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active, interval_source)
           VALUES (1, 1, 'water', 7, '2026-07-17', 0, 'provisional')"""
    )

    await _seed_care_schedules(
        db,
        1,
        json.dumps({"water_interval_days": 5}),
    )

    rows = await db.execute_fetchall(
        """SELECT interval_days, is_active, interval_source
           FROM care_schedules WHERE plant_id = 1 AND care_type = 'water'"""
    )
    assert len(rows) == 1
    assert rows[0]["interval_days"] == 7
    assert rows[0]["is_active"] == 0
    assert rows[0]["interval_source"] == "provisional"


async def test_malformed_or_empty_thresholds_noop(db):
    await _seed_care_schedules(db, 1, "not json")
    await _seed_care_schedules(db, 1, json.dumps({}))
    await _seed_care_schedules(db, 1, json.dumps({"water_interval_days": 0, "fertilise_months": []}))
    assert len(await _rows(db, "water")) == 0
    assert len(await _rows(db, "fertilize")) == 0
