"""Unit tests for `_seed_care_schedules` (backend/routers/plants.py).

Exercises the helper directly against an in-memory aiosqlite DB — no HTTP,
no app graph beyond the import. This is the regression guard for Task 6 (the
`$1/$2` → `?` placeholder fix that broke under dev SQLite).
"""
import json
from datetime import date

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
    created_at TEXT
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


async def test_idempotent_no_duplicates(db):
    payload = json.dumps({"water_interval_days": 5, "fertilise_months": [4, 7]})
    await _seed_care_schedules(db, 1, payload)
    await _seed_care_schedules(db, 1, payload)
    assert len(await _rows(db, "water")) == 1
    assert len(await _rows(db, "fertilize")) == 1


async def test_fertilise_interval_and_next_due(db):
    months = [3, 6, 9]  # len 3 -> interval = max(30, 365 // 3) = 121
    await _seed_care_schedules(db, 1, json.dumps({"fertilise_months": months}))
    rows = await _rows(db, "fertilize")
    assert len(rows) == 1
    assert rows[0]["interval_days"] == 121
    next_due = date.fromisoformat(str(rows[0]["next_due"]))
    assert next_due.month in months
    assert next_due.day == 1
    today = date.today()
    # next_due lands on the next upcoming fertilise month (this year or next)
    assert next_due >= date(today.year, today.month, 1)


async def test_malformed_or_empty_thresholds_noop(db):
    await _seed_care_schedules(db, 1, "not json")
    await _seed_care_schedules(db, 1, json.dumps({}))
    await _seed_care_schedules(db, 1, json.dumps({"water_interval_days": 0, "fertilise_months": []}))
    assert len(await _rows(db, "water")) == 0
    assert len(await _rows(db, "fertilize")) == 0
