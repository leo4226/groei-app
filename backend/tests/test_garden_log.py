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
                is_active INTEGER DEFAULT 1
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
                water_amount DOUBLE PRECISION
            );
            INSERT INTO plants (id, is_active) VALUES (1, 1);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, season_adjust, is_active, last_done, next_due)
            VALUES (10, 1, 'water', 7, NULL, 1, NULL, '2025-12-31');
        ''')

        updated = await log_garden_water(db, date(2026, 1, 1), watered_by=1, water_amount=None)
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
                is_active INTEGER DEFAULT 1
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
                fertilized_by INTEGER
            );
            INSERT INTO plants (id, is_active) VALUES (1, 1);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, season_adjust, is_active, last_done, next_due)
            VALUES (20, 1, 'fertilize', 14, NULL, 1, NULL, '2025-12-31');
        ''')

        updated = await log_garden_fertilize(db, date(2026, 1, 1), fertilized_by=1)
        row = (await db.execute_fetchall('SELECT last_done, next_due FROM care_schedules WHERE id = 20'))[0]

        assert updated == 1
        assert row['last_done'] == '2026-01-01'
        assert row['next_due'] == '2026-01-15'
