# BioCLIP prompt ensemble + preprocessing — measurement (#809)

Date: 2026-08-07. Same 126 GBIF photos / 47 species, leave-one-out text-only
eval (`eval_bioclip.py` → live worker `/identify`), before/after on identical
photos.

## Results (text-only top-1 / top-5)

| Config | Top-1 | Top-5 | Notes |
|---|---|---|---|
| Baseline (single `"a photo of {latin}, a plant"`) | 17% (21/126) | 38% (48/126) | pre-#809 embeddings, 1332 species |
| **Prompt ensemble, no crop** | **17% (22/126)** | **40% (50/126)** | new 1246-species ensemble embeddings |
| Ensemble + center-crop 0.9 | 15% (19/126) | 38% (48/126) | crop hurts |
| Ensemble + center-crop 0.85 | 16% (20/126) | 38% (48/126) | crop hurts |

## Interpretation

- **Prompt ensemble: small real gain on top-5 (38% → 40%), top-1 flat.**
  Ensemble = 7 Latin templates + 3 English common-name templates, averaged per
  species, L2-normalized. 92% of species have a common name.
- **Center-crop: hurts on the GBIF eval.** GBIF photos are already tight
  center crops — cutting 10–15% more removes leaf margins the model uses.
  This eval **cannot** validate the crop's real target (phone photos with
  pot/soil/mulch background). Crop is therefore shipped **default OFF**
  (`BIOCLIP_CROP_FRACTION=1.0`), env-tunable, to be validated in the #806
  real-photo window before enabling.
- **Honest caveat (unchanged from #806):** GBIF is optimistic (training-data
  overlap). These deltas are directional, not production numbers. The
  ~2-week real-photo validation is what sets both the floor and the crop
  decision.

## Staleness (§7) — resolved

`precompute_embeddings.py` now writes `data/bioclip/meta.json` with
`generated_at`, `species_count`, and the template lists. The worker's
`/coverage` endpoint exposes `embeddings_generated_at` + `prompt_strategy`,
so the Fly backend / Leon can compare against species-table changes.

- Regenerated: 2026-08-07T05:08:37Z, 1246 species (was 1332 pre-prune rows;
  current `id_enabled=TRUE` count is 1246 — stale pre-prune embeddings were
  one of the staleness symptoms).

## Also landed

- `eval_bioclip.py` + `eval_blend.py`: send `X-Worker-Token` from
  `BIOCLIP_WORKER_TOKEN` (they 401'd against the token-protected worker).
- Worker + local service: cheap quality diagnostics (resolution / blur /
  lighting) logged on `/identify` — log-only, never reject. Example flags
  seen on the eval set: `['blurry']`, `['too_dark']`.
