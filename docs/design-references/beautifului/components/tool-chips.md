# Tool Chips

- **Stable ID:** `bui.tool-chips`
- **Source:** [Beautiful UI — Tool Chips](https://www.beautifului.dev/#tool-chips)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** condenses tool calls, messages, file edits, and command-like work into an expandable status area.

## Anatomy and states

- **Observed upstream:** aggregate summary, expand/collapse control, typed entries, compact file/change chips, and a summary overflow indicator.
- **Observed upstream:** collapsed and expanded states reveal different levels of process detail.
- **Inferred:** entries need a stable outcome state when background work ends.

## Accessibility and motion

- **Observed upstream:** expandable interaction is central to the pattern.
- **Inferred:** include text labels for icons and make the aggregate count understandable without colour.
- **Not verified:** focus order within chips, truncation behaviour, and screen-reader detail.

## Possible Floreren use

- **Inferred:** a future troubleshooting or assistant surface may need compact, optional progress details.

## Adaptation and cautions

- **Floreren decision:** translate technical process language into user-relevant Floreren terms. Do not present internal commands, files, or model activity as a product feature by default.
- **Caution:** a chip summary must not hide an error that blocks the user’s requested result.
