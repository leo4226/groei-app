# Plant Reader Enrichment Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract duplicated plant enrichment logic (care status, schedules, phenology parsing, temperature status) into a single `services/plant_reader.py` module with batch support, fixing N+1 queries and eliminating copy-pasted code across `maps.py` and `plants.py`.

**Architecture:** New module `backend/services/plant_reader.py` with two public functions: `enrich_plant(db, plant_row, today, temp_data=None)` for single plants and `enrich_plants(db, plant_rows, today, temp_data=None)` for batch. Both return dicts (not Pydantic models — routers already have `response_model` decorators). Internal helpers `_compute_care_status` and `_compute_temp_status` move from `maps.py` into this module. Three call sites in `maps.py` and two in `plants.py` are refactored to use the new module.

**Tech Stack:** Python 3, aiosqlite, FastAPI

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/services/plant_reader.py` | Create | Enrichment module — `enrich_plant`, `enrich_plants`, internal helpers |
| `backend/services/__init__.py` | Modify (no-op, already exists) | No changes needed |
| `backend/tests/test_plant_reader.py` | Create | Tests for enrichment logic |
| `backend/routers/maps.py` | Modify | Replace `_plant_with_care`, `_compute_care_status`, `_compute_temp_status`, inline care status in `get_map_plants` |
| `backend/routers/plants.py` | Modify | Replace enrichment loops in `list_plants` and `get_plant` |

---

### Task 1: Create the Plant Reader Module

**Files:**
- Create: `groei/backend/services/plant_reader.py`

- [ ] **Step 1: Write `plant_reader.py`**

```python
import json
from datetime import date

from models import MostUrgent


def _compute_care_status(schedules, today):
    """Derive care_status and most_urgent from schedule rows."""
    care_status = "good"
    most_urgent = None
    for s in schedules:
        s = dict(s)
        next_due = s["next_due"]
        if next_due < today:
            care_status = "overdue"
            days = (date.fromisoformat(today) - date.fromisoformat(next_due)).days
            most_urgent = MostUrgent(
                care_type=s["care_type"],
                days_overdue=days,
                last_done_by=s.get("last_done_by_name"),
            )
            break
        elif next_due == today:
            if care_status != "overdue":
                care_status = "due_today"
                most_urgent = MostUrgent(
                    care_type=s["care_type"],
                    days_overdue=0,
                    last_done_by=s.get("last_done_by_name"),
                )
    return care_status, most_urgent


def _compute_temp_status(care_thresholds_json, temp_data):
    """Derive temperature status from care thresholds + current week's weather."""
    if not care_thresholds_json:
        return "comfortable"
    try:
        thresholds = json.loads(care_thresholds_json)
    except (json.JSONDecodeError, TypeError):
        return "comfortable"

    days = temp_data.get("days") or []
    if not days:
        return "comfortable"

    week_min = min(d["min"] for d in days)
    week_max = max(d["max"] for d in days)
    min_temp = thresholds.get("min_temp_c")
    max_temp = thresholds.get("max_temp_c")

    if min_temp is not None:
        if week_min <= min_temp:
            return "freezing"
        if week_min <= min_temp + 3:
            return "chilling"

    if max_temp is not None and week_max >= max_temp:
        return "heatstress"

    return "comfortable"


async def enrich_plant(db, plant_row, today, temp_data=None):
    """Enrich a single plant dict with care_status, most_urgent, temp_status, phenology, and care_schedules."""
    plant = dict(plant_row)

    schedules = await db.execute_fetchall(
        """SELECT cs.care_type, cs.next_due, u.name as last_done_by_name
           FROM care_schedules cs
           LEFT JOIN users u ON cs.last_done_by = u.id
           WHERE cs.plant_id = ? AND cs.is_active = 1
           ORDER BY cs.next_due ASC""",
        (plant["id"],),
    )
    plant["care_status"], plant["most_urgent"] = _compute_care_status(schedules, today)

    care_thresholds = plant.pop("care_thresholds", None)
    if temp_data is not None:
        plant["temp_status"] = _compute_temp_status(care_thresholds, temp_data)
    else:
        plant["temp_status"] = "comfortable"

    phenology_json = plant.pop("phenology_json", None)
    plant["phenology"] = json.loads(phenology_json) if phenology_json else None

    return plant


async def enrich_plant_full(db, plant_row, today, temp_data=None):
    """Enrich a single plant dict with full care_schedules list (for PlantOut shape)."""
    plant = dict(plant_row)

    sched_rows = await db.execute_fetchall(
        """SELECT cs.*, u.name as last_done_by_name
           FROM care_schedules cs
           LEFT JOIN users u ON cs.last_done_by = u.id
           WHERE cs.plant_id = ? AND cs.is_active = 1""",
        (plant["id"],),
    )
    plant["care_schedules"] = [dict(row) for row in sched_rows]

    phenology_json = plant.pop("phenology_json", None)
    plant["phenology"] = json.loads(phenology_json) if phenology_json else None

    return plant


async def enrich_plants(db, plant_rows, today, temp_data=None):
    """Batch-enrich plant dicts. Single query for all schedules (fixes N+1)."""
    if not plant_rows:
        return []

    plants = [dict(r) for r in plant_rows]
    plant_ids = [p["id"] for p in plants]

    # Build lookup
    by_id = {p["id"]: p for p in plants}

    # Single batch query for all schedules
    placeholders = ",".join("?" for _ in plant_ids)
    sched_rows = await db.execute_fetchall(
        f"""SELECT cs.care_type, cs.next_due, cs.plant_id, u.name as last_done_by_name
            FROM care_schedules cs
            LEFT JOIN users u ON cs.last_done_by = u.id
            WHERE cs.plant_id IN ({placeholders}) AND cs.is_active = 1
            ORDER BY cs.plant_id, cs.next_due ASC""",
        plant_ids,
    )

    # Group schedules by plant_id
    schedules_by_plant = {}
    for row in sched_rows:
        r = dict(row)
        pid = r["plant_id"]
        if pid not in schedules_by_plant:
            schedules_by_plant[pid] = []
        schedules_by_plant[pid].append(r)

    # Enrich each plant
    for plant in plants:
        pid = plant["id"]
        schedules = schedules_by_plant.get(pid, [])
        plant["care_status"], plant["most_urgent"] = _compute_care_status(schedules, today)

        care_thresholds = plant.pop("care_thresholds", None)
        if temp_data is not None:
            plant["temp_status"] = _compute_temp_status(care_thresholds, temp_data)
        else:
            plant["temp_status"] = "comfortable"

        phenology_json = plant.pop("phenology_json", None)
        plant["phenology"] = json.loads(phenology_json) if phenology_json else None

    return plants
```

- [ ] **Step 2: Verify module imports cleanly**

Run:
```bash
cd groei/backend && python -c "from services.plant_reader import enrich_plant, enrich_plants, enrich_plant_full; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add groei/backend/services/plant_reader.py
git commit -m "feat: add Plant Reader enrichment module

Two public entry points:
- enrich_plant() for single-plant enrichment
- enrich_plants() for batch enrichment (single schedules query, fixes N+1)
- enrich_plant_full() for PlantOut shape with full care_schedules

Internal helpers _compute_care_status and _compute_temp_status extracted
from maps.py where they currently live as duplicates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Write Tests for Plant Reader

**Files:**
- Create: `groei/backend/tests/test_plant_reader.py`

- [ ] **Step 1: Create tests directory and test file**

```bash
mkdir -p groei/backend/tests
```

Create `groei/backend/tests/__init__.py` (empty file).

- [ ] **Step 2: Write test file**

Create `groei/backend/tests/test_plant_reader.py`:

```python
import pytest
import aiosqlite
from services.plant_reader import enrich_plant, enrich_plants, enrich_plant_full, _compute_care_status, _compute_temp_status


# --- _compute_care_status ---

def test_care_status_good():
    """All schedules in future → care_status='good'."""
    schedules = [{"care_type": "water", "next_due": "2026-12-31"}]
    status, urgent = _compute_care_status(schedules, "2026-01-01")
    assert status == "good"
    assert urgent is None


def test_care_status_overdue():
    """Schedule past due → care_status='overdue' with most_urgent."""
    schedules = [{"care_type": "water", "next_due": "2025-12-31", "last_done_by_name": "Leon"}]
    status, urgent = _compute_care_status(schedules, "2026-01-05")
    assert status == "overdue"
    assert urgent is not None
    assert urgent.care_type == "water"
    assert urgent.days_overdue == 5
    assert urgent.last_done_by == "Leon"


def test_care_status_due_today():
    """Schedule due today → care_status='due_today'."""
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
    """No schedules → care_status='good'."""
    status, urgent = _compute_care_status([], "2026-06-15")
    assert status == "good"
    assert urgent is None


# --- _compute_temp_status ---

def test_temp_no_thresholds():
    """No thresholds → comfortable."""
    result = _compute_temp_status(None, {"days": [{"min": 5, "max": 15}]})
    assert result == "comfortable"


def test_temp_invalid_json():
    """Invalid JSON → comfortable."""
    result = _compute_temp_status("not json", {"days": [{"min": 5, "max": 15}]})
    assert result == "comfortable"


def test_temp_freezing():
    """Week min below min_temp_c → freezing."""
    thresholds = '{"min_temp_c": 5, "max_temp_c": 35}'
    temp_data = {"days": [{"min": 3, "max": 15}, {"min": 2, "max": 18}]}
    result = _compute_temp_status(thresholds, temp_data)
    assert result == "freezing"


def test_temp_chilling():
    """Week min within 3 degrees of min_temp_c → chilling."""
    thresholds = '{"min_temp_c": 5, "max_temp_c": 35}'
    temp_data = {"days": [{"min": 6, "max": 15}]}
    result = _compute_temp_status(thresholds, temp_data)
    assert result == "chilling"


def test_temp_heatstress():
    """Week max above max_temp_c → heatstress."""
    thresholds = '{"min_temp_c": 5, "max_temp_c": 30}'
    temp_data = {"days": [{"min": 15, "max": 32}]}
    result = _compute_temp_status(thresholds, temp_data)
    assert result == "heatstress"


def test_temp_comfortable():
    """Temps within thresholds → comfortable."""
    thresholds = '{"min_temp_c": 0, "max_temp_c": 40}'
    temp_data = {"days": [{"min": 10, "max": 25}]}
    result = _compute_temp_status(thresholds, temp_data)
    assert result == "comfortable"


def test_temp_no_days():
    """No day data → comfortable."""
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
                next_due TEXT, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, is_active)
            VALUES (1, 42, 'water', '2026-01-01', 1);
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
                next_due TEXT, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, is_active)
            VALUES (1, 1, 'water', '2026-12-31', 1);
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
                next_due TEXT, is_active INTEGER DEFAULT 1
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
                next_due TEXT, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, is_active)
            VALUES (1, 1, 'water', '2025-12-31', 1);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, is_active)
            VALUES (2, 2, 'water', '2026-12-31', 1);
            INSERT INTO care_schedules (id, plant_id, care_type, next_due, is_active)
            VALUES (3, 3, 'fertilize', '2026-06-15', 1);
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
                interval_days INTEGER, next_due TEXT, is_active INTEGER DEFAULT 1
            );
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active)
            VALUES (1, 1, 'water', 7, '2026-06-20', 1);
            INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active)
            VALUES (2, 1, 'fertilize', 30, '2026-07-01', 1);
        """)
        await db.commit()

        plant_row = {"id": 1, "name": "Scheduled", "phenology_json": None}
        result = await enrich_plant_full(db, plant_row, "2026-06-15")
        assert len(result["care_schedules"]) == 2
        assert result["care_schedules"][0]["care_type"] == "water"
        assert result["care_schedules"][1]["care_type"] == "fertilize"
```

- [ ] **Step 3: Run tests**

```bash
cd groei/backend && python -m pytest tests/test_plant_reader.py -v
```
Expected: All 17 tests PASS

- [ ] **Step 4: Commit**

```bash
git add groei/backend/tests/__init__.py groei/backend/tests/test_plant_reader.py
git commit -m "test: add Plant Reader enrichment tests

17 tests covering _compute_care_status, _compute_temp_status,
enrich_plant, enrich_plants (batch), and enrich_plant_full.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Refactor `maps.py` to Use Plant Reader

**Files:**
- Modify: `groei/backend/routers/maps.py`

- [ ] **Step 1: Replace imports and remove moved helpers**

Replace the imports at the top of `maps.py` (lines 1-12):

```python
import json
import re
import os

from fastapi import APIRouter, HTTPException
from datetime import date

from database import get_db
from models import MapOut, MapDetailOut, MapPlantOut, MapObjectOut, MapItemsOut, MapCreate, MapUpdate
from routers.plant_care import _get_temp_data
from services.svg_renderer import render_canvas_data
from services.plant_reader import enrich_plant, enrich_plants
```

Remove `_compute_temp_status` (lines 109-136), `_compute_care_status` (lines 139-159), and `_plant_with_care` (lines 162-178) entirely — all three are now in `plant_reader.py`.

- [ ] **Step 2: Refactor `get_map_plants` to use `enrich_plants`**

Replace lines 44-106 (the entire `get_map_plants` function) with:

```python
@router.get("/maps/{slug}/plants", response_model=list[MapPlantOut])
async def get_map_plants(slug: str):
    async with get_db() as db:
        map_row = await db.execute_fetchall(
            "SELECT id FROM maps WHERE slug = ?", (slug,)
        )
        if not map_row:
            raise HTTPException(404, "Map not found")
        map_id = map_row[0]["id"]

        plant_rows = await db.execute_fetchall(
            """SELECT p.id, p.name, p.species, p.map_x, p.map_y, p.photo_path,
                      p.container_id, p.ground_zone_id, p.display_radius_cm,
                      p.sun_requirement, p.plant_type, p.icon_key, p.species_id,
                      p.is_locked, p.care_thresholds,
                      s.phenology_json
               FROM plants p
               LEFT JOIN plant_species s ON p.species_id = s.id
               WHERE p.map_id = ? AND p.is_active = 1 AND p.map_x IS NOT NULL AND p.map_y IS NOT NULL""",
            (map_id,),
        )
        today = date.today().isoformat()
        return await enrich_plants(db, plant_rows, today)
```

Note: the SELECT is widened to include `container_id`, `ground_zone_id`, `display_radius_cm`, `species_id`, `is_locked`, `care_thresholds`, and the LEFT JOIN to `plant_species` for `phenology_json` — these were missing from the original narrow SELECT but are needed for `MapPlantOut`.

- [ ] **Step 3: Refactor `get_map_items` free-standing plants**

Replace line 203 (`plants = [await _plant_with_care(db, p, today, temp_data) for p in plant_rows]`) with:

```python
        plants = await enrich_plants(db, plant_rows, today, temp_data=temp_data)
```

- [ ] **Step 4: Refactor `get_map_items` contained plants**

Replace lines 224-230 (the contained plants loop and map_x/map_y fixup) with:

```python
            contained = await enrich_plants(db, contained_rows, today, temp_data=temp_data)
            for p in contained:
                p["map_x"] = p["map_x"] or 0
                p["map_y"] = p["map_y"] or 0
```

- [ ] **Step 5: Verify maps.py still works**

```bash
cd groei/backend && python -c "from routers.maps import router; print('OK')"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add groei/backend/routers/maps.py
git commit -m "refactor: replace inline enrichment in maps.py with plant_reader

- get_map_plants now uses enrich_plants (fixes N+1, batches schedules)
- get_map_items free-standing plants use enrich_plants
- get_map_items contained plants use enrich_plants
- Removed _compute_care_status, _compute_temp_status, _plant_with_care
  (moved to services/plant_reader.py)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Refactor `plants.py` to Use Plant Reader

**Files:**
- Modify: `groei/backend/routers/plants.py`

- [ ] **Step 1: Add plant_reader import**

Replace the imports (lines 1-13):

```python
import json
import os
import time
from datetime import date

from fastapi import APIRouter, UploadFile, File, HTTPException

from database import get_db
from models import PlantOut, PlantCreate, PlantUpdate, CareScheduleOut, PlantPositionUpdate, PlantContainerUpdate, PlantGroundZoneUpdate
from routers.icons import find_variant
from services.scheduling import calculate_next_due
from services.plant_reader import enrich_plant_full
from species_service import get_or_create_species
from threshold_service import generate_thresholds
```

- [ ] **Step 2: Refactor `list_plants` to batch-load schedules (fix N+1)**

Replace the entire `list_plants` function (lines 20-48) with:

```python
@router.get("/plants", response_model=list[PlantOut])
async def list_plants():
    async with get_db() as db:
        rows = await db.execute_fetchall("""
            SELECT p.*, l.name as location_name, l.icon as location_icon,
                   s.phenology_json
            FROM plants p
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN plant_species s ON p.species_id = s.id
            WHERE p.is_active = 1
            ORDER BY p.name
        """)
        plants = [dict(r) for r in rows]

        # Batch load all schedules (single query, fixes N+1)
        plant_ids = [p["id"] for p in plants]
        if plant_ids:
            placeholders = ",".join("?" for _ in plant_ids)
            sched_rows = await db.execute_fetchall(
                f"""SELECT cs.*, u.name as last_done_by_name
                    FROM care_schedules cs
                    LEFT JOIN users u ON cs.last_done_by = u.id
                    WHERE cs.plant_id IN ({placeholders}) AND cs.is_active = 1""",
                plant_ids,
            )
            by_plant = {}
            for row in sched_rows:
                r = dict(row)
                pid = r["plant_id"]
                if pid not in by_plant:
                    by_plant[pid] = []
                by_plant[pid].append(r)
        else:
            by_plant = {}

        for plant in plants:
            plant["care_schedules"] = by_plant.get(plant["id"], [])
            if plant.get("phenology_json"):
                plant["phenology"] = json.loads(plant.pop("phenology_json"))
            else:
                plant.pop("phenology_json", None)

        return plants
```

- [ ] **Step 3: Refactor `get_plant` to use `enrich_plant_full`**

Replace `get_plant` (lines 51-80) with:

```python
@router.get("/plants/{plant_id}", response_model=PlantOut)
async def get_plant(plant_id: int):
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT p.*, l.name as location_name, l.icon as location_icon,
                   s.phenology_json
            FROM plants p
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN plant_species s ON p.species_id = s.id
            WHERE p.id = ? AND p.is_active = 1
        """, (plant_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Plant not found")
        today = date.today().isoformat()
        return await enrich_plant_full(db, dict(row), today)
```

- [ ] **Step 4: Verify plants.py still works**

```bash
cd groei/backend && python -c "from routers.plants import router; print('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add groei/backend/routers/plants.py
git commit -m "refactor: use plant_reader for plants.py enrichment

- list_plants now batch-loads schedules (single query, fixes N+1)
- get_plant uses enrich_plant_full from plant_reader

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: Start backend and verify no import errors**

```bash
cd groei && python -m uvicorn backend.main:app --port 8000 &
sleep 2
curl http://localhost:8000/api/plants | head -c 200
```
Expected: JSON array of plants returned without errors.

- [ ] **Step 2: Verify map plants endpoint**

```bash
curl http://localhost:8000/api/maps/garden/plants | python -m json.tool | head -30
```
Expected: JSON array with `care_status`, `most_urgent` fields on each plant.

- [ ] **Step 3: Verify map items endpoint**

```bash
curl http://localhost:8000/api/maps/garden/items | python -m json.tool | head -30
```
Expected: JSON object with `plants` and `objects` arrays, each plant has `care_status`, `temp_status`.

- [ ] **Step 4: Run all tests**

```bash
cd groei/backend && python -m pytest tests/ -v
```
Expected: All tests PASS.

- [ ] **Step 5: Stop backend**

```bash
kill %1
```

---

## Self-Review

**1. Spec coverage:**
- Extract enrichment into single module — Task 1 creates `plant_reader.py`
- Two public entry points (enrich_plant, enrich_plants) — Task 1
- enrich_plant_full for PlantOut shape — Task 1
- Fix N+1 in list_plants — Task 4 Step 2 (batch query)
- Replace maps.py inline code — Task 3 Steps 2-4
- Replace plants.py enrichment — Task 4 Steps 2-3
- Remove dead code from maps.py — Task 3 Step 1
- Tests — Task 2 (17 tests)
- Db connection passed as parameter (not injected) — All functions take `db`
- Dict return (not Pydantic) — All functions return dict

**2. Placeholder scan:** No TBDs, no TODOs. All code is shown in full.

**3. Type consistency:**
- `enrich_plant(db, plant_row, today, temp_data=None)` — consistent across all call sites
- `enrich_plants(db, plant_rows, today, temp_data=None)` — consistent across all call sites
- `enrich_plant_full(db, plant_row, today, temp_data=None)` — used by get_plant
- `_compute_care_status(schedules, today)` — called from enrich_plant and enrich_plants
- `_compute_temp_status(care_thresholds_json, temp_data)` — called from enrich_plant and enrich_plants
