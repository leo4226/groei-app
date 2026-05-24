# BioCLIP confidence calibration — design

**Status:** brainstorming complete, awaiting user review before plan.
**Date:** 2026-05-24
**Author:** brainstormed with Claude in `/floreren` session.

## Problem

The BioCLIP worker returns raw cosine similarities (typically 0.15–0.35 across 6000+ species) as confidence scores. In practice these scores are hard to reason about: the right plant can be returned with a 0.18 ("looks unsure"), the wrong plant with a 0.30 ("looks sure"), and the top-5 often sit within a thin margin of each other. Today the only thresholds are `_MIN_CONFIDENCE_FOR_RESULT = 0.10` and `_LOW_CONFIDENCE_UPPER = 0.30` in `backend/routers/plant_id.py:35-36`, and the front-end UX collapses everything to a single `low_confidence` boolean.

Result: users (and Leon, evaluating quality) cannot tell *meaningful* matches apart from *coincidental* matches.

## Goal

Make BioCLIP's output reasonable to interpret without changing the model, and build the eval scaffolding that lets any *future* ML work be measured rather than guessed at.

Explicit non-goals:
- No model change. BioCLIP stays.
- No prompt change. `precompute_embeddings.py` is untouched.
- No new dependencies, no DB migration, no GPU-box code change. Only the backend router + frontend get small modifications; one new script for the eval set, one for the eval run.

## Insight driving the design

"Scores are hard to reason about" is primarily a **UX / calibration problem**, not an ML problem. With ~6000 candidates, BioCLIP cosines naturally cluster narrowly — that is the model's nature, not its weakness. Transforming the raw score into a human-readable label (using both the absolute top-1 score and the *margin* to top-2) recovers most of the interpretability for a small fraction of the effort of a model upgrade.

If, after this work, eval data still shows the model genuinely missing right answers (not just under-scoring them), prompt-improvement or model-upgrade work becomes the next, measurable step.

## Components

### 1. Eval set — GBIF-sourced

**Format:** `backend/data/eval/<species_id>/gbif_<occurrence_id>.jpg`

- Folder name uses `species_id` (canonical, no special-char issues unlike Latin names).
- Filename preserves the GBIF occurrence ID for attribution and debugging.
- `backend/data/` is already in `.gitignore`, so photos do not bloat the repo.

**Sampling strategy:** start with **100 random species × ~3 images each ≈ 300 photos**. Random sampling avoids over-representing common species. Stratification (indoor vs. outdoor, by family) can be added later if the score distribution differs meaningfully between groups.

**Circularity caveat (must be surfaced in eval output):** BioCLIP's training set probably includes a lot of GBIF imagery, so a GBIF-derived eval set is *partially testing the model against its own training data*. Headline accuracy will look better than real users will experience. The eval is still useful for calibrating thresholds (the score *distribution* is informative regardless of training overlap) but the eval script will print this caveat at the top of every report so the number is read with the right grain of salt.

### 2. Two scripts

#### 2a. `backend/scripts/fetch_eval_set.py` (new)

One-shot, idempotent runner that populates `backend/data/eval/`.

1. Reads N random species from `plant_species` (default 100, configurable via CLI flag `--n-species`).
2. For each species, calls the GBIF Occurrence API:
   - Endpoint: `https://api.gbif.org/v1/occurrence/search`
   - Filtered by `mediaType=StillImage` and `scientificName={latin_name}` (or `taxonKey` if available).
   - Limit to first ~10 records, pick the top 3 with image URLs that load.
3. Downloads those images, saves under `backend/data/eval/<species_id>/`.
4. **Idempotent:** if the folder already has ≥3 photos, the species is skipped. Re-running with a higher `--n-species` adds new species without re-downloading existing ones.
5. Prints a summary: species fetched, species skipped (already populated), species with no GBIF images, total photos.
6. GBIF requires no auth. Rate limit: ~1 req/sec via `time.sleep(1)` between requests to stay courteous.

#### 2b. `backend/scripts/eval_bioclip.py` (new)

Walks `backend/data/eval/`, runs each photo through the BioCLIP worker, compares the returned top-K against the known correct `species_id` (from the folder name), prints a report:

```
BioCLIP eval report — 2026-05-24
Worker: https://bioclip.<tunnel>.cfargotunnel.com  (or local)
Photos: 287   Species: 98

⚠  Eval source is GBIF — likely overlap with BioCLIP training data.
   Real-user accuracy will be lower than these numbers.

Top-1 accuracy: 182/287  (63%)
Top-5 accuracy: 244/287  (85%)

Score distribution when CORRECT (top-1):
  mean=0.281   median=0.273   min=0.193   max=0.412
Score distribution when WRONG (top-1):
  mean=0.241   median=0.232   min=0.162   max=0.358

Margin (top1 − top2) when CORRECT:  mean=0.043   p25=0.018  p75=0.061
Margin (top1 − top2) when WRONG:    mean=0.018   p25=0.005  p75=0.027

Suggested threshold values (based on this run):
  high     :  top1 ≥ 0.30  AND  margin ≥ 0.04
  medium   :  top1 ≥ 0.25
  low      :  top1 ≥ 0.10
  no_match :  top1 < 0.10
```

The "suggested thresholds" line is computed from the distributions (e.g., a margin in the 75th percentile of CORRECT but above the 75th of WRONG separates them well). Initial values are educated guesses; the script's job is to refine them from data.

The script supports a `--worker-url` flag (defaults to `BIOCLIP_WORKER_URL` env var) so it can run against the remote tunnel or a local worker.

### 3. Calibration layer — `backend/routers/plant_id.py`

Replace today's `low_confidence: bool` field with a new `confidence: Literal["high", "medium", "low", "no_match"]` field on `IdentifyResponse`, computed from `top1` and `top1 − top2`:

```python
def _classify_confidence(top1: float, top2: float | None) -> str:
    if top1 < _MIN_CONFIDENCE_FOR_RESULT:
        return "no_match"
    margin = top1 - (top2 or 0)
    if top1 >= 0.30 and margin >= 0.04:
        return "high"
    if top1 >= 0.25:
        return "medium"
    return "low"
```

Threshold constants live at module top (alongside `_MIN_CONFIDENCE_FOR_RESULT`) so they can be tuned without touching the function. Initial values come from the eval script's output (we will run the eval before deciding the first deployed values).

The existing `low_confidence: bool` field stays as a deprecated alias (`= confidence != "high"`) so the frontend does not have to change in lockstep with the backend deploy.

`no_match` short-circuits to `IdentifyResponse(candidates=[], confidence="no_match", low_confidence=False, source="bioclip")` — same shape as today's empty-candidate response.

### 4. Frontend surface — minimal UI changes

Today the identify page renders candidates with a confidence number. The minimal-change UX:

| `confidence` | Render |
|---|---|
| `high` | Render top result as today, no extra label. Show top 3 candidates. |
| `medium` | Small subtitle on the top result: *"Redelijk zeker"* |
| `low` | Prominent banner above the candidate list: *"Niet zeker — kies handmatig of probeer een betere foto"* |
| `no_match` | Don't render the candidate list at all. Show: *"Geen herkenning. Probeer een andere foto (kies het blad of de bloem dichterbij)."* |

No new screens, no new endpoints, no new components beyond the banner/subtitle. The exact Dutch copy can be refined during implementation by reading similar microcopy in the existing identify flow.

### 5. Where things live

| Piece | Path | Why |
|---|---|---|
| Eval photos | `backend/data/eval/<species_id>/` (gitignored) | Local-only data, varies per environment |
| GBIF downloader | `backend/scripts/fetch_eval_set.py` | One-shot, like `precompute_embeddings.py` |
| Eval runner | `backend/scripts/eval_bioclip.py` | One-shot |
| Calibration logic | `backend/routers/plant_id.py` | Tunable via Fly deploy; single source for any future client (mobile) |
| Label rendering | `frontend/src/.../IdentifyPlant.tsx` (or equivalent — confirm in implementation) | UX text, can be tweaked without backend deploy |

## What this design explicitly does NOT do

- No model change (BioCLIP stays).
- No prompt change (precompute embeddings stay).
- No new Python dependencies on either the backend or the worker.
- No GPU-box code change. The worker is read-only from this work's perspective.
- No DB schema change.
- No auth or rate limiting on the worker (separate finding from the bioclip review, separate ticket).

## Order of operations

1. Write `fetch_eval_set.py`, run it once → populate `backend/data/eval/` with ~300 photos.
2. Write `eval_bioclip.py`, run it once → get the score distribution + suggested thresholds.
3. Implement the `_classify_confidence` calibration layer with thresholds informed by the eval output.
4. Update the frontend identify UI to consume the new `confidence` field.
5. Deploy backend (Fly) + frontend (Vercel push).
6. Re-run `eval_bioclip.py` periodically (when species are added, when BioCLIP is upgraded) to verify thresholds still hold.

## Open question deferred to implementation

The exact Dutch microcopy in §4. We will read existing identify-flow copy at implementation time and match its tone (formal/informal, length, terminology).

## References

- `backend/bioclip_worker.py` — current inference worker.
- `backend/services/bioclip_id.py` — local fallback of the same logic.
- `backend/routers/plant_id.py` — caller, current calibration code at lines 35–36, 206–207.
- `backend/scripts/precompute_embeddings.py` — pattern that `fetch_eval_set.py` and `eval_bioclip.py` will follow.
- GBIF Occurrence API: <https://www.gbif.org/developer/occurrence>
