# Filter Table

- **Stable ID:** `bui.filter-table`
- **Source:** [Beautiful UI — Filter Table](https://www.beautifului.dev/#filter-table)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** puts status filters above a compact table so users can reorganise live data.

## Anatomy and states

- **Observed upstream:** all-items filter, per-status filters with counts, active-filter treatment, and a small status table.
- **Observed upstream:** choosing a filter changes the visible records; status labels show category and quantity.
- **Inferred:** no-results and clear-filter states need the same prominence as filtered results.

## Accessibility and motion

- **Observed upstream:** filters are individual controls with text labels and counts.
- **Inferred:** expose selected state programmatically and do not rely on a coloured dot as the category label.
- **Not verified:** keyboard arrow behaviour, focus after filtering, and count update announcements.

## Possible Floreren use

- **Inferred:** a care list could use a small, explicit status filter if it reduces scanning without hiding important due work.

## Adaptation and cautions

- **Floreren decision:** filter names and counts must be localised through `useT()` and match Floreren care semantics.
- **Caution:** do not let a remembered filter hide overdue care without an obvious active-filter indicator.
