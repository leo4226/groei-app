from datetime import date

import aiosqlite
import pytest

from services.garden_log import log_garden_fertilize, log_garden_water


@pytest.mark.asyncio
async def test_log_garden_water_updates_schedules_from_selected_watering_date():
    async with aiosqlite.connect(':memory:') as db:
        db.row_factory = aiosqlite.Row
        await db.executescript('''
            CREATE TABLE plants (
                id INTEGER PRIMARY KEY,
                is_active INTEGER DEFAULT 1,
                household_id INTEGER
            );
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY,
                plant_id INTEGER,
                care_type TEXT,
                interval_days INTEGER,
                season_adjust TEXT,
                is_active INTEGER DEFAULT 1,
                last_done DATE,
                next_due DATE
            );
            CREATE TABLE garden_water_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watered_at DATE NOT NULL,
                watered_by INTEGER,
                water_amount DOUBLE PRECISION,
                household_id INTEGER
            );
            INSERT INTO plants (id, is_active, household_id) VALUES (1, 1, 1);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, season_adjust, is_active, last_done, next_due)
            VALUES (10, 1, 'water', 7, NULL, 1, NULL, '2025-12-31');
        ''')

        updated = await log_garden_water(db, date(2026, 1, 1), watered_by=1, water_amount=None, household_id=1)
        row = (await db.execute_fetchall('SELECT last_done, next_due FROM care_schedules WHERE id = 10'))[0]

        assert updated == 1
        assert row['last_done'] == '2026-01-01'
        assert row['next_due'] == '2026-01-08'


@pytest.mark.asyncio
async def test_log_garden_fertilize_updates_schedules_from_selected_fertilizing_date():
    async with aiosqlite.connect(':memory:') as db:
        db.row_factory = aiosqlite.Row
        await db.executescript('''
            CREATE TABLE plants (
                id INTEGER PRIMARY KEY,
                is_active INTEGER DEFAULT 1,
                household_id INTEGER
            );
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY,
                plant_id INTEGER,
                care_type TEXT,
                interval_days INTEGER,
                season_adjust TEXT,
                is_active INTEGER DEFAULT 1,
                last_done DATE,
                next_due DATE
            );
            CREATE TABLE garden_fertilize_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fertilized_at DATE NOT NULL,
                fertilized_by INTEGER,
                household_id INTEGER
            );
            INSERT INTO plants (id, is_active, household_id) VALUES (1, 1, 1);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, season_adjust, is_active, last_done, next_due)
            VALUES (20, 1, 'fertilize', 14, NULL, 1, NULL, '2025-12-31');
        ''')

        updated = await log_garden_fertilize(db, date(2026, 1, 1), fertilized_by=1, household_id=1)
        row = (await db.execute_fetchall('SELECT last_done, next_due FROM care_schedules WHERE id = 20'))[0]

        assert updated == 1
        assert row['last_done'] == '2026-01-01'
        assert row['next_due'] == '2026-01-15'


# ── Household scoping for garden water/fertilize logs ─────────────────────

from services.garden_log import get_last_garden_watered, get_last_garden_fertilized, log_garden_water, log_garden_fertilize


@pytest.mark.asyncio
async def test_garden_water_log_is_household_scoped():
    """Household 1's water log must be invisible to household 2."""
    async with aiosqlite.connect(':memory:') as db:
        db.row_factory = aiosqlite.Row
        await db.executescript('''
            CREATE TABLE households (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE plants (
                id INTEGER PRIMARY KEY, is_active INTEGER DEFAULT 1, household_id INTEGER
            );
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                interval_days INTEGER, season_adjust TEXT, is_active INTEGER DEFAULT 1,
                last_done DATE, next_due DATE
            );
            CREATE TABLE garden_water_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watered_at DATE NOT NULL, watered_by INTEGER,
                water_amount DOUBLE PRECISION, household_id INTEGER
            );
            INSERT INTO households (id, name) VALUES (1, 'HH1'), (2, 'HH2');
        ''')

        # Log watering for household 1
        await log_garden_water(db, date(2026, 6, 1), watered_by=1, water_amount=None, household_id=1)

        # Household 2 should see no watering
        result_hh2 = await get_last_garden_watered(2, db=db)
        assert result_hh2 is None  # HH2 must not see HH1's log

        # Household 1 should see its own watering
        result_hh1 = await get_last_garden_watered(1, db=db)
        assert result_hh1 == date(2026, 6, 1)


@pytest.mark.asyncio
async def test_garden_fertilize_log_is_household_scoped():
    """Household 1's fertilize log must be invisible to household 2."""
    async with aiosqlite.connect(':memory:') as db:
        db.row_factory = aiosqlite.Row
        await db.executescript('''
            CREATE TABLE households (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE plants (
                id INTEGER PRIMARY KEY, is_active INTEGER DEFAULT 1, household_id INTEGER
            );
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                interval_days INTEGER, season_adjust TEXT, is_active INTEGER DEFAULT 1,
                last_done DATE, next_due DATE
            );
            CREATE TABLE garden_fertilize_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fertilized_at DATE NOT NULL, fertilized_by INTEGER, household_id INTEGER
            );
            INSERT INTO households (id, name) VALUES (1, 'HH1'), (2, 'HH2');
        ''')

        # Log fertilizing for household 1
        await log_garden_fertilize(db, date(2026, 6, 1), fertilized_by=1, household_id=1)

        # Household 2 should see no fertilizing
        result_hh2 = await get_last_garden_fertilized(2, db=db)
        assert result_hh2 is None

        # Household 1 should see its own fertilizing
        result_hh1 = await get_last_garden_fertilized(1, db=db)
        assert result_hh1 == date(2026, 6, 1)


@pytest.mark.asyncio
async def test_delete_water_log_only_deletes_caller_household():
    """Deleting latest water log from HH1 must not affect HH2's log."""
    async with aiosqlite.connect(':memory:') as db:
        db.row_factory = aiosqlite.Row
        await db.executescript('''
            CREATE TABLE households (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE garden_water_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watered_at DATE NOT NULL, watered_by INTEGER,
                water_amount DOUBLE PRECISION, household_id INTEGER
            );
            INSERT INTO households (id, name) VALUES (1, 'HH1'), (2, 'HH2');
            INSERT INTO garden_water_log (watered_at, household_id) VALUES ('2026-06-01', 1);
            INSERT INTO garden_water_log (watered_at, household_id) VALUES ('2026-06-02', 2);
        ''')

        # Delete HH1's latest entry
        await db.execute("DELETE FROM garden_water_log WHERE id = (SELECT id FROM garden_water_log WHERE household_id = 1 ORDER BY watered_at DESC LIMIT 1)")

        # HH2's entry must still exist
        rows = await db.execute_fetchall("SELECT id FROM garden_water_log WHERE household_id = 2")
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_log_garden_water_scopes_schedules_to_household():
    """Watering log must only update schedules belonging to the same household."""
    async with aiosqlite.connect(':memory:') as db:
        db.row_factory = aiosqlite.Row
        await db.executescript('''
            CREATE TABLE households (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE plants (id INTEGER PRIMARY KEY, is_active INTEGER DEFAULT 1, household_id INTEGER);
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                interval_days INTEGER, season_adjust TEXT, is_active INTEGER DEFAULT 1,
                last_done DATE, next_due DATE
            );
            CREATE TABLE garden_water_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT, watered_at DATE NOT NULL,
                watered_by INTEGER, water_amount DOUBLE PRECISION, household_id INTEGER
            );
            INSERT INTO households (id, name) VALUES (1, 'HH1'), (2, 'HH2');
            INSERT INTO plants (id, household_id, is_active) VALUES (1, 1, 1), (2, 2, 1);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, is_active, last_done, next_due)
            VALUES (10, 1, 'water', 7, 1, NULL, '2025-12-01'), (20, 2, 'water', 7, 1, NULL, '2025-12-01');
        ''')

        # Water HH1
        updated = await log_garden_water(db, date(2026, 1, 1), watered_by=1, water_amount=None, household_id=1)

        # HH1 schedule should be updated
        row1 = (await db.execute_fetchall('SELECT last_done FROM care_schedules WHERE id = 10'))[0]
        assert row1['last_done'] == '2026-01-01'

        # HH2 schedule must NOT be updated
        row2 = (await db.execute_fetchall('SELECT last_done FROM care_schedules WHERE id = 20'))[0]
        assert row2['last_done'] is None

        assert updated == 1  # only 1 schedule updated
