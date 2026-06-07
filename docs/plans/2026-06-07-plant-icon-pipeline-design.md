# Plant Icon Pipeline — Design

**Date:** 2026-06-07
**Status:** Approved (design), pending implementation plan
**Author:** Leon + Claude

## Problem

Plant icons are broken in three connected ways:

1. **"Sync icons" always reports the same `+6 new`.** Six SVGs
   (`brownbean_nopot`, `cortaderia_bare`, `error-plant`, `leon`, `seed`,
   `seed_bare`) exist on disk but were never added to the committed
   `manifest.json` (214 entries; 220 SVGs on disk). The sync endpoint discovers
   them, reports "+6", and calls `save_manifest()` — but that write goes to
   **Fly's ephemeral `/app/icons`**, which (a) resets on machine
   restart/auto-stop and (b) is never read by the frontend anyway.

2. **Plants are created with no icon.** Icon assignment is best-effort matching
   on the client (`findMatchingIcon`); on no match, `icon_key` is `NULL` and the
   create endpoint stores it as-is. No server-side fallback, no flag.

3. **Admin "generate icons" never delivers.** `POST /admin-panel/generate-icons`
   writes SVGs + manifest to Fly's ephemeral disk and updates `plant.icon_key`
   in Postgres. The DB update persists but the SVG only exists on Fly's disk —
   the Vercel-served frontend requests `/icons/<id>.svg` and gets a 404. On Fly
   restart the SVG vanishes, leaving a dangling `icon_key`.

### Root cause (single)

The deployment is split — **static frontend on Vercel** (serves
`frontend/public/icons/*` from git) + **ephemeral backend on Fly**. The icon
pipeline was designed as if the backend could write icon files the frontend
serves. It cannot. Any durable icon change must land in either **git**
(curated) or a **shared object store** (generated) — never Fly local disk.

### Secondary finding (corrects CLAUDE.md)

There is **no live Claude/Anthropic API call** in the backend. Every LLM call
routes through one shared module, `backend/llm_config.py`, currently pointed at
**OpenRouter + DeepSeek** (`deepseek/deepseek-chat`). The "Claude Haiku" mentions
in code comments and CLAUDE.md are stale.

## Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Generated-icon quality | **Distinctive per-species** (AI), not generic category placeholders |
| 2 | Generation trigger + storage | **Runtime in prod → R2 (SVG) + Postgres (metadata)** |
| 3 | Generation method | **Approach A**: constrained AI SVG + validation + procedural fallback |
| 4 | Creation-time behavior | **Placeholder + flag**: assign generic category placeholder, set `icon_requested=TRUE` |
| 5 | LLM provider | **Nous Portal (direct)**, model **DeepSeek V4 Flash** (`deepseek/deepseek-v4-flash`) |
| 6 | Migration scope | **Global** — change shared `llm_config.py`; all callers (incl. care thresholds) move to Nous |

## Architecture

### Unified catalog (static + dynamic)

The catalog is the union of two **durable** sources, merged by the backend:

- **Curated icons** — git `frontend/public/icons/*.svg` + `manifest.json`,
  served by Vercel. Versioned, reviewable. Unchanged.
- **Generated icons** — SVG bytes in **R2** (`icons/generated/<id>.svg`),
  metadata in new Postgres table `generated_icons`.

`GET /icon-catalog` returns **all** entries, each with an explicit `url`:
- curated → `/icons/<file>` (Vercel)
- generated → R2 public URL

**Frontend changes:**
- `icons.catalog()` switches from `fetch('/icons/manifest.json')` to backend
  `GET /icon-catalog`; response cached in the Zustand store for offline/PWA.
- `resolveIconUrl()` (in `frontend/src/utils/icons.ts`) becomes catalog-aware:
  look up the entry by `icon_key`, return its `url`. Generated → R2, curated →
  Vercel. One seam, both sources.

> **Note (behavior change):** the catalog source moves from a static file to a
> cached backend call. Necessary to merge generated icons; mitigated by store
> caching.

### Data model — `generated_icons` (new table)

| column | type | notes |
|--------|------|-------|
| `id` | text PK | e.g. `gen_rosa` (base/potted) and `gen_rosa_bare` |
| `name` | text | display name (NL) |
| `sci` | text | latin name |
| `cat` | text | category |
| `form` | text | `potted` \| `bare` |
| `variant_of` | text null | base id for the `_bare` row |
| `family` | text | optional |
| `url` | text | R2 public URL |
| `source` | text | `ai` \| `procedural` |
| `created_at` | timestamptz | default now |

A generated icon yields two rows: base (`form=potted`) + bare
(`form=bare`, `variant_of=<base>`), mirroring the curated manifest's
form-variant convention so `find_variant()` works unchanged in shape.

### Generation pipeline (Approach A)

`POST /admin-panel/generate-icons` (batch over `species_without_icon` /
placeholdered plants) and a per-plant trigger. For each target:

1. **Prompt Nous (`deepseek/deepseek-v4-flash`)** with a strict style-guide: fixed
   `viewBox="0 0 100 100"`, the terracotta pot spec, the curated green palette.
   Expect JSON `{ potted_svg, bare_svg, cat }` — both forms in one call.
2. **Validate + sanitize** each SVG (`defusedxml`):
   - root must be `<svg>` with `viewBox="0 0 100 100"` and width/height 100
   - whitelist tags (`svg,g,path,ellipse,rect,circle,line,polyline,polygon,title,defs,linearGradient,stop`)
     and attributes
   - strip `<script>`, `<image>`, `<foreignObject>`, event handlers (`on*`),
     external `href`/`xlink:href` to `http(s)`/`data:`
   - reject on any violation
3. **Fallback** — on API error or validation failure, use procedural
   `icon_generator.generate_icon_svg(form=potted)` + bare. Set
   `source='procedural'`. The pipeline **never produces nothing**.
4. **Upload** both SVGs to R2 via `services/storage.Storage.put()`
   (`icons/generated/<id>.svg`, `icons/generated/<id>_bare.svg`).
5. **Insert/update** `generated_icons` rows (base + bare) with R2 urls.
6. **Re-match** plants → set `plant.icon_key = gen_<slug>`, clear
   `icon_requested`.

Returns `{ generated: [...], skipped: [...], sync_result: {...} }`.

### Potted ↔ bare switching

`resolve_placement_icon()` / `find_variant()` (called on container
placement changes in `plants.py`) are refactored to read the **unified**
catalog (manifest + `generated_icons`) instead of only the static manifest, so
the existing "in container → potted, else bare" rule applies to generated
icons too.

### Creation-time fallback (placeholder + flag)

In `backend/routers/plants.py` create, when the client sends no `icon_key`:

1. Run the server-side matcher (`_normalize` + `DUTCH_TO_ICON` + unified
   lookup).
2. Still nothing → assign a **generic category placeholder** `placeholder_<cat>`
   (≈13 committed once as curated icons) so the plant is **never blank**, and
   set `icon_requested = TRUE`.
3. The whole block is wrapped so it can **never fail plant creation**.

**Gap definition change:** "missing icon" = `icon_requested = TRUE`
(placeholdered or none), not `icon_key IS NULL`. The admin overview
`missing_icons` count and `/icon-catalog/gaps` `requested` list key off
`icon_requested`.

### Sync fix (the "+6 forever" bug)

- **One-time:** add the 6 orphan SVGs to `manifest.json`.
- **Remove** the file-discovery-and-write half of `/icon-catalog/sync` (the
  ephemeral writer). "Sync icons" becomes **re-match only**: re-run the matcher
  against the current unified catalog, report real matches. Idempotent, no
  filesystem writes. New curated icons arrive via git/deploy; generated via the
  pipeline.

### Nous migration (global)

`backend/llm_config.py` defaults change to direct Nous Portal:

```
LLM_API_KEY  = os.getenv("NOUS_API_KEY") or ""
LLM_CHAT_URL = os.getenv("LLM_CHAT_URL") or "https://inference-api.nousresearch.com/v1/chat/completions"
LLM_MODEL    = os.getenv("LLM_MODEL")    or "deepseek/deepseek-v4-flash"
```

> **Model:** Nous Portal, **DeepSeek V4 Flash** (Leon's usual model). Confirm the
> exact id string at provisioning — Nous Portal may expose it as
> `deepseek/deepseek-v4-flash` or a `:free` tier variant. `LLM_MODEL` is
> env-overridable, so no code change is needed to switch models later.

Call sites are OpenAI-compatible (`Authorization: Bearer`), so all 7 callers —
including `threshold_service.py` (care) — are unchanged. Provision:

```
flyctl secrets set NOUS_API_KEY=… -a floreren-api --remote-only
```

plus local `backend/.env`. Update CLAUDE.md's stale "Claude Haiku" note and
`backend/.env.example`.

> The key is set as a secret / .env value directly — not committed, not pasted
> into source.

## Error handling

| Failure | Behavior |
|---------|----------|
| Nous API down / timeout | Procedural fallback; generation continues |
| AI SVG fails validation | Procedural fallback |
| R2 upload fails | Plant lands in `skipped`; no `icon_key` set; no partial DB row |
| Generation partial | Returns `generated` + `skipped` lists; admin can retry |
| Creation-time matching/placeholder error | Caught; plant still created (icon-less + `icon_requested`) |

## Testing

- **SVG validator** — valid passes; `<script>`, external `href`, wrong viewBox,
  non-whitelisted tag all rejected.
- **Fallback** — mock Nous returning garbage → procedural SVG, `source='procedural'`.
- **Matcher** — extend existing exact/prefix/Dutch coverage for unified lookup.
- **Creation** — extend `backend/tests/test_plants_create.py`: no match →
  `placeholder_<cat>` + `icon_requested=TRUE`; never raises.
- **generate-icons** — mock Nous + mock `Storage` → asserts `generated_icons`
  rows (base+bare) and `plant.icon_key` updates.
- **Catalog merge** — curated + generated unified; `resolveIconUrl` picks R2 url
  for generated, Vercel for curated.
- **llm_config** — Nous defaults + env override.

## One-time migration checklist

- [ ] Alembic migration: `generated_icons` table
- [ ] Add 6 orphan SVGs to `frontend/public/icons/manifest.json`
- [ ] Commit ≈13 `placeholder_<cat>.svg` + manifest entries
- [ ] Fly secret `NOUS_API_KEY`; set/confirm `LLM_*` env
- [ ] Update CLAUDE.md (LLM provider = Nous, not Claude) + `backend/.env.example`

## Risks / open items

- **DeepSeek V4 Flash SVG quality** — first real generation batch should be
  eyeballed; the validator guarantees *valid + on-spec*, not *beautiful*. If
  quality is poor, the procedural fallback still ships and we can tune the
  prompt or switch `LLM_MODEL` to another Nous Portal model (e.g. DeepSeek V4
  Pro) with no code change.
- **Catalog caching / offline** — backend `/icon-catalog` must be cached client
  side so the PWA renders icons offline.
- **Generation cost/latency** — batch generation is admin-triggered and
  bounded by the gap list; acceptable.
