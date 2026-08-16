# Loading State

- **Stable ID:** `bui.loading-state`
- **Source:** [Beautiful UI — Loading State](https://www.beautifului.dev/#loading-state)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** makes an active wait visible with a pixel-grid loader, changing label, and elapsed time.

## Anatomy and states

- **Observed upstream:** activity mark, status label, elapsed-time value, and selectable loader variants.
- **Observed upstream:** the visible state is in-progress; the label and counter animate while work continues.
- **Inferred:** the same location should resolve to success, failure, or ordinary content rather than leave an endless loader.

## Accessibility and motion

- **Observed upstream:** the catalogue has reduced-motion behaviour.
- **Inferred:** expose meaningful status text to assistive technology and keep elapsed time non-essential.
- **Not verified:** live-region behaviour, timeout handling, and exact reduced-motion fallback.

## Possible Floreren use

- **Inferred:** a short, labelled wait state could help during plant identification or data refresh when the action already exists.

## Adaptation and cautions

- **Floreren decision:** use Floreren's own loading primitives and copy. Do not add a pixel grid merely for visual similarity.
- **Caution:** never use an animated indicator as the only evidence that a request is still active; offer error recovery for meaningful waits.
