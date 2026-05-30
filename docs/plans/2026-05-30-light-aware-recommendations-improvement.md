# Light-Aware Recommendations — Improvement Plan

**Date:** 2026-05-30
**Status:** Steps B & C implemented (2026-05-30). Step A (backfill) deferred — gated on a prod measurement. Follow-up: `getSunFit`/`PLANT_SUN_PROFILES` retune.
**Relates to:** `docs/plans/2026-05-29-plant-recommendations-v2.md` (the system this improves)

## Implementation status (2026-05-30)

- **Done — Step C (light model + scoring):** `backend/services/plant_suggestions.py` now uses a single `fit_grade(sun_preference, bucket)` returning `perfect | acceptable | marginal | tolerated | None`, replacing `_COMPATIBLE`/`_PERFECT`/`compatible_sun_preferences`/`sun_fit_label`. `_score_candidate` is multiplicative: `ecology × LIGHT_MULT[fit] + (perfect ? 2 : 0)`, with `LIGHT_MULT = {perfect 1.00, acceptable 0.80, tolerated 0.65, marginal 0.55}` (chosen as the starting point; tune after a season). Tests rewritten in `tests/test_plant_suggestions.py` (36 pass) via TDD.
- **Done — Step B (threshold unification):** `GrowHereSheet.tsx` now derives the spot bucket from `bucketFor(sunHours, skyOpenness)` (lightQuality.ts, 4h/2h/SVF) and labels it with `bucketLabel` — the 6h/3h `sunCategoryLabel`/`sunReqId` helpers are gone. The persisted `sun_requirement` on add now comes from the bucket (`BUCKET_TO_PREF`), and the stale `useEffect` dependency (`skyOpenness`) is fixed. Badges render all four fit grades (`sunFitMarginal`/`sunFitTolerated` i18n keys added to nl/en/translations). `tsc --noEmit` clean.
- **Decision applied:** `marginal` pairings are *included* (not excluded) so shady gardens never get empty lists; the multiplier ranks them last.
- **Step A (backfill) — code ready, BLOCKED on billing:** Measured prod 2026-05-30: **1741 of 1743 enriched species have NULL `sun_preference`** (only 2 are set). So in prod the light model currently runs almost entirely on the `tolerated` lane — the backfill is *essential*, not optional, for spots to actually differentiate. Added a surgical `--only-missing-sun` mode to `scripts/enrich_species_ecology.py` that asks the LLM for sun_preference only and writes just that one column (no GBIF re-derivation, idempotent, dry-run verified). **However a real run returns DeepSeek `402 Payment Required` — the API account is out of credit**, so 0 rows could be filled (prod untouched). This also means live AI suggestions + ongoing ecology enrichment are down in prod. **Action for Leon: top up the DeepSeek account, then run** `cd backend && python scripts/enrich_species_ecology.py --only-missing-sun` (~1741 rows, ~$0.10, re-runnable).
- **Follow-up (deliberately not done):** the secondary "already in garden" / local-dataset sections still use `getSunFit`/`PLANT_SUN_PROFILES` (6h/3h ±1). These don't drive the main DB recommendations. `PLANT_SUN_PROFILES` is imported by **8 files** including `MapView`, `PlantMarker`, `ObjectShape`, `PlantDetail`, `SunControls`, `PlantQuickSheet` — retuning its thresholds shifts suitability colours/labels across the whole map UI, so it needs its own pass with visual verification in the running app rather than a blind edit.

## Why

The v2 recommender (`backend/services/plant_suggestions.py`) is sound in its plumbing —
each garden cell's real `sunHours` and `skyOpenness` flow through to `bucket_for()` and a
per-bucket compatibility filter. But an investigation on 2026-05-30 found that **light
influences the result far less than it appears**, so two spots with very different sun
profiles tend to surface nearly the same ranked list. Four root causes, in priority order:

| # | Problem | Effect |
|---|---------|--------|
| 1 | Light is a weak **ranking** signal (`+2` of a score dominated by garden-level terms) | Different spots return near-identical orderings; light only gates, never sorts |
| 2 | `NULL sun_preference` is treated as `"any"` and passes every bucket; the backfill script **skips already-enriched rows** | If the catalog isn't fully backfilled, most plants appear in every spot → differentiation collapses |
| 3 | **Three** disagreeing sun-threshold definitions (4h/2h, 6h/3h, 6h/3h±1) | The sheet header mislabels the very spot it recommends for (e.g. "Shade" while suggesting full-sun plants) |
| 4 | Asymmetric compatibility table — full sun **excludes** partial-sun plants but part sun **includes** full-sun plants | Sunniest, easiest spots get the *narrowest* candidate pool |

The good news: problems 1, 3, and 4 can be fixed together by one unified light model.
Problem 2 is a data/ops task that is independent and should go first.

---

## The three sources of truth that disagree (problem 3)

| Location | Thresholds | Used for |
|---|---|---|
| `frontend/src/utils/lightQuality.ts` → `bucketFor` | **4h** full, **2h** part, SVF **0.5** | Heatmap colouring, light-quality layer |
| `backend/services/plant_suggestions.py` → `bucket_for` | **4h** / **2h** / **0.5** | Recommendation filtering + fit (✅ matches lightQuality) |
| `frontend/.../GrowHereSheet.tsx` → `sunCategoryLabel` / `sunReqId` | **6h** full, **3h** partial | The sheet **header label** + the `sun_requirement` saved when adding a plant |
| `frontend/src/utils/plantSunRequirements.ts` → `PLANT_SUN_PROFILES` / `getSunFit` | **6h**/**3h** with ±1h tolerance | "Already in garden" + local-dataset matching sections |

`lightQuality.ts` and the backend already agree (4h/2h). The two **6h/3h** definitions are
the outliers. Concrete failure in the 2–4 h band:

- A **2.5 h** spot → header reads **"🌿 Shade"**, but `bucket_for` classifies it as `part`,
  recommends full- and partial-sun plants, and badges them "Ideal light."
- A **4.5 h** spot → header reads **"⛅ Partial"**, but `bucket_for` says `full`.

And because `sunReqId` (the 6/3 version) is also the fallback `sun_requirement` persisted on
add (`GrowHereSheet.tsx:248`), a full-sun plant dropped at a 2.5 h spot is saved as `shade`.

**Fix:** make `lightQuality.ts` (frontend) + `bucket_for` (backend) the single source of
truth and delete the 6/3 logic. Details in Step 3 below.

---

## Proposed core: one unified light model

Replace the binary `perfect / acceptable` fit + the asymmetric compatibility table with a
single **light-level ladder** shared by filtering and ranking. This one change addresses
problems 1, 3, and 4.

### 1. Spot light level (already computed, just name it)

```
deep_shade = 0   bright_shade = 1   part = 2   full = 3
```

`bucket_for(sun_hours, svf)` already produces these four buckets — map them to 0–3.

### 2. Plant × spot fit grade (replaces `_COMPATIBLE` + `_PERFECT`)

| spot ↓ \ pref → | `full_sun` | `partial_sun` | `shade` | `any` / `NULL` |
|---|---|---|---|---|
| **full** (3) | perfect | acceptable | **exclude** (scorch) | tolerated |
| **part** (2) | acceptable | perfect | marginal | tolerated |
| **bright_shade** (1) | marginal | acceptable | perfect | tolerated |
| **deep_shade** (0) | **exclude** (won't flower) | marginal | perfect | tolerated |

Key differences from today:
- **Problem 4 fixed:** a full-sun spot now *accepts* partial-sun plants (graded
  `acceptable`) instead of excluding them, and a full-sun plant in bright shade becomes
  `marginal` instead of excluded. Only genuinely doomed pairings (shade plant in full sun,
  full-sun plant in deep shade) are still excluded — which also avoids empty result sets in
  shady gardens.
- **`any` / `NULL` is its own `tolerated` lane:** it still passes everywhere (graceful
  degradation for un-backfilled rows) but always ranks *below* a plant whose *known*
  preference matches the spot. Today `any` can tie `perfect`. This makes the recommender
  prefer plants we actually know fit, which is exactly the right behaviour while problem 2
  is being resolved.

### 3. Fit → ranking weight (problem 1)

Today the fit only adds a flat `+2`. Instead, multiply the ecology subscore by a
light-suitability factor, with a floor so good gap-fillers in imperfect light aren't buried:

```python
LIGHT_MULT = {
    "perfect":    1.00,
    "acceptable": 0.80,
    "marginal":   0.55,
    "tolerated":  0.65,   # known 'any' / unknown NULL — between acceptable and marginal
}

def _score_candidate(gap_months_covered, pollinator_value, is_native, fit, flowers_now):
    ecology = (
        len(gap_months_covered) * 10
        + (pollinator_value or 0) * 5
        + (3 if is_native is True else 0)
        + (1 if flowers_now else 0)
    )
    return ecology * LIGHT_MULT[fit] + (2 if fit == "perfect" else 0)
```

The small additive `+2` for `perfect` is a pure tiebreaker so that when two plants have
identical ecology value, the one that *thrives* in this exact light wins.

#### Worked example — why this differentiates spots

Garden gap = March; candidate pool includes:
- **Lavandula** (`full_sun`, pollinator 3, non-native, blooms Jun–Aug → no gap cover)
  → ecology = `0 + 15 + 0 = 15`
- **Pulmonaria** (`shade`, pollinator 2, native, blooms Mar → fills gap)
  → ecology = `10 + 10 + 3 = 23`

| Spot | Lavender fit → score | Pulmonaria fit → score | Top pick |
|---|---|---|---|
| **Full sun (3)** | perfect → 15×1.0 + 2 = **17** | exclude → — | **Lavender** |
| **Deep shade (0)** | exclude → — | perfect → 23×1.0 + 2 = **25** | **Pulmonaria** |
| **Part sun (2)** | acceptable → 15×0.8 = **12** | marginal → 23×0.55 = **12.7** | **Pulmonaria** (barely) |

Today both plants pass most buckets and Pulmonaria's higher ecology score wins *everywhere*,
so the sunny border and the shady corner look almost the same. Under the new model the
orderings genuinely diverge by light while ecology still drives the close calls.

---

## Problem 2: backfill `sun_preference` (do this first — it's independent)

### Measure first
Run against Neon (prod) before deciding effort:

```sql
SELECT COALESCE(sun_preference, 'NULL') AS pref, COUNT(*)
FROM plant_species
WHERE ecology_enriched_at IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;
```

If `NULL` is a small slice, the new `tolerated` lane (above) already handles it gracefully
and a backfill is low-urgency. If `NULL` dominates, backfill is the highest-leverage fix in
this whole doc — without it, the light model has little real data to act on.

### The gotcha
`scripts/enrich_species_ecology.py` selects `WHERE ecology_enriched_at IS NULL`. Species
enriched *before* the `sun_preference` column existed have a non-null `ecology_enriched_at`
and a null `sun_preference`, so **a normal run skips exactly the rows we need to fix.**

### Fix options
- **(Recommended) Add `--only-missing-sun`** that selects
  `WHERE sun_preference IS NULL AND ecology_enriched_at IS NOT NULL`, resets
  `ecology_enriched_at = NULL` for each, then calls `ensure_ecology()` (the existing
  `--only-failed` branch already demonstrates the reset-then-enrich pattern). One-time cost
  ≈ \$0.10 for ~1500 species, ~6 min.
- **Cheap deterministic seed (optional):** before the LLM pass, seed `sun_preference` from
  `LOCAL_PLANTS[].sunRequirement` (frontend dataset) by latin-name match — zero cost for the
  species we already curated. LLM only fills the remainder.

---

## Implementation steps

Suggested order: **2 → 3 → 1/4** (measure & backfill data, unify thresholds, then the model).

### Step A — Backfill (problem 2)
1. Run the measurement query on Neon.
2. Add `--only-missing-sun` to `scripts/enrich_species_ecology.py`.
3. Run it against prod; spot-check ~10 rows for sane values.

### Step B — Unify thresholds (problem 3)
1. In `GrowHereSheet.tsx`, delete `sunCategoryLabel` and `sunReqId`; replace with
   `bucketFor(sunHours, skyOpenness)` + `bucketLabel(bucket, t)` from `lightQuality.ts`.
2. Derive the persisted `sun_requirement` on add from the spot's bucket via an explicit
   `bucket → preference` map (`full→full_sun`, `part→partial_sun`,
   `bright_shade/deep_shade→shade`) instead of `sunReqId`.
3. Re-express `getSunFit` / `PLANT_SUN_PROFILES` (used by the "already in garden" and
   local-dataset sections) in the 4-bucket vocabulary so they agree with the recommender,
   or at minimum retune their hour ranges to 4h/2h. Decide: keep the ±1h tolerance idea but
   anchored on the unified thresholds.
4. Fix the stale-dep bug: `GrowHereSheet.tsx:226-234` calls with `tappedCell.skyOpenness`
   but its dependency array omits it — add `tappedCell.skyOpenness`.

### Step C — Light model (problems 1 + 4)
1. Replace `_COMPATIBLE` / `_PERFECT` / `sun_fit_label` with the fit-grade table and a
   `fit_grade(sun_preference, bucket) -> "perfect"|"acceptable"|"marginal"|"tolerated"|None`
   (`None` = exclude).
2. In `recommend_for_spot`, skip candidates whose grade is `None`; store the grade.
3. Rework `_score_candidate` to the multiplicative form above.
4. Update `PlantRecommendation.sun_fit` to carry the 4-level grade. The frontend
   `EcologyBadges` (`GrowHereSheet.tsx:103`) currently only distinguishes `perfect` vs else —
   extend it to show `acceptable` / `marginal` distinctly (and add i18n keys).
5. Tests: `backend/tests/test_plant_suggestions.py` — replace the `compatible_sun_preferences`
   / `sun_fit_label` cases with `fit_grade` cases (perfect/acceptable/marginal/tolerated/
   exclude per the table) and add scoring cases proving a perfect-light plant outranks the
   same plant in marginal light, and that a strong gap-filler still beats a weak
   perfect-light plant.

---

## Decisions for Leon

1. **`marginal` inclusion vs exclusion.** I propose *including* full-sun plants in bright
   shade (and partial-sun in deep shade) as `marginal` rather than excluding them, to avoid
   empty lists in shady gardens. Prefer stricter exclusion instead?
2. **Multiplier values** (`0.80 / 0.65 / 0.55`) are a starting point. Tune after a season —
   they're the knob that controls how aggressively light reorders the list vs ecology.
3. **Backfill urgency** depends on the NULL ratio from Step A's query — worth running that
   before committing effort to Step C.

## Out of scope
- Tier 2 LLM reasoning enrichment (already a known follow-up in the v2 plan).
- Per-map `PX_PER_M` / any heatmap geometry changes.
- Soil, moisture, or wind factors — light + biodiversity only, as today.
