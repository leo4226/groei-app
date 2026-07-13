# Plant Care Schedule Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users enable, disable, and change every recurring care schedule on an existing plant, with immediate and predictable due-date recalculation.

**Architecture:** A dedicated household-scoped backend endpoint atomically reconciles the submitted recurring schedules while leaving weather and photo schedules alone. A pure frontend model owns environment filtering and payload construction; `EditPlant` renders that model and sends the complete enabled set.

**Tech Stack:** FastAPI, Pydantic, asyncpg-compatible DB adapter, pytest, React 19, TypeScript, Vitest, Tailwind CSS.

## Global Constraints

- Work only in `C:\Users\leon_\Projects\floreren-606` on `fix/606-care-schedule-editor`.
- Do not modify calendar files or calendar behavior related to #603/#605.
- Use test-first red/green cycles for backend and frontend behavior.
- Do not modify weather-driven frost/heat scheduling or the photo-reminder workflow.
- Before the PR, run `cd backend && python -m pytest -q` and `cd frontend && npm run build`.

---

### Task 1: Atomic schedule reconciliation API

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/routers/plants.py`
- Create: `backend/tests/test_care_schedule_sync.py`

**Interfaces:**
- Consumes: `CARE_TYPES`, `normalize_care_type`, `is_care_type_valid_for_env`, `environment_for_plant`, and `calculate_next_due`.
- Produces: `CareScheduleSyncInput(schedules: list[CareScheduleCreate])` and `PUT /plants/{plant_id}/care-schedules -> PlantOut`.

- [ ] **Step 1: Write failing endpoint tests**

Create real API tests with a plant, maps, active/inactive recurring rows, a photo row, and an ephemeral weather row. Assert that one request can insert, update, reactivate, and disable schedules; changed/reactivated rows use `last_done + interval_days`; new rows use a monkeypatched current date plus the interval; omitted photo/weather rows remain active.

Add separate tests asserting 404 for another household and 422 with no writes for duplicate types, interval `0`, unknown types, weather types, and environment-invalid types.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `backend\.venv\Scripts\python -m pytest backend/tests/test_care_schedule_sync.py -q`

Expected: collection or endpoint failures because `CareScheduleSyncInput` and the PUT route do not exist.

- [ ] **Step 3: Add the request model**

Add this Pydantic boundary in `backend/models.py`:

```python
class CareScheduleSyncInput(BaseModel):
    schedules: list[CareScheduleCreate]
```

Keep canonicalization in the existing `CareScheduleCreate` validator and perform set-level duplicate/type/environment validation before any database writes.

- [ ] **Step 4: Implement reconciliation without intermediate commits**

In `backend/routers/plants.py`, query the owned plant with its map type and container placement, derive the environment with `environment_for_plant`, and validate every submitted type against `CARE_TYPES`. Reject `is_weather_triggered` entries and anything invalid for that environment.

Load all rows for the plant and reconcile only known non-weather, non-photo, non-ephemeral rows. For each submitted schedule:

```python
anchor = last_done.date() if isinstance(last_done, datetime) else last_done
next_due = calculate_next_due(anchor, interval_days, season_adjust)
```

Parse ISO strings from the SQLite seam before calling `calculate_next_due`. Update changed active rows, reactivate inactive rows, insert missing rows, and deactivate managed active rows omitted from the request. Commit once and return `get_plant(...)`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `backend\.venv\Scripts\python -m pytest backend/tests/test_care_schedule_sync.py -q`

Expected: all schedule-sync tests pass.

- [ ] **Step 6: Run adjacent backend tests**

Run: `backend\.venv\Scripts\python -m pytest backend/tests/test_care_schedule_update.py backend/tests/test_plants_create.py backend/tests/test_warnings.py -q`

Expected: all selected tests pass, demonstrating compatibility with existing creation, interval patching, and warning behavior.

### Task 2: Pure frontend schedule editor model

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/pages/editPlantCareSchedules.ts`
- Create: `frontend/src/pages/editPlantCareSchedules.test.ts`

**Interfaces:**
- Produces: `EditableCareType`, `CareEnvironment`, `ScheduleEditorState`, `careEnvironmentForPlant`, `buildScheduleEditorState`, `editableCareTypesForEnvironment`, and `buildCareScheduleSyncPayload`.
- Consumes: `Plant`, `MapInfo`, `CareScheduleInput`, and the existing canonical care-type translations.

- [ ] **Step 1: Write failing pure-model tests**

Cover these behaviors:

- active persisted intervals populate editor state;
- missing schedules are disabled and use environment defaults;
- indoor includes mist/rotate/dust while outdoor excludes them;
- outdoor ground excludes repot while outdoor container includes it;
- weather and photo never appear;
- payload output contains only enabled positive-interval schedules;
- `pest_check` and `dust` are accepted by the TypeScript care-type union.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd frontend && npm test -- src/pages/editPlantCareSchedules.test.ts`

Expected: module/type failures because the model and missing care types do not exist.

- [ ] **Step 3: Implement the pure model**

Extend `CareType` and `CARE_TYPE_INFO` with `pest_check` and `dust`. Define the editable list exactly as:

```ts
export const EDITABLE_CARE_TYPES = [
  'water', 'fertilize', 'prune', 'repot',
  'pest_check', 'mist', 'rotate', 'dust',
] as const
```

Use three environments (`indoor`, `outdoor_container`, `outdoor_ground`) and defaults matching `backend/care_types.py`; use seven days only when a valid optional type has no backend default. Keep all conversion logic pure so it can be tested without rendering React.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd frontend && npm test -- src/pages/editPlantCareSchedules.test.ts`

Expected: all editor-model tests pass.

### Task 3: Edit Plant schedule controls and save flow

**Files:**
- Create: `frontend/src/components/plant/CareScheduleEditor.tsx`
- Modify: `frontend/src/pages/EditPlant.tsx`
- Modify: `frontend/src/api/client.ts`

**Interfaces:**
- `CareScheduleEditor` consumes `state`, `careTypes`, translated labels, and `onChange`.
- `care.syncSchedules(plantId, schedules)` sends `{ schedules }` to the new PUT route and returns `Plant`.

- [ ] **Step 1: Add the API method and editor component**

Add:

```ts
syncSchedules: (plantId: number, schedules: CareScheduleInput[]) =>
  api<Plant>('PUT', `/plants/${plantId}/care-schedules`, { body: { schedules } })
```

Render one compact bordered row per environment-valid recurring type. Use an accessible checkbox/switch for enabled state and a numeric day input (`min={1}`, `max={3650}`, `inputMode="numeric"`) while enabled. Use `CareIcon` and `t.careTypes[type]`; do not introduce untranslated labels.

- [ ] **Step 2: Integrate the pure model into EditPlant**

Replace `buildSchedulesFromPlant`, `origWaterSchedule`, the water-only save patch, and the water-only `FrequencySlider` card. Initialize state from the loaded plant and selected map environment, preserve user edits during ordinary renders, and pass `buildCareScheduleSyncPayload(schedules, environment)` to `care.syncSchedules` after `updatePlant` succeeds.

When the selected map changes between indoor/outdoor, hide and omit invalid types without destroying their in-memory values. Keep the existing error handling so a failed schedule request prevents navigation.

- [ ] **Step 3: Run frontend unit tests**

Run: `cd frontend && npm test -- src/pages/editPlantCareSchedules.test.ts src/pages/editPlantPayload.test.ts src/types/careEnv.test.ts`

Expected: all selected tests pass.

- [ ] **Step 4: Run the production build**

Run: `cd frontend && npm run build`

Expected: TypeScript and Vite/rolldown complete with exit code 0.

### Task 4: Full verification and delivery

**Files:**
- Review all files changed on `fix/606-care-schedule-editor`.

**Interfaces:**
- Produces: a tested draft pull request closing #606.

- [ ] **Step 1: Run full backend verification**

Run: `cd backend && python -m pytest -q`

Expected: exit code 0 with no failures.

- [ ] **Step 2: Run fresh frontend verification**

Run: `cd frontend && npm run build`

Expected: exit code 0.

- [ ] **Step 3: Review scope and diff hygiene**

Run: `git status --short`, `git diff --check`, and `git diff origin/master --name-only`.

Expected: no calendar paths, no secrets, no whitespace errors, and only #606 design/plan, care backend, care tests, frontend care editor/model/types/API/EditPlant files.

- [ ] **Step 4: Commit implementation**

Stage only the reviewed #606 files and commit with:

```text
fix(care): make plant schedules editable (#606)

Closes #606
```

- [ ] **Step 5: Push and open a draft PR**

Push `fix/606-care-schedule-editor` and open a draft PR against `master` with `Closes #606`, the behavior summary, and exact verification output. Do not merge it.
