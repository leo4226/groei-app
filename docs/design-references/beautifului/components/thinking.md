# Thinking

- **Stable ID:** `bui.thinking`
- **Source:** [Beautiful UI — Thinking](https://www.beautifului.dev/#thinking-state)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** groups expandable progress traces for steps, reasoning, search, and coding.

## Anatomy and states

- **Observed upstream:** collapsible summary, disclosure control, category tabs, and trace content.
- **Observed upstream:** users can switch detail categories and expand or collapse the trace.
- **Inferred:** a concise summary can keep a long process understandable without exposing every event by default.

## Accessibility and motion

- **Observed upstream:** the main trace uses an expandable control.
- **Inferred:** disclose state with a real button and `aria-expanded`; keep the summary meaningful when content is collapsed.
- **Not verified:** keyboard behaviour between tabs, focus after updates, and screen-reader announcements.

## Possible Floreren use

- **Inferred:** a future assistant could show high-level progress such as “checking care history” or “finding sources.”

## Adaptation and cautions

- **Floreren decision:** never expose hidden chain-of-thought or pretend that a system trace proves correctness. Use short, user-relevant progress labels only.
- **Caution:** do not add this pattern to ordinary care flows unless the extra detail helps recovery or trust.
