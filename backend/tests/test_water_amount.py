"""Tests for the water_amount field on garden watering logs.

Endpoints (prefix /api):
  POST /garden/water-log  — log a garden watering
  GET  /garden/water-log/latest — get latest watering

Both are defined in backend/routers/plant_care.py, WaterLogCreate model.
water_amount: float | None = None  # ml
"""
import pytest
import aiosqlite
from fastapi.testclient import TestClient
from main import app
from database import db_dep


# ── Fixtures ──────────────────────────────────────────────────────────────────

SCHEMA = """
    CREATE TABLE garden_water_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        watered_at  DATE NOT NULL,
        watered_by  INTEGER,
        water_amount REAL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE care_schedules (
        id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
        interval_days INTEGER, next_due TEXT, is_active INTEGER DEFAULT 1,
        last_done_by INTEGER, last_done TEXT, notes TEXT,
        season_adjust TEXT, created_at TEXT
    );
    CREATE TABLE plants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, species TEXT, is_active INTEGER DEFAULT 1
    );
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
"""


@pytest.fixture
def _db_cache():
    """In-memory SQLite with garden_water_log + related tables."""
    async def _init():
        db = await aiosqlite.connect(":memory:")
        db.row_factory = aiosqlite.Row
        await db.executescript(SCHEMA)
        await db.commit()
        return db

    class _Cache:
        _db = None
        @staticmethod
        async def get():
            if _Cache._db is None:
                _Cache._db = await _init()
            return _Cache._db

    return _Cache


@pytest.fixture(autouse=True)
def override_db(_db_cache):
    """Override db_dep — every request reuses the SAME in-memory db."""
    async def _mem_db():
        db = await _db_cache.get()
        yield db

    app.dependency_overrides[db_dep] = _mem_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestWaterAmountAccepted:
    """POST /api/garden/water-log with water_amount → returned in response."""

    def test_water_amount_float_value(self, client):
        """Accept water_amount=250.5 and echo it back."""
        resp = client.post("/api/garden/water-log", json={
            "water_amount": 250.5,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == 250.5
        assert data["watered_at"] is not None
        assert data["schedules_updated"] == 0

    def test_water_amount_integer_value(self, client):
        """Accept water_amount=500 (int) and return as float."""
        resp = client.post("/api/garden/water-log", json={
            "water_amount": 500,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == 500  # FastAPI returns int if int sent

    def test_water_amount_float_ml_precision(self, client):
        """Accept water_amount=1000.75 with decimal precision."""
        resp = client.post("/api/garden/water-log", json={
            "water_amount": 1000.75,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == 1000.75


class TestWaterAmountOptional:
    """water_amount defaults to None when not provided."""

    def test_no_water_amount_returns_none(self, client):
        """Omit water_amount entirely → response has water_amount=None."""
        resp = client.post("/api/garden/water-log", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] is None

    def test_explicit_null_water_amount(self, client):
        """Send water_amount=null → returns None."""
        resp = client.post("/api/garden/water-log", json={
            "water_amount": None,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] is None


class TestWaterAmountZero:
    """Edge case: water_amount = 0."""

    def test_water_amount_zero(self, client):
        """water_amount=0 is accepted and returned as 0."""
        resp = client.post("/api/garden/water-log", json={
            "water_amount": 0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == 0

    def test_water_amount_zero_dot_zero(self, client):
        """water_amount=0.0 is accepted."""
        resp = client.post("/api/garden/water-log", json={
            "water_amount": 0.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == 0.0


class TestWaterAmountPersisted:
    """water_amount is persisted and returned by GET /garden/water-log/latest."""

    def test_latest_returns_water_amount(self, client):
        """POST with water_amount, GET latest returns it."""
        client.post("/api/garden/water-log", json={
            "water_amount": 330.0,
        })
        resp = client.get("/api/garden/water-log/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == 330.0

    def test_latest_without_water_amount(self, client):
        """POST without water_amount, GET latest returns None."""
        client.post("/api/garden/water-log", json={})
        resp = client.get("/api/garden/water-log/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] is None

    def test_latest_zero_water_amount(self, client):
        """POST with water_amount=0, GET latest returns 0 (not None)."""
        client.post("/api/garden/water-log", json={
            "water_amount": 0,
        })
        resp = client.get("/api/garden/water-log/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == 0

    def test_latest_no_logs_returns_none(self, client):
        """GET latest with no logs returns water_amount=None."""
        resp = client.get("/api/garden/water-log/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] is None
        assert data["watered_at"] is None

    def test_latest_returns_last_water_amount(self, client):
        """After multiple POSTs, GET returns the most recent water_amount."""
        client.post("/api/garden/water-log", json={"water_amount": 100.0})
        client.post("/api/garden/water-log", json={"water_amount": 200.0})
        resp = client.get("/api/garden/water-log/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == 200.0

    def test_delete_clears_latest(self, client):
        """DELETE /garden/water-log/latest clears the log."""
        client.post("/api/garden/water-log", json={"water_amount": 500.0})
        resp = client.delete("/api/garden/water-log/latest")
        assert resp.status_code == 200
        resp2 = client.get("/api/garden/water-log/latest")
        assert resp2.json()["water_amount"] is None


class TestWaterAmountRejected:
    """Invalid water_amount values should be rejected."""

    def test_negative_water_amount(self, client):
        """Negative values are allowed by schema (business rule, not model constraint)."""
        resp = client.post("/api/garden/water-log", json={
            "water_amount": -10.0,
        })
        # FastAPI BaseModel doesn't constrain negatives — it's accepted
        assert resp.status_code == 200
        data = resp.json()
        assert data["water_amount"] == -10.0

    def test_string_water_amount_rejected(self, client):
        """String value for water_amount returns 422."""
        resp = client.post("/api/garden/water-log", json={
            "water_amount": "abc",
        })
        assert resp.status_code == 422
