# BioCLIP identification audit (#442)

**Date:** 2026-07-07
**Status:** audit / findings + the top quick-win fix (§3.1, un-gate confirmed retrieval) implemented in this PR. That code change is **pending a worker-side validation run before merge** — the `_IMAGE_MATCH_MIN` floor was picked conservatively without a real-photo calibration.
**Scope caveat:** This is a **code + prior-eval audit**, not a fresh benchmark. Producing new top-1/top-5 numbers on *Leon's real garden photos* needs the GPU worker box and a labelled photo set neither of which is reachable from a cloud session. Where I assert accuracy, it comes from the existing `2026-05-24-bioclip-eval-baseline.txt`. The single most important follow-up is a real-photo benchmark (see §6).

---

## TL;DR

Three things, in order of impact, explain "BioCLIP is bad and I always end up on PlantNet":

1. **Zero-shot text matching is near its ceiling.** Matching a photo embedding against ~text embeddings of Latin names tops out at **~14% top-1 / ~26% top-5** on live iNat photos — and that's an *upper bound* (the eval set overlaps BioCLIP's training data; real garden photos score lower). This is the approach's inherent limit, not a bug.

2. **The self-improving feature you remember exists — but was gated into near-uselessness.** `user_confirmed_embeddings` (your "picked plants confirm the ID" memory) *is* wired up: every `/identify/commit` stores the photo's embedding. But the read path (`_blend_scores`) only lets those confirmations **re-rank within BioCLIP's existing text top-5**, requires **≥2** confirmations of a species before it activates, and applies a **1.0** (neutral) weight. So it can't *rescue* a species BioCLIP's text ranking missed — which is the 74% case — and with ~2 users it almost never has ≥2 refs. Net effect today: it does almost nothing. **This is the biggest fixable win and the design intended the opposite.**

3. **The UI actively trains you to tap PlantNet.** Whenever BioCLIP isn't `high` confidence (rare — `high` needs top-1 ≥ 0.28 *and* margin ≥ 0.03), the results screen promotes a solid green "Try PlantNet" button + a warning banner, and shows raw cosine as a "30% confidence" bar. A correct match displayed as "30%" reads like a failure, so you reach for PlantNet reflexively.

---

## 1. How identification works today

```
Photo ─▶ /plants/identify (routers/plant_id.py)
          │
          ├─▶ BioCLIP worker (bioclip.floreren.app, Leon's RTX 2070)
          │     POST /identify → image embedding (512-d, L2-norm)
          │     similarities = text_embeddings @ image_emb   (cosine vs every species' NAME)
          │     → top-5 (species_id, cosine) + the raw image embedding (base64)
          │
          ├─▶ _apply_user_refs(): blend text matches with image-to-image
          │     similarity vs user_confirmed_embeddings   ← the "confirmation" feature
          │
          ├─▶ _classify_confidence(top1, top2) → high|medium|low|no_match
          │
          └─▶ if no_match OR the user taps the button → PlantNet API (20/day quota)
```

- **Reference set**: `precompute_embeddings.py` encodes every `plant_species` row as the text prompt `"a photo of {latin_name}, a plant"`. One vector per species. Lives as `.npy` on the worker box (not in the repo).
- **Matching**: pure image→**text** cosine. No image→image except via the (gated) confirmation blend.
- **Confidence**: raw cosine, thresholds calibrated 2026-05-24 (`_CONFIDENCE_FLOOR=0.10`, `_HIGH_TOP1=0.28`, `_HIGH_MARGIN=0.03`, `_MEDIUM_TOP1=0.30`).

### The user-confirmed retrieval feature — how it *actually* behaves

Write path (works): `POST /identify/commit` → calls worker `/embed-image` → stores 512-d float32 in `user_confirmed_embeddings(species_id, embedding, …)`. So confirming a plant *does* bank a labelled image vector.

Read path (`_blend_scores`, `routers/plant_id.py:71`) — three gates that neuter it:

| Gate | Code | Effect |
|---|---|---|
| **Intersection, not union** | `for sid in text_score_map` | Confirmations only re-rank species **already** in BioCLIP's text top-5. They can never surface a species the text ranking missed — even with 20 confirmed photos of it. |
| **≥2 refs required** | `if ref_matrix.shape[0] < 2: continue` | With ~2 users accruing slowly, almost no species has 2+ confirmations. Feature stays dormant for months. |
| **Neutral weight** | `_IMAGE_REF_BOOST = 1.0`, `max(text, image*1.0)` | Even when it fires, image similarity only wins if its raw cosine happens to beat the text cosine. |

The original design (`2026-05-26-bioclip-user-confirmed-retrieval-design.md` §4b) specified a **union** (`set(text) | set(image)`) with a **1.1×** image boost — i.e. confirmations *should* be able to rescue misses. The shipped code reversed that, almost certainly out of a (reasonable) fear of one bad confirmation polluting results — but the cure removed the whole benefit.

---

## 2. Why it underperforms — root causes, ranked

1. **Zero-shot text is weak and barely self-aware.** From the baseline eval (126 iNat photos, 47 species): top-1 **14%**, top-5 **26%**. Correct top-1 cosine mean **0.302** vs wrong **0.287** — the score barely separates right from wrong. Only the *margin* (top1−top2) discriminates (0.035 vs 0.012), which is why `high` is rare. On real garden photos (out-of-distribution vs the GBIF eval) it will be worse.

2. **The rescue mechanism is switched off** (the gated blend, §1). This is the difference between "a static 14% model" and "a model that gets measurably better every time you confirm one of your own plants."

3. **Species-count growth hurts precision.** The reference set is *every* `plant_species` row. The May design counted **1,734** species; issue #442 says **~6,000**. More species = more confusable near-neighbours = lower zero-shot precision. Coverage and precision are in direct tension here. (Verify the live count via the worker's `/coverage` endpoint — see §7.)

4. **Suboptimal prompts.** `"a photo of {latin}, a plant"` underuses BioCLIP, which was trained on taxonomic + **common-name** prompts and benefits from template ensembling. Single bare-Latin prompts leave accuracy on the table.

5. **Confidence shown as raw cosine.** `pct = confidence * 100` → a correct 0.30 match displays "30% confidence" with a warning banner and a prominent PlantNet CTA. This is a calibration/UX problem that *manufactures* distrust even when BioCLIP is right.

6. **Latent score-scale bug in the blend.** Image→image cosine (~0.6–0.9 for same species) and image→text cosine (~0.25–0.35) are on different scales, but `_blend_scores` does `max(text, image)` and feeds the result to thresholds calibrated on *text* scores (0.28). If the blend ever fires it over-reports confidence. Any un-gating must fix calibration at the same time (§3.1).

---

## 3. Improvement roadmap (quick wins first, model swap last)

### 3.1 — Un-gate user-confirmed retrieval **✅ implemented in this PR (pending validation)**
Turned the confirmation loop back on so your own garden becomes the training set. Changes to `_blend_scores` (`routers/plant_id.py`) + `tests/test_blend_scores.py`:
- **Union, not intersection**: a strong image→image match now surfaces a species even if BioCLIP's text ranking missed it entirely (the rescue path — the whole point).
- **≥2 → ≥1 ref**: one confirmation is enough for the feature to be live.
- **Floor-gated, degrades safely**: image→image cosine is only trusted at/above `_IMAGE_MATCH_MIN` (default **0.80**). Below the floor the image signal is ignored, so a weak/wrong confirmation can never hijack a result — worst case, behaviour falls back to pure text.
- **Pending:** the `_IMAGE_MATCH_MIN` floor is a conservative guess set without real-photo calibration. Validate on the worker before merge (see §6). Also open: a rescued match's raw image cosine currently flows into the displayed confidence, so it reads as "85%" beside text candidates' "30%" — display recalibration is §3.3.

This directly answers the "confirming plants should improve scoring" instinct: it now can — it just wasn't allowed to before.

### 3.2 — Multi-image ensemble (cheap, high value)
Let identify accept 2–3 angles; average the L2-normed embeddings before matching. Averaging cuts single-shot noise and is a well-known zero-shot booster. Pairs naturally with the "take another photo" UX.

### 3.3 — Fix confidence UX (cheap, stops the PlantNet reflex)
- Map cosine → a calibrated 0–100 (isotonic/Platt fit on the eval set) instead of showing raw cosine as "%".
- Make PlantNet a **secondary** action unless truly `no_match`; don't promote it on every medium/low result.
- When a user-confirmed image match fires (§3.1), present it *confidently* — that's exactly the case we trust most.

### 3.4 — Better prompts / preprocessing (modest)
- Use BioCLIP's canonical prompt ensemble incl. common names, averaged per species (re-run `precompute_embeddings.py`).
- Center/saliency crop before inference to drop background (pots, soil, mulch) that dilutes the plant signal.

### 3.5 — Auto-cascade to PlantNet, or merge both (medium)
Instead of a manual button on low confidence, automatically run PlantNet and either replace or merge candidates by calibrated confidence. PlantNet is genuinely strong on plants and is already integrated.

### 3.6 — VLM path (medium/large)
A vision-language model (Gemini Flash / GPT-4V — `plant_reader.py` already has a GPT-4V path) can use whole-photo context (leaf shape, flower, pot, setting) that pure vision embeddings miss. Candidate as a tie-breaker or parallel path. Cost per call matters.

### 3.7 — Model swap (largest effort — do last)
Only after §3.1–3.3 and a real-photo benchmark. Candidates: a larger BioCLIP backbone, an iNaturalist-trained classifier, or PlantNet-as-primary for certain taxa. **Decide purely on top-1/top-5 measured on Leon's actual photos**, not on paper claims.

---

## 4. Recommended order

1. Real-photo benchmark harness (§6) — you can't tune what you can't measure.
2. Un-gate confirmed retrieval (§3.1) + re-baseline.
3. Confidence UX + calibration (§3.3).
4. Multi-image ensemble (§3.2).
5. Prompt/crop tweaks (§3.4), auto-cascade (§3.5).
6. VLM (§3.6) / model swap (§3.7) only if 2–5 don't get there.

---

## 5. Confidence recalibration note
The current thresholds are honestly derived (see baseline), but (a) they're on GBIF photos that flatter BioCLIP, and (b) the blend breaks their assumptions. After §3.1 they must be re-fit on: pure-text scores **and** blended scores separately, on real photos.

## 6. Measurement plan (the real deliverable behind this audit)
- Assemble a labelled set of **Leon's own garden photos** (the only test set that matters). ~5–10 per species, phone-taken, varied angles/light.
- **Note on the existing eval:** `eval_bioclip.py` posts to the worker's `/identify` directly, which returns *text-only* matches — the blend happens backend-side. So the current script already measures **pure text-only** accuracy (the 2026-05-24 baseline's later note implying otherwise is inaccurate). To measure the **blended** path you must either (a) capture the worker's `embedding` field, load `user_confirmed_embeddings`, and apply `_blend_scores` in the eval, or (b) drive the backend `/plants/identify` end-to-end. Either is a small addition; not shipped here because it can't be exercised without the worker + DB.
- **Validate §3.1 before merge:** run the text-only eval, then seed a few `user_confirmed_embeddings` for evaluated species and measure blended top-1/top-5 with the same photos. Confirm rescues help and that no look-alikes get wrongly rescued at the chosen `_IMAGE_MATCH_MIN`; tune the floor from the observed same-species vs different-species image-cosine distributions.
- Report top-1/top-5 for: current text-only, text+confirmed (un-gated), +multi-image, +better prompts. One table, same photos.

## 7. Open items to verify (need the worker / prod DB)
- **Live species count**: `GET /coverage` on the worker → is it ~1,734 or ~6,000? Reconcile with `SELECT count(*) FROM plant_species WHERE latin_name <> ''`. More species ⇒ expect lower precision (§2.3).
- **Embedding staleness**: when was `precompute_embeddings.py` last run vs. last species-table change? Worker embeddings must be regenerated after species are added.
- **Confirmed-refs volume**: `SELECT species_id, count(*) FROM user_confirmed_embeddings GROUP BY 1` — how many species even have ≥1 today? (Predicts how much §3.1 helps immediately.)
- **Garden coverage**: how many species Leon actually grows have ≥1 embedding and ≥1 confirmation.

## References
- `backend/bioclip_worker.py` — worker (`/identify`, `/embed-image`, `/coverage`).
- `backend/services/bioclip_id.py` — local inference module (mirrors the worker).
- `backend/routers/plant_id.py` — orchestration, `_blend_scores` (the gated blend), `_classify_confidence`, `identify_commit`.
- `backend/scripts/precompute_embeddings.py` — prompt format + species source.
- `docs/archive/2026-05-24-bioclip-eval-baseline.txt` — the 14%/26% numbers.
- `docs/archive/2026-05-26-bioclip-user-confirmed-retrieval-design.md` — the design the shipped blend diverged from.
