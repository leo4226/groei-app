# Architecture Review — Groei Plant APP

Generated 2026-05-07. Domain language from CONTEXT.md.

---

## 1. Extract a `LocationContext` seam (weather, coordinates, shadow geometry)

**Files:** `backend/routers/plant_care.py`, `frontend/src/utils/gardenStructures.ts`, `frontend/src/hooks/useSunVisualization.ts`, `frontend/src/utils/shadowGeometry.ts`

**Problem:** Amsterdam coordinates and Leon's garden geometry are hardcoded across 6+ files. Open-Meteo URLs contain literal `52.3715,4.8499`. Shadow casters are a flat list of polygons with no indirection. CLAUDE.md says this is a "known limitation" but there is no seam where a second garden could be swapped in.

**Solution:** Introduce a `GardenConfig` module behind which lat/lon/bearing/shadow-casters live, keyed by map. On the backend, make weather endpoints accept lat/lon from the caller instead of hardcoding. On the frontend, turn `useSunVisualization`'s hardcoded imports into parameters.

**Benefits:** One adapter today (Leon's garden), but makes the seam real so a second garden becomes a data change, not a code change. Tests stop monkey-patching module constants.

---

## 2. Split `routers/plant_care.py` into 4 modules

**Files:** `backend/routers/plant_care.py` (724 lines), `backend/routers/alerts.py`

**Problem:** A single file contains weather fetching, water logging, species info resolution (Trefle + Claude fallback), and grow-here AI suggestions. None of these are "plant care." `alerts.py` imports private functions (`_get_rain_data`, `_get_temp_data`) from it — leaking implementation across routers.

**Solution:** Four modules behind clear interfaces:
- `weather.py` — Open-Meteo client, accepts lat/lon
- `water_log.py` — garden water CRUD + status
- `species_info.py` — Trefle → Claude → curated fallback chain
- `grow_here.py` — AI plant suggestions

**Benefits:** Locality: changing rain-fetch logic touches one file. The weather module becomes testable with a mock HTTP client. Alerts stops importing private functions from another router.

---

## 3. Unify `Plant` and `MapPlant` types with a discriminated placement

**Files:** `frontend/src/types/index.ts` (lines 28-53, 214-233), `backend/models.py` (PlantOut, MapPlantOut)

**Problem:** "What is a plant" has 4 definitions across the stack — `Plant`, `MapPlant`, `PlantOut`, `MapPlantOut` — each with slightly different field subsets. `container_id` and `ground_zone_id` leak DB foreign keys into the frontend.

**Solution:** A base `Plant` type with a discriminated `placement` union from CONTEXT.md: `Unplaced | OnMap | InContainer`. The DB encoding stays behind the API seam. Frontend types speak the domain language.

**Benefits:** One source of truth for "plant." Components branch on `plant.placement` (domain concept) instead of `plant.ground_zone_id !== null` (DB detail).

---

## 4. Add derived state and coordinated actions to `useGroeiStore`

**Files:** `frontend/src/store/useGroeiStore.ts` (179 lines), every page component

**Problem:** The store is a cache with passthrough actions — every `api.fetchX()` has a matching `loadX()` that does `set({ x })`. Zero computation. Pages like `MapPage` bypass the store entirely with local `useState` + direct API calls. `PlantDetail` mixes store actions and direct API calls with fragile sync logic.

**Solution:** The store should own derived state (e.g. `plantsNeedingAttention`) and coordinated actions (e.g. `waterPlant` calls API, surgically updates dashboard, adjusts care_status, refreshes care log — one action, not 3 calls fanned out across the page).

**Benefits:** Pages become thin — read derived state, call coordinated actions. The store becomes testable as a unit (dispatch action, assert computed state). Currently no test file for the store exists.

---

## 5. Introduce a query module between routers and raw SQL

**Files:** All 15 `backend/routers/*.py`, `backend/database/__init__.py`

**Problem:** Every router writes raw SQL strings inline. The same `SELECT ... FROM plants LEFT JOIN locations LEFT JOIN plant_species` pattern repeats in 5+ routers. Changing a column means grepping all routers. The `database/` package split organized connection management but didn't introduce a seam for data access.

**Solution:** A `queries/` package that owns the SQL. Routers call `queries.get_plant_with_context(plant_id)` instead of writing 15-line JOINs. Query modules testable with in-memory SQLite.

**Benefits:** Locality: the plants JOIN lives in one place. Tests verify query correctness independently of HTTP. Small interface, large implementation behind it (depth).

---

## 6. Collapse shallow routers and thin pages

**Files:** `backend/routers/users.py` (13 lines), `ground_zones.py` (19 lines), `species.py` (24 lines), `locations.py` (26 lines), `admin.py` (45 lines), `care.py` (111 lines)

**Problem:** 6 routers are 111 lines or fewer. `users.py` is one GET endpoint. The abstraction overhead (file, imports, `APIRouter()`, decorators, error handling) exceeds the implementation.

**Solution:** Group related shallow routers into `reference.py` (users + locations + species). Keep modules only when they earn their interface cost.

**Benefits:** Fewer files to navigate. "Where is X" has fewer candidates.

---

## 7. Rename code to match CONTEXT.md domain language

**Files:** `frontend/src/types/index.ts`, `backend/routers/ground_zones.py`, `backend/models.py`

**Problem:** Code uses `Object`, `ObjectType`, `GroundZone`, `ground_zone_id` — all terms CONTEXT.md explicitly resolved away from. "Object" should be Container or Hardscape. "Ground zone" should be Zone. Drift means new devs learn the domain language then find different names in code.

**Solution:** Rename: `GroundZone` → `Zone`, `MapObject` → `Container | Hardscape`, `ground_zones.py` → `zones.py`, `objects.py` → `containers.py`. Update API paths or add redirects.

**Benefits:** Domain language becomes navigable — grep for "Zone" finds everything. Removes cognitive translation layer.

---

## Suggested order of attack

1. **#2** Split plant_care.py — highest bang, purely backend, no API break
2. **#1** LocationContext seam — unlocks multi-map weather + shadow
3. **#5** Query module — makes routers testable
4. **#4** Store depth — makes pages thin and testable
5. **#3** Unify Plant types — reduces type drift
6. **#6** Collapse shallow routers — cleanup
7. **#7** Rename to domain language — cleanup
