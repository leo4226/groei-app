# Records Table

- **Stable ID:** `bui.records-table`
- **Source:** [Beautiful UI — Records Table](https://www.beautifului.dev/#records-table)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** presents a dense CRM-style data grid with row selection, tags, sortable columns, and relationship status.

## Anatomy and states

- **Observed upstream:** selectable rows, linked primary record, tag cells, sortable headers, relationship/status cells, and scrollable table area.
- **Observed upstream:** selection and sort controls reorganise or mark records.
- **Inferred:** a data-heavy view needs loading, empty, error, and bulk-action states outside the ordinary row state.

## Accessibility and motion

- **Observed upstream:** the live table names itself as horizontally and vertically scrollable.
- **Inferred:** use real table semantics for tabular data, retain visible header context, and provide labelled selection controls.
- **Not verified:** mobile rendering, focus trapping in the scroll area, and sort announcements.

## Possible Floreren use

- **Inferred:** the pattern may inform an admin-like plant or household list only if a true dense table is later required.

## Adaptation and cautions

- **Floreren decision:** preserve Floreren’s mobile-first card/list patterns unless task requirements prove a data grid is better.
- **Caution:** do not import example records, tags, relationship concepts, or table density into a plant-care view without a user need.
