# Weed Backend Design

Migrate the frontend `weeds-dataset.ts` into SQLite tables and add API routes for weed catalog browsing and sighting logging.

## Summary

The frontend already has a complete static dataset of 40 Dutch weeds (`weeds-dataset.ts`). This design adds corresponding backend tables and API routes so the data is queryable and weed sightings can be logged on garden maps.

## Database Schema

### `weed_species` — Reference catalog

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| slug | TEXT UNIQUE NOT NULL | e.g. `"paardenbloem"` |
| common_name_nl | TEXT NOT NULL | `"Paardenbloem"` |
| latin_name | TEXT NOT NULL | `"Taraxacum officinale"` |
| family | TEXT | `"Composietenfamilie (Asteraceae)"` |
| common_names | TEXT | JSON array of alternative Dutch names |
| appearance_json | TEXT | Full `WeedAppearance` as JSON |
| habitat_json | TEXT | Full `WeedHabitat` as JSON |
| removal_json | TEXT | Full `WeedRemoval` as JSON |
| edible | BOOLEAN DEFAULT 0 | |
| edible_note | TEXT | |
| interesting | TEXT | |
| native_to_nl | BOOLEAN DEFAULT 1 | |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

Composite sub-objects (`appearance_json`, `habitat_json`, `removal_json`) are stored as JSON strings, following the pattern of `phenology_json` in `plant_species`. They are read as whole objects, not queried individually.

### `weed_sightings` — Simple pin on map

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| weed_id | INTEGER NOT NULL | FK → `weed_species(id)` |
| map_id | INTEGER NOT NULL | FK → `maps(id)` |
| map_x | REAL NOT NULL | SVG x coordinate |
| map_y | REAL NOT NULL | SVG y coordinate |
| notes | TEXT | |
| sighted_at | DATE NOT NULL DEFAULT (date('now')) | |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

Simple pin model — location and date. No status tracking, no removal log (deferred to future iteration).

## API Routes

### `GET /api/weed-catalog`

List all weeds with optional filters:
- `?place=gazon` — filter by habitat place
- `?bloom_month=6` — weeds blooming in June
- `?flower_color=geel` — by flower color
- `?growth_form=kruipend` — by growth form
- `?sun_preference=zon` — sun preference
- `?search=brand` — free text on name, latin name, description

Returns `WeedSpeciesListItem[]` (slim — id, slug, names, flower color, places).

### `GET /api/weed-catalog/{id}`

Single weed with all fields including full JSON sub-objects parsed.

Returns `WeedSpeciesOut`.

### `GET /api/weed-sightings`

List sightings, optionally filtered by `?map_id=1`.

Returns `WeedSightingOut[]` with joined weed catalog data (weed name, removal info).

### `POST /api/weed-sightings`

Log a new sighting. Body: `WeedSightingCreate`.

### `DELETE /api/weed-sightings/{id}`

Remove a sighting.

## Seed Strategy

Script `seed_weed_catalog.py` reads `weeds-dataset.ts`, extracts `LOCAL_WEEDS` array, transforms each into a `weed_species` row, and inserts with `INSERT OR IGNORE ON slug`. The TS file remains the authoring source for now.

## Models

```
WeedSpeciesOut        — full catalog row with parsed sub-objects
WeedSpeciesListItem   — slim (id, slug, names, flower_color, places)
WeedSightingCreate    — POST body
WeedSightingOut       — sighting + joined weed name + removal info
```

## Files

| File | Action |
|---|---|
| `backend/database/schema.py` | Add `CREATE TABLE IF NOT EXISTS` for both tables |
| `backend/models.py` | Add weed Pydantic models |
| `backend/routers/weed_catalog.py` | New — catalog browse + detail |
| `backend/routers/weed_sightings.py` | New — sighting CRUD |
| `backend/main.py` | Import + mount both routers |
| `backend/seed_weed_catalog.py` | New — one-shot seed from TS file |

## Out of Scope

- No changes to frontend `weeds-dataset.ts`
- No frontend UI changes
- No removal tracking or status transitions on sightings
- No weed images/photos
