# BioCLIP image-match floor — interim calibration report (2026-08-06)

## What was validated

The un-gated user-confirmed retrieval (audit #442 §3.1, shipped in #464) is only useful
if its `_IMAGE_MATCH_MIN` floor actually fires. The floor was a conservative guess
(0.80) set without real-photo calibration. This run is the first calibration on a
measured distribution.

## Method

- Harness: `backend/scripts/eval_blend.py` (built with #464, run for the first time against the live worker).
- Worker: `http://127.0.0.1:8001` (Leon's RTX box, `bioclip.floreren.app` tunnel).
- Eval set: `backend/data/eval/` — GBIF photos, 126 photos across 47 species.
- Mode: leave-one-out — each photo is identified with every other photo as a
  user-confirmed reference for its species; text-only vs blended top-1/top-5 compared.

## Results

| Metric | Value |
|---|---|
| Same-species image cosine | p50 = 0.486, p90 = 0.695, p95 = 0.737 |
| Different-species image cosine | p50 = 0.203, p90 = 0.351, p95 = 0.411 |
| Text-only top-1 / top-5 | 21/126 (17%) / 48/126 (38%) |
| Blended top-1 / top-5 @ floor 0.80 | 25/126 (20%) / 52/126 (41%) — rescued 4 |
| Blended top-1 / top-5 @ floor 0.45 | 86/126 (68%) / 97/126 (77%) — rescued 66 |

## Decision

- **`_IMAGE_MATCH_MIN` changed 0.80 → 0.45** (`backend/routers/plant_id.py`).
- Rationale: 0.80 sat above the same-species p95 (0.737) — the un-gate never fired.
  0.45 sits below the same-species median (0.486), so most genuine repeat photos
  clear it, and above the different-species p95 (0.411), so most look-alikes stay
  below it.
- At 0.45 the leave-one-out blend rescues 66 wrong→right at top-1 vs 4 at 0.80.

## Caveats (read before trusting production numbers)

- GBIF photos likely overlap BioCLIP's training data, so both text-only and blended
  accuracy are optimistic. The distributions and the *direction* of the effect are
  the trustworthy part; absolute accuracy is not.
- Leave-one-out uses all other photos of the same species as references — real users
  confirm a handful of photos per plant, so production blended accuracy will be
  lower than the 68% top-1 shown here.
- **PENDING — real-photo validation** (audit §6 / issue #806): re-run
  `eval_blend.py` on Leon's own garden photos (~5-10 per species, phone-taken,
  varied angles/light) before trusting the floor in production. Target: ~2026-08-20.

## Follow-ups

- Confidence display recalibration (rescued match reads as "85%" beside text "30%")
  is tracked in #808.
- Embedding regeneration with prompt ensembles + crop strategy is tracked in #809.
