import pytest
import aiosqlite
from services.plant_reader import enrich_plant, enrich_plants, enrich_plant_full, _compute_care_status, _compute_temp_status


# --- _compute_care_status ---

def test_care_status_good():
    """All schedules in future -> care_status='good'."""
    schedules = [{"care_type": "water", "next_due": "2026-12-31"}]
    status, urgent = _compute_care_status(schedules, "2026-01-01")
    assert status == "good"
    assert urgent is None


def test_care_status_overdue():
    """Schedule past due -> care_status='overdue' with most_urgent."""
    schedules = [{"care_type": "water", "next_due": "2025-12-31", "last_done_by_name": "Leon"}]
    status, urgent = _compute_care_status(schedules, "2026-01-05")
    assert status == "overdue"
    assert urgent is not None
    assert urgent.care_type == "water"
    assert urgent.days_overdue == 5
    assert urgent.last_done_by == "Leon"


def test_care_status_due_today():
    """Schedule due today -> care_status='due_today'."""
    schedules = [{"care_type": "fertilize", "next_due": "2026-06-15", "last_done_by_name": None}]
    status, urgent = _compute_care_status(schedules, "2026-06-15")
    assert status == "due_today"
    assert urgent is not None
    assert urgent.days_overdue == 0


def test_care_status_overdue_beats_due_today():
    """Overdue schedule takes priority over due_today."""
    schedules = [
        {"care_type": "water", "next_due": "2026-01-01"},
        {"care_type": "fertilize", "next_due": "2026-01-05"},
    ]
    status, urgent = _compute_care_status(schedules, "2026-01-05")
    assert status == "overdue"
    assert urgent.care_type == "water"


def test_care_status_empty_schedules():
    """No schedules -> care_status='good'."""
    status, urgent = _compute_care_status([], "2026-06-15")
    assert status == "good"
    assert urgent is None


# --- _compute_temp_status ---

def test_temp_no_thresholds():
    """No thresholds -> comfortable."""
    result = _compute_temp_status(None, {"days": [{"min": 5, "max": 15}]})
    assert result == "comfortable"


def test_temp_invalid_json():
    """Invalid JSON -> comfortable."""
    result = _compute_temp_status("not json", {"days": [{"min": 5, "max": 15}]})
    assert result == "comfortable"


def test_temp_freezing():
    """Week min below min_temp_c -> freezing."""
    thresholds = '{"min_temp_c": 5, "max_temp_c": 35}'
    temp_data = {"days": [{"min": 3, "max": 15}, {"min": 2, "max": 18}]}
    result = _compute_temp_status(thresholds, temp_data)
    assert result == "freezing"


def test_temp_chilling():
    """Week min within 3 degrees of min_temp_c -> chilling."""
    thresholds = '{"min_temp_c": 5, "max_temp_c": 35}'
    temp_data = {"days": [{"min": 6, "max": 15}]}
    result = _compute_temp_status(thresholds, temp_data)
    assert result == "chilling"


def test_temp_heatstress():
    """Week max above max_temp_c -> heatstress."""
    thresholds = '{"min_temp_c": 5, "max_temp_c": 30}'
    temp_data = {"days": [{"min": 15, "max": 32}]}
    result = _compute_temp_status(thresholds, temp_data)
    assert result == "heatstress"


def test_temp_comfortable():
    """Temps within thresholds -> comfortable."""
    thresholds = '{"min_temp_c": 0, "max_temp_c": 40}'
    temp_data = {"days": [{"min": 10, "max": 25}]}
    result = _compute_temp_status(thresholds, temp_data)
    assert result == "comfortable"


def test_temp_no_days():
    """No day data -> comfortable."""
    thresholds = '{"min_temp_c": 0, "max_temp_c": 40}'
    result = _compute_temp_status(thresholds, {"days": []})
    assert result == "comfortable"


# --- enrich_plant (integration with in-memory DB) ---

@pytest.mark.asyncio
async def test_enrich_plant_adds_care_status_and_phenology():
    """enrich_plant computes care_status, most_urgent, temp_status, and parses phenology."""
    async with aiosqlite.connect(":memory:") as db:
        db.row_factory = aiosqlite.Row
        await db.executescript("""
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                next_due TEXT, last_done_by INTEGER, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, last_done_by, is_active)
            VALUES (1, 42, 'water', '2026-01-01', NULL, 1);
        """)
        await db.commit()

        plant_row = {
            "id": 42, "name": "Test Plant", "species": "Testus",
            "care_thresholds": None,
            "phenology_json": '{"months": []}',
        }
        result = await enrich_plant(db, plant_row, "2026-01-05")
        assert result["care_status"] == "overdue"
        assert result["most_urgent"] is not None
        assert result["temp_status"] == "comfortable"
        assert result["phenology"] == {"months": []}
        assert "care_thresholds" not in result
        assert "phenology_json" not in result


@pytest.mark.asyncio
async def test_enrich_plant_temp_status_with_data():
    """enrich_plant computes temp_status when temp_data provided."""
    async with aiosqlite.connect(":memory:") as db:
        db.row_factory = aiosqlite.Row
        await db.executescript("""
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                next_due TEXT, last_done_by INTEGER, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, last_done_by, is_active)
            VALUES (1, 1, 'water', '2026-12-31', NULL, 1);
        """)
        await db.commit()

        plant_row = {
            "id": 1, "name": "Frosty", "species": "Frostus",
            "care_thresholds": '{"min_temp_c": 10, "max_temp_c": 35}',
            "phenology_json": None,
        }
        temp_data = {"days": [{"min": 3, "max": 15}]}
        result = await enrich_plant(db, plant_row, "2026-06-15", temp_data=temp_data)
        assert result["temp_status"] == "freezing"


@pytest.mark.asyncio
async def test_enrich_plant_missing_phenology():
    """enrich_plant handles missing phenology_json gracefully."""
    async with aiosqlite.connect(":memory:") as db:
        db.row_factory = aiosqlite.Row
        await db.executescript("""
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                next_due TEXT, last_done_by INTEGER, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
        """)
        await db.commit()

        plant_row = {"id": 1, "name": "Bare"}
        result = await enrich_plant(db, plant_row, "2026-06-15")
        assert result["phenology"] is None
        assert result["care_status"] == "good"


# --- enrich_plants batch ---

@pytest.mark.asyncio
async def test_enrich_plants_batch():
    """enrich_plants enriches multiple plants with a single schedules query."""
    async with aiosqlite.connect(":memory:") as db:
        db.row_factory = aiosqlite.Row
        await db.executescript("""
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                next_due TEXT, last_done_by INTEGER, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, last_done_by, is_active)
            VALUES (1, 1, 'water', '2025-12-31', NULL, 1);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, last_done_by, is_active)
            VALUES (2, 2, 'water', '2026-12-31', NULL, 1);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, last_done_by, is_active)
            VALUES (3, 3, 'fertilize', '2026-06-15', NULL, 1);
        """)
        await db.commit()

        plant_rows = [
            {"id": 1, "name": "Overdue Plant", "care_thresholds": None, "phenology_json": None},
            {"id": 2, "name": "Good Plant", "care_thresholds": None, "phenology_json": None},
            {"id": 3, "name": "Due Today", "care_thresholds": None, "phenology_json": None},
        ]
        results = await enrich_plants(db, plant_rows, "2026-06-15")
        assert len(results) == 3
        assert results[0]["care_status"] == "overdue"
        assert results[1]["care_status"] == "good"
        assert results[2]["care_status"] == "due_today"


@pytest.mark.asyncio
async def test_enrich_plants_empty():
    """enrich_plants handles empty input."""
    async with aiosqlite.connect(":memory:") as db:
        db.row_factory = aiosqlite.Row
        results = await enrich_plants(db, [], "2026-06-15")
        assert results == []


# --- enrich_plant_full ---

@pytest.mark.asyncio
async def test_enrich_plant_full_returns_care_schedules():
    """enrich_plant_full returns full care_schedules list for PlantOut shape."""
    async with aiosqlite.connect(":memory:") as db:
        db.row_factory = aiosqlite.Row
        await db.executescript("""
            CREATE TABLE care_schedules (
                id INTEGER PRIMARY KEY, plant_id INTEGER, care_type TEXT,
                interval_days INTEGER, next_due TEXT, last_done_by INTEGER, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, last_done_by, is_active)
            VALUES (1, 1, 'water', 7, '2026-06-20', NULL, 1);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, last_done_by, is_active)
            VALUES (2, 1, 'fertilize', 30, '2026-07-01', NULL, 1);
        """)
        await db.commit()

        plant_row = {"id": 1, "name": "Scheduled", "phenology_json": None}
        result = await enrich_plant_full(db, plant_row, "2026-06-15")
        assert len(result["care_schedules"]) == 2
        assert result["care_schedules"][0]["care_type"] == "water"
        assert result["care_schedules"][1]["care_type"] == "fertilize"
