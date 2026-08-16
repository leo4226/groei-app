# Search

- **Stable ID:** `bui.search`
- **Source:** [Beautiful UI — Search](https://www.beautifului.dev/#search)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** provides a focused command-search result list and an empty state.

## Anatomy and states

- **Observed upstream:** search field, compact results list, and empty-state variant.
- **Observed upstream:** visible result content changes as a user searches.
- **Inferred:** selected-result, loading, no-match, error, and recent-search states should be considered separately.

## Accessibility and motion

- **Observed upstream:** the search field has a visible label/placeholder and result rows are actionable.
- **Inferred:** support keyboard navigation, identify result count or no matches in text, and keep focus predictable after a selection.
- **Not verified:** shortcut behaviour, result announcement, debouncing, and mobile overlay treatment.

## Possible Floreren use

- **Inferred:** a future plant, map, or command search could use clear result and no-match handling.

## Adaptation and cautions

- **Floreren decision:** build search around Floreren records and permissions, not generic command-palette vocabulary.
- **Caution:** do not introduce global keyboard shortcuts that conflict with browser or assistive-technology controls without testing.
