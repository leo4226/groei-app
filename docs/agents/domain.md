# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary.
- **`docs/archive/`** — archived ADRs and specs; past decisions relevant to the area you're about to work in.
- **`docs/plans/`** — active plans and design docs for in-flight work.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md                  # domain glossary
├── docs/archive/               # archived ADRs and specs (past decisions)
├── docs/plans/                 # active plans, specs & design docs
├── docs/agents/                # this config: tracker, labels, domain, how-we-work
└── (backend/, frontend/)
```

There is **no** `docs/adr/` — ADRs live (archived) under `docs/archive/`.

### Where the skills write docs

- Glossary terms → `CONTEXT.md`.
- New ADRs / resolved decisions → `docs/archive/`.
- Plans, specs, design docs (`grill-with-docs`, design output) → `docs/plans/`.
- PRDs (`to-prd`) → a GitHub issue (see `issue-tracker.md`), not a file.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 — but worth reopening because…_
