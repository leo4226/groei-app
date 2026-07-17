import importlib.util
import sqlite3
from pathlib import Path

import pytest

from care_types import CARE_TYPES, is_care_type_valid_for_env


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "0048_unique_active_moisture_checks.py"
)


def test_moisture_check_is_weather_triggered_and_valid_everywhere():
    definition = CARE_TYPES["moisture_check"]

    assert definition["is_weather_triggered"] is True
    assert definition["default_intervals"] == {
        "outdoor_ground": None,
        "outdoor_container": None,
        "indoor": None,
    }
    assert all(
        is_care_type_valid_for_env("moisture_check", environment)
        for environment in ("outdoor_ground", "outdoor_container", "indoor")
    )


def test_migration_enforces_one_active_moisture_check_per_plant():
    spec = importlib.util.spec_from_file_location("migration_0048", MIGRATION_PATH)
    migration = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(migration)

    assert migration.revision == "0048"
    assert migration.down_revision == "0047"

    connection = sqlite3.connect(":memory:")
    connection.execute("""
        CREATE TABLE care_schedules (
            id INTEGER PRIMARY KEY,
            plant_id INTEGER NOT NULL,
            care_type TEXT NOT NULL,
            is_ephemeral INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE
        )
    """)

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

    connection.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, is_ephemeral, is_active)
           VALUES (1, 7, 'moisture_check', 1, TRUE)"""
    )
    with pytest.raises(sqlite3.IntegrityError):
        connection.execute(
            """INSERT INTO care_schedules
               (id, plant_id, care_type, is_ephemeral, is_active)
               VALUES (2, 7, 'moisture_check', 1, TRUE)"""
        )

    connection.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, is_ephemeral, is_active)
           VALUES (3, 7, 'moisture_check', 1, FALSE)"""
    )
    connection.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, is_ephemeral, is_active)
           VALUES (4, 7, 'water', 1, TRUE)"""
    )
