# PLAN: Plant Phenology Schema & Claude-Generated Species Data

## Goal
Introduce a `plant_species` table that stores reusable, Claude-generated lifecycle/phenology data per species. Link existing `plants` rows to species records via a `species_id` FK. Run a one-time backfill migration that calls the Claude API to generate species profiles for all plants currently in the database.

This is the data foundation for season-aware suitability (Plan 2) and the spot inspector (Plan 3). No UI changes in this plan.

---

## Architecture Overview

```
plant_species (new)
  id, slug, common_name_nl, common_name_en, latin_name
  phenology_json  ← Claude-generated, see schema below
  climate_zone
  created_at, updated_at

plants (existing)
  + species_id FK → plant_species.id  (nullable for now)
```

### Phenology JSON schema (stored in `plant_species.phenology_json`)

```json
{
  "months": [
    {
      "month": 1,
      "phase": "dormant",
      "phase_label_nl": "Rustperiode",
      "sun_hours_needed": 0,
      "description_nl": "Plant is volledig in rust, geen actie nodig.",
      "actions_nl": []
    },
    {
      "month": 4,
      "phase": "establishing",
      "phase_label_nl": "Opkomst",
      "sun_hours_needed": 3,
      "description_nl": "Eerste groei zichtbaar.",
      "actions_nl": ["Buiten zetten na nachtvorst"]
    },
    {
      "month": 6,
      "phase": "growing",
      "phase_label_nl": "Actieve groei",
      "sun_hours_needed": 6,
      "description_nl": "Snelle groei, regelmatig water geven.",
      "actions_nl": ["Wekelijks water geven", "Bijmesten mogelijk"]
    }
  ],
  "sow_window": [3, 4],
  "transplant_window": [5],
  "harvest_window": [7, 8, 9],
  "frost_sensitive": true,
  "min_temp_c": 10,
  "max_height_cm": 60,
  "max_spread_cm": 40,
  "interesting_facts_nl": "Bruine boon is een eenjarige plant die van warmte houdt en gevoelig is voor nachtvorst.",
  "climate_zone": "temperate"
}
```

**Phase values:** `dormant` | `establishing` | `growing` | `flowering` | `fruiting` | `harvest` | `dying_back` | `evergreen`

---

## Files to Change

### 1. `backend/migrations/add_plant_species.sql` (NEW)

```sql
CREATE TABLE IF NOT EXISTS plant_species (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,           -- e.g. "phaseolus-vulgaris"
  common_name_nl TEXT NOT NULL,        -- e.g. "Bruine boon"
  common_name_en TEXT,                 -- e.g. "Brown bean"
  latin_name TEXT,                     -- e.g. "Phaseolus vulgaris"
  phenology_json TEXT,                 -- JSON blob, see schema above
  climate_zone TEXT DEFAULT 'temperate',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE plants ADD COLUMN species_id INTEGER REFERENCES plant_species(id);
```

### 2. `backend/database.py` — apply migration on startup

In the `init_db()` function (or equivalent startup call), add:

```python
def apply_migrations(conn):
    # existing migrations...
    
    # Plant species migration
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='plant_species'"
    )
    if not cursor.fetchone():
        with open("migrations/add_plant_species.sql") as f:
            conn.executescript(f.read())
        conn.commit()
        print("✓ Applied migration: add_plant_species")
```

### 3. `backend/models.py` — add PlantSpecies model

```python
from pydantic import BaseModel
from typing import Optional, List, Any

class MonthPhenology(BaseModel):
    month: int
    phase: str
    phase_label_nl: str
    sun_hours_needed: float
    description_nl: str
    actions_nl: List[str]

class PhenologyData(BaseModel):
    months: List[MonthPhenology]
    sow_window: List[int]
    transplant_window: List[int]
    harvest_window: List[int]
    frost_sensitive: bool
    min_temp_c: Optional[float]
    max_height_cm: Optional[int]
    max_spread_cm: Optional[int]
    interesting_facts_nl: str
    climate_zone: str

class PlantSpecies(BaseModel):
    id: Optional[int] = None
    slug: str
    common_name_nl: str
    common_name_en: Optional[str] = None
    latin_name: Optional[str] = None
    phenology_json: Optional[str] = None  # raw JSON string in DB
    climate_zone: str = "temperate"
```

### 4. `backend/species_service.py` (NEW)

This module handles all species logic: lookup, Claude generation, and DB upsert.

```python
import json
import re
import anthropic
from database import get_db

ANTHROPIC_CLIENT = anthropic.Anthropic()

SPECIES_PROMPT = """
Je bent een botanische expert die tuiniers in Nederland helpt.

Genereer een JSON-object met fenologische data voor de volgende plant:
Plant: {plant_name}

Geef ALLEEN een geldig JSON-object terug, geen uitleg, geen markdown, geen backticks.
Het object moet dit exacte schema volgen:

{{
  "slug": "lowercase-latijnse-naam-of-nederlandse-naam",
  "common_name_nl": "Nederlandse naam",
  "common_name_en": "English name",
  "latin_name": "Latijnse naam",
  "climate_zone": "temperate",
  "phenology": {{
    "months": [
      {{
        "month": 1,
        "phase": "dormant",
        "phase_label_nl": "Rustperiode",
        "sun_hours_needed": 0,
        "description_nl": "Korte beschrijving wat de plant doet",
        "actions_nl": []
      }}
    ],
    "sow_window": [],
    "transplant_window": [],
    "harvest_window": [],
    "frost_sensitive": true,
    "min_temp_c": 10,
    "max_height_cm": 60,
    "max_spread_cm": 40,
    "interesting_facts_nl": "Interessant feit over de plant.",
    "climate_zone": "temperate"
  }}
}}

Vul alle 12 maanden in. Gebruik alleen deze phase-waarden:
dormant, establishing, growing, flowering, fruiting, harvest, dying_back, evergreen

Let op:
- sun_hours_needed is het aantal uur directe zon PER DAG dat de plant NODIG heeft in die fase
- Voor eenjarige planten: gebruik dormant of dying_back buiten het groeiseizoen
- Voor vaste planten en bomen: gebruik dormant in winter, evergreen als van toepassing
- sow_window, transplant_window, harvest_window zijn lijsten van maandnummers (1-12)
- interesting_facts_nl: schrijf 1-2 interessante zinnen specifiek voor Nederlandse tuiniers
"""

def generate_species_from_claude(plant_name: str) -> dict:
    """Call Claude API to generate phenology data for a plant name."""
    response = ANTHROPIC_CLIENT.messages.create(
        model="claude-opus-4-5",
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": SPECIES_PROMPT.format(plant_name=plant_name)
        }]
    )
    
    raw = response.content[0].text.strip()
    
    # Strip markdown fences if Claude added them despite instructions
    raw = re.sub(r'^```json\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    
    return json.loads(raw)

def get_or_create_species(db, plant_name: str) -> int:
    """
    Look up species by name (fuzzy match on common_name_nl).
    If not found, generate via Claude and insert.
    Returns species_id.
    """
    # Try exact match first
    row = db.execute(
        "SELECT id FROM plant_species WHERE LOWER(common_name_nl) = LOWER(?)",
        (plant_name,)
    ).fetchone()
    
    if row:
        return row["id"]
    
    # Generate from Claude
    print(f"  Generating species data for: {plant_name}")
    data = generate_species_from_claude(plant_name)
    
    phenology_json = json.dumps(data.get("phenology", {}), ensure_ascii=False)
    
    cursor = db.execute(
        """
        INSERT INTO plant_species (slug, common_name_nl, common_name_en, latin_name, phenology_json, climate_zone)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          phenology_json = excluded.phenology_json,
          updated_at = CURRENT_TIMESTAMP
        """,
        (
            data.get("slug", plant_name.lower().replace(" ", "-")),
            data.get("common_name_nl", plant_name),
            data.get("common_name_en"),
            data.get("latin_name"),
            phenology_json,
            data.get("climate_zone", "temperate"),
        )
    )
    db.commit()
    return cursor.lastrowid

def get_species_by_id(db, species_id: int) -> dict | None:
    row = db.execute(
        "SELECT * FROM plant_species WHERE id = ?", (species_id,)
    ).fetchone()
    if not row:
        return None
    result = dict(row)
    if result.get("phenology_json"):
        result["phenology"] = json.loads(result["phenology_json"])
    return result
```

### 5. `backend/migrate_species_backfill.py` (NEW — run once)

Standalone script to backfill species for all existing plants.

```python
#!/usr/bin/env python3
"""
One-time migration: generate Claude species profiles for all existing plants
and link them via species_id.

Usage: python migrate_species_backfill.py
"""
import sys
import time
from database import get_db
from species_service import get_or_create_species

def backfill():
    db = get_db()
    
    plants = db.execute(
        "SELECT id, name FROM plants WHERE species_id IS NULL"
    ).fetchall()
    
    if not plants:
        print("All plants already have species_id. Nothing to do.")
        return
    
    print(f"Backfilling {len(plants)} plants...\n")
    
    for plant in plants:
        plant_id = plant["id"]
        plant_name = plant["name"]
        
        try:
            species_id = get_or_create_species(db, plant_name)
            db.execute(
                "UPDATE plants SET species_id = ? WHERE id = ?",
                (species_id, plant_id)
            )
            db.commit()
            print(f"  ✓ {plant_name} → species_id={species_id}")
        except Exception as e:
            print(f"  ✗ {plant_name}: {e}", file=sys.stderr)
        
        # Be polite to the API
        time.sleep(0.5)
    
    print("\nBackfill complete.")

if __name__ == "__main__":
    backfill()
```

### 6. `backend/routers/plants.py` (or equivalent) — hook species creation on plant add

When a new plant is added via POST `/plants`, trigger species lookup/generation in the background:

```python
from species_service import get_or_create_species

@router.post("/plants")
async def create_plant(plant: PlantCreate, db = Depends(get_db)):
    # ... existing plant insertion logic ...
    
    # Link or create species (do this after insert so plant row exists)
    try:
        species_id = get_or_create_species(db, plant.name)
        db.execute(
            "UPDATE plants SET species_id = ? WHERE id = ?",
            (species_id, new_plant_id)
        )
        db.commit()
    except Exception as e:
        # Non-fatal: species data is nice to have, not required
        print(f"Warning: could not generate species data for {plant.name}: {e}")
    
    return {"id": new_plant_id, ...}
```

### 7. `backend/routers/species.py` (NEW) — read-only API endpoints

```python
from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from species_service import get_species_by_id
import json

router = APIRouter(prefix="/species", tags=["species"])

@router.get("/{species_id}")
def get_species(species_id: int, db = Depends(get_db)):
    species = get_species_by_id(db, species_id)
    if not species:
        raise HTTPException(404, "Species not found")
    return species

@router.get("/")
def list_species(db = Depends(get_db)):
    rows = db.execute("SELECT id, slug, common_name_nl, latin_name FROM plant_species ORDER BY common_name_nl").fetchall()
    return [dict(r) for r in rows]
```

Register this router in `main.py`:
```python
from routers import species
app.include_router(species.router)
```

### 8. `backend/routers/plants.py` — include species in GET /plants response

When returning plant data, join with species to include `species_id` and surface it to the frontend:

```python
@router.get("/plants/{plant_id}")
def get_plant(plant_id: int, db = Depends(get_db)):
    row = db.execute(
        "SELECT p.*, s.common_name_nl as species_name, s.phenology_json "
        "FROM plants p LEFT JOIN plant_species s ON p.species_id = s.id "
        "WHERE p.id = ?", (plant_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404)
    result = dict(row)
    if result.get("phenology_json"):
        result["phenology"] = json.loads(result.pop("phenology_json"))
    return result
```

---

## Testing the Backfill

After running the backfill script, verify in SQLite:

```sql
-- All plants should have species_id
SELECT p.name, s.common_name_nl, s.latin_name
FROM plants p
LEFT JOIN plant_species s ON p.species_id = s.id;

-- Check phenology was generated
SELECT common_name_nl, json_extract(phenology_json, '$.sow_window') as sow
FROM plant_species;
```

---

## What This Unlocks (for Plans 2 & 3)

- **Plan 2 (season-aware suitability):** `phenology.months[n].sun_hours_needed` for the plant's growing months can be compared against the garden's actual sun at that spot and month — replacing the current always-on comparison
- **Plan 3 (spot inspector):** Query all species, filter those whose growing-season sun needs match a given spot's sun profile → "what can grow here?"
- **Plant detail panel:** Render the 12-month `months` array as a lifecycle Gantt bar

---

## Session Starter Prompt for Claude Code

```
I'm working on the Groei garden planning app (React + FastAPI + SQLite).

Please implement PLAN-plant-phenology-schema.md from the project files.

Key steps:
1. Create and apply backend/migrations/add_plant_species.sql
2. Create backend/species_service.py with Claude API integration
3. Create backend/migrate_species_backfill.py
4. Update the plant creation endpoint to auto-link species
5. Add GET /species and GET /species/{id} endpoints
6. Update GET /plants/{id} to join and return phenology data

After implementing, run the backfill script:
  cd backend && python migrate_species_backfill.py

Then verify with:
  sqlite3 groei.db "SELECT p.name, s.latin_name FROM plants p JOIN plant_species s ON p.species_id = s.id"

The ANTHROPIC_API_KEY is already available in the environment.
Do not change any frontend files — this plan is backend-only.
```
