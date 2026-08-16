# Streaming Text

- **Stable ID:** `bui.streaming-text`
- **Source:** [Beautiful UI — Streaming Text](https://www.beautifului.dev/#streaming-text)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** presents a streamed answer with inline sources, compact actions, and follow-up prompts.

## Anatomy and states

- **Observed upstream:** answer area, incremental cursor/content state, action controls, expandable source count, source links, and follow-ups.
- **Observed upstream:** source detail can be collapsed while the answer remains visible.
- **Inferred:** the final state needs a clear completion or retry outcome if streaming stops.

## Accessibility and motion

- **Observed upstream:** streamed-content motion appears in the catalogue.
- **Inferred:** announce only useful updates and avoid repeatedly reading the entire growing answer to assistive technology.
- **Not verified:** interruption, reconnect, selection, and reduced-motion semantics.

## Possible Floreren use

- **Inferred:** a future assistant answer could pair plant-care guidance with clearly identified supporting sources.

## Adaptation and cautions

- **Floreren decision:** show a source only when Floreren has a real, safe source to identify. Do not mimic citations with invented provenance.
- **Caution:** partial output is not a completed recommendation; keep write actions unavailable until the applicable Floreren action is confirmed.
