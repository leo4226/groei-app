# Grouped Outdoor Calendar Care Implementation Plan

> **For Hermes:** Implement this plan task-by-task on `feat/549-garden-care-grouping`; keep the Calendar display preference local and make any schedule mutation explicit, auditable, and undoable.

**Goal:** Let the Calendar collapse outdoor Water, Fertilize, and Prune tasks into work sessions, optionally complete-and-align an outdoor care type safely, and show grouped live heat/frost warnings from the same warning source as Map.

**Architecture:** `group_outdoor` stays a device-local Calendar query preference. When true, the Calendar router converts qualifying outdoor schedule occurrences into synthetic group events while preserving individual indoor events. A new server-side bulk operation records member schedule snapshots and per-plant care logs before changing schedules, allowing one server-side undo. Calendar weather events are derived through `compute_plant_warnings()` and represented as non-actionable grouped events.

**Tech Stack:** FastAPI + asyncpg/DbAdapter + Alembic; React 19 + TypeScript + Vite; pytest + Vitest.

---

### Task 1: Define the API types and storage for reversible bulk care

**Objective:** Add one migration and typed request/response models for a server-owned bulk operation.

**Files:**
- Create: `backend/alembic/versions/<next>_add_garden_care_operations.py`
- Modify: `backend/models.py`
- Test: `backend/tests/test_garden_care_operations.py`

**Step 1: Write failing model/schema tests**

Test a Water operation with two outdoor member schedules and one indoor schedule. Assert only the two outdoor schedules are members, and that a snapshot stores old `next_due`, `last_done`, and `last_done_by` per schedule.

**Step 2: Add migration**

Create:

```sql
CREATE TABLE garden_care_operations (
  id SERIAL PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  care_type TEXT NOT NULL,
  completed_at DATE NOT NULL,
  completed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  undone_at TIMESTAMP
);
CREATE TABLE garden_care_operation_members (
  operation_id INTEGER NOT NULL REFERENCES garden_care_operations(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL REFERENCES care_schedules(id) ON DELETE CASCADE,
  previous_next_due DATE NOT NULL,
  previous_last_done TIMESTAMP,
  previous_last_done_by INTEGER REFERENCES users(id),
  care_log_id INTEGER REFERENCES care_log(id),
  PRIMARY KEY (operation_id, schedule_id)
);
```

**Step 3: Add Pydantic models**

`GardenCareCompleteIn(care_type, completed_at, user_id)` limits `care_type` to `water|fertilize|prune`. `GardenCareOperationOut` returns operation ID, type, completion date, and affected count.

**Step 4: Run focused test**

```bash
cd backend && PYTHONPATH= PYTHONNOUSERSITE=1 .venv/Scripts/python -m pytest -q tests/test_garden_care_operations.py
```

---

### Task 2: Implement outdoor-only complete-and-align and undo service

**Objective:** Replace client-side parallel completion with one transaction that only affects eligible outdoor schedules and can be undone as a group.

**Files:**
- Create: `backend/services/garden_care.py`
- Modify: `backend/routers/care.py`
- Test: `backend/tests/test_garden_care_operations.py`

**Step 1: Write failing endpoint tests**

Cover:
1. `POST /care/garden/complete` affects Water schedules on plants whose `map_type != 'indoor'` only.
2. It creates a `care_log` for every affected plant and snapshots state in operation members.
3. It calculates each member’s next due from the selected `completed_at`, using its own interval and seasonal adjustment.
4. It rejects unknown type, no eligible schedules, and cross-household data.
5. `POST /care/garden/{operation_id}/undo` restores every member state, deletes generated care logs, and marks the operation undone.

**Step 2: Implement `complete_outdoor_care()`**

Query active `care_schedules` joined to active `plants` and `maps`, constrained to household and `m.map_type != 'indoor'`. For each schedule:
- capture its state;
- insert `care_log` with the selected action date as `done_at`;
- calculate that schedule’s own next due from the selected date;
- update schedule;
- store snapshot/member reference.

Use one DB transaction/commit boundary. Do not change care intervals or profiles.

**Step 3: Implement `undo_outdoor_care()`**

Scope operation to household, reject already-undone operations, restore each member schedule from its snapshot, remove the generated care logs, set `undone_at`, and commit atomically.

**Step 4: Run focused tests**

```bash
cd backend && PYTHONPATH= PYTHONNOUSERSITE=1 .venv/Scripts/python -m pytest -q tests/test_garden_care_operations.py tests/test_care_undo.py tests/test_garden_log.py
```

---

### Task 3: Return grouped schedule and weather events from the Calendar router

**Objective:** Make Calendar grouping presentation-only until a user explicitly calls the bulk endpoint, and add Map-equivalent weather event visibility.

**Files:**
- Modify: `backend/routers/calendar.py`
- Modify: `backend/models.py`
- Test: `backend/tests/test_calendar_events.py`
- Test: `backend/tests/test_care_surface_consistency.py`

**Step 1: Extend event contract**

Add optional fields to `CalendarEventOut`:

```python
grouped: bool = False
group_count: int | None = None
group_member_schedule_ids: list[int] | None = None
weather_triggered: bool = False
```

Synthetic group events use `plant_id=None`, stable IDs like `garden:water:2026-07-10`, and only occur when `group_outdoor=true`.

**Step 2: Write failing grouping tests**

Seed outdoor and indoor schedules due on the same date. With `group_outdoor=false`, assert all individual events remain. With `group_outdoor=true`, assert one grouped outdoor Water event with count/member IDs plus unchanged indoor Water event. Repeat for Fertilize and Prune; verify other types remain individual.

**Step 3: Inject live weather warning events**

Fetch shared weather through the existing warnings service helper, run `compute_plant_warnings()` for outdoor plants, and collapse matching `heat_protect`/`frost_protect` warnings by care type + actionable date. These events are `weather_triggered=true`, non-actionable, and have no member schedules. Deduplicate against repeated per-plant warnings.

**Step 4: Run focused tests**

```bash
cd backend && PYTHONPATH= PYTHONNOUSERSITE=1 .venv/Scripts/python -m pytest -q tests/test_calendar_events.py tests/test_care_surface_consistency.py tests/test_warnings.py
```

---

### Task 4: Wire the Display setting into Calendar data and UI

**Objective:** Make the existing setting visibly control Calendar grouping without converting it into a hidden data mutation.

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/calendar/useCalendarEvents.ts`
- Modify: `frontend/src/pages/calendar/PlanningCalendarPage.tsx`
- Modify: `frontend/src/pages/calendar/MonthView.tsx`
- Modify: `frontend/src/pages/calendar/calendarTypes.ts`
- Test: `frontend/src/pages/calendar/*.test.tsx` or pure model tests if configured

**Step 1: Share the local preference safely**

Export a small `calendarPreferences.ts` helper with `getGroupOutdoorCalendarEvents()` and a custom browser event dispatched when Settings changes. Calendar listens and refetches. Keep default `true` to match current Display toggle default.

**Step 2: Extend the Calendar request**

`calendar.events(from, to, env, groupOutdoor)` adds the boolean query parameter. `useCalendarEvents()` receives it as a dependency.

**Step 3: Render group events honestly**

Calendar grid/event labels show `Water the garden · N plants` (localized). Do not show a plant thumbnail for grouped events. Agenda count uses grouped sessions instead of raw plants.

**Step 4: Add explicit Complete & align / Undo UI**

For grouped Water/Fertilize/Prune schedule events due today or overdue:
- replace the existing batch `Promise.all` action with one `gardenCare.complete` call;
- label the action explicitly as `Complete & align`, not merely `Done`;
- show affected plant count;
- offer `Undo group` after success through the operation ID.

Weather events show their reason/action, but no completion button.

**Step 5: Run frontend tests/build**

```bash
cd frontend && npm test
cd frontend && npx tsc -b --force
cd frontend && npm run build
```

---

### Task 5: Full regression and final review

**Objective:** Verify Map/Calendar source parity, scope boundaries, and visual clarity before PR.

**Files:**
- Modify only if tests expose regressions.

**Step 1: Run backend suite**

```bash
cd backend && PYTHONPATH= PYTHONNOUSERSITE=1 .venv/Scripts/python -m pytest -q
```

**Step 2: Run frontend suite/build**

```bash
cd frontend && npm test
cd frontend && npx tsc -b --force && npm run build
```

**Step 3: Manual verification**

1. Toggle grouping off: Calendar shows per-plant events.
2. Toggle grouping on: outdoor Water/Fertilize/Prune collapse; indoor remains individual.
3. Complete & align Water: only outdoor Water schedules change; Calendar refreshes to the correct next sessions.
4. Undo: all prior schedule states and care logs restore.
5. Confirm active heat/frost appears in both Map warning summary and Calendar.

**Step 4: Commit and PR**

```bash
git add <changed-files>
git commit -m "feat(calendar): group outdoor care sessions (#549)" -m "Closes #549"
git push -u origin HEAD
gh pr create --fill --base master
```
