# Map-level Water Sessions Design

**Issue:** #744
**Status:** Approved for implementation
**Date:** 2026-07-22

## Problem

Floreren currently has two adjacent features:

- Care Rhythm rewrites recurring Water `next_due` dates at most one day earlier.
- Calendar Grouping combines configured care only when events already share the same map, care type, and date.

This makes the user configure both *when* care should happen and *what* should group, but still leaves most Water schedules on separate days. The screenshot that motivated this design showed 2 schedules moved and 55 exceptions. Saved weekdays also do not govern ordinary completion: completion recalculates from the completion date and interval, so schedules can drift apart again.

The product goal is a practical household routine: usually one outdoor visit and one indoor visit per week, while retaining personalized intervals and explicit frequent-care exceptions.

## Product model

Floreren presents **map-level Water sessions**, not a flattened household Water cadence.

A saved Care Rhythm provides one or two preferred weekdays per environment, with existing per-map overrides. Saving that routine is sufficient to organize Water for maps that inherit a weekday; users do not also have to enable Water in Calendar Grouping. Existing Water grouping rules remain a compatibility fallback only for households without a saved routine. Each eligible Water occurrence is projected onto a routine session date. The underlying schedule remains canonical.

A Water session is a check-and-water workflow. All suggested plants are selected initially, but the user can deselect plants whose soil remains moist. Only selected schedules receive a Water log and recurrence update.

### Three layers

1. **Base routine:** one outdoor day and one indoor day for most households.
2. **Adaptive extra sessions:** weather-generated map checks, implemented later.
3. **Personalized exceptions:** schedules too frequent for the configured routine, or explicitly opted out, remain individual.

## Canonical date versus session date

`care_schedules.next_due` remains the personalized canonical deadline. The planner derives a separate session date for Calendar presentation.

This distinction prevents a ten-day interval from becoming permanently weekly merely because Sunday is preferred.

For a canonical due date, the planner chooses the latest configured weekday on or before that due date. A one-day Sunday routine therefore collects work due before the following Sunday into the preceding Sunday visit.

The API exposes enough metadata to distinguish:

- the displayed session date;
- the canonical plant due date;
- routine-session membership;
- exact/frequent-care exceptions.

The Calendar query widens its canonical occurrence horizon by at most six days so a session near the end of the requested range can include work due before the next visit. After projection, exact events remain constrained to the original range.

The server pipeline is ordered deliberately:

1. generate canonical occurrences from canonical dates only;
2. represent the stored overdue occurrence separately instead of pretending the range start is its canonical date;
3. calculate seasonal effective intervals at each canonical occurrence date;
4. project eligible Water occurrences;
5. fall back to exact events for same-schedule collisions;
6. clamp only recoverable agenda catch-up sessions when `pin_overdue` is enabled;
7. enforce the requested response range;
8. group by displayed date, care type, and map.

Scheduled event IDs use the schedule ID, care type, and canonical occurrence date, so the same occurrence has stable identity across query ranges even when its displayed session date is clamped.

## Frequent-care rule

The planner computes the largest gap between configured routine days, including the week boundary.

Examples:

- Sunday only → maximum gap 7 days.
- Monday and Thursday → maximum gap 4 days.

If a schedule's effective interval is shorter than that gap, the configured routine cannot represent its required frequency. That schedule remains an individual extra-care task. This prevents a three-day tomato schedule from being silently reduced to weekly care.

If the interval is at least the maximum gap, occurrences may be projected into routine sessions. Seasonal adjustments can still create an unexpected collision. If two occurrences from one schedule project into the same session, neither occurrence is dropped: that schedule falls back to explicit extra-care events for that planning window.

## Missed sessions and urgency

A projected session date can be before today while its canonical deadline is still upcoming. In an agenda request with `pin_overdue`, it is clamped to the request's start date as an actionable catch-up visit. `overdue` is always computed as `canonical_date < today`; the displayed or clamped session date never makes an upcoming plant falsely overdue.

Work Agenda continues pinning outstanding work. Month displays a session only when its actual routine date is inside the requested month; API responses never leak projected events outside their requested range. A missed session remains recoverable through Work Agenda rather than being duplicated on a false Month date.

## Completion semantics

Grouped Water completion remains transactional, household-scoped, map-scoped, selectable, and undoable.

For a routine participant:

- early completion anchor = canonical `next_due`;
- on-time/late completion anchor = actual completion date;
- next canonical due = anchor + effective interval.

Equivalent rule: `anchor = max(canonical_next_due, completed_at)`.

This prevents an early routine visit from compressing every later recurrence. Explicit exact schedules and non-Water care retain their existing completion-from-actual-date behavior in this slice.

Unselected schedules receive no care log, no `last_done`, and no new due date.

## Care Rhythm persistence

The default Care Rhythm flow becomes preference planning rather than schedule rewriting.

- Preview projects session dates without writing.
- Apply persists the weekday configuration and records a reversible configuration operation.
- Apply does not mutate `care_schedules.next_due` or assign new rhythm ownership to schedules.
- Undo restores the prior configuration.
- New preference-only operations intentionally have zero schedule-member snapshots; this is a valid operation shape, not corruption.
- Existing legacy operations with schedule-member snapshots remain undoable.
- Existing `rhythm_opt_out` continues to mean "follow the exact schedule" for Water.

No schema migration is required for the first slice.

## Calendar integration

Routine projection applies only when all are true:

- a saved Care Rhythm exists;
- the map resolves to at least one preferred weekday from its environment or override;
- the Water schedule is active, recurring, and not opted out;
- its effective interval can be represented by the selected routine days.

When no Care Rhythm is saved, existing Calendar Grouping Water rules keep their exact-date behavior for backward compatibility. A saved routine supersedes that duplicate Water toggle; other care types continue to use Calendar Grouping normally.

Water events that share map and projected session date become one grouped event. Group members retain schedule ID, plant context, and canonical due date. A same-schedule collision falls back to exact events instead of being deduplicated. Other care types retain current exact-date grouping behavior until their follow-up slice.

Month and Work Agenda consume the same API events. No frontend-only grouping or optimistic recurrence math is introduced.

## Settings scope

This slice updates misleading copy and preview semantics so the current UI describes sessions rather than a one-day rewrite. It does not implement the complete Settings redesign.

Follow-up Settings work will provide:

- one visible outdoor day and one indoor day;
- second days and map overrides under Advanced;
- collapsed per-map summaries;
- a weekly visit summary instead of a long exception list.

It will also remove Water from the duplicate Calendar Grouping choice once the session model is established.

## Out of scope

- Adaptive ET₀/rain sessions.
- Indoor heat-proxy sessions.
- Fertilize and Prune session projection.
- Full Care Planning accordion redesign.
- Automatic completion of all plants in a map.

## Safety and verification

Required regressions cover:

- one-day and two-day routine projection;
- seven-, ten-, and fourteen-day intervals;
- three-day frequent-care exception;
- opt-out behavior;
- horizon widening without exact-event leakage;
- catch-up actionability without false overdue styling;
- household/map isolation;
- selectable grouped completion;
- early versus late recurrence anchoring;
- grouped undo;
- preview side-effect freedom and Apply without schedule writes;
- Dutch and English copy;
- Month and Work Agenda rendering at desktop and phone widths.
