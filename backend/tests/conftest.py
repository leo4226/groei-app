"""Shared fixtures for backend tests.

Provides:
- `seeded_db`: an in-memory aiosqlite DB seeded with the minimal schema
  (households, accounts, plants, care_schedules, …) and overrides `db_dep`
  so every request inside a test reuses the same connection.
- `auth_header`: a real JWT bearer header for account_id=1 / household_id=1
  (built via `auth.create_token`) for tests that exercise the real auth path.
- `client`: an httpx AsyncClient pointed at the FastAPI app, for async tests.

Patterned after `test_db_seam.py` (which uses a sync TestClient + db_dep
override). This conftest exposes the same seam in async form so new tests
can `await client.get(...)`.
"""
import asyncio
import datetime
import os
import sqlite3
import pytest

# asyncpg (prod) wants real date objects for DATE columns; give sqlite an
# explicit adapter so the same code path works in tests (the implicit
# adapters are deprecated since Python 3.12).
sqlite3.register_adapter(datetime.date, lambda d: d.isoformat())

# Ensure tests use a real Postgres connection.
os.environ.setdefault("DATABASE_URL", "postgresql://floreren:dev@localhost:5432/floreren")
import pytest_asyncio
import aiosqlite
from httpx import AsyncClient, ASGITransport

from main import app
from database import db_dep
from auth import create_token, get_current_account


SCHEMA = """
    CREATE TABLE households (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_id INTEGER NOT NULL,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE plants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        species TEXT,
        location_id INTEGER,
        map_id INTEGER,
        map_x REAL,
        map_y REAL,
        photo_path TEXT,
        acquired_date TEXT,
        pot_size_cm INTEGER,
        last_repotted TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        is_locked INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sun_requirement TEXT,
        plant_type TEXT,
        icon_key TEXT,
        species_id INTEGER,
        container_id INTEGER,
        ground_zone_id TEXT,
        display_radius_cm INTEGER,
        care_thresholds TEXT,
        care_profile TEXT,
        phase TEXT DEFAULT 'established',
        sown_date TEXT,
        household_id INTEGER
    );
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
        is_ephemeral INTEGER DEFAULT 0
    );
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        avatar TEXT,
        household_id INTEGER,
        language TEXT
    );
    CREATE TABLE garden_water_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watered_at DATE NOT NULL,
        watered_by INTEGER,
        water_amount DOUBLE PRECISION,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE notification_preferences (
        account_id INTEGER PRIMARY KEY,
        digest_enabled INTEGER NOT NULL DEFAULT 0,
        digest_time TEXT NOT NULL DEFAULT '08:00',
        quiet_hours TEXT,
        last_digest_sent_on DATE
    );
    CREATE TABLE locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        household_id INTEGER
    );
    CREATE TABLE maps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        map_type TEXT,
        household_id INTEGER
    );
    CREATE TABLE plantnet_quota (
        account_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (account_id, date)
    );
"""


def _dict_row(cursor, row):
    """Row factory matching DbAdapter's contract: plain dicts (so router code
    may use row.get(...), exactly as against asyncpg in production)."""
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


@pytest_asyncio.fixture
async def seeded_db():
    """In-memory SQLite seeded with one household + account, db_dep overridden."""
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(SCHEMA)
    await db.execute(
        "INSERT INTO households (id, name) VALUES (1, 'Test Household')"
    )
    await db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash) "
        "VALUES (1, 1, 'test@example.com', 'Test', 'x')"
    )
    await db.commit()

    async def _override_db():
        # Reuse the same connection across all requests within a test.
        yield db

    app.dependency_overrides[db_dep] = _override_db
    try:
        yield db
    finally:
        app.dependency_overrides.pop(db_dep, None)
        await db.close()


@pytest.fixture
def auth_header():
    """Real JWT bearer for account_id=1 / household_id=1."""
    token = create_token(account_id=1, household_id=1)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def client():
    """Async httpx client pointed at the FastAPI app (httpx 0.28+ style)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
