# Architecture Deepening Opportunities

> **Date:** 2026-05-06
> **Source:** `/improve-codebase-architecture` skill review
> **Status:** Candidates presented; awaiting selection for grilling

## Overview

Six deepening opportunities identified across backend and frontend. Ranked roughly by impact: locality/concentration of duplicated logic, then testability enablement, then interface depth.

---

## Candidate 1: Extract "Care Calendar" Module

**Files:** `backend/routers/maps.py` (lines 63–105, 109–136, 139–178), `backend/routers/dashboard.py` (lines 39–63)

**Problem:** Care status computation (overdue/due_today/good from schedule next_due vs today) is duplicated in three places within `maps.py` alone, plus another in `dashboard.py`. `_compute_care_status` was extracted but the first instance was never refactored to use it. A bug in overdue calculation needs fixes in multiple places.

**Solution:** Single module with interface `(schedules, today) -> (care_status, most_urgent)`. Maps router, dashboard, and plants list all call the same function.

**Benefits:** Fix once, fixed everywhere (locality). Tiny interface for large behavioural leverage. Tests cover boundary cases once.

---

## Candidate 2: Deepen or Replace the Zustand Store

**Files:** `frontend/src/store/useGroeiStore.ts` (139 lines), `frontend/src/api/client.ts`

**Problem:** The store's 9 actions map 1:1 to API client functions with no added behaviour. Deletion test: delete the store and have callers call `api.*` directly — no complexity vanishes. Interface (18 surface points) nearly as complex as implementation (shallow module).

**Solution:** Either (a) replace with lightweight `useQuery`-style cache hooks, or (b) deepen into a "Plant Registry" module where "mark care done" auto-adjusts local care_status without full re-fetch.

**Benefits:** Higher leverage — callers express intent not API choreography. Better locality — "refresh after mutate" pattern concentrated.

---

## Candidate 3: Typed API Client — 40 Functions -> 1

**Files:** `frontend/src/api/client.ts` (382 lines)

**Problem:** 40 nearly identical functions repeating: construct URL, `fetch`, `ensureOk`, return JSON. Only variation is method, path, body encoding. Zero leverage per entry point.

**Solution:** A single generic `api<ResponseType>(method, path, body?)` with type-level route definitions. Interface shrinks from 40 functions to 1.

**Benefits:** Massive depth increase. Error handling tested once. Type definitions remain the source of truth at the seam.

---

## Candidate 4: Database Seam for Backend Testability

**Files:** All 14 routers in `backend/routers/`, `backend/database.py`

**Problem:** Every router hardcodes `async with get_db() as db:`. No seam to inject a test database. Result: zero backend tests. One adapter = hypothetical seam, not real.

**Solution:** FastAPI `Depends(get_db)` for injection. Tests override with in-memory SQLite. Creates a real seam — two adapters (production file-based, test in-memory).

**Benefits:** Enables backend testing across all 14 routers (leverage). Minimal seam surface — one `Depends` per router.

---

## Candidate 5: Extract "Plant Reader" Enrichment Module

**Files:** `backend/routers/maps.py:_plant_with_care()`, `backend/routers/plants.py:list_plants()` + `get_plant()`

**Problem:** Both routers enrich raw plant rows with schedules, phenology JSON parsing, and temperature data. `list_plants` has an N+1 query pattern. Phenology `json.loads` dance repeated identically in both files. No locality — changing enrichment shape touches two routers.

**Solution:** `enrich_plant(db, plant_row) -> EnrichedPlant` module. Internally batches schedule queries (fixing N+1).

**Benefits:** Locality for enrichment. Leverage — callers get enriched plants without knowing table joins. Tests verify enrichment once.

---

## Candidate 6: Split `database.py` — Schema / Migrations / Seeds

**Files:** `backend/database.py` (324 lines)

**Problem:** Schema definitions, idempotent migrations, and seed data interleaved in single `init_db()`. Schema changes require reading past migration blocks. Three concerns, one file — poor locality.

**Solution:** `schema.py` (CREATE TABLE), `migrations.py` (ALTER TABLE history), `seed.py` (test data). `init_db()` orchestrates.

**Benefits:** Better locality per concern. Clear current schema at a glance. Future: swappable seed data (test vs dev).

---

## Meta

**ADR conflicts:** None identified against ADR-0001.

**Not addressed:** Shadow caster generalization (CLAUDE.md explicitly defers this). CSS rotation removal (already in progress per CLAUDE.md).
