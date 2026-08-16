# Beautiful UI reference library

A compact, internal library of **visual and interaction inspiration** from [Beautiful UI](https://www.beautifului.dev/). It records what was observed on 2026-08-16 without importing upstream implementation or turning it into a Floreren design system.

## Use this library

1. Read `active.yaml` for the current mode and task profiles.
2. Read `policy.md` before using an idea.
3. Read `patterns/floreren-adaptation-rules.md` before making a Floreren UI change.
4. Use `catalogue.yaml` to select only component notes that match the task. Do not load all 19 notes by default.

The default mode is `inspiration-only`. The notes are not a component API, visual specification, or approval to copy upstream code.

## Evidence labels

- **Observed upstream**: visible or stated on the cited live source at the capture date.
- **Inferred**: a reasoned interpretation, not a stated upstream fact.
- **Floreren decision**: a local rule for using this library.
- **Not verified**: a detail not tested or measured in this research.

## Contents

- `active.yaml`: current version, default mode, and task-to-note filters.
- `catalogue.yaml`: stable component IDs, paths, source URLs, and tags.
- `policy.md`: provenance, licensing, and use limits.
- `patterns/`: cross-component observations and Floreren adaptation rules.
- `components/`: one concise note per observed catalogue component.
- `visuals/`: optional internal evidence only; see its README and manifest.
- `license/`: the upstream MIT license copy and scope notes.

## Source and provenance

- Catalogue: <https://www.beautifului.dev/>
- Published license: <https://www.beautifului.dev/license>
- Capture date: 2026-08-16
- Upstream copyright notice: Copyright (c) 2026 Shane Levine

No upstream TSX, compiled CSS/JavaScript, logos, fonts, marketing copy, screenshots, or example business records are stored here. This library does not imply affiliation with Beautiful UI or its creator.
