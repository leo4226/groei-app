# Diff Table

- **Stable ID:** `bui.diff-table`
- **Source:** [Beautiful UI — Diff Table](https://www.beautifului.dev/#diff-table)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** makes proposed tabular additions, deletions, and modifications visible before they are applied.

## Anatomy and states

- **Observed upstream:** table title, column headers, normal rows, and rows with positive/negative change treatment.
- **Observed upstream:** changed cells or rows use semantic colour to distinguish deletions and additions.
- **Inferred:** a review pattern needs a clear applied, cancelled, and failed result after the proposal is acted on.

## Accessibility and motion

- **Observed upstream:** meaning is reinforced by table structure as well as colour.
- **Inferred:** identify the type of each proposed change in text for users who cannot perceive colour; make overflow workable on narrow screens.
- **Not verified:** keyboard navigation, horizontal scrolling, and screen-reader announcements of changes.

## Possible Floreren use

- **Inferred:** a future bulk edit or assistant proposal could preview a limited set of field changes before confirmation.

## Adaptation and cautions

- **Floreren decision:** use an explicit change summary and Floreren field names; do not reuse business-record examples or upstream colouring values.
- **Caution:** do not use a dense diff table for a single simple change where a readable confirmation sentence is safer.
