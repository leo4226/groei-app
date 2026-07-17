"""Tests for GET /api/icon-catalog/gaps and PATCH /api/icon-catalog/request/{plant_id}."""
import asyncio
import pytest
import aiosqlite
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from database import db_dep
from auth import get_current_account


FAKE_MANIFEST = [
    {"id": "monstera", "name": "Monstera", "sci": "Monstera deliciosa",
     "cat": "houseplant", "form": "potted", "family": "Araceae", "file": "monstera.svg"},
    {"id": "tomato", "name": "Tomato", "sci": "Solanum lycopersicum",
     "cat": "edible", "form": "bare", "family": "Solanaceae", "file": "tomato.svg"},
    {"id": "tomato_potted", "name": "Tomato (potted)", "sci": "Solanum lycopersicum",
     "cat": "edible", "form": "potted", "family": "Solanaceae", "file": "tomato_potted.svg",
     "variant_of": "tomato"},
]

SCHEMA = """
    CREATE TABLE plants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, species TEXT,
        is_active INTEGER DEFAULT 1,
        icon_key TEXT,
        icon_requested BOOLEAN DEFAULT 0,
        phase TEXT DEFAULT 'mature',
        household_id INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        common_name_nl TEXT NOT NULL,
        latin_name TEXT,
        climate_zone TEXT DEFAULT 'temperate',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
"""


@pytest.fixture
def db_override():
    cache: dict = {}

    async def _init_db():
        db = await aiosqlite.connect(":memory:")
        db.row_factory = aiosqlite.Row
        await db.executescript(SCHEMA)
        await db.commit()
        cache["db"] = db

    asyncio.run(_init_db())

    async def _get_db():
        yield cache["db"]

    app.dependency_overrides[db_dep] = _get_db
    app.dependency_overrides[get_current_account] = lambda: {"account_id": 1, "household_id": 1}
    yield cache
    app.dependency_overrides.pop(db_dep, None)
    app.dependency_overrides.pop(get_current_account, None)
    # Close the connection or its (non-daemon) aiosqlite worker thread keeps
    # the pytest process alive after the run finishes.
    asyncio.run(cache["db"].close())


@pytest.fixture
def fake_manifest():
    with patch("routers.icons.load_manifest", return_value=FAKE_MANIFEST):
        yield


def seed(cache, sql, params=()):
    async def _run():
        await cache["db"].execute(sql, params)
        await cache["db"].commit()
    asyncio.run(_run())


# ── Tests: GET /api/icon-catalog/gaps ──

def test_gaps_returns_requested_plants(db_override, fake_manifest):
    seed(db_override, "INSERT INTO plants (name, icon_requested, icon_key) VALUES ('Monstera', 1, NULL)")
    resp = TestClient(app).get("/api/icon-catalog/gaps")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["requested"]) == 1
    assert data["requested"][0]["name"] == "Monstera"


def test_gaps_requested_excludes_unflagged_plants(db_override, fake_manifest):
    # A plant with icon_requested=0 must NOT appear in requested, even if it has no icon_key.
    seed(db_override, "INSERT INTO plants (name, icon_requested, icon_key) VALUES ('Tomato', 0, 'tomato')")
    resp = TestClient(app).get("/api/icon-catalog/gaps")
    assert resp.status_code == 200
    assert len(resp.json()["requested"]) == 0


def test_gaps_species_without_icon(db_override, fake_manifest):
    seed(db_override,
         "INSERT INTO plant_species (common_name_nl, latin_name) VALUES ('Lavendel', 'Lavandula angustifolia')")
    resp = TestClient(app).get("/api/icon-catalog/gaps")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()["species_without_icon"]]
    assert "Lavendel" in names


def test_gaps_species_with_icon_excluded(db_override, fake_manifest):
    seed(db_override,
         "INSERT INTO plant_species (common_name_nl, latin_name) VALUES ('Monstera', 'Monstera deliciosa')")
    resp = TestClient(app).get("/api/icon-catalog/gaps")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()["species_without_icon"]]
    assert "Monstera" not in names


def test_gaps_icons_without_species(db_override, fake_manifest):
    resp = TestClient(app).get("/api/icon-catalog/gaps")
    assert resp.status_code == 200
    ids = [e["id"] for e in resp.json()["icons_without_species"]]
    assert "monstera" in ids
    assert "tomato" in ids
    assert "tomato_potted" not in ids


# ── Tests: PATCH /api/icon-catalog/request/{plant_id} ──

def test_request_icon_sets_flag(db_override, fake_manifest):
    seed(db_override, "INSERT INTO plants (name, household_id) VALUES ('Pepperoni', 1)")

    async def get_id():
        rows = await db_override["db"].execute_fetchall("SELECT id FROM plants WHERE name='Pepperoni'")
        return dict(rows[0])["id"]

    plant_id = asyncio.run(get_id())

    resp = TestClient(app).patch(f"/api/icon-catalog/request/{plant_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "requested"

    async def check_flag():
        rows = await db_override["db"].execute_fetchall(
            "SELECT icon_requested FROM plants WHERE id=?", (plant_id,)
        )
        return dict(rows[0])["icon_requested"]

    assert asyncio.run(check_flag()) == 1


def test_request_icon_404_for_missing_plant(db_override, fake_manifest):
    resp = TestClient(app).patch("/api/icon-catalog/request/9999")
    assert resp.status_code == 404


# ── New test: placeholdered plant (icon_requested=1, icon_key='placeholder_*') ──

@pytest.mark.asyncio
async def test_placeholdered_plant_shows_as_requested(client, seeded_db, auth_header):
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, latin_name TEXT)")
    await seeded_db.execute(
        "INSERT INTO plants (id,name,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Basterdkool','placeholder_unknown',1,1,1)")
    await seeded_db.commit()
    resp = await client.get("/api/icon-catalog/gaps", headers=auth_header)
    assert resp.status_code == 200, resp.text
    names = [r["name"] for r in resp.json()["requested"]]
    assert "Basterdkool" in names
