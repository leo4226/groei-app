# BioCLIP identification catalog — expand coverage without losing precision

**Date:** 2026-07-07
**Status:** plan / design. Complements the audit (`2026-07-07-bioclip-audit.md`); this covers the **coverage ceiling** that audit under-weighted.
**One-line:** the recognizable-species set = `plant_species` (~2k). A plant not in it can never be named — BioCLIP force-matches it to the nearest of the 2k and reports ~30% confidence (a confident wrong answer, not "unknown"). We need a much larger vocabulary, scoped and weighted so precision on common plants doesn't collapse.

---

## 1. The problem (why 2k is a hard ceiling, not a soft filter)

Identification is `similarities = text_embeddings @ image_emb` → top-K, where `text_embeddings` is **one row per `plant_species` species** (built by `precompute_embeddings.py`). So:
- The DB **is** the candidate universe. It is not a separate filter over a broader BioCLIP result.
- A photographed plant outside the set returns the nearest *in-set* species at ~0.28–0.30 cosine — **above** the `no_match` floor (0.10) — i.e. surfaced as a confident wrong match.
- BioCLIP the *model* was trained on ~450k taxa; we've narrowed it to ~2k because those are the species with care data. We are under-using the model, and PlantNet "wins" largely because its reference set is far larger (coverage), not only because it's more accurate.

## 2. Audit of the current ~2k (from the sourcing logic; verify with §2.1 SQL)

How the set was built:
- **`import_gbif_species.py`** — genus-driven. Hardcoded lists: ~40 houseplant genera, ~60 outdoor/ornamental genera (default uses first 30), ~25 herb/veg genera. For each, it pulls up to **100 species per genus from GBIF globally** (Tracheophyta, ACCEPTED, rank=SPECIES). **No geographic filter** ("country search unreliable in GBIF API").
- **Curated** `dutch_consumer_plants.py` (~a few hundred), `seed_common_plants.py`, `database/seeds.py`.

Findings:
- ✅ **Genera are logical** for a consumer/gardener: common houseplants, popular ornamentals, herbs/veg — good "common inside" + "common cultivated outside" coverage.
- ❌ **Simultaneously too broad and too narrow for NL:**
  - *Too broad:* within each covered genus, up to 100 **globally-sourced** species — many exotic congeners that never occur in NL (e.g. ~100 worldwide *Sedum*/*Rosa* when a handful occur here). These waste vocabulary slots **and** add precision-eroding look-alikes.
  - *Too narrow:* only ~60 outdoor genera are ornamental picks. The **Dutch wild flora** (~1,500 species across hundreds of genera — weeds, wildflowers, natives) is largely **absent** unless a species happens to sit in a listed ornamental genus. Photograph a wild plant in the garden → not in the set → confident wrong match. (The weed catalog `weed_species` has `native_to_nl`, but it is a *separate* table and is **not** part of the BioCLIP reference set.)
- ✅ **Asset we already have:** `plant_species.native_to_nl` (+ `invasive_nl`) from migration 0010, populated by the ecology pipeline (GBIF `/species/{taxonKey}/distributions`, LLM fallback). So NL-relevance is already a first-class signal — likely **under-populated**, but it exists and can power both the audit and the prior below.

### 2.1 Row-level audit (cheap SQL to run against the DB — no token cost here)
```sql
-- overall size + NL-native coverage
SELECT count(*) AS total,
       count(*) FILTER (WHERE native_to_nl IS TRUE)  AS native_nl,
       count(*) FILTER (WHERE native_to_nl IS FALSE) AS non_native,
       count(*) FILTER (WHERE native_to_nl IS NULL)  AS unknown_region
FROM plant_species;

-- are we over-represented in a few genera? (global-congener bloat)
SELECT genus, count(*) FROM plant_species GROUP BY genus ORDER BY count(*) DESC LIMIT 25;

-- how many have a Dutch common name (proxy for NL relevance / enrichment)
SELECT count(*) FILTER (WHERE common_name_nl IS NOT NULL AND common_name_nl <> latin_name) AS has_nl_name,
       count(*) AS total FROM plant_species;

-- how many have reference images (needed for image-anchoring, §3.C)
SELECT count(*) FILTER (WHERE images_count > 0) AS with_images, count(*) FROM plant_species;
```
Expected signal: a large `unknown_region` + genera with ~100 rows each ⇒ the global-congener bloat + native gap described above.

## 3. Design — bigger vocabulary, precision preserved

Five layers. A–D are the core; E/F are optional/later.

### A. Scope the catalog by *relevance*, not taxonomy-completeness
Build the ID catalog from species **plausible in a Dutch/NW-European context**, not "all 450k":
- **Native/wild flora:** import all vascular plants with GBIF **occurrences in NL** (and optionally BE/DE/NW-Europe) above a small occurrence threshold. This is the ~1,500–2,500 species currently missing. Source: GBIF occurrence facet by `country=NL`, or a standard Dutch flora list (Heukels / NDFF / Verspreidingsatlas).
- **Cultivated set:** keep the current consumer genera (houseplants, ornamentals, herbs/veg) — they won't have wild NL occurrences but are relevant.
- Trim the **global-congener bloat**: for genus imports, prefer species with NL/European occurrences; keep exotic congeners only if they're common houseplants/ornamentals.
- **Target ~5k–15k** relevant species — an order of magnitude more coverage, still focused. Relevance-scoping is the first and biggest precision guard: fewer irrelevant look-alikes than a naive global expansion.

### B. Geographic prior at ranking time (the key precision knob)
Add / populate a per-species region weight (reuse `native_to_nl`; optionally add `nl_occurrence_count` / `eu_occurrence_count` from GBIF). Rank by cosine **plus a mild locality prior**:
```
score = cosine + λ · region_prior(species)      # region_prior high for NL-native/common, ~0 for rare exotics
```
- λ small enough that a *strong* visual match still overrides the prior (a genuine exotic is still recognized), but ties break toward locally-plausible species.
- Effect: we can safely *add* thousands of species for coverage, because the extra ones only win when the image strongly supports them. This is what lets coverage grow without precision loss on the common cases.

### C. Image-anchor the reference set (precision that *scales with* N — biggest accuracy lever)
Today the reference is **text** embeddings (~14% top-1). Precompute a few **image** embeddings per species from the GBIF/iNat photos we already fetch (`import_gbif_species.py` pulls CC0 media), and match **image-to-image** (a much stronger signal than image-to-text). Then:
- Each new species is anchored by real photos, not just a Latin label — so precision doesn't degrade as the catalog grows; it *improves*.
- Composes with the just-shipped **user-confirmed embeddings** (image-to-image already un-gated) — the whole system becomes retrieval over real images, with the user's own garden as the highest-quality anchors.

### D. Decouple the ID catalog from the care catalog (coverage without the care-data burden)
The set was small because every species needed care thresholds. Split them:
- **ID catalog** (large): species + embeddings + region prior. Recognition only.
- **Care catalog** (current ~2k): species with care thresholds.
- On identify, name from the ID catalog. If the species isn't in the care catalog: **lazily auto-enrich on confirm** via the existing `get_or_create_species` / LLM care-threshold path, or fall back to **genus/family-level generic care**. Coverage expands freely; care data accrues only for plants the user actually keeps.

### E. Margin-gated cascade to PlantNet (coverage backstop)
Keep PlantNet for the true long tail. With a bigger, region-scoped, image-anchored catalog BioCLIP handles far more locally; when top-1 margin is thin, auto-cascade to PlantNet instead of showing a confident wrong species.

### F. (Optional, later) hierarchical coarse-to-fine
BioCLIP is taxonomy-trained: match genus/family first, then fine-match within the top families. Shrinks the effective N at the precise stage. Only worth it if flat matching over the expanded catalog measurably confuses.

## 4. Why precision holds (summary for the "don't lose precision" worry)
1. **Relevance-scoped** catalog (native + cultivated), not global → far fewer look-alikes than naive expansion.
2. **Geographic prior** → extra species only win on strong visual evidence; common NL plants favored on ties.
3. **Image anchoring** → per-species signal strengthens; precision improves with N rather than degrading.
4. **Margin gating** → uncertain → PlantNet, not confident-wrong.
5. Optional **hierarchical** matching if needed.

## 5. Phasing (quick wins first)
1. **Image-anchor the existing 2k** — precompute image embeddings from already-fetched GBIF media; measure with `eval_blend.py`. Precision win *now*, zero coverage risk.
2. **Populate/backfill `native_to_nl` + occurrence counts**; add the geographic prior to ranking (tune λ on real photos).
3. **Import NL/NW-Europe wild flora** (occurrence-scoped) → close the native gap; trim global-congener bloat.
4. **Decouple care catalog** + lazy auto-enrich on confirm.
5. **Margin-gated auto-cascade** to PlantNet; (optional) hierarchical matching.
Re-measure top-1/top-5 at each phase (§6). Ship behind the same conservative-by-default posture as the blend.

## 6. Measurement
- Extend the real-photo eval (`eval_blend.py` / a `--catalog` variant) to report top-1/top-5 for: current 2k text-only → +image-anchored → +region prior → +expanded catalog. Same photos, one table.
- Track a **false-confident rate**: of out-of-catalog plants, how many return a high/medium confidence (should drop sharply once margin-gating + prior are in).
- Precision guardrail: expanded catalog must not lower top-1 on the current common-plant set.

## 7. Open questions / risks
- **λ (prior weight)** and the occurrence threshold need calibration on real photos — start conservative.
- **`native_to_nl` completeness** — likely partial; backfill via the ecology pipeline before relying on the prior.
- **Storage/compute** — image embeddings for ~10k species × a few refs is still small (tens of MB); GPU precompute is a one-off batch.
- **Licensing** — reuse only CC0/CC-BY GBIF/iNat media (importer already filters licenses).
- **Care fallback quality** — genus/family generic care must be clearly marked as generic until enriched.

## 8. References
- `backend/scripts/import_gbif_species.py` — current genus-driven sourcing.
- `backend/scripts/precompute_embeddings.py` — text-only reference build (the ceiling).
- `backend/services/ecology_enrichment.py`, `alembic/versions/0010_add_species_ecology.py` — `native_to_nl` / `invasive_nl` source (the prior's raw material).
- `backend/routers/plant_id.py` — `_blend_scores` (image anchoring already un-gated), `_classify_confidence` (margin gating).
- `docs/plans/2026-07-07-bioclip-audit.md` — sister audit (accuracy/pipeline/thresholds).
