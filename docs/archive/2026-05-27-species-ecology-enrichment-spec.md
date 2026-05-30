# Species ecology enrichment — implementation spec

**Date:** 2026-05-27
**Status:** Spec, awaiting review and implementation.
**Parent:** `2026-05-27-public-gardens-and-biodiversity.md`

## Goal

Give every `plant_species` row a small ecology profile (native-to-NL,
flowering months, pollinator value, host-plant links, invasive flag,
data provenance) so the plant-detail page can show ecology facts.

No score is computed in this spec. No `growHere` change. No public
gardens. Just: data in, card out.

## Scope

### In

- Add ecology columns to `plant_species` (or a parallel
  `species_ecology` table — see "Schema decision" below).
- Implement an enrichment pipeline that queries, in order, GBIF →
  iNaturalist → Wikidata → LLM, taking the first non-null result
  per field.
- Lazy backfill: when a species detail is fetched and ecology is
  missing, enrich on-demand (async, non-blocking for the response).
- New backend endpoint `GET /species/{id}/ecology` returning the
  ecology profile.
- Plant-detail page (frontend) shows an ecology card with the facts
  and a small provenance indicator per fact.
- Backfill script: `scripts/enrich_species_ecology.py` to walk the
  whole `plant_species` table in batches (rate-limited).

### Out

- Per-garden biodiversity score.
- `growHere` modifications.
- Post-identify ecology nudge.
- Public-garden atlas.
- Similar-alternative recommendation engine.
- EXIF-stripping audit (separate; can run in parallel).

## Schema decision

**Add columns to `plant_species`.** Reasons:

- `plant_species` is already wide; six more nullable columns are not a
  bloat problem.
- These fields are 1:1 with species — no list/relational
  characteristics to justify a side table.
- Existing `_enrich_species_if_missing` and `upsert_species_from_gbif`
  already touch `plant_species`; keeping ecology there avoids a
  second join everywhere ecology is read.

If `host_plant_for` (an array of species references) grows beyond
a flat enum-like list, revisit and split it into a join table.

### Alembic migration

```python
# alembic/versions/0006_add_species_ecology.py
op.add_column('plant_species', sa.Column('is_native_nl', sa.Boolean, nullable=True))
op.add_column('plant_species', sa.Column('invasive_nl', sa.Boolean, nullable=True))
op.add_column('plant_species', sa.Column('flowering_months', sa.JSON, nullable=True))  # list[int] 1-12
op.add_column('plant_species', sa.Column('pollinator_value', sa.SmallInteger, nullable=True))  # 0-3
op.add_column('plant_species', sa.Column('host_plant_for', sa.JSON, nullable=True))  # list[str] taxon names
op.add_column('plant_species', sa.Column('ecology_data_source', sa.String(32), nullable=True))
op.add_column('plant_species', sa.Column('ecology_enriched_at', sa.DateTime, nullable=True))
```

All nullable so existing rows continue to work. SQLite-dev uses
`JSON` as TEXT, which is fine for the dict-form storage.

Mirror the change into the manual migration in `backend/migrations/`
to keep the dev SQLite path in sync (same pattern as `0005_add_plantnet_quota`).

## Enrichment service

New module: `backend/services/ecology_enrichment.py`.

### Data sources — what each provides

| Source | Provides | Notes |
|---|---|---|
| GBIF `/species/{taxonKey}/distributions` | `is_native_nl`, `invasive_nl` | Filter to `country=NL`. `establishmentMeans` ∈ {NATIVE, INTRODUCED, INVASIVE, ...}. |
| iNaturalist `/taxa/{id}` | Cross-check `is_native_nl` | Uses `listed_taxa` for NL. Lower priority than GBIF for native flag (smaller dataset). |
| Wikidata SPARQL | `host_plant_for`, optional pollinator hints | `?species wdt:P2975 ?host` for host-of. Pollinator info is sparse. |
| LLM (DeepSeek via existing `species_service` plumbing) | `flowering_months`, `pollinator_value` | Final fallback. Only fields not filled by APIs. |

### Function shape

```python
# services/ecology_enrichment.py

from dataclasses import dataclass

@dataclass
class EcologyProfile:
    is_native_nl: bool | None
    invasive_nl: bool | None
    flowering_months: list[int] | None
    pollinator_value: int | None        # 0..3
    host_plant_for: list[str] | None
    data_source: str                    # 'gbif' / 'inat' / 'wikidata' / 'llm' / 'mixed'

async def enrich(
    latin_name: str,
    gbif_taxon_key: int | None,
) -> EcologyProfile:
    """Run the source chain. First non-null value per field wins.
    Track which sources contributed for `data_source`."""
```

Internal helpers per source:

```python
async def _from_gbif(taxon_key: int) -> dict   # native/invasive
async def _from_inat(latin_name: str) -> dict
async def _from_wikidata(latin_name: str) -> dict
async def _from_llm(latin_name: str, missing_fields: list[str]) -> dict
```

Each returns a partial dict. `enrich()` merges them, tracking which
fields came from which source. `data_source` = single source if all
fields came from it, else `'mixed'`. Always reflects the *highest-
authority* source actually used.

### Rate-limiting and caching

- GBIF: 8 req/s already established in `import_gbif_species.py`
  (`_MIN_INTERVAL = 0.125`). Reuse pattern.
- iNat: 1 req/s per their guidelines (`time.sleep(1)` between calls
  in the batch script; live requests are user-paced, so no limit).
- Wikidata SPARQL: ~5 queries/min recommended. Cache via in-memory
  TTL (1 hour) is enough for short bursts.
- LLM: existing plumbing, no extra limiter.

All results are persisted to `plant_species` so successive lookups
are free.

### Failure handling

Each source is wrapped in try/except. Failures log a warning and
return an empty dict — the next source takes over. If *all* sources
fail, write the row with all-null ecology fields and
`ecology_data_source = 'failed'`, `ecology_enriched_at = now()`. A
retry path (re-run the script with `--only-failed`) can pick them
up later.

## Lazy backfill hook

The plant-detail endpoint and the post-identify commit flow both
read species rows. Add a `_ensure_ecology(db, species_id)` step that
checks `ecology_enriched_at IS NULL` and, if so, enqueues an
enrichment.

Two strategies; spec picks the simpler:

- **Inline (chosen):** await enrichment before responding. Adds
  ~1-3 seconds to the *first* request per species — acceptable, and
  the data is then permanent.
- *Background task (rejected for now):* fire-and-forget with
  FastAPI `BackgroundTasks`. Means the first user gets a card with
  no ecology data. Worse UX for marginal latency saving. Revisit if
  enrichment grows past ~5 seconds per species.

Hook points:

- `GET /species/{species_id}` — call `_ensure_ecology` before
  returning.
- `POST /plants/identify/commit` (existing `_enrich_species_if_missing`
  flow) — extend to also call ecology enrichment.

## API surface

### New endpoint

```
GET /species/{species_id}/ecology
→ EcologyOut
```

```python
class EcologyOut(BaseModel):
    is_native_nl: bool | None
    invasive_nl: bool | None
    flowering_months: list[int] | None
    pollinator_value: int | None         # 0..3
    host_plant_for: list[str] | None
    data_source: str
    enriched_at: datetime
```

Triggers `_ensure_ecology` on demand. Returns 404 only if species
doesn't exist.

### Backfill script

```
backend/scripts/enrich_species_ecology.py [--only-failed] [--limit N]
```

Walks `plant_species` ordered by `id`, rate-limited (GBIF 8/s),
calls `enrich()` per row, writes back. Idempotent: skips rows with
`ecology_enriched_at IS NOT NULL` unless `--only-failed`.

## Frontend changes

### Type (`frontend/src/types/index.ts`)

```ts
export type EcologyOut = {
  is_native_nl: boolean | null
  invasive_nl: boolean | null
  flowering_months: number[] | null    // 1-12
  pollinator_value: number | null      // 0-3
  host_plant_for: string[] | null
  data_source: 'gbif' | 'inat' | 'wikidata' | 'llm' | 'mixed' | 'failed'
  enriched_at: string                  // ISO
}
```

### API client (`frontend/src/api/client.ts`)

```ts
export const species = {
  ...,
  ecology: (id: number) => api<EcologyOut>('GET', `/species/${id}/ecology`),
}
```

### Plant-detail card

New component `frontend/src/components/plants/EcologyCard.tsx`.
Mounted in `PlantDetail.tsx` below the existing care-thresholds
section.

Layout (text-only, no chart yet):

```
┌─ Ecologie ──────────────────────────────────┐
│ 🇳🇱 Inheems in Nederland                    │
│ 🐝 Bestuiverswaarde: hoog (3/3)             │
│ 🌸 Bloeit mei – aug                         │
│ 🦋 Waardplant voor Atalanta, Dagpauwoog     │
│                                             │
│ Bron: GBIF · LLM (deels) · bijgewerkt 27 mei │
└─────────────────────────────────────────────┘
```

- Each fact line is rendered only if the field is non-null.
- The `data_source` line is small grey text. If it includes 'llm',
  add a question-mark icon with tooltip "LLM-gegenereerd, niet
  geverifieerd".
- `data_source = 'failed'` → render the card with a single line
  "Ecologie-data kon niet worden opgehaald. Probeer later opnieuw."

i18n: add `t.ecology.*` keys for native/non-native, pollinator
levels, host-plant prefix, source labels, failed state. EN
mirrors NL.

## Tests

### Backend

`backend/tests/test_ecology_enrichment.py`:

- `_from_gbif` parses a recorded GBIF distributions response into the
  right `is_native_nl` / `invasive_nl` flags. Fixture:
  `tests/fixtures/gbif_distributions_taraxacum.json`.
- `_from_wikidata` parses a SPARQL response into `host_plant_for`.
- `enrich()` with GBIF mocked to return data and LLM mocked to fill
  only the missing fields: `data_source = 'mixed'`.
- `enrich()` with all sources mocked to fail: returns empty profile,
  `data_source = 'failed'`.
- Rate-limit guard: two back-to-back GBIF calls in tests don't
  actually sleep (patch `_MIN_INTERVAL = 0`).

`backend/tests/test_species_endpoint.py` (extend existing if
present):

- `GET /species/{id}/ecology` for a row with `ecology_enriched_at
  IS NULL` triggers enrichment then returns the result.
- Subsequent call returns cached row without re-enriching (patch
  `enrich` and assert it's called once).

### Frontend

`EcologyCard.test.tsx`:

- All-null profile → renders nothing (or the "data niet opgehaald"
  variant for `'failed'`).
- Full profile → renders all four fact lines.
- `data_source` with 'llm' shows the unverified tooltip.

## Verification (manual)

After implementation:

1. `alembic upgrade head` on dev DB; verify columns added.
2. Reset ecology for one known species (`UPDATE plant_species SET
   ecology_enriched_at = NULL WHERE id = X`).
3. Open `/plants/<plant>` in the dev app; observe enrichment delay
   on first load (~1–3s), card appears with data.
4. Reload; card appears instantly.
5. Run `python scripts/enrich_species_ecology.py --limit 10` to
   backfill in batch; observe GBIF rate-limiting in logs.
6. Spot-check 3 species manually against the GBIF web UI to confirm
   the native flag matches.

## Risks specific to this spec

- **GBIF taxon-key gaps.** Some `plant_species` rows lack
  `gbif_taxon_key`. For those, GBIF is skipped and the chain
  starts at iNat. Acceptable degradation, but cards for those
  species will lean more on LLM. Worth a one-shot script later to
  backfill `gbif_taxon_key` via `GBIF /species/match?name=...`.
- **Wikidata SPARQL flakiness.** The endpoint occasionally
  throttles or 504s. Treat as a non-fatal source — failure just
  means missing host-plant data.
- **LLM hallucinating flowering months.** "May–August" for plants
  that flower year-round (tropical houseplants) is a common LLM
  failure. The card honestly shows whatever the LLM gave; the
  `'llm'` provenance is the user's signal to discount it.

## Definition of done

- Migration shipped and applied to Neon (production) and SQLite
  (dev).
- `services/ecology_enrichment.py` covered by unit tests.
- `GET /species/{id}/ecology` returns data for at least one
  enriched species in a manual test.
- Plant-detail card shows the ecology section for Leon's known
  plants (≥ 5 species).
- Backfill script runs to completion on Leon's local DB without
  errors.
- No `growHere`, no atlas, no scoring touched.
