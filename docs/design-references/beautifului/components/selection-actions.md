# Selection Actions

- **Stable ID:** `bui.selection-actions`
- **Source:** [Beautiful UI — Selection Actions](https://www.beautifului.dev/#selection-actions)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** places contextual actions near selected text, including explain and improve-style rewrite actions.

## Anatomy and states

- **Observed upstream:** selected passage, anchored action bar, free-form edit input, quick actions, and overflow/next control.
- **Observed upstream:** selection creates the action surface; choosing an action begins a transformation path.
- **Inferred:** transformed text needs a preview, cancel, error, and explicit apply state.

## Accessibility and motion

- **Observed upstream:** the action bar has text-labelled actions in addition to icons.
- **Inferred:** selection actions need an alternative keyboard-accessible route and must not cover the selected content or focus unexpectedly.
- **Not verified:** mobile text-selection behaviour, focus placement, and screen-reader support.

## Possible Floreren use

- **Inferred:** a future editable assistant draft could offer bounded rewrite support, if an issue defines editing and confirmation behaviour.

## Adaptation and cautions

- **Floreren decision:** do not apply text changes silently; preserve original text and require explicit acceptance when content is persisted. The observed snippet imports `iconoir-react` and unresolved `Shimmer`/`StreamText` atoms, so it is not drop-in compatible.
- **Caution:** browser text selection is fragile on touch devices; do not make it the only editing route.
