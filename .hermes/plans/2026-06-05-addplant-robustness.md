# AddPlant Robustness — Photo-ID Prefill + Test Coverage — Implementation Plan

> **Tracking issue:** [#29](https://github.com/leo4226/groei-app/issues/29) — `leo4226/groei-app`. This file is the source of truth; the issue carries the task checklist and is how the work is claimed/merged.
>
> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Work the whole epic as one unit (its phases share files and are sequenced) — claim #29 with `in-progress`, one branch, one PR.

**Goal:** Make the **Add Plant** flow robust regardless of entry path. Today a plant added via **photo ID** is missing fields a database-picked plant gets for free, because `AddPlant.tsx` discards data that `/identify/commit` already returns. Fix the prefill, harden the backend `create_plant` path, and add the first test coverage for both ends (none exists today).

**Background — the gap.** `AddPlant` reaches the form via three `location.state.from` paths: `identify`, `pick` (database), `manual`. When the prefill is an `IdentifyCommitResult` (photo ID), the component only consumes `name_nl_suggested`, `scientific_name`, `icon_key`, and `photo_path`. It **ignores `care_thresholds` and `species_id`** — both already on the wire (`frontend/src/types/index.ts:513`, returned by `IdentifyCommitResponse` at `backend/routers/plant_id.py:478`). Consequences vs the database path:

| Field | Database pick (`LocalPlant`) | Photo ID (`IdentifyCommitResult`) today |
|---|---|---|
| Care schedules | seeded from `waterNeeds` via `buildInitialSchedules` | generic indoor defaults (water-needs branch skipped for identify) |
| `sun_requirement` | `SUN_DB_TO_TILE[...]` | `null` |
| `plant_type` | `DUTCH_TYPE_TO_SYSTEM[...]` | `derivedPlantType` (icon-derived, often `undefined`) |
| `notes` | `amsterdamNotes` | empty |

**Scope (confirmed with user):** Frontend prefill enrichment **+** backend `create_plant` hardening. Two enrichment sources, each from where the data actually lives:
- **Care schedules** ← `care_thresholds` already returned by `/identify/commit` (`water_interval_days`, `fertilise_months`). No new endpoint.
- **Sun** ← the **species ecology** profile, fetched lazily by the form via `GET /species/{species_id}/ecology` (`species_id` is already in the commit result). This is the correct home for sun and the only path that actually populates it (see below).

Frontend tests = **extract pure helpers and unit-test them** (matches the existing node-env vitest convention; no jsdom/testing-library added).

**Why sun comes from ecology, not `care_thresholds`.** `care_thresholds` is defined (CONTEXT.md) as environmental stress limits used to compute Alerts; sun is a categorical placement preference, not a threshold. Sun's real home already exists: the `plant_species.sun_preference` column (`migrations/0006`, `alembic/0011`) and the `EcologyOut` profile (`backend/routers/species.py:11`). Critically, `sun_preference` is **NOT** written by `get_or_create_species` / `_generate_species` (`species_service.py:104` inserts only names + `phenology_json` + climate zone) — it is populated **lazily** by `ensure_ecology(db, species_id)` (GBIF + LLM) on first hit to `/species/{id}/ecology`, then cached. So a freshly photo-identified species has `sun_preference = NULL` until that endpoint runs; the form's lazy fetch is what triggers and then consumes it.

**Honest limitation:** `care_thresholds` temperature limits (`min_temp_c`, `bring_inside_below_c`, etc.) already reach the plant server-side and drive Alerts, not form schedules — so this plan does not surface them in the form. The sun fetch is non-blocking, so an instant submit can still save before `sun_requirement` resolves (acceptable: it's optional and editable on the plant afterwards).

**Tech Stack:** React 19 + TypeScript, Zustand (`useFloreren`), Vite, vitest (node env); FastAPI + asyncpg/SQLite, pytest (`asyncio_mode=auto`).

**Key files:**
- `frontend/src/pages/AddPlant.tsx` — form, prefill logic, `handleSubmit` (`:122`, helpers at `:45`/`:105`, submit at `:370`)
- `frontend/src/types/index.ts` — `IdentifyCommitResult` (`:513`), `PlantCreateInput`/`CareScheduleInput` (in `api/client.ts:115`)
- `backend/routers/plants.py` — `create_plant` (`:136`), `_seed_care_schedules` (`:21`)
- `backend/threshold_service.py` — `generate_thresholds` + threshold key contract (`_REQUIRED_KEYS`, `:7`)
- `backend/tests/test_plant_id_endpoint.py` — working API-test template to copy from

**`care_thresholds` contract** (from `_REQUIRED_KEYS`): `drought_mm_per_week`, `waterlog_mm_per_week`, `min_temp_c`, `max_temp_c`, `bring_inside_below_c`, `fertilise_months[]`, `fertilise_tip`, `water_interval_days`.

---

## Phase 1: Extract pure, testable helpers (refactor — no behavior change)

The robustness logic is currently tangled inside the `AddPlant` component, so it can't be unit-tested in the node env. Extract it first, preserving today's behavior exactly.

### Task 1: Create `frontend/src/pages/addPlant/prefill.ts`

**Files:** Create `frontend/src/pages/addPlant/prefill.ts`

Move/define these **pure** functions (no React, no I/O):

- `buildInitialSchedules(prefill)` — move verbatim from `AddPlant.tsx:105`.
- `findMatchingIcon(plant, catalog)` — move verbatim from `AddPlant.tsx:45`.
- `normalizePrefill(prefill)` → returns a discriminated result `{ kind: 'identify' | 'database' | 'manual' | 'none'; name; species; notes; sunRequirement; formType; iconKeyHint }`. This consolidates the duck-typing currently spread across the `useState` initializers and the sync `useEffect` (`AddPlant.tsx:264`). Reuse `isIdentifyPrefill` and the existing `SUN_DB_TO_TILE` / `TYPE_TO_FORM` maps (move those constants here too).
- `buildCreatePayload(formState): PlantCreateInput` — extract the object currently built inline in `handleSubmit` (`AddPlant.tsx:384`), including the `isFromDatabase ? DUTCH_TYPE_TO_SYSTEM[...] : derivedPlantType` branch and the `SUN_TILE_TO_DB` mapping. Takes a plain `formState` arg; no store access.

Keep the existing constant maps (`DUTCH_TYPE_TO_SYSTEM`, `WATER_NEEDS_TO_DAYS`, `SUN_DB_TO_TILE`, `SUN_TILE_TO_DB`, `TYPE_TO_FORM`) co-located here and re-export from `AddPlant.tsx` if other files import them.

**Verify:** `npx tsc --noEmit` in `frontend/` passes. No runtime wiring yet.

### Task 2: Wire `AddPlant.tsx` to the extracted helpers

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

Replace the inline implementations with imports from `prefill.ts`. `handleSubmit` builds its payload via `buildCreatePayload(...)`. **Behavior must be identical** for all three paths in this task — this is a pure refactor that sets up Phase 2.

**Verify:** `npm run dev`; manually add a plant via **database pick** and via **manual** — same fields persist as before (check the network `POST /plants` body). `npx tsc --noEmit` passes.

---

## Phase 2: Photo-ID prefill enrichment (frontend behavior change)

### Task 3: Map `care_thresholds` → care schedules for the identify path

**Files:** Modify `frontend/src/pages/addPlant/prefill.ts`, `frontend/src/pages/AddPlant.tsx`

Add a pure helper `thresholdsToScheduleOverrides(thresholds): Partial<Record<CareType, { enabled: boolean; days: number }>>`:
- `water_interval_days > 0` → `water: { enabled: true, days: water_interval_days }`.
- `fertilise_months` non-empty → `fertilize: { enabled: true, days: max(30, round(365 / fertilise_months.length)) }` (mirror the backend interval math in `_seed_care_schedules:56` so the in-form preview matches what the server seeds).
- Return nothing for keys the thresholds don't speak to (leave `buildInitialSchedules` defaults).

In `AddPlant.tsx`, when `isIdentifyPrefill(prefill)`, merge these overrides onto `buildInitialSchedules(prefill)` in both the initial `useState` and the sync `useEffect` (`:264`). Use `prefill.care_thresholds` (already typed `Record<string, unknown>` — narrow it with a small type guard in `prefill.ts`).

**Verify:** Add a unit test fixture (Phase 4) and manually: run a photo ID whose species has known `water_interval_days`; the Care card's water frequency shows that interval, not the indoor default.

### Task 4: `plant_type` fallback on the identify path

**Files:** Modify `frontend/src/pages/addPlant/prefill.ts`

In `buildCreatePayload`, when the path is `identify` and `derivedPlantType` is `undefined`, fall back to a sensible default (the icon `cat` if resolvable, else omit).

**Verify:** Unit test asserts payload for an identify prefill includes the mapped water schedule and a defined-or-omitted `plant_type`.

### Task 5: Sun via lazy ecology fetch on the identify path

**Files:** Modify `frontend/src/pages/AddPlant.tsx`, `frontend/src/pages/addPlant/prefill.ts`

The API client already exposes `species.ecology(id)` (`api/client.ts:198`, returns `EcologyOut` which includes `sun_preference`). In `AddPlant`, add a `useEffect` that — when the prefill is an identify result with a `species_id` and `sunRequirement` is still unset — calls `species.ecology(species_id)`, and on success maps `sun_preference` through the existing `SUN_DB_TO_TILE` map and calls `setSunRequirement`. Mirror the existing fire-and-forget pattern used for `icons.catalog()` (`AddPlant.tsx:259`): non-blocking, `.catch(() => {})`, and **don't overwrite** a value the user has already changed.

Add a pure helper `sunPreferenceToTile(sun_preference): string | null` in `prefill.ts` so the mapping is unit-testable. **Verify the vocabulary lines up**: `sun_preference` values are `'full_sun' | 'partial_sun' | 'shade'` (`models.py:52`) while `SUN_DB_TO_TILE` was built for the `LocalPlant` vocabulary — extend the map (or add a small normalizer) so all `sun_preference` values resolve to a tile, and return `null` for unknown/missing values.

**Verify:** `npm run dev`, run a photo ID; after the form mounts the Light/sun control reflects the species' `sun_preference` (allow a moment for the fetch). Confirm `GET /species/{id}/ecology` fires once. Changing the sun tile manually, then letting the fetch resolve, must **not** clobber the manual choice.

---

## Phase 3: Backend `create_plant` hardening

### Task 6: Fix placeholder inconsistency in `_seed_care_schedules`

**Files:** Modify `backend/routers/plants.py`

The water insert (`:38`) hardcodes PG-style `$1, $2` placeholders while the fertilize insert (`:58`) uses `?`. `qm_to_pg` only translates `?`, so the `$1/$2` form is wrong under dev SQLite. Change the water insert to use `?` placeholders for consistency with the rest of the module.

**Verify:** Task 11 test exercises this insert against the dev DB and passes (it would error today on SQLite).

### Task 7: Guarantee at least one schedule when thresholds are unavailable

**Files:** Modify `backend/routers/plants.py`

Today if the form sends an empty `care_schedules` **and** `generate_thresholds` raises (Claude down) **and** no cached species thresholds exist, the plant ends up with **zero** schedules. In the `except Exception` branch around `generate_thresholds` (`:209`), if the plant has no `water` schedule, insert a default water schedule (use the existing default interval from the seed/threshold convention, e.g. 7 days) so every plant is at least waterable.

**Verify:** Task 10 test: create a plant with empty `care_schedules` and thresholds generation patched to raise → assert exactly one `water` schedule exists.

### Task 8: Confirm care-type vocabulary parity (dedup correctness)

**Files:** `backend/routers/plants.py` (verify only; change only if mismatched)

`_seed_care_schedules` is idempotent by checking for an existing schedule of `care_type` `'water'` / `'fertilize'`. The form's `CARE_TYPE_INFO` keys use `water` and `fertilize` (confirmed in `CareProfileSection.tsx:58`), so a form-sent `fertilize` correctly suppresses the seed. Add a one-line comment in `create_plant` noting this contract so a future rename of either side can't silently double-seed.

**Verify:** Task 10 test: create a plant whose form `care_schedules` already include `water` and `fertilize` + cached thresholds present → assert no duplicate `water`/`fertilize` rows.

---

## Phase 4: Test coverage

### Task 9: Frontend unit tests for the extracted helpers

**Files:** Create `frontend/src/pages/addPlant/__tests__/prefill.test.ts`

Vitest (node env, no DOM). Cover:
- `normalizePrefill` for all four kinds (identify / database / manual / none) — correct name, species, notes, sun, formType.
- `buildInitialSchedules` — database `waterNeeds` mapping vs identify (defaults), `repot_check` disabled.
- `thresholdsToScheduleOverrides` — water interval mapping, fertilise-months → interval math, empty/missing thresholds yield no overrides.
- `sunPreferenceToTile` — each `sun_preference` value (`full_sun`/`partial_sun`/`shade`) resolves to a tile; unknown/missing → `null` (Task 5).
- `findMatchingIcon` — iconKey > exact Latin > exact Dutch > genus precedence.
- `buildCreatePayload` — database path uses `DUTCH_TYPE_TO_SYSTEM` + `SUN_TILE_TO_DB`; identify path includes the mapped water schedule and a defined-or-omitted `plant_type`.

**Verify:** `npm run test` (i.e. `vitest run`) passes; new file included.

### Task 10: Backend tests for `create_plant`

**Files:** Create `backend/tests/test_plants_create.py`

Copy the fixture/auth/test-DB setup from `backend/tests/test_plant_id_endpoint.py`. Patch `species_service.get_or_create_species` and `threshold_service.generate_thresholds` so tests don't hit Claude/network. Cover:
- Happy path: `POST /plants` with explicit `care_schedules` → 200, plant row created scoped to the account's `household_id`, schedules inserted with `next_due = today`.
- Empty `care_schedules` + cached species thresholds present → schedules seeded from thresholds (water + fertilize).
- Empty `care_schedules` + `generate_thresholds` raises → exactly one default `water` schedule (Task 7).
- No duplicate `water`/`fertilize` when form sends them and thresholds also present (Task 8 dedup).
- Species linking: `species_id` set on the plant after `get_or_create_species`.

**Verify:** `cd backend && pytest tests/test_plants_create.py` passes.

### Task 11: Backend test for `_seed_care_schedules`

**Files:** Create `backend/tests/test_seed_care_schedules.py`

Unit-test the helper directly against a dev-DB adapter:
- Water insert runs without placeholder error (regression for Task 6).
- Idempotency: calling twice creates no duplicates.
- `fertilise_months` → `next_due` lands on the next upcoming month; interval = `max(30, 365 // len(months))`.
- Malformed/empty thresholds JSON → no-op, no raise.

**Verify:** `cd backend && pytest tests/test_seed_care_schedules.py` passes.

---

## Phase 5: Integration & verification

### Task 12: Full typecheck + suites + manual smoke

**Files:** none (verification)

- `cd frontend && npx tsc --noEmit && npm run test`
- `cd backend && pytest`
- Manual: `npm run dev`, walk all three add paths. For photo ID, confirm the water schedule reflects the species `water_interval_days`, the sun control fills in from `/species/{id}/ecology`, and the plant saves without error.

**Verify:** All green; photo-ID plant now carries species-appropriate water/fertilize schedules and a sun requirement.

---

## Risks & Tradeoffs

1. **Sun fetch latency + race.** Sun arrives via a non-blocking `GET /species/{id}/ecology` after the form mounts, and that call runs lazy enrichment (GBIF + LLM) on first access for a species — it can take a few seconds. The form is usable meanwhile; an instant submit may save before sun resolves. Accepted: `sun_requirement` is optional and editable on the plant. The effect must not overwrite a sun value the user already picked (Task 5).
2. **Refactor risk (Phase 1).** Extracting `handleSubmit`'s payload builder and the prefill duck-typing touches the most intricate part of the component. Phase 1 is explicitly behavior-preserving and gated by the database/manual smoke test before Phase 2 changes behavior.
3. **Sun vocabulary mismatch.** `sun_preference` (`full_sun`/`partial_sun`/`shade`) may not line up 1:1 with the `LocalPlant`-oriented `SUN_DB_TO_TILE` keys. Task 5 extends/normalizes the map and Task 9 unit-tests every value; unknown values fall back to `null` (no sun set) rather than a wrong tile.
4. **Interval math duplication.** The fertilize-interval formula now lives in both `_seed_care_schedules` and `thresholdsToScheduleOverrides`. Acceptable (frontend is a preview; backend is source of truth) but keep them in sync; the comment in Task 3 calls this out.
5. **No component-level tests.** Per the chosen approach, the React rendering of the three flows isn't covered — only the extracted logic. The Phase 5 manual smoke is the safety net for wiring (including the sun-fetch effect). Revisit jsdom + testing-library if regressions recur in JSX wiring.
6. **Enrichment availability.** Quality depends on the species having cached `care_thresholds` / ecology. First-time species fall back to generic defaults until Claude/GBIF generate the data — same as today, not a regression.

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `frontend/src/pages/addPlant/prefill.ts` | Create | Pure prefill/payload/threshold + sun-mapping helpers |
| `frontend/src/pages/AddPlant.tsx` | Modify | Use helpers; enrich identify prefill from `care_thresholds`; lazy `/ecology` fetch for sun |
| `frontend/src/pages/addPlant/__tests__/prefill.test.ts` | Create | Unit tests for the helpers |
| `backend/routers/plants.py` | Modify | Placeholder fix; default-water fallback; dedup comment |
| `backend/tests/test_plants_create.py` | Create | `create_plant` endpoint tests |
| `backend/tests/test_seed_care_schedules.py` | Create | `_seed_care_schedules` unit tests |
