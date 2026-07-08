# Catalog improvement — execution runbook (for a machine-local agent)

**Audience:** an agent with full access to Leon's machine (the GPU/worker box), the
repo, and `backend/.env` (the Neon `DATABASE_URL`). Executes the catalog cleanup +
expansion that a sandboxed cloud session cannot (DB writes + GPU + worker restart).
**Why:** see `2026-07-07-bioclip-audit.md` (accuracy) and `2026-07-07-bioclip-catalog-expansion.md` (coverage). Short version: the ~1,784-species catalog **is** BioCLIP's answer set; it's ~43% exotic-orchid + tree-congener bloat and only 7% NL-native, so out-of-set plants get confident-wrong answers.

## Ground rules for the executing agent
1. **Dry-run before every write.** Show Leon the plan; never `--apply` unmasked.
2. **Dev before prod.** Point `backend/.env` `DATABASE_URL` at the **dev** Neon branch (`ep-crimson-darkness-alvzvh16`) first. Only touch **production** (`ep-weathered-lake-al5q450z`) after dev looks right **and Leon explicitly says so**. Never silently point `.env` at prod.
3. **Pause at every 🔶 CHECKPOINT and ask Leon** — same review gates a careful human would want. Don't proceed past a checkpoint without an answer.
4. **Reversible.** Prefer the `id_enabled` flag over deletes; every phase has a rollback below.
5. **Report actual output**, not "should work." Paste the numbers back to Leon.

## Environment facts (verify, don't assume)
- Species data: **Neon Postgres**, not the repo. Reached via `backend/.env` `DATABASE_URL`.
- BioCLIP reference set = `backend/data/bioclip/species_embeddings.npy`, built by `scripts/precompute_embeddings.py` **from the DB**, loaded by the worker (`bioclip_worker.py`, `127.0.0.1:8001`, scheduled task "Floreren Workers", exposed as `bioclip.floreren.app`). The prod Fly backend uses that worker — so **regenerating the .npy + restarting the worker is what actually changes identification**, independent of any PR merge.
- GPU box Python: uv venv `backend\.venv` on **Python 3.12** (has torch). DB-only scripts also run under normal Python, but use the venv for consistency.
- Branch with all this tooling: `claude/plant-app-clutter-design-upw86x` (PR #468). `git pull` it first.

---

## Phase 1 — Prune the exotic bloat  *(tooling already built; just execute)*

Goal: cap over-padded genera (≈100 orchids/trees per genus) so BioCLIP stops offering them, **without deleting** anything. Uses `id_enabled` (migration 0034) + `scripts/prune_catalog.py`; `precompute_embeddings.py` only embeds `id_enabled = TRUE`.

1. **Get the code & point at dev.**
   ```bash
   cd C:\Users\leon_\Projects\Floreren
   git checkout claude/plant-app-clutter-design-upw86x && git pull
   ```
   Confirm `backend/.env` `DATABASE_URL` = the **dev** branch. 🔶 **CHECKPOINT:** confirm with Leon which DB he wants to start on (recommend dev).

2. **See the current state** (read-only):
   ```bash
   cd backend && python scripts/audit_catalog.py
   ```
   Paste the report to Leon (native %, bloated genera, image/care coverage).

3. **Apply the flag column** (dev DB; prod gets it automatically on the #468 deploy):
   ```bash
   alembic upgrade head        # adds plant_species.id_enabled
   ```

4. **Dry-run the prune** and show Leon the plan:
   ```bash
   python scripts/prune_catalog.py            # default --cap 20, dry-run
   ```
   🔶 **CHECKPOINT — ask Leon:** does the per-genus drop list look right, and is `--cap 20` the number he wants? (Lower = more aggressive. Common plants are untouched; protected species — ones he grows, has care data, native-NL, or user-confirmed — are never pruned.) Re-run with his chosen `--cap N` until he's happy.

5. **Apply** (writes `id_enabled = FALSE` on the excess):
   ```bash
   python scripts/prune_catalog.py --cap <agreed> --apply
   ```

6. **Rebuild embeddings on the GPU box, then restart the worker:**
   ```bash
   backend\.venv\Scripts\python scripts\precompute_embeddings.py
   ```
   Restart the worker so it reloads the new `.npy` (scheduled task "Floreren Workers", or the launcher `C:\Users\leon_\Scripts\start-floreren-workers.ps1`). Verify:
   ```bash
   curl http://127.0.0.1:8001/health          # embeddings_loaded: true
   curl http://127.0.0.1:8001/coverage        # species_count dropped (~1,784 → ~1,000)
   ```
   🔶 **CHECKPOINT:** report the new `species_count` to Leon and have him test-identify a couple of real garden plants on the preview/app.

7. **When dev looks good → prod.** 🔶 **CHECKPOINT — ask Leon** before touching prod. Then repeat steps 4–6 with `.env` pointed at the **production** branch (or run the prune against prod after #468 merges so the migration is present). The worker's `.npy` must be rebuilt from whichever DB should drive prod identification.

**Rollback (Phase 1):** `python scripts/prune_catalog.py --reset --apply` (re-enables all), then re-run `precompute_embeddings.py` + restart the worker.

---

## Phase 2 — Import NL/NW-Europe plants  *(importer now built — review checkpoints, then run)*

Goal: fill the coverage gap — add Dutch/NW-European **native & wild flora** and flesh out common cultivated genera, so the plants Leon actually photographs are in the set. This is the "extend it, Europe-focused" step.

### What `scripts/import_nl_flora.py` does (already built)
- **Sources by occurrence, not genus:** GBIF occurrence `speciesKey` facet with `country=<code>` (+ Tracheophyta `7707728`), summed across the chosen countries and ranked by occurrence count — the plants actually growing here, not global congeners.
- **Keeps only species ≥ `--min-occurrences`** (skip vagrants/noise), **dedups** against existing `gbif_taxon_key`s (idempotent), and **caps per genus** (`--cap`, default 20) so it can't re-introduce bloat.
- **Reuses** `import_gbif_species.py` helpers + `species_service.upsert_species_from_gbif` / `insert_species_image` (CC0/CC-BY images); new rows are `id_enabled = TRUE`.
- **Dry-run by default**; prints the add-count, per-genus breakdown, and a sample before any write. Pure `select_candidates()` is unit-tested (`test_import_nl_flora.py`).
- Flags: `--countries NL,BE,DE`, `--min-occurrences N`, `--cap N`, `--limit N` (total added), `--max-fetch N`, `--apply`.

🔶 **CHECKPOINTS — ask Leon before running:**
- Region scope: **NL only**, or **NL + NW-Europe (BE/DE)**? (Wider = more coverage, slightly more look-alikes.)
- Occurrence threshold (how common must a wild plant be to include)?
- A rough size cap (how many species total to add) so the import stays focused.

### Run it
```bash
cd backend && python scripts/import_nl_flora.py --countries <agreed> --min-occurrences <agreed>   # dry-run (default): show what it would add
# 🔶 CHECKPOINT: Leon reviews the count + a sample of names
python scripts/import_nl_flora.py --countries <agreed> --min-occurrences <agreed> --apply
python scripts/backfill_dutch_names.py && python scripts/backfill_english_names.py
python scripts/enrich_species_ecology.py        # fills native_to_nl on new rows
backend\.venv\Scripts\python scripts\precompute_embeddings.py   # re-embed (GPU) + restart worker
```
Verify via `/coverage` (species_count up) and test-identify a few wild plants. 🔶 report to Leon.

**Rollback (Phase 2):** new rows carry `source = 'gbif'` and a fresh `created_at`; if a batch is wrong, either `id_enabled = FALSE` them (safe) or delete the batch by `gbif_taxon_key` set. Confirm approach with Leon before deleting.

---

## Phase 3 — Precision layers  *(later; design in the expansion plan)*
Once coverage is decent, add (see `2026-07-07-bioclip-catalog-expansion.md` §3):
1. **Image-anchoring** — precompute a few image embeddings per species from the GBIF/iNat photos already stored; match image-to-image (biggest accuracy lever; ~81% of species have a reference image). Composes with the un-gated user-confirmed embeddings (#442).
2. **Geographic/relevance prior** — re-rank with `score = cosine + λ·prior`, prior high for "Dutch-plausible" (native_to_nl OR has-care OR has-NL-name), so the remaining exotics only win on strong visual evidence. Reuses the now-populated `native_to_nl`.
3. Validate each with `scripts/eval_blend.py` on real photos; guardrail: current common-plant top-1 must not drop.

---

## What "done" looks like
- `/coverage` species_count reflects a pruned + NL-expanded set (bloat down, Dutch flora up).
- Test-identifying Leon's real garden plants returns the right species (or a sensible "not sure → PlantNet"), not a confident exotic.
- `native_to_nl` populated on new rows, ready for the Phase-3 prior.
