"""Database-backed invariants for weather schedule synchronization (#584)."""
import asyncio
import importlib.util
import sqlite3
from datetime import date
from pathlib import Path

import pytest

from services.weather_task_service import _sync_weather_type


INDEX_SQL = """
CREATE UNIQUE INDEX uq_care_schedules_active_ephemeral_weather
ON care_schedules (plant_id, care_type)
WHERE is_ephemeral = 1
  AND is_active = TRUE
  AND care_type IN ('frost_protect', 'heat_protect')
"""


class SelectBarrierDb:
    """Hold both initial reads so callers observe the same empty state."""

    def __init__(self, db):
        self._db = db
        self._select_count = 0
        self._both_selected = asyncio.Event()

    async def execute_fetchall(self, sql, params=()):
        rows = await self._db.execute_fetchall(sql, params)
        if sql.lstrip().startswith("SELECT id, care_type FROM care_schedules"):
            self._select_count += 1
            if self._select_count == 2:
                self._both_selected.set()
            await self._both_selected.wait()
        return rows

    async def execute(self, sql, params=()):
        return await self._db.execute(sql, params)


async def test_concurrent_weather_sync_keeps_one_active_schedule(seeded_db):
    await seeded_db.execute(INDEX_SQL)
    db = SelectBarrierDb(seeded_db)

    results = await asyncio.gather(
        _sync_weather_type(
            db,
            plant_id=84,
            canonical_type="heat_protect",
            legacy_type="protect_heat",
            triggered=True,
            today=date(2026, 7, 12),
            notes="caller one",
        ),
        _sync_weather_type(
            db,
            plant_id=84,
            canonical_type="heat_protect",
            legacy_type="protect_heat",
            triggered=True,
            today=date(2026, 7, 12),
            notes="caller two",
        ),
    )

    assert sorted(results) == [(0, 0), (1, 0)]
    rows = await seeded_db.execute_fetchall(
        """SELECT care_type, is_active, notes FROM care_schedules
           WHERE plant_id = 84"""
    )
    assert len(rows) == 1
    assert rows[0]["care_type"] == "heat_protect"
    assert rows[0]["is_active"] == 1
    assert rows[0]["notes"] in {"caller one", "caller two"}


async def test_sync_keeps_canonical_row_when_newer_legacy_alias_exists(seeded_db):
    await seeded_db.execute(INDEX_SQL)
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (plant_id, care_type, interval_days, next_due, is_ephemeral, notes)
           VALUES (85, 'heat_protect', 1, '2026-07-11', 1, 'canonical')"""
    )
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (plant_id, care_type, interval_days, next_due, is_ephemeral, notes)
           VALUES (85, 'protect_heat', 1, '2026-07-11', 1, 'legacy')"""
    )

    result = await _sync_weather_type(
        seeded_db,
        plant_id=85,
        canonical_type="heat_protect",
        legacy_type="protect_heat",
        triggered=True,
        today=date(2026, 7, 12),
        notes="refreshed",
    )

    assert result == (0, 1)
    rows = await seeded_db.execute_fetchall(
        """SELECT care_type, is_active, next_due, notes
           FROM care_schedules WHERE plant_id = 85 ORDER BY id"""
    )
    assert rows == [
        {
            "care_type": "heat_protect",
            "is_active": 1,
            "next_due": "2026-07-12",
            "notes": "refreshed",
        },
        {
            "care_type": "protect_heat",
            "is_active": 0,
            "next_due": "2026-07-11",
            "notes": "legacy",
        },
    ]


def test_migration_repairs_duplicates_and_enforces_weather_uniqueness():
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0040_unique_active_weather_schedules.py"
    )
    spec = importlib.util.spec_from_file_location("migration_0040", migration_path)
    migration = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(migration)

    connection = sqlite3.connect(":memory:")
    connection.execute("""
        CREATE TABLE care_schedules (
            id INTEGER PRIMARY KEY,
            plant_id INTEGER,
            care_type TEXT,
            is_ephemeral INTEGER,
            is_active BOOLEAN
        )
    """)
    connection.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, is_ephemeral, is_active)
           VALUES (?, ?, ?, ?, ?)""",
        [
            (1, 7, "heat_protect", True, True),
            (2, 7, "heat_protect", True, True),
            (3, 7, "heat_protect", True, False),
            (4, 7, "water", True, True),
            (5, 8, "frost_protect", True, True),
            (6, 8, "frost_protect", True, True),
            (7, 8, "protect_cold", True, True),
        ],
    )

    class SqliteOp:
        class Bind:
            class Dialect:
                name = "sqlite"

            dialect = Dialect()

        @staticmethod
        def get_bind():
            return SqliteOp.Bind()

        @staticmethod
        def execute(sql):
            connection.execute(sql)

    migration.op = SqliteOp()
    migration.upgrade()
    migration.upgrade()

    active_weather_ids = [
        row[0]
        for row in connection.execute(
            """SELECT id FROM care_schedules
               WHERE is_ephemeral = 1 AND is_active = TRUE
                 AND care_type IN ('frost_protect', 'heat_protect')
               ORDER BY id"""
        )
    ]
    assert active_weather_ids == [2, 6]

    with pytest.raises(sqlite3.IntegrityError):
        connection.execute(
            """INSERT INTO care_schedules
               (id, plant_id, care_type, is_ephemeral, is_active)
               VALUES (8, 7, 'heat_protect', TRUE, TRUE)"""
        )

    connection.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, is_ephemeral, is_active)
           VALUES (9, 7, 'heat_protect', TRUE, FALSE)"""
    )
    connection.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, is_ephemeral, is_active)
           VALUES (10, 7, 'water', TRUE, TRUE)"""
    )

    migration.downgrade()
    connection.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, is_ephemeral, is_active)
           VALUES (11, 7, 'heat_protect', TRUE, TRUE)"""
    )
