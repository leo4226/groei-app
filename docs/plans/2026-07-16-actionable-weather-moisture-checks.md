# Actionable Weather Moisture Checks Implementation Plan

> **For Hermes:** Execute with RED-GREEN-REFACTOR TDD. Preserve canonical Water schedule authority.

**Goal:** Materialize high map-aware Water pressure as one temporary moisture check per plant, group those checks per map in Calendar, and resolve selected checks explicitly as still moist or watered.

**Architecture:** Extract #664 Water outlook construction into a shared service. A household-scoped sync derives active `moisture_check` ephemeral schedules from high pressure. Schedule notes store compact bilingual reason metadata. Calendar groups these one-shot checks per map. A dedicated transactional resolve endpoint locks selected checks and their canonical Water schedules. Retried resolutions have no duplicate effects because resolved checks are inactive.

**Invariants:**

- Canonical `water.next_due` is never changed by sync or “Still moist”.
- “Watered” advances only explicitly selected active canonical Water schedules from the confirmed date.
- A plant has at most one active ephemeral `moisture_check`.
- Missing/stale weather creates no checks and cleans up stale active checks.
- Forecast rain may remove a check but never postpone canonical Water.
- Archived/moved/disabled plants cannot retain stale checks.
- Both outcomes are household-scoped, transactional and safe to retry.

## Task 1: Schema and care type

- Add migration 0048 with a partial unique index for one active ephemeral moisture check per plant.
- Register `moisture_check` as weather-triggered and valid for all environments.
- Add migration and care-type tests.

## Task 2: Shared outlook and synchronization

- Extract #664 outlook calculation into a shared service without changing endpoint output.
- Add RED tests for create/update, normal/rain cleanup, indoor proxy, archived/moved/base-disabled cleanup, same-day dismissal suppression and concurrency.
- Sync only the authenticated household on Calendar reads.

## Task 3: Transactional resolution

- Add RED service/API tests for selected-only Watered, Still moist no-op on canonical schedules, retries, invalid selections, household isolation and rollback.
- Lock checks and canonical schedules and use `calculate_next_due` with typed dates/datetimes.

## Task 4: Grouped Calendar session

- Parse bilingual reason metadata and group moisture checks per map/date independent of normal grouping preferences.
- Extend group-member payload with bilingual reasons.
- Add backend grouping tests.

## Task 5: Explicit dialog and actions

- Add typed client method and accessible NL/EN selection dialog.
- Offer “Still moist” and “Watered” for explicitly selected plants.
- Wire Month and Work agenda flows, retries and refresh.
- Add component/action tests.

## Task 6: Verification

- Full backend/frontend tests, i18n lint, exact TypeScript gate and production build.
- Apply migration to dev Neon, live read/write QA with rollback or temporary branch data.
- Desktop browser QA in NL and EN.
- Independent review, commit, push and PR with `Closes #665`.
