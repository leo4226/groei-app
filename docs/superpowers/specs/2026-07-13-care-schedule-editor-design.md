# Plant Care Schedule Editor Design

**Issue:** #606
**Date:** 2026-07-13
**Status:** Approved

## Problem

The Edit Plant page loads all active care schedules but only exposes watering. It can patch the interval of an existing water schedule, while missing, disabled, and non-water schedules cannot be managed. The existing interval patch also leaves `next_due` unchanged, so changing a frequency does not immediately change the warning date.

## Scope

This change adds complete schedule management for recurring, schedule-driven care:

- water;
- fertilize;
- prune;
- repot;
- pest check;
- mist, rotate, and wipe leaves where valid for an indoor plant.

Weather-driven frost and heat protection remain automatic. Photo reminders remain managed by the growth journal. Calendar behavior and calendar view files are explicitly out of scope.

## API and persistence

Add `PUT /plants/{plant_id}/care-schedules`. The request contains the complete set of enabled recurring schedules, each with a canonical `care_type` and positive integer `interval_days`.

The endpoint verifies household ownership, rejects unknown, weather-triggered, photo, or environment-invalid types, and rejects duplicate care types. It reconciles the submitted set in one transaction:

- an active row with a changed interval is updated;
- an inactive row is reactivated and updated;
- a missing row is inserted;
- an existing recurring row omitted from the request is made inactive;
- ephemeral weather rows and the photo schedule are not modified.

Whenever an interval changes or a schedule is enabled, `next_due` becomes `last_done + interval_days`. If no `last_done` exists, it becomes `today + interval_days`. Unchanged active schedules retain their current `next_due`.

The response returns the plant's active schedules using the existing plant representation.

## Frontend

The Edit Plant care card becomes a reusable schedule list. Each valid recurring type has:

- an enable switch;
- its translated care label and icon;
- a day-frequency control visible while enabled.

Initial state comes from the plant's active schedules. Disabled types use the canonical environment default until enabled; an optional valid type with no catalog default, such as indoor misting, starts at seven days. Saving first updates ordinary plant fields and then sends the complete enabled schedule set to the dedicated endpoint. API errors stay on the edit page through the existing save-error treatment.

The frontend care-type union and metadata will include `pest_check` and `dust`, which already exist in the backend catalog and translations. Environment filtering must mirror the backend: mist, rotate, and dust are indoor-only; repot is not offered for outdoor-ground plants; weather and photo types are excluded from this editor.

## Validation and failure behavior

The backend is authoritative for supported types and environment validity. A validation or ownership failure makes no schedule changes. The editor does not silently ignore a schedule that cannot be saved.

Ordinary plant-field updates and schedule reconciliation remain separate requests because they use separate domain endpoints. If the schedule request fails after the plant-field request succeeds, the page reports the failure and does not navigate away, allowing retry.

## Testing

Backend endpoint tests cover:

- authorization and household ownership;
- inserting a new schedule;
- updating an interval and recalculating from `last_done`;
- recalculating from today when there is no history;
- reactivating a disabled schedule;
- disabling an omitted recurring schedule without touching photo/weather rows;
- rejecting duplicates, invalid intervals, unknown types, and environment-invalid types atomically.

Frontend unit tests cover conversion between plant schedules, editor state, and the submitted enabled schedule payload, including environment filtering. The final verification is the full backend pytest suite and the frontend production build.

## Non-goals

- Configurable warning lead time before `next_due`.
- Editing weather thresholds.
- Moving photo-reminder controls.
- Changing calendar grouping, rendering, or scheduling behavior.
