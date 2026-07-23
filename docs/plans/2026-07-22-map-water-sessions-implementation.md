# Map-level Water Sessions Implementation Plan

> **For Hermes:** Use test-driven development and complete each task in order. Review spec compliance and code quality before publishing.

**Goal:** Replace one-day Water date rewriting with recurring map-level Water sessions while preserving canonical plant intervals and selectable completion.

**Architecture:** Add a pure routine-session planner used by the Calendar API. Keep `care_schedules.next_due` canonical, project display dates server-side, and make grouped Water completion anchor early recurrence at the canonical due date. Reuse existing weekday preferences, grouping rules, dialog, operation snapshots, and opt-out field.

**Tech Stack:** FastAPI, Python, asyncpg/PostgreSQL, React 19, TypeScript, Vitest, pytest.

---

### Task 1: Add the pure Water-session planner

**Objective:** Derive routine session dates without changing canonical schedules.

**Files:**
- Create: `backend/services/care_sessions.py`
- Create: `backend/tests/test_care_sessions.py`

**Step 1: Write failing planner tests**

Cover:

- `maximum_routine_gap([7]) == 7`;
- `maximum_routine_gap([1, 4]) == 4`;
- Sunday projection for canonical Wednesday;
- seven-, ten-, and fourteen-day schedules are eligible for a Sunday routine;
- a three-day schedule is an exact extra-care exception;
- empty weekdays do not project;
- weekday normalization is deterministic.

Use a small immutable result shape:

```python
@dataclass(frozen=True)
class SessionProjection:
    session_date: date
    canonical_date: date
    is_routine: bool
    reason: Literal["routine", "no_routine", "too_frequent", "opted_out"]
```

**Step 2: Run the focused test and confirm RED**

Run:

```bash
cd backend && .venv/Scripts/python -m pytest -q tests/test_care_sessions.py
```

Expected: import failure because `services.care_sessions` does not exist.

**Step 3: Implement the minimum pure functions**

Implement:

```python
def maximum_routine_gap(weekdays: Iterable[int]) -> int | None: ...

def project_water_session(
    *, canonical_due: date, effective_interval: int,
    preferred_weekdays: Iterable[int], opted_out: bool,
) -> SessionProjection: ...
```

Use the latest selected weekday on or before `canonical_due`. Do not read the database or current clock in this module.

**Step 4: Run focused tests and confirm GREEN**

Expected: all planner tests pass.

---

### Task 2: Expose saved routine preferences without proposing or writing

**Objective:** Give Calendar a lightweight household-scoped saved configuration lookup.

**Files:**
- Modify: `backend/services/care_rhythm.py`
- Modify: `backend/tests/test_care_rhythm.py`

**Step 1: Add failing tests**

Add tests for a public helper that:

- returns `None` when no saved preference exists;
- returns normalized indoor/outdoor weekdays and validated map overrides when saved;
- never persists the dynamic proposal;
- ignores no household other than the requested one.

**Step 2: Implement the helper**

Extract/reuse the existing `_config_snapshot` decoding path without exposing operation ownership:

```python
async def get_saved_care_rhythm_config(db, household_id: int) -> dict | None:
    snapshot = await _config_snapshot(db, household_id)
    return snapshot["config"] if snapshot["saved"] else None
```

Avoid duplicate preference queries.

**Step 3: Run focused care-rhythm tests**

```bash
cd backend && .venv/Scripts/python -m pytest -q tests/test_care_rhythm.py
```

---

### Task 3: Project Water occurrences into map sessions in Calendar

**Objective:** Return one map-level Water session on routine dates while preserving exact exceptions.

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/routers/calendar.py`
- Modify: `backend/tests/test_calendar_grouping_preferences.py`
- Modify: `backend/tests/test_calendar_events.py`

**Step 1: Add failing endpoint regressions**

Build household-scoped fixtures for:

- one outdoor Sunday preference and one indoor Wednesday preference, without requiring separate Water grouping rules;
- separate Garden and House grouped Water sessions;
- seven-, ten-, and fourteen-day schedules sharing practical sessions;
- a three-day schedule remaining individual;
- `rhythm_opt_out = TRUE` remaining individual;
- canonical dates retained in group members;
- no duplicate schedule ID in one grouped session, with colliding occurrences retained as exact extra-care events rather than dropped;
- a session inside the requested range collecting a canonical due date up to six days beyond `to`;
- widened lookahead not leaking ordinary exact events past `to`;
- a past session with future canonical due being clamped to the agenda start and actionable but not overdue;
- Month/API responses never containing a projected date outside the requested range;
- the same canonical occurrence retaining a stable event ID across Month and agenda ranges;
- unsaved Care Rhythm retaining existing exact-date grouping when legacy Water grouping is enabled.

**Step 2: Extend event contracts**

Add optional fields to `CalendarEventOut` and group-member output:

```python
canonical_date: str | None = None
routine_session: bool = False
routine_reason: str | None = None
```

Preserve backward compatibility through defaults.

**Step 3: Fetch required authority fields**

Calendar schedule rows must include `rhythm_opt_out`. Load saved rhythm configuration before choosing the canonical occurrence horizon. A saved routine is the Water-grouping authority for maps with effective weekdays; consult legacy Water grouping only when no routine is saved. Widen only the Water planning horizon, with a hard maximum of six days.

**Step 4: Apply projection before grouping**

Replace the current synthetic `from_dt` occurrence with an explicit canonical occurrence pipeline. For eligible Water occurrences:

- compute the effective interval at that canonical occurrence date, never at the projected session date;
- project with `project_water_session`;
- set the displayed date to the session date;
- retain canonical date and set `overdue = canonical_date < today`;
- build the event ID from schedule ID, care type, and canonical occurrence date rather than list index;
- group by projected date, map, and Water;
- detect same-session schedule collisions and keep those occurrences exact rather than discarding either one;
- clamp missed routine sessions only for `pin_overdue` agenda requests, without changing their canonical dates, and otherwise enforce the original response range.

Other care types keep current behavior.

**Step 5: Run focused endpoint tests**

```bash
cd backend && .venv/Scripts/python -m pytest -q \
  tests/test_care_sessions.py \
  tests/test_calendar_grouping_preferences.py \
  tests/test_calendar_events.py
```

---

### Task 4: Preserve cadence during selectable grouped Water completion

**Objective:** Prevent early routine completion from compressing personalized intervals.

**Files:**
- Modify: `backend/services/garden_care.py`
- Modify: `backend/tests/test_garden_care_operations.py`
- Modify: `backend/tests/test_calendar_grouping_preferences.py`

**Step 1: Add failing regressions**

Cover:

- Water due Wednesday, completed in Sunday routine: next due anchors from Wednesday;
- overdue Water completed Sunday: next due anchors from Sunday;
- non-Water grouped care retains completion-date anchoring;
- exact opted-out Water retains completion-date anchoring;
- unselected schedule remains untouched;
- undo restores canonical dates and logs;
- another household/map cannot submit schedule IDs.

**Step 2: Add routine-participation lookup**

Inside the existing transaction, determine whether each Water schedule participates using saved Care Rhythm, map override, interval capacity, and `rhythm_opt_out`. Do not trust client flags. When no routine is saved, retain the current legacy grouping-rule behavior and completion anchoring.

**Step 3: Apply the anchor rule**

For routine-participating Water only:

```python
canonical_due = _as_date(schedule["next_due"])
anchor = max(canonical_due, completed_at)
next_due = calculate_next_due(anchor, interval_days, schedule["season_adjust"])
```

All snapshots and undo fences remain unchanged.

**Step 4: Run focused completion and undo tests**

```bash
cd backend && .venv/Scripts/python -m pytest -q \
  tests/test_garden_care_operations.py \
  tests/test_calendar_grouping_preferences.py
```

---

### Task 5: Convert Care Rhythm Apply from date rewriting to session planning

**Objective:** Save/undo routine configuration without mutating canonical Water dates.

**Files:**
- Modify: `backend/services/care_rhythm.py`
- Modify: `backend/models.py` only if preview reason typing changes
- Modify: `backend/tests/test_care_rhythm.py`

**Step 1: Replace one-day-window expectations with projection expectations**

Tests must assert:

- preview remains side-effect free;
- preview `old_date` is canonical and `new_date` is the projected session date;
- Apply persists config and operation metadata but leaves every schedule date, interval, history field, and rhythm owner unchanged;
- stale preview still causes zero writes;
- Undo restores previous config;
- a preference-only operation with zero member rows is treated as valid and auditable;
- legacy operations with members remain safely undoable;
- no-routine, exact opt-out, and too-frequent reasons are explicit.

**Step 2: Reuse the pure planner in preview**

Remove the one-day-only planner from the default preview path. Keep legacy operation-member handling in Undo for old rows.

**Step 3: Stop writing schedule dates in new Apply operations**

A new operation records configuration provenance only. Keep household locking, config validation, preview hashing, and transaction behavior.

**Step 4: Run the full care-rhythm test module**

Expected: all updated and legacy compatibility tests pass.

---

### Task 6: Update frontend contracts and Water-session copy

**Objective:** Explain sessions and canonical timing without expanding Settings scope.

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/calendar/calendarTypes.ts`
- Modify: `frontend/src/pages/calendar/WateringRoundDialog.tsx`
- Modify: `frontend/src/pages/calendar/WateringRoundDialog.test.ts`
- Modify: `frontend/src/pages/settings/CareRhythmSettings.tsx`
- Modify: `frontend/src/pages/settings/CareRhythmSettings.test.ts`
- Modify together: `frontend/src/i18n/translations.ts`, `frontend/src/i18n/en.ts`, `frontend/src/i18n/nl.ts`

**Step 1: Add failing component regressions**

Assert:

- Watering Round remains all-selected by default and allows deselection;
- canonical due context is available to assistive text without showing alarm styling for an early session;
- Settings describes routine visits, not one-day date movement;
- preview summaries distinguish routine sessions, exact schedules, and frequent-care exceptions;
- Dutch and English copy both render.

**Step 2: Extend typed event fields**

Mirror optional backend fields with backward-compatible optional TypeScript properties.

**Step 3: Update copy and minimal presentation**

Remove references to "at most one day earlier" and "outside the one-day window." Do not implement accordions or new per-map controls in this issue.

**Step 4: Run focused frontend tests**

```bash
cd frontend && npm test -- \
  src/pages/calendar/WateringRoundDialog.test.ts \
  src/pages/settings/CareRhythmSettings.test.ts \
  src/pages/calendar/MonthView.test.ts \
  src/pages/calendar/WorkAgendaView.test.ts
```

---

### Task 7: Verify end-to-end behavior and publish

**Objective:** Prove the core slice works without regressions.

**Step 1: Full backend gate**

```bash
cd backend && .venv/Scripts/python -m pytest -q
```

**Step 2: Full frontend gates**

```bash
cd frontend
npm test
npx tsc -b --force
npm run lint:i18n
npm run build
```

**Step 3: Browser QA**

At approximately 390px and 1264px, verify in Dutch and English:

- Garden and House sessions land on inherited routine days;
- a catch-up session is actionable without false overdue styling;
- three-day Water remains an individual extra-care task;
- Watering Round selection and completion work;
- Settings copy no longer promises one-day rewriting;
- no horizontal overflow or clipped Dutch labels.

**Step 4: Independent review**

Review security scope, asyncpg date types, occurrence horizon, recurrence anchoring, undo compatibility, accessibility, and test gaps.

**Step 5: Commit and open a draft PR**

Commit format:

```text
feat(calendar): plan map Water sessions (#744)

Closes #744
```

Open against `master` with the full Floreren wrap-up template. Do not merge or enable auto-merge.
