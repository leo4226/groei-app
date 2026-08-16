# Prompt Bar

- **Stable ID:** `bui.prompt-bar`
- **Source:** [Beautiful UI — Prompt Bar](https://www.beautifului.dev/#prompt-bar)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** provides a composer with attachments, `@` sources, `/` commands, model choice, and dictation.

## Anatomy and states

- **Observed upstream:** attachment/source trigger, text input, model selector, dictation control, send button, and rounded/pill presentation variants.
- **Observed upstream:** menus can open from the contextual triggers; send is disabled before valid input.
- **Inferred:** each optional capability needs a clear unavailable, selected, and removable state.

## Accessibility and motion

- **Observed upstream:** controls have visible labels or accessible names in the live page.
- **Inferred:** menus need keyboard navigation, focus management, and text alternatives for icon-only controls.
- **Not verified:** dictation permission and error handling, attachment validation, and mobile keyboard behaviour.

## Possible Floreren use

- **Inferred:** structured text entry may be useful for a future assistant, but Floreren does not currently need every upstream capability.

## Adaptation and cautions

- **Floreren decision:** do not add model selection, slash commands, or dictation merely to mirror the reference. The observed snippet imports `glimm`; check compatibility before any explicit reuse.
- **Caution:** attachments and source selection require Floreren-specific privacy, upload, and error rules.
