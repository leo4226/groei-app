# ADR 0002 — Icon variants use two separate dimensions: form and phase

**Date:** 2026-05-13
**Status:** Accepted

## Context

Plant icons need to cover two independent axes of variation:

- **Form**: how the plant is presented visually — `potted`, `bare`, `portrait`, `fruit`. Driven by placement context (a plant in a bed zone auto-selects `bare`).
- **Phase**: the plant's life stage — `seed`, `seedling`, `mature`. Set manually by the household member on the Plant record.

The alternative was to add phase values (`seed`, `seedling`, `mature`) directly into the existing `form` field alongside `potted` and `bare`.

## Decision

`phase` is a separate field on icon manifest entries alongside `form`. File naming convention: `{base}_{form}_{phase}.svg` (e.g. `tomato_bare_seedling.svg`). A manifest entry with neither field is the canonical base icon shown as fallback.

## Consequences

- A "potted seedling tomato" is `tomato_potted_seedling.svg` — the two dimensions combine without ambiguity.
- `form` stays coherent: it encodes presentation context, not life stage.
- The gap view treats the base icon as sufficient — having all variant combinations is optional. Gap tracking does not flag missing variants as a deficit.
- The existing `find_variant()` helper in `routers/icons.py` needs extending to accept an optional `phase` argument in addition to `target_form`.
- Future automatic phase selection (from plant age or phenology) does not require a schema change — it would just pre-fill the `phase` field on the Plant.
