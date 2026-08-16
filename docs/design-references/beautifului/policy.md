# Policy

## Purpose

This library preserves small, attributable observations that can help a future Floreren UI task. It is deliberately an index, not a scrape, a source mirror, or an imported design system.

## Default use: inspiration only

**Floreren decision:** extract the interaction problem or visual principle, then solve it with Floreren's own architecture, vocabulary, tokens, and accessibility behaviour. A similar outcome is allowed. Direct visual or implementation copying is not the default.

Before using a note, check the local task requirements first. This library never overrides an issue, existing Floreren UX, i18n rules, mobile needs, or accessibility requirements.

## Provenance and license

- **Observed upstream:** the catalogue and licence were inspected at the URLs below on 2026-08-16.
  - <https://www.beautifului.dev/>
  - <https://www.beautifului.dev/license>
- The published software licence is MIT, Copyright (c) 2026 Shane Levine. The unmodified notice is in `license/MIT.txt`.
- `license/scope-notes.md` explains what that notice does and does not cover in this repository.

## What is stored

Short original notes, stable IDs, source links, summaries of visible patterns, compatibility warnings, and optional internal visual evidence.

## What is not stored

No upstream TSX, raw page scrape, compiled JS/CSS, logos, fonts, marketing copy, screenshots from upstream, or example creamery/business records. Do not add them to this library.

## Code-copy rule

**Floreren decision:** do not copy upstream code merely because a component page offers a copy control. A future issue must explicitly request code reuse. That issue must verify the current licence, retain required notices, assess dependency and token compatibility, and document the decision in its PR.

## Evidence discipline

Keep these labels close to each claim:

- **Observed upstream**: visible on the live source or stated by it at capture.
- **Inferred**: a design interpretation or a candidate use.
- **Floreren decision**: a local rule made for Floreren.
- **Not verified**: unknown behaviour, untested accessibility, exact implementation, or an assumption.

Do not upgrade an inference into a requirement. Do not claim keyboard, screen-reader, contrast, performance, or mobile behaviour without verification.

## Updating

Updates are manual and issue-scoped. Record the source URL, capture date, changed IDs, and any new licence finding in `CHANGELOG.md`. There is intentionally no watcher, scheduled job, or automatic scrape.
