# Context Cards

- **Stable ID:** `bui.context-cards`
- **Source:** [Beautiful UI — Context Cards](https://www.beautifului.dev/#context-cards)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** groups retrieved text chunks with source/file metadata and a compact count.

## Anatomy and states

- **Observed upstream:** collection title/count, source-type marker, item title, length metadata, excerpt, and source link/metadata.
- **Observed upstream:** multiple cards present independently traceable pieces of supporting material.
- **Inferred:** empty, unavailable, and permission-restricted source states need distinct treatment.

## Accessibility and motion

- **Observed upstream:** cards combine text labels with source-type marks.
- **Inferred:** provide source names in text, avoid using a file icon as the only identifier, and keep links descriptive.
- **Not verified:** long excerpt handling, keyboard order, and source-loading behaviour.

## Possible Floreren use

- **Inferred:** future species knowledge or assistant guidance could identify supporting Floreren records or approved external sources.

## Adaptation and cautions

- **Floreren decision:** show only sources Floreren may expose to the current household. Do not surface private notes, internal identifiers, or unsupported provenance.
- **Caution:** an excerpt is support, not proof; avoid presenting it as a verified care instruction without context.
