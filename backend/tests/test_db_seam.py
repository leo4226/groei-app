"""Prove the database dependency injection seam works.
   Tests can override db_dep with an in-memory SQLite."""
import pytest
import aiosqlite
from fastapi.testclient import TestClient
from main import app
from database import db_dep


@pytest.fixture
def _db_cache():
    """Singleton in-memory db shared by all override calls in one test."""
    async def _init():
        db = await aiosqlite.connect(":memory:")
        db.row_factory = aiosqlite.Row
        await db.executescript("""
            CREATE TABLE plants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL, species TEXT, location_id INTEGER,
                map_id INTEGER, map_x REAL, map_y REAL, photo_path TEXT,
                acquired_date TEXT, pot_size_cm INTEGER, last_repotted TEXT,
                notes TEXT, is_active INTEGER DEFAULT 1, is_locked INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sun_requirement TEXT, plant_type TEXT, icon_key TEXT,
                species_id INTEGER, container_id INTEGER, ground_zone_id TEXT,
                display_radius_cm INTEGER, care_thresholds TEXT,
                phase TEXT DEFAULT 'established', sown_date TEXT,
                quantity INTEGER NOT NULL DEFAULT 1, household_id INTEGER,
                form_type TEXT, pot_material TEXT, pot_diameter_cm INTEGER,
                pot_height_cm INTEGER, has_drainage BOOLEAN, substrate TEXT,
                acquired_from TEXT, mulch BOOLEAN
            );
            CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT, icon TEXT, sort_order INTEGER DEFAULT 0, household_id INTEGER);
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                interval_days INTEGER, next_due TEXT, is_active INTEGER DEFAULT 1,
                last_done_by INTEGER, last_done TEXT, notes TEXT,
                season_adjust TEXT, created_at TEXT, is_ephemeral INTEGER DEFAULT 0,
                interval_source TEXT NOT NULL DEFAULT 'manual'
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, avatar TEXT, household_id INTEGER, language TEXT, account_id INTEGER);
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
                language TEXT DEFAULT 'nl',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE plant_species (
                id INTEGER PRIMARY KEY, slug TEXT UNIQUE, common_name_nl TEXT,
                common_name_en TEXT, latin_name TEXT, phenology_json TEXT,
                climate_zone TEXT DEFAULT 'temperate', care_thresholds TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE maps (
                id INTEGER PRIMARY KEY, name TEXT, slug TEXT UNIQUE,
                svg_file TEXT, viewbox TEXT, scale_info TEXT,
                sort_order INTEGER DEFAULT 0, canvas_data TEXT,
                map_type TEXT DEFAULT 'outdoor', lat REAL, lon REAL, bearing REAL DEFAULT 0,
                created_at TEXT, household_id INTEGER
            );
            CREATE TABLE objects (
                id INTEGER PRIMARY KEY, name TEXT, object_type TEXT,
                shape TEXT, diameter_cm INTEGER, width_cm INTEGER, depth_cm INTEGER,
                material TEXT, color TEXT, map_id INTEGER, map_x REAL, map_y REAL,
                rotation REAL DEFAULT 0, notes TEXT, is_active INTEGER DEFAULT 1,
                category TEXT DEFAULT 'container', label TEXT, preset TEXT,
                created_at TEXT, updated_at TEXT
            );
            CREATE TABLE ground_zones (
                id TEXT PRIMARY KEY, map_id INTEGER, name TEXT,
                zone_type TEXT, polygon TEXT, soil_note TEXT, created_at TEXT
            );
            INSERT INTO users (id, name) VALUES (1, 'Test User');
            INSERT INTO locations (id, name) VALUES (1, 'Test Location');
        """)
        await db.commit()
        return db

    class _Cache:
        _db = None
        @staticmethod
        async def get():
            if _Cache._db is None:
                _Cache._db = await _init()
            return _Cache._db

    yield _Cache

    # Close the connection or its (non-daemon) aiosqlite worker thread keeps
    # the pytest process alive after the run finishes.
    if _Cache._db is not None:
        import asyncio
        asyncio.run(_Cache._db.close())


@pytest.fixture(autouse=True)
def override_db(_db_cache):
    """Override db_dep — every request reuses the SAME in-memory db."""
    async def _mem_db():
        db = await _db_cache.get()
        yield db
        # We do NOT close the db — it's shared across requests

    app.dependency_overrides[db_dep] = _mem_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def override_auth():
    """Inject a fake account (household_id=1) for all tests."""
    from auth import get_current_account
    from main import app

    async def _fake_account():
        return {"account_id": 1, "household_id": 1}

    app.dependency_overrides[get_current_account] = _fake_account
    yield


# ── Tests ──

def test_list_plants_empty(client):
    """GET /api/plants with empty in-memory DB returns empty list."""
    resp = client.get("/api/plants")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_plants_includes_species_common_names(client, _db_cache):
    """Plant list exposes both localized species names for frontend language switching."""
    import asyncio

    async def seed():
        db = await _db_cache.get()
        await db.execute(
            "INSERT INTO plant_species (id, slug, common_name_nl, common_name_en, latin_name) VALUES (?, ?, ?, ?, ?)",
            (7, "monstera-deliciosa", "Gatenplant", "Swiss cheese plant", "Monstera deliciosa"),
        )
        await db.execute(
            "INSERT INTO plants (id, name, species, species_id, household_id, is_active) VALUES (?, ?, ?, ?, ?, 1)",
            (42, "Gatenplant in de hoek", "Monstera deliciosa", 7, 1),
        )
        await db.commit()

    asyncio.run(seed())

    resp = client.get("/api/plants")
    assert resp.status_code == 200
    plant = resp.json()[0]
    assert plant["name"] == "Gatenplant in de hoek"
    assert plant["species_common_name_nl"] == "Gatenplant"
    assert plant["species_common_name_en"] == "Swiss cheese plant"


def test_create_and_get_plant(client):
    """POST /api/plants inserts into in-memory DB, GET returns it."""
    resp = client.post("/api/plants", json={
        "name": "Test Monstera",
        "species": "Monstera deliciosa",
        "location_id": 1,
    })
    assert resp.status_code == 200
    plant = resp.json()
    assert plant["name"] == "Test Monstera"
    assert plant["id"] == 1

    # GET should return it
    resp2 = client.get(f"/api/plants/{plant['id']}")
    assert resp2.status_code == 200
    assert resp2.json()["name"] == "Test Monstera"


def test_get_plant_not_found(client):
    """404 for non-existent plant."""
    resp = client.get("/api/plants/999")
    assert resp.status_code == 404


def test_update_plant(client):
    """PUT updates a plant via in-memory DB."""
    # Create first
    client.post("/api/plants", json={
        "name": "Update Me",
        "species": "Testus updatus",
        "location_id": 1,
    })

    resp = client.put("/api/plants/1", json={"name": "Updated Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


def test_archive_plant(client):
    """DELETE soft-deletes a plant."""
    client.post("/api/plants", json={
        "name": "Archive Me",
        "location_id": 1,
    })
    resp = client.delete("/api/plants/1")
    assert resp.status_code == 200

    # Should be 404 after soft-delete
    resp2 = client.get("/api/plants/1")
    assert resp2.status_code == 404



# ── Auth helpers ──

def test_password_hash_and_verify():
    from auth import hash_password, verify_password
    hashed = hash_password("secret123")
    assert hashed != "secret123"
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)


def test_create_and_decode_token():
    from auth import create_token, decode_token
    token = create_token(account_id=1, household_id=7)
    payload = decode_token(token)
    assert payload["account_id"] == 1
    assert payload["household_id"] == 7


# -- Auth endpoints --

def test_register_creates_account_and_household(client):
    resp = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User",
        "household_name": "Test Garden",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["name"] == "Test User"
    assert data["account_id"] >= 1
    assert data["household_id"] >= 1


def test_register_rejects_short_password(client):
    resp = client.post("/api/auth/register", json={
        "email": "shortpw@example.com", "password": "short", "name": "S",
    })
    assert resp.status_code == 422


def test_register_rejects_malformed_email(client):
    resp = client.post("/api/auth/register", json={
        "email": "not-an-email", "password": "password123", "name": "S",
    })
    assert resp.status_code == 422


def test_register_duplicate_email_returns_409(client):
    client.post("/api/auth/register", json={
        "email": "dup@example.com", "password": "password123",
        "name": "A", "household_name": "AH",
    })
    resp = client.post("/api/auth/register", json={
        "email": "dup@example.com", "password": "other123",
        "name": "B", "household_name": "BH",
    })
    assert resp.status_code == 409


def test_login_returns_token(client):
    client.post("/api/auth/register", json={
        "email": "login@example.com", "password": "password123",
        "name": "Login User", "household_name": "Login Garden",
    })
    resp = client.post("/api/auth/login", json={
        "email": "login@example.com", "password": "password123",
    })
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_login_wrong_password_returns_401(client):
    client.post("/api/auth/register", json={
        "email": "wrong@example.com", "password": "correct123",
        "name": "W", "household_name": "WH",
    })
    resp = client.post("/api/auth/login", json={
        "email": "wrong@example.com", "password": "incorrect",
    })
    assert resp.status_code == 401


def test_plants_require_auth(client):
    """GET /api/plants without token returns 401."""
    from auth import get_current_account
    from main import app
    # Remove the auth override for this test
    saved = app.dependency_overrides.pop(get_current_account, None)
    resp = client.get("/api/plants")
    if saved:
        app.dependency_overrides[get_current_account] = saved
    assert resp.status_code == 401
