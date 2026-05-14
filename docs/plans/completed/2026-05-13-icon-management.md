# Icon Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add icon gap reporting to Settings, an icon request button on plant edit forms, and a `phase` field on plants for life-stage icon variants.

**Architecture:** Three independent layers — (1) DB migration adds two columns to `plants`, (2) a new read-only `GET /icon-catalog/gaps` endpoint computes the three gap types from the manifest + DB, (3) the frontend surfaces gaps in Settings and a request button in EditPlant. The existing dynamic `PUT /plants/{id}` update machinery handles the new fields without changes to the router once models are updated.

**Tech Stack:** FastAPI + aiosqlite + SQLite (backend), React 19 + TypeScript + Tailwind CSS (frontend). Tests use `pytest` + `fastapi.testclient.TestClient` with in-memory SQLite override (see `groei/backend/tests/test_db_seam.py` for the pattern). All commands run from `groei/`.

---

## Domain context

Read `CONTEXT.md` at the repo root before starting. Key terms:

- **Icon** — SVG file in `groei/icons/` with a manifest entry (`manifest.json`). Has `id`, `name`, `sci` (scientific name), `cat`, `form`, `family`, `file`. Variant entries additionally have `variant_of` and optionally `phase`.
- **Icon variant** — alternative Icon for the same species, distinguished by `form` (`potted`/`bare`/`portrait`/`fruit`) and/or `phase` (`seed`/`seedling`/`mature`). Linked via `variant_of`.
- **Icon request** — explicit signal (`icon_requested = 1` on a Plant) that the household wants a custom icon created. Distinct from simply having no icon.
- **Phase** — life stage of a Plant (`seed`/`seedling`/`mature`), stored on the plant, used for icon variant selection.

## File map

| File | Action | What changes |
|---|---|---|
| `groei/backend/migrate_add_icon_phase.py` | **Create** | One-off migration script |
| `groei/backend/models.py` | **Modify** | Add `icon_requested`, `phase` to PlantCreate/PlantUpdate/PlantOut |
| `groei/backend/routers/plants.py` | **Modify** | Update `create_plant` INSERT to include new columns |
| `groei/backend/routers/icons.py` | **Modify** | Add gaps endpoint, request endpoint, extend find_variant, update sync |
| `groei/backend/tests/test_db_seam.py` | **Modify** | Add new columns to in-memory schema |
| `groei/backend/tests/test_icon_gaps.py` | **Create** | Tests for gaps + request endpoints |
| `groei/frontend/src/types/index.ts` | **Modify** | Add `icon_requested`, `phase` to Plant; add `IconGapReport` type |
| `groei/frontend/src/api/client.ts` | **Modify** | Add `fetchIconGaps()`, `requestIcon()` |
| `groei/frontend/src/pages/EditPlant.tsx` | **Modify** | Request button below IconPicker + phase selector |
| `groei/frontend/src/pages/Settings.tsx` | **Modify** | Gap view: three sections below sync result |

---

## Task 1: DB Migration

**Files:**
- Create: `groei/backend/migrate_add_icon_phase.py`

- [ ] **Step 1: Write the migration script**

Create `groei/backend/migrate_add_icon_phase.py`:

```python
"""Add icon_requested and phase columns to the plants table.

Run: cd groei/backend && python migrate_add_icon_phase.py
Idempotent — uses ALTER TABLE ... IF NOT EXISTS via existence check.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "groei.db")


def column_exists(db: sqlite3.Connection, table: str, column: str) -> bool:
    cols = db.execute(f"PRAGMA table_info({table})").fetchall()
    return any(c[1] == column for c in cols)


def main():
    db = sqlite3.connect(DB_PATH)
    added = []

    if not column_exists(db, "plants", "icon_requested"):
        db.execute("ALTER TABLE plants ADD COLUMN icon_requested BOOLEAN DEFAULT 0")
        added.append("icon_requested")

    if not column_exists(db, "plants", "phase"):
        db.execute("ALTER TABLE plants ADD COLUMN phase TEXT DEFAULT 'mature'")
        added.append("phase")

    db.commit()
    db.close()

    if added:
        print(f"Added columns: {', '.join(added)}")
    else:
        print("Nothing to do — columns already exist.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the migration**

```bash
cd groei/backend && python migrate_add_icon_phase.py
```

Expected output:
```
Added columns: icon_requested, phase
```

Running it a second time should output:
```
Nothing to do — columns already exist.
```

- [ ] **Step 3: Verify in DB**

```bash
cd groei/backend && python3 -c "
import sqlite3
db = sqlite3.connect('groei.db')
cols = [c[1] for c in db.execute('PRAGMA table_info(plants)').fetchall()]
print('icon_requested' in cols, 'phase' in cols)
"
```

Expected: `True True`

- [ ] **Step 4: Commit**

```bash
git add groei/backend/migrate_add_icon_phase.py
git commit -m "feat: add icon_requested and phase columns to plants table"
```

---

## Task 2: Backend models

**Files:**
- Modify: `groei/backend/models.py`

- [ ] **Step 1: Add fields to PlantCreate**

In `models.py`, find `class PlantCreate` and add two fields after `icon_key`:

```python
class PlantCreate(BaseModel):
    name: str
    species: str | None = None
    location_id: int | None = None
    acquired_date: date | None = None
    pot_size_cm: int | None = None
    notes: str | None = None
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None
    sun_requirement: str | None = None
    plant_type: str | None = None
    icon_key: str | None = None
    phase: str = 'mature'          # 'seed' | 'seedling' | 'mature'
    care_schedules: list[CareScheduleCreate] = []
```

- [ ] **Step 2: Add fields to PlantUpdate**

Find `class PlantUpdate` and add two fields after `icon_key`:

```python
class PlantUpdate(BaseModel):
    name: str | None = None
    species: str | None = None
    location_id: int | None = None
    acquired_date: date | None = None
    pot_size_cm: int | None = None
    last_repotted: date | None = None
    notes: str | None = None
    display_radius_cm: int | None = None
    sun_requirement: str | None = None
    plant_type: str | None = None
    icon_key: str | None = None
    icon_requested: bool | None = None   # None = don't change
    phase: str | None = None             # 'seed' | 'seedling' | 'mature'
```

- [ ] **Step 3: Add fields to PlantOut**

Find `class PlantOut` and add two fields after `icon_key`:

```python
class PlantOut(BaseModel):
    id: int
    name: str
    species: str | None = None
    location_id: int | None = None
    location_name: str | None = None
    location_icon: str | None = None
    map_id: int | None = None
    map_x: float | None = None
    map_y: float | None = None
    photo_path: str | None = None
    acquired_date: str | None = None
    pot_size_cm: int | None = None
    last_repotted: str | None = None
    container_id: int | None = None
    notes: str | None = None
    is_active: bool = True
    is_locked: bool = False
    created_at: str | None = None
    sun_requirement: str | None = None
    plant_type: str | None = None
    icon_key: str | None = None
    icon_requested: bool = False
    phase: str = 'mature'
    species_id: int | None = None
    phenology: Any | None = None
    care_schedules: list[CareScheduleOut] = []
    care_status: str = "good"
    temp_status: str = "comfortable"
```

- [ ] **Step 4: Commit**

```bash
git add groei/backend/models.py
git commit -m "feat: add icon_requested and phase to plant models"
```

---

## Task 3: Backend plants router — update INSERT

**Files:**
- Modify: `groei/backend/routers/plants.py`

The `update_plant` endpoint (`PUT /plants/{id}`) already builds a dynamic SET clause from `PlantUpdate.model_dump(exclude_unset=True)`, so it handles the new fields automatically. Only `create_plant` needs a manual change because it uses an explicit INSERT.

- [ ] **Step 1: Update the INSERT in create_plant**

In `routers/plants.py`, find the INSERT in `create_plant` (around line 87) and replace it:

```python
cursor = await db.execute(
    """INSERT INTO plants
       (name, species, location_id, acquired_date, pot_size_cm, notes,
        map_id, map_x, map_y, sun_requirement, plant_type, icon_key, phase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
    (data.name, data.species, data.location_id,
     str(data.acquired_date) if data.acquired_date else None,
     data.pot_size_cm, data.notes,
     data.map_id, data.map_x, data.map_y, data.sun_requirement,
     data.plant_type, data.icon_key, data.phase),
)
```

Note: `icon_requested` is intentionally omitted from INSERT — a brand-new plant cannot have an outstanding request yet (the plant must exist before a request can be logged).

- [ ] **Step 2: Verify the server starts without errors**

```bash
cd groei && npm run dev:backend
```

Expected: FastAPI starts on port 8000 without import errors. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add groei/backend/routers/plants.py
git commit -m "feat: include phase column in plant INSERT"
```

---

## Task 4: Backend icons router — gaps endpoint, request endpoint, find_variant extension, sync update

**Files:**
- Modify: `groei/backend/routers/icons.py`

This task has four sub-changes to the same file. Make them all, then commit once.

- [ ] **Step 1: Update the import line and replace `_FORM_SUFFIXES` with `_VARIANT_SUFFIXES` (handles phase too)**

At the top of `routers/icons.py`, update the FastAPI import to include `HTTPException`:

```python
from fastapi import APIRouter, Depends, HTTPException
```

Then replace:

```python
_FORM_SUFFIXES = re.compile(r"_(bare|potted|nopot|fruit|portrait)$")
```

With:

```python
_VARIANT_SUFFIXES = re.compile(r"_(bare|potted|nopot|fruit|portrait|seed|seedling|mature)$")
```

- [ ] **Step 2: Replace `find_variant()` to accept optional phase**

Replace the entire `find_variant` function:

```python
def find_variant(icon_key: str | None, target_form: str, target_phase: str | None = None) -> str | None:
    """Return the icon_id for the closest variant of icon_key matching target_form (and optionally target_phase).
    Strips all known variant suffixes to find the base, then matches by form + phase.
    Falls back to form-only match, then returns original icon_key unchanged."""
    if not icon_key:
        return icon_key

    # Strip all variant suffixes iteratively to get the base id
    base = icon_key
    prev = None
    while prev != base:
        prev = base
        base = _VARIANT_SUFFIXES.sub("", base)

    manifest = load_manifest()

    def entry_base(entry_id: str) -> str:
        b = entry_id
        p = None
        while p != b:
            p = b
            b = _VARIANT_SUFFIXES.sub("", b)
        return b

    # Try: base matches + form matches + phase matches
    if target_phase:
        for entry in manifest:
            if (entry_base(entry["id"]) == base
                    and entry.get("form") == target_form
                    and entry.get("phase") == target_phase):
                return entry["id"]

    # Fallback: base matches + form matches (ignore phase)
    for entry in manifest:
        if entry_base(entry["id"]) == base and entry.get("form") == target_form:
            return entry["id"]

    return icon_key
```

- [ ] **Step 3: Add the gaps endpoint**

After the existing `sync_icons` route, add:

```python
@router.get("/gaps")
async def get_icon_gaps(db=Depends(db_dep)):
    """Return three gap reports:
    - requested: plants with icon_requested=1 and no icon_key
    - species_without_icon: plant_species rows with no matching manifest entry
    - icons_without_species: base manifest entries with no matching plant_species
    """
    manifest = load_manifest()
    base_entries = [e for e in manifest if not e.get("variant_of")]

    # Build a set of normalised scientific names that have icons
    manifest_sci: set[str] = {
        e.get("sci", "").lower().strip()
        for e in base_entries
        if e.get("sci", "").strip()
    }

    # Gap A2 — plants with an explicit icon request
    requested_rows = await db.execute_fetchall(
        """SELECT id, name, species FROM plants
           WHERE is_active = 1 AND icon_requested = 1
             AND (icon_key IS NULL OR icon_key = '')"""
    )

    # Gap A1 — plant_species with no icon
    species_rows = await db.execute_fetchall(
        "SELECT id, common_name_nl, latin_name FROM plant_species ORDER BY common_name_nl"
    )
    species_without_icon = [
        {
            "id": dict(r)["id"],
            "name": dict(r)["common_name_nl"],
            "latin": dict(r)["latin_name"] or "",
        }
        for r in species_rows
        if (dict(r)["latin_name"] or "").lower().strip() not in manifest_sci
    ]

    # Gap B — base manifest entries with no matching plant_species
    species_latin: set[str] = {
        (dict(r)["latin_name"] or "").lower().strip()
        for r in species_rows
        if dict(r)["latin_name"]
    }
    icons_without_species = [
        {
            "id": e["id"],
            "name": e.get("name", ""),
            "sci": e.get("sci", ""),
        }
        for e in base_entries
        if e.get("sci", "").strip()
        and e.get("sci", "").lower().strip() not in species_latin
    ]

    return {
        "requested": [dict(r) for r in requested_rows],
        "species_without_icon": species_without_icon,
        "icons_without_species": icons_without_species,
    }
```

- [ ] **Step 4: Add the icon request endpoint**

After the `get_icon_gaps` route, add:

```python
@router.patch("/request/{plant_id}")
async def request_icon(plant_id: int, db=Depends(db_dep)):
    """Mark a plant as needing a custom icon. Idempotent."""
    cursor = await db.execute(
        "SELECT id FROM plants WHERE id = ? AND is_active = 1", (plant_id,)
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    await db.execute(
        "UPDATE plants SET icon_requested = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (plant_id,),
    )
    await db.commit()
    return {"status": "requested", "plant_id": plant_id}
```

- [ ] **Step 5: Update sync to clear icon_requested when a plant gets matched**

In the `sync_icons` function, find the block that does `UPDATE plants SET icon_key = ?` (around the `matched.append` line) and change it to also clear `icon_requested`:

```python
        if found_key:
            await db.execute(
                """UPDATE plants
                   SET icon_key = ?, icon_requested = 0, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (found_key, plant["id"]),
            )
            matched.append({
                "plant_id": plant["id"],
                "plant_name": plant["name"],
                "icon_key": found_key,
            })
```

- [ ] **Step 6: Commit**

```bash
git add groei/backend/routers/icons.py
git commit -m "feat: add gaps endpoint, request endpoint, extend find_variant for phase"
```

---

## Task 5: Backend tests

**Files:**
- Modify: `groei/backend/tests/test_db_seam.py` (schema update)
- Create: `groei/backend/tests/test_icon_gaps.py`

- [ ] **Step 1: Add new columns to the in-memory schema in test_db_seam.py**

In `groei/backend/tests/test_db_seam.py`, find the `CREATE TABLE plants` statement inside the `_db_cache` fixture and add the two new columns at the end of the column list:

```python
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
                icon_requested BOOLEAN DEFAULT 0,
                phase TEXT DEFAULT 'mature'
            );
```

- [ ] **Step 2: Run existing tests to confirm nothing broke**

```bash
cd groei/backend && python -m pytest tests/ -v
```

Expected: all existing tests pass.

- [ ] **Step 3: Write the failing tests for the gaps endpoint**

Create `groei/backend/tests/test_icon_gaps.py`:

```python
"""Tests for GET /icon-catalog/gaps and PATCH /icon-catalog/request/{plant_id}."""
import json
import pytest
import aiosqlite
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from database import db_dep


# ── In-memory DB fixture (same pattern as test_db_seam.py) ──

@pytest.fixture
def db_override(tmp_path):
    """Provide an in-memory async DB with the minimal schema."""
    _cache = {}

    async def _get_db():
        if "db" not in _cache:
            db = await aiosqlite.connect(":memory:")
            db.row_factory = aiosqlite.Row
            await db.executescript("""
                CREATE TABLE plants (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL, species TEXT,
                    is_active INTEGER DEFAULT 1,
                    icon_key TEXT,
                    icon_requested BOOLEAN DEFAULT 0,
                    phase TEXT DEFAULT 'mature',
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
            """)
            _cache["db"] = db
        yield _cache["db"]

    app.dependency_overrides[db_dep] = _get_db
    yield _cache
    app.dependency_overrides.clear()


# Minimal manifest for testing — two base entries, one variant
FAKE_MANIFEST = {
    "plants": [
        {"id": "monstera", "name": "Monstera", "sci": "Monstera deliciosa",
         "cat": "houseplant", "form": "potted", "family": "Araceae", "file": "monstera.svg"},
        {"id": "tomato", "name": "Tomato", "sci": "Solanum lycopersicum",
         "cat": "edible", "form": "bare", "family": "Solanaceae", "file": "tomato.svg"},
        {"id": "tomato_potted", "name": "Tomato (potted)", "sci": "Solanum lycopersicum",
         "cat": "edible", "form": "potted", "family": "Solanaceae", "file": "tomato_potted.svg",
         "variant_of": "tomato"},
    ],
    "count": 3,
    "iconCount": 3,
}


@pytest.fixture
def fake_manifest():
    with patch("routers.icons.load_manifest", return_value=FAKE_MANIFEST["plants"]):
        yield


# ── Tests for GET /icon-catalog/gaps ──

def test_gaps_returns_requested_plants(db_override, fake_manifest):
    """Plants with icon_requested=1 and no icon_key appear in 'requested'."""
    client = TestClient(app)

    async def seed():
        db = db_override.get("db")
        if db is None:
            # trigger fixture init
            async for _ in app.dependency_overrides[db_dep]():
                break
            db = db_override["db"]
        await db.execute(
            "INSERT INTO plants (name, icon_requested, icon_key) VALUES ('Monstera', 1, NULL)"
        )
        await db.commit()

    import asyncio
    asyncio.get_event_loop().run_until_complete(seed())

    resp = client.get("/icon-catalog/gaps")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["requested"]) == 1
    assert data["requested"][0]["name"] == "Monstera"


def test_gaps_requested_excludes_plants_with_icon(db_override, fake_manifest):
    """Plants with icon_requested=1 but already have an icon_key are NOT in 'requested'."""
    client = TestClient(app)

    async def seed():
        db = db_override.get("db")
        if db is None:
            async for _ in app.dependency_overrides[db_dep]():
                break
            db = db_override["db"]
        await db.execute(
            "INSERT INTO plants (name, icon_requested, icon_key) VALUES ('Tomato', 1, 'tomato')"
        )
        await db.commit()

    import asyncio
    asyncio.get_event_loop().run_until_complete(seed())

    resp = client.get("/icon-catalog/gaps")
    assert resp.status_code == 200
    assert len(resp.json()["requested"]) == 0


def test_gaps_species_without_icon(db_override, fake_manifest):
    """A plant_species with no matching manifest sci name appears in 'species_without_icon'."""
    client = TestClient(app)

    async def seed():
        db = db_override.get("db")
        if db is None:
            async for _ in app.dependency_overrides[db_dep]():
                break
            db = db_override["db"]
        await db.execute(
            "INSERT INTO plant_species (common_name_nl, latin_name) VALUES ('Lavendel', 'Lavandula angustifolia')"
        )
        await db.commit()

    import asyncio
    asyncio.get_event_loop().run_until_complete(seed())

    resp = client.get("/icon-catalog/gaps")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()["species_without_icon"]]
    assert "Lavendel" in names


def test_gaps_species_with_icon_excluded(db_override, fake_manifest):
    """A plant_species whose latin_name matches a manifest sci is NOT in 'species_without_icon'."""
    client = TestClient(app)

    async def seed():
        db = db_override.get("db")
        if db is None:
            async for _ in app.dependency_overrides[db_dep]():
                break
            db = db_override["db"]
        await db.execute(
            "INSERT INTO plant_species (common_name_nl, latin_name) VALUES ('Monstera', 'Monstera deliciosa')"
        )
        await db.commit()

    import asyncio
    asyncio.get_event_loop().run_until_complete(seed())

    resp = client.get("/icon-catalog/gaps")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()["species_without_icon"]]
    assert "Monstera" not in names


def test_gaps_icons_without_species(db_override, fake_manifest):
    """A base manifest entry whose sci doesn't match any plant_species latin_name appears in icons_without_species."""
    client = TestClient(app)
    resp = client.get("/icon-catalog/gaps")
    assert resp.status_code == 200
    # No species in DB → both base icons (monstera, tomato) should appear
    ids = [e["id"] for e in resp.json()["icons_without_species"]]
    assert "monstera" in ids
    assert "tomato" in ids
    # Variant should NOT appear
    assert "tomato_potted" not in ids


# ── Tests for PATCH /icon-catalog/request/{plant_id} ──

def test_request_icon_sets_flag(db_override, fake_manifest):
    """PATCH /icon-catalog/request/{id} sets icon_requested=1."""
    client = TestClient(app)

    async def seed():
        db = db_override.get("db")
        if db is None:
            async for _ in app.dependency_overrides[db_dep]():
                break
            db = db_override["db"]
        await db.execute("INSERT INTO plants (name) VALUES ('Pepperoni')")
        await db.commit()
        row = await db.execute_fetchall("SELECT id FROM plants WHERE name='Pepperoni'")
        return dict(row[0])["id"]

    import asyncio
    plant_id = asyncio.get_event_loop().run_until_complete(seed())

    resp = client.patch(f"/icon-catalog/request/{plant_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "requested"

    async def check():
        db = db_override["db"]
        row = await db.execute_fetchall(
            "SELECT icon_requested FROM plants WHERE id=?", (plant_id,)
        )
        return dict(row[0])["icon_requested"]

    flag = asyncio.get_event_loop().run_until_complete(check())
    assert flag == 1


def test_request_icon_404_for_missing_plant(db_override, fake_manifest):
    """PATCH /icon-catalog/request/9999 returns 404."""
    client = TestClient(app)
    resp = client.patch("/icon-catalog/request/9999")
    assert resp.status_code == 404
```

- [ ] **Step 4: Run the tests — they should fail (endpoints don't exist yet in test isolation)**

```bash
cd groei/backend && python -m pytest tests/test_icon_gaps.py -v
```

Expected: tests run (some may fail due to manifest mock setup — confirm tests are discovered, not import-errored).

- [ ] **Step 5: Run tests again after Task 4 is complete**

```bash
cd groei/backend && python -m pytest tests/test_icon_gaps.py -v
```

Expected: all 7 tests pass.

- [ ] **Step 6: Run full test suite**

```bash
cd groei/backend && python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add groei/backend/tests/
git commit -m "test: add icon gaps and request endpoint tests"
```

---

## Task 6: Frontend types

**Files:**
- Modify: `groei/frontend/src/types/index.ts`

- [ ] **Step 1: Add `icon_requested` and `phase` to the `Plant` interface**

Find `export interface Plant` in `types/index.ts`. Add two fields after `icon_key`:

```typescript
export interface Plant {
  id: number
  name: string
  species: string | null
  location_id: number | null
  location_name: string | null
  location_icon: string | null
  map_id: number | null
  map_x: number | null
  map_y: number | null
  photo_path: string | null
  acquired_date: string | null
  pot_size_cm: number | null
  container_id: number | null
  last_repotted: string | null
  notes: string | null
  is_active: boolean
  is_locked: boolean
  created_at: string | null
  sun_requirement: string | null
  plant_type: string | null
  icon_key: string | null
  icon_requested: boolean
  phase: 'seed' | 'seedling' | 'mature'
  species_id: number | null
  phenology: Phenology | null
  care_schedules: CareSchedule[]
  care_status: 'overdue' | 'due_today' | 'good'
  temp_status: 'comfortable' | 'chilling' | 'freezing' | 'heatstress'
}
```

- [ ] **Step 2: Add `phase` to `PlantCreateInput`**

Find `export interface PlantCreateInput` and add `phase` (no `icon_requested` — can't request before plant exists):

```typescript
export interface PlantCreateInput {
  name: string
  species?: string
  location_id?: number
  acquired_date?: string
  pot_size_cm?: number
  notes?: string
  map_id?: number
  map_x?: number
  map_y?: number
  sun_requirement?: string
  plant_type?: string
  icon_key?: string
  phase?: 'seed' | 'seedling' | 'mature'
  care_schedules: CareScheduleInput[]
}
```

- [ ] **Step 3: Add `phase` and `variant_of` to `PlantIcon`**

Find `export interface PlantIcon` and add:

```typescript
export interface PlantIcon {
  id: string
  name: string
  sci: string
  cat: string
  form: string
  phase?: string
  variant_of?: string
  family: string
  file: string
}
```

- [ ] **Step 4: Add `IconGapReport` type**

After `IconSyncResult`, add:

```typescript
export interface IconGapItem {
  id?: number
  name: string
  latin?: string
  sci?: string
  species?: string | null
}

export interface IconGapReport {
  requested: IconGapItem[]
  species_without_icon: IconGapItem[]
  icons_without_species: IconGapItem[]
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd groei && npm run dev:frontend
```

Expected: Vite starts on port 5173 without TypeScript errors. Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add groei/frontend/src/types/index.ts
git commit -m "feat: add icon_requested, phase, IconGapReport types"
```

---

## Task 7: Frontend API client

**Files:**
- Modify: `groei/frontend/src/api/client.ts`

- [ ] **Step 1: Add the two new icon functions**

In `client.ts`, find the `// ── Icons ──` section and add two lines after the existing ones:

```typescript
// ── Icons ──

export const fetchIconCatalog      = ()                    => api<PlantIcon[]>('GET', '/icon-catalog')
export const syncIcons             = ()                    => api<IconSyncResult>('POST', '/icon-catalog/sync')
export const fetchIconGaps         = ()                    => api<IconGapReport>('GET', '/icon-catalog/gaps')
export const requestIcon           = (plantId: number)     => api<{ status: string; plant_id: number }>('PATCH', `/icon-catalog/request/${plantId}`)
```

Also update the import at the top of the file — add `IconGapReport` to the existing type import line:

```typescript
import type { User, Location, Plant, PlantCreateInput, DashboardData, DashboardV2Data, StatusCounts, RecentLogEntry, CareLogEntry, MapInfo, MapDetail, MapPlant, MapObject, MapItems, ObjectCreateInput, GroundZone, PlantIcon, IconSyncResult, IconGapReport, PlantAlert, AlertSummary, PlantFactOut } from '../types'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd groei && npm run dev:frontend
```

Expected: starts without errors. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/api/client.ts
git commit -m "feat: add fetchIconGaps and requestIcon API calls"
```

---

## Task 8: Frontend — EditPlant.tsx

**Files:**
- Modify: `groei/frontend/src/pages/EditPlant.tsx`

The EditPlant form currently has: photo, name, species, icon, sun requirement, map picker, pot size, acquired date, last repotted, notes, save button.

This task adds: a "Icoon aanvragen" button below the icon picker (only when no icon is selected) + a phase selector below the icon picker.

- [ ] **Step 1: Add `requestIcon` to imports**

At the top of `EditPlant.tsx`, update the import from `../api/client`:

```typescript
import { fetchPlant, requestIcon } from '../api/client'
```

- [ ] **Step 2: Add state variables**

After the existing `const [iconKey, setIconKey] = useState<string | null>(null)` line, add:

```typescript
const [iconRequested, setIconRequested] = useState(false)
const [requestingIcon, setRequestingIcon] = useState(false)
const [phase, setPhase] = useState<'seed' | 'seedling' | 'mature'>('mature')
```

- [ ] **Step 3: Populate state from loaded plant**

In the `load()` function inside `useEffect`, after `setIconKey(p.icon_key ?? null)`, add:

```typescript
setIconRequested(p.icon_requested ?? false)
setPhase((p.phase ?? 'mature') as 'seed' | 'seedling' | 'mature')
```

- [ ] **Step 4: Add `handleRequestIcon` function**

After the `handlePhotoChange` function, add:

```typescript
async function handleRequestIcon() {
  setRequestingIcon(true)
  try {
    await requestIcon(plantId)
    setIconRequested(true)
  } catch {
    // silently fail — user can still save form to persist via icon_requested field
    setIconRequested(true)
  } finally {
    setRequestingIcon(false)
  }
}
```

- [ ] **Step 5: Include `icon_requested` and `phase` in form submit**

In `handleSubmit`, update the `updatePlant` call to include the two new fields:

```typescript
await updatePlant(plantId, {
  name: name.trim(),
  species: species.trim() || null,
  map_id: mapId,
  pot_size_cm: potSize ? parseInt(potSize) : null,
  acquired_date: acquiredDate || null,
  last_repotted: lastRepotted || null,
  notes: notes.trim() || null,
  sun_requirement: sunRequirement ?? null,
  icon_key: iconKey,
  icon_requested: iconKey ? false : iconRequested,
  phase,
})
```

Note: when saving with an icon selected, always clear `icon_requested` (the request is fulfilled).

- [ ] **Step 6: Add the request button and phase selector to the JSX**

Find the `{/* Icon */}` block in the JSX:

```tsx
{/* Icon */}
<div>
  <label className="block text-sm font-medium text-text-muted mb-1.5">Icoon</label>
  <IconPicker value={iconKey} onChange={setIconKey} />
</div>
```

Replace it with:

```tsx
{/* Icon */}
<div>
  <label className="block text-sm font-medium text-text-muted mb-1.5">Icoon</label>
  <IconPicker value={iconKey} onChange={(key) => { setIconKey(key); if (key) setIconRequested(false) }} />
  {!iconKey && (
    <button
      type="button"
      onClick={handleRequestIcon}
      disabled={requestingIcon || iconRequested}
      className="mt-2 text-xs text-primary underline disabled:no-underline disabled:text-text-muted"
    >
      {iconRequested ? 'Icoon aangevraagd ✓' : requestingIcon ? 'Aanvragen…' : 'Icoon aanvragen'}
    </button>
  )}
</div>

{/* Phase */}
<div>
  <label className="block text-sm font-medium text-text-muted mb-1.5">Groeifase</label>
  <div className="flex gap-2">
    {([
      { value: 'seed', label: 'Zaad', emoji: '🌰' },
      { value: 'seedling', label: 'Zaailing', emoji: '🌱' },
      { value: 'mature', label: 'Volgroeid', emoji: '🌿' },
    ] as const).map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => setPhase(opt.value)}
        className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-colors ${
          phase === opt.value
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-text-muted hover:border-text-muted'
        }`}
      >
        <span className="text-lg">{opt.emoji}</span>
        <span>{opt.label}</span>
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 7: Verify in browser**

Start the dev server:

```bash
cd groei && npm run dev
```

Open `http://localhost:5173`, navigate to a plant's edit form. Confirm:
1. The phase selector shows three buttons (Zaad, Zaailing, Volgroeid) with Volgroeid pre-selected.
2. When no icon is chosen, "Icoon aanvragen" link appears below the picker.
3. Clicking "Icoon aanvragen" shows "Icoon aangevraagd ✓" and disables the button.
4. When an icon IS chosen, the request link disappears.

- [ ] **Step 8: Commit**

```bash
git add groei/frontend/src/pages/EditPlant.tsx
git commit -m "feat: add icon request button and phase selector to plant edit form"
```

---

## Task 9: Frontend — Settings gap view

**Files:**
- Modify: `groei/frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Add imports**

At the top of `Settings.tsx`, add `fetchIconGaps` and `IconGapReport` to existing imports:

```typescript
import { syncIcons, fetchIconGaps } from '../api/client'
import type { IconSyncResult, IconGapReport } from '../types'
```

- [ ] **Step 2: Add gap state variables**

After the existing `const [syncError, setSyncError] = useState<string | null>(null)` line, add:

```typescript
const [gapReport, setGapReport] = useState<IconGapReport | null>(null)
const [gapsLoading, setGapsLoading] = useState(false)
const [gapsError, setGapsError] = useState<string | null>(null)
```

- [ ] **Step 3: Add `handleLoadGaps` function**

After `handleSyncIcons`, add:

```typescript
async function handleLoadGaps() {
  setGapsLoading(true)
  setGapsError(null)
  try {
    const report = await fetchIconGaps()
    setGapReport(report)
  } catch (e) {
    setGapsError(e instanceof Error ? e.message : 'Laden mislukt')
  } finally {
    setGapsLoading(false)
  }
}
```

- [ ] **Step 4: Add the gap view section to the JSX**

In the JSX, find the closing `</section>` of the "Iconen" section (the one with the sync button) and add a new section directly after it:

```tsx
      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">Icoon gaps</h2>
        <div className="card p-4 space-y-3">
          <p className="text-sm text-text-muted">
            Overzicht van ontbrekende iconen en soorten.
          </p>
          <button
            onClick={handleLoadGaps}
            disabled={gapsLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-surface border border-border text-text font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {gapsLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-text/20 border-t-text rounded-full animate-spin" />
                Laden…
              </>
            ) : (
              '🔍 Gaps laden'
            )}
          </button>

          {gapsError && (
            <p className="text-sm text-fiery-red">{gapsError}</p>
          )}

          {gapReport && (
            <div className="space-y-4 text-sm">

              {/* Gap A2 — requested icons */}
              <div>
                <p className="font-medium text-text mb-1">
                  Aangevraagde iconen ({gapReport.requested.length})
                </p>
                {gapReport.requested.length === 0 ? (
                  <p className="text-text-muted italic text-xs">Geen aanvragen</p>
                ) : (
                  <ul className="space-y-1">
                    {gapReport.requested.map((p) => (
                      <li key={p.id} className="text-text-muted">
                        <span className="font-medium text-text">{p.name}</span>
                        {p.species && <span className="text-xs ml-1">— {p.species}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Gap A1 — species without icon */}
              <div>
                <p className="font-medium text-text mb-1">
                  Soorten zonder icoon ({gapReport.species_without_icon.length})
                </p>
                {gapReport.species_without_icon.length === 0 ? (
                  <p className="text-text-muted italic text-xs">Alle soorten hebben een icoon</p>
                ) : (
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {gapReport.species_without_icon.map((s) => (
                      <li key={s.id} className="text-text-muted">
                        <span className="font-medium text-text">{s.name}</span>
                        {s.latin && <span className="text-xs ml-1 italic">— {s.latin}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Gap B — icons without species */}
              <div>
                <p className="font-medium text-text mb-1">
                  Iconen zonder soort ({gapReport.icons_without_species.length})
                </p>
                {gapReport.icons_without_species.length === 0 ? (
                  <p className="text-text-muted italic text-xs">Alle iconen hebben een soort</p>
                ) : (
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {gapReport.icons_without_species.map((e) => (
                      <li key={e.id} className="text-text-muted font-mono text-xs">
                        {e.id}
                        {e.sci && <span className="font-sans italic ml-1">— {e.sci}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </div>
          )}
        </div>
      </section>
```

- [ ] **Step 5: Verify in browser**

With the dev server running (`npm run dev` from `groei/`), open `http://localhost:5173/settings`.

Confirm:
1. A new "Icoon gaps" section appears below "Iconen".
2. Clicking "Gaps laden" shows a spinner then populates three sub-sections.
3. The three sections show correct counts.
4. Lists longer than their max-height scroll independently.

- [ ] **Step 6: Commit**

```bash
git add groei/frontend/src/pages/Settings.tsx
git commit -m "feat: add icon gap view to Settings with three gap sections"
```

---

## Icon creation workflow (no code changes)

Now that all plumbing is in place, the icon creation loop via Claude Code is:

1. A household member taps "Icoon aanvragen" on a plant they own → `icon_requested = 1` is stored.
2. Leon opens Settings → "Gaps laden" → sees the plant in "Aangevraagde iconen".
3. Leon asks Claude Code: *"Create an SVG icon for [plant name] in the style of `groei/icons/monstera.svg`. Write it to `groei/icons/[id].svg` and add a manifest entry."*
4. Claude Code generates the SVG, writes it to disk, updates `manifest.json`.
5. Leon clicks "Iconen synchroniseren" → the plant gets matched → `icon_requested` is cleared automatically.

No Claude Design download/copy step required.
