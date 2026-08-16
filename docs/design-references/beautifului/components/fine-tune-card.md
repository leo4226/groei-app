# Fine-tune Card

- **Stable ID:** `bui.fine-tune-card`
- **Source:** [Beautiful UI — Fine-tune Card](https://www.beautifului.dev/#fine-tune-card)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** offers a compact property inspector with layout, dimensions, radius, opacity, type, and adjustment controls.

## Anatomy and states

- **Observed upstream:** object title, adjust action, layout picker, grouped numeric fields, segmented options, and select control.
- **Observed upstream:** selected layout/options affect the inspected configuration.
- **Inferred:** fields need validation, reset/default, dirty, save, and error states if they change persisted data.

## Accessibility and motion

- **Observed upstream:** the interface combines labels with small control groups.
- **Inferred:** expose each numeric field and segmented option with an explicit label; do not rely on visual layout icons alone.
- **Not verified:** validation rules, keyboard stepping, save semantics, and narrow-screen behaviour.

## Possible Floreren use

- **Inferred:** map-layout advanced properties could borrow the compact inspector idea when an existing editor task needs it.

## Adaptation and cautions

- **Floreren decision:** keep advanced controls separate from normal care actions and use Floreren units/labels.
- **Caution:** dense property panels are unsuitable for casual users unless the task proves the control is needed and reversible.
