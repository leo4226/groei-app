# Recommendation Card

- **Stable ID:** `bui.recommendation-card`
- **Source:** [Beautiful UI — Recommendation Card](https://www.beautifului.dev/#recommendation-card)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** frames a suggested action with a confidence signal, alternatives, and an accept action.

## Anatomy and states

- **Observed upstream:** recommendation question, rationale, alternative options, confidence label/meter, expandable alternatives, and accept control.
- **Observed upstream:** alternative detail can be disclosed and an action can be accepted.
- **Inferred:** acceptance should resolve into a result state that identifies what changed.

## Accessibility and motion

- **Observed upstream:** confidence is represented with text as well as coloured marks.
- **Inferred:** explain confidence in plain language and make alternatives reachable without hover.
- **Not verified:** how confidence is calculated, whether it is calibrated, and error/retry behaviour.

## Possible Floreren use

- **Inferred:** a care or identification suggestion could show a rationale and alternatives when Floreren has genuine evidence.

## Adaptation and cautions

- **Floreren decision:** confidence never replaces user control, and a write needs the normal Floreren confirmation flow.
- **Caution:** do not invent precision or show a confidence meter without a defined meaning.
