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

# asyncpg (prod) wants real date/datetime objects for DATE/TIMESTAMP columns;
# give sqlite explicit adapters so the same code path works in tests (the
# implicit adapters are deprecated since Python 3.12). datetime is stored
# T-separated so text ordering matches chronological ordering.
sqlite3.register_adapter(datetime.date, lambda d: d.isoformat())
sqlite3.register_adapter(datetime.datetime, lambda dt: dt.isoformat(timespec="seconds"))

# Ensure tests use a real Postgres connection.
os.environ.setdefault("DATABASE_URL", "postgresql://floreren:***@localhost:5432/floreren")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
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
        is_admin INTEGER NOT NULL DEFAULT 0,
        language TEXT DEFAULT 'nl',
        role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX uq_accounts_owner_per_household
        ON accounts(household_id) WHERE role = 'owner';
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
        measured_sun_hours REAL,
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
        quantity INTEGER NOT NULL DEFAULT 1,
        household_id INTEGER,
        form_type TEXT,
        pot_material TEXT,
        pot_diameter_cm INTEGER,
        pot_height_cm INTEGER,
        has_drainage BOOLEAN,
        substrate TEXT,
        acquired_from TEXT,
        mulch BOOLEAN
    );
    CREATE TABLE plant_placements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        map_id INTEGER NOT NULL,
        map_x REAL NOT NULL,
        map_y REAL NOT NULL,
        ground_zone_id TEXT,
        phase TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        is_ephemeral INTEGER DEFAULT 0,
        notified_for_due DATE,
        snoozed_until TIMESTAMP,
        rhythm_opt_out INTEGER DEFAULT 0,
        rhythm_operation_id INTEGER,
        interval_source TEXT NOT NULL DEFAULT 'manual'
    );
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        avatar TEXT,
        household_id INTEGER,
        language TEXT,
        account_id INTEGER
    );
    CREATE TABLE garden_water_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watered_at DATE NOT NULL,
        watered_by INTEGER,
        water_amount DOUBLE PRECISION,
        household_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE garden_fertilize_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fertilized_at DATE NOT NULL,
        fertilized_by INTEGER,
        household_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE notification_preferences (
        account_id INTEGER PRIMARY KEY,
        digest_enabled INTEGER NOT NULL DEFAULT 0,
        digest_time TEXT NOT NULL DEFAULT '08:00',
        quiet_hours TEXT,
        last_digest_sent_on DATE,
        push_enabled INTEGER NOT NULL DEFAULT 0,
        last_push_sent_on DATE,
        quiet_start TEXT,
        quiet_end TEXT,
        muted_care_types TEXT
    );
    CREATE TABLE push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE weather_warning_account_state (
        account_id INTEGER NOT NULL,
        warning_id TEXT NOT NULL,
        care_type TEXT NOT NULL CHECK (care_type IN ('frost_protect', 'heat_protect')),
        forecast_date DATE NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('warning', 'urgent')),
        acknowledged_at TIMESTAMP,
        push_sent_at TIMESTAMP,
        PRIMARY KEY (account_id, warning_id)
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
    CREATE TABLE household_calendar_grouping_preferences (
        household_id INTEGER PRIMARY KEY,
        care_types TEXT NOT NULL,
        map_ids TEXT NOT NULL
    );
    CREATE TABLE household_calendar_grouping_rules (
        household_id INTEGER NOT NULL,
        map_id INTEGER NOT NULL,
        care_type TEXT NOT NULL,
        PRIMARY KEY (household_id, map_id, care_type)
    );
    CREATE TABLE household_care_rhythm_preferences (
        household_id INTEGER PRIMARY KEY,
        indoor_weekdays TEXT NOT NULL,
        outdoor_weekdays TEXT NOT NULL,
        last_operation_id INTEGER
    );
    CREATE TABLE map_care_rhythm_overrides (
        household_id INTEGER NOT NULL,
        map_id INTEGER NOT NULL,
        weekdays TEXT NOT NULL,
        PRIMARY KEY (household_id, map_id)
    );
    CREATE TABLE calendar_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL UNIQUE,
        household_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        config_json TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMP
    );
    CREATE TABLE plantnet_quota (
        account_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (account_id, date)
    );
    CREATE TABLE identify_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER,
        household_id INTEGER,
        engine TEXT NOT NULL,
        outcome TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        top_species_id INTEGER,
        top_confidence REAL,
        chosen_species_id INTEGER,
        chosen_source TEXT,
        committed_at TIMESTAMP
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
        "INSERT INTO accounts (id, household_id, email, name, password_hash, role) "
        "VALUES (1, 1, 'test@example.com', 'Test', 'x', 'owner')"
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


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """Clear the in-memory auth rate limiter before each test so counters from
    one test don't push another over the limit (all TestClient requests share
    the same client IP)."""
    from services.rate_limit import reset
    reset()
    yield
    reset()


#: A mild, unremarkable 7-day forecast: nothing near the frost
#: (`bring_inside_below_c`) or heat (`HEAT_WATER_MAX_TEMP_C` = 30 °C)
#: thresholds, so no weather-driven ephemeral task is ever created for it.
_NEUTRAL_TEMP_DAYS = [{"min": 12.0, "max": 20.0} for _ in range(7)]


@pytest.fixture(autouse=True)
def _neutral_weather(monkeypatch):
    """Stop the suite from asserting against the live Amsterdam forecast.

    `services.environment.get_temp_data` falls through to an Open-Meteo HTTP
    call when no cache is warm, which in tests meant every run fetched the real
    7-day forecast over the network. `_sync_ephemeral_schedules` then scans that
    whole window for a day at or above 30 °C and, on a hit, inserts an ephemeral
    heat-water schedule for every eligible outdoor plant. Any test asserting an
    exact number of water events therefore passed or failed according to the
    weather in Amsterdam that day — `test_calendar_water_sessions.py` went red
    for exactly this reason, with a phantom `heat-water:` card.

    Tests that care about specific weather patch their own seam on top of this;
    the default is simply a forecast that triggers nothing, and no network.
    """
    from datetime import date, timedelta

    today = date.today()
    days = [
        {**day, "date": (today + timedelta(days=offset)).isoformat()}
        for offset, day in enumerate(_NEUTRAL_TEMP_DAYS)
    ]

    async def _fake_get_temp_data(db=None):
        return {"days": days}

    monkeypatch.setattr(
        "services.environment.get_temp_data", _fake_get_temp_data, raising=True,
    )


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
