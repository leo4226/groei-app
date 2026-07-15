# Care rhythm implementation plan (#627)

> **Issue:** https://github.com/leo4226/groei-app/issues/627
> **Branch:** `feat/627-care-rhythm`
> **Scope:** Recurring Water schedules only. Weather-aware moisture checks remain in #441.

## Product rules

1. A recurring Water `next_due` may move at most one calendar day earlier and never later.
2. Personalized `interval_days`, `season_adjust`, guidance, `last_done`, and care logs remain unchanged by organization.
3. Only active, non-ephemeral, future Water schedules on active plants are eligible.
4. Schedules explicitly opted out remain visible exceptions.
5. Preview is side-effect free. Apply must re-plan under row locks and reject a stale preview hash.
6. Apply and Undo are household-scoped, transactional, auditable, reversible, and ownership-fenced.
7. Grouped Water completion records only user-selected schedules and recalculates each selected schedule from the actual completion date and its own interval.
8. New-plant onboarding preserves today's current default unless the user explicitly accepts a saved-rhythm first-due proposal.

## Deterministic proposal algorithm

- Weekdays use ISO integers `1..7` (Monday..Sunday).
- Indoor and Outdoor are optimized independently.
- Candidate configurations contain one or two weekdays.
- For every eligible schedule:
  - due weekday selected -> unchanged/aligned;
  - previous weekday selected -> move exactly one day earlier;
  - otherwise -> unchanged exception.
- Candidate score, ascending and deterministic:
  1. number of actual care weekdays after alignment, including exception weekdays;
  2. total movement days;
  3. exception count;
  4. preferred-day count;
  5. weekday tuple.
- Empty environments return no proposed days.
- Map overrides are never inferred automatically; maps initially inherit their environment proposal.

## Task 1: migration and portable test schema

**Files**
- Add `backend/alembic/versions/0045_add_care_rhythm.py`
- Modify `backend/tests/conftest.py`

**Schema**
- `care_rhythm_operations`: household, previous/applied config JSON, preview hash, timestamps.
- `household_care_rhythm_preferences`: Indoor/Outdoor weekday JSON and `last_operation_id` ownership fence.
- `map_care_rhythm_overrides`: household/map weekday JSON.
- `care_rhythm_operation_members`: schedule, previous/applied `next_due`, previous owner operation.
- Add `care_schedules.rhythm_opt_out BOOLEAN NOT NULL DEFAULT FALSE`.
- Add `care_schedules.rhythm_operation_id` FK with `ON DELETE SET NULL`.

**Verification**
- Alembic upgrade and downgrade SQL generate successfully from `0044`/`0045`.
- SQLite fixture mirrors production constraints needed by service tests.

## Task 2: RED -> GREEN pure planner

**Files**
- Add `backend/services/care_rhythm.py`
- Add `backend/tests/test_care_rhythm.py`

**RED tests**
- one-day-earlier and never-later invariant;
- deterministic one/two-day proposal and tie-breaking;
- Indoor/Outdoor separation and per-map overrides;
- exceptions and opt-outs remain unchanged and visible;
- due-today, overdue, archived, inactive, ephemeral, non-Water, and foreign-household schedules are not eligible;
- preview contains old/new date, movement, reason, group counts, and stable hash;
- changing configuration changes preview without writes.

**GREEN implementation**
- Canonical configuration normalization and ownership validation.
- Side-effect-free schedule query and plan projection.
- SHA-256 preview hash over household, canonical config, and sorted schedule state.

## Task 3: RED -> GREEN API, transactional apply, and stale-safe Undo

**Files**
- Modify `backend/models.py`
- Add `backend/routers/care_rhythm.py`
- Modify `backend/main.py`
- Extend `backend/tests/test_care_rhythm.py`

**Endpoints**
- `GET /api/household/care-rhythm` -> saved config or deterministic proposal plus map metadata.
- `POST /api/care-rhythm/preview` -> side-effect-free plan.
- `POST /api/care-rhythm/apply` -> config + preview hash.
- `POST /api/care-rhythm/{operation_id}/undo`.
- `POST /api/care-rhythm/onboarding-preview` -> explicit first-due proposal for a map and Water interval.

**Apply transaction**
1. Lock household.
2. Lock eligible Water schedule rows.
3. Recompute and compare preview hash; stale -> 409.
4. Snapshot previous config and schedule state.
5. Create operation.
6. Update only moved future `next_due` values and operation ownership markers.
7. Replace config and map overrides with operation ownership.
8. Commit as one unit.

**Undo transaction**
- Lock operation, household preferences, and member schedules.
- Require operation still owns current config and every changed schedule.
- Reject later manual edits or later operations with 409.
- Restore prior dates, prior owners, and prior config atomically.

**Failure regressions**
- injected apply/Undo failures leave no partial writes;
- identical later apply cannot be undone through an older operation (ABA protection);
- foreign-household maps/operations are inaccessible;
- repeated preview is idempotent.

## Task 4: explicit schedule opt-out and new-plant confirmation

**Files**
- Modify `backend/models.py`
- Modify `backend/routers/care.py`
- Modify `backend/routers/plants.py`
- Modify `backend/tests/test_care_schedule_update.py`
- Modify `backend/tests/test_care_schedule_sync.py`
- Add onboarding coverage to `backend/tests/test_care_rhythm.py`
- Modify `frontend/src/types/index.ts`
- Modify `frontend/src/pages/editPlantCareSchedules.ts`
- Modify `frontend/src/components/plant/CareScheduleEditor.tsx`
- Modify associated frontend tests and `EditPlant.tsx`

**Rules**
- Care schedule API exposes `rhythm_opt_out`.
- Explicit interval PATCH sets opt-out and clears rhythm ownership.
- Sync changes clear stale rhythm ownership; unchanged rows preserve it.
- Editor shows a Water-only “Follow Care rhythm” switch so the user can leave or rejoin explicitly.
- `CareScheduleCreate.next_due` is optional and accepted only as an explicit onboarding value.
- Onboarding proposal uses a saved effective map routine and `today + interval` as personalized baseline; it applies the same max-one-day-earlier rule.
- Declining/omitting the proposal preserves the existing due-today creation behavior.

## Task 5: selected-plant Water rounds

**Files**
- Modify `backend/models.py`
- Modify `backend/routers/calendar.py`
- Modify `backend/services/garden_care.py`
- Modify grouped-care backend tests
- Modify `frontend/src/pages/calendar/calendarTypes.ts`
- Modify `frontend/src/api/client.ts`
- Add `frontend/src/pages/calendar/WateringRoundDialog.tsx` and test
- Modify `useCalendarActions.ts`, `CalendarAgendaCard.tsx`, `MobileAgendaList.tsx`, and tests

**Contract**
- Synthetic grouped event includes member summaries: schedule ID, plant ID, localized names/icon.
- Grouped-completion input accepts optional `schedule_ids` for backward compatibility.
- When provided, IDs must be unique, non-empty, active, household/map/care scoped, and members of the actionable grouped set.
- Only selected schedules get logs/`last_done`/new personalized `next_due`.
- Water group Done opens a selection dialog; all are initially selected, user can deselect still-wet plants, zero selection cannot submit.
- Successful completion and Undo trigger Calendar/Work Agenda retry.

## Task 6: bilingual Settings flow

**Files**
- Add `frontend/src/pages/settings/CareRhythmSettings.tsx`
- Add `frontend/src/pages/settings/CareRhythmSettings.test.ts`
- Modify `frontend/src/pages/Settings.tsx`
- Modify `frontend/src/api/client.ts`
- Modify `frontend/src/i18n/translations.ts`, `en.ts`, `nl.ts`

**UI**
- Add “Organize my care week” card below per-map Calendar grouping.
- Dialog supports one/two Indoor and Outdoor weekday chips.
- Each map defaults to inheritance and can opt into a map override.
- Configuration changes recalculate preview immediately.
- Preview shows moved, unchanged, exceptions, old/new date, movement, and grouped counts.
- Explicit Apply; success shows affected count and Undo.
- Errors roll back optimistic state and use localized copy.
- Dispatch `floreren-care-rhythm-changed` after Apply/Undo; active Calendar range listeners retry.

## Task 7: verification and delivery

1. Focused backend and frontend tests after every source edit.
2. Full backend: `PYTHONPATH= PYTHONNOUSERSITE=1 .venv/Scripts/python -m pytest -q`.
3. Frontend: `npm test`, `npx tsc -b --force`, `npm run lint:i18n`, `npm run build`.
4. CRLF-aware `git diff --check`, removed-test declaration guard, and added-line security scan.
5. Desktop and 390px mobile visual QA in Dutch and English; verify no horizontal overflow.
6. Independent spec/logic/security/database review of the complete staged diff; fix and rerun affected/full gates.
7. Commit `feat(calendar): organize Water schedules into a Care rhythm (#627)` with `Closes #627`.
8. Push and open one PR against `master`; do not merge or deploy.

## Deferred to #441

- per-map Open-Meteo ET0/rain snapshots;
- temporary “Check moisture” recommendations;
- forecast confidence and rain cancellation;
- indoor heating/moisture model;
- any automatic weather advancement.
