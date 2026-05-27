# BioCLIP user-confirmed image retrieval — design

**Status:** brainstorming complete, awaiting user review before plan.
**Date:** 2026-05-26
**Author:** brainstormed with Claude in the `/floreren` session.

## Problem

BioCLIP plant identification today compares a user's photo (image embedding) against 1,734 text embeddings — one per Latin species name in `plant_species`. This works but is fundamentally a single-shot zero-shot approach: every species has *one* reference (its text label) regardless of how many real-world photos exist of that species. As a result:

- For species where BioCLIP's training data was rich (common houseplants, garden classics), identification is solid.
- For species with thin training coverage, the text label is a weak proxy for "what this plant looks like."
- Most importantly: every time a Floreren user confirms an identification, we discard a perfectly good labeled image-pair that could have improved future identifications.

The user proposed using these confirmations as training data. Full fine-tuning of BioCLIP is impractical at our scale (1–2 users, slow data accrual, ML risk of catastrophic forgetting). A different shape of the same idea — *image-retrieval with user-confirmed embeddings* — captures most of the benefit at a fraction of the engineering and operational cost.

## Goal

Add a self-improving identification path: when a user confirms a species via `/identify/commit`, capture the image embedding and store it as a reference. On future identifies, compare the new photo's embedding against BOTH the existing text embeddings AND all accumulated user-confirmed image embeddings, combining the scores. Result: each confirmation makes the system slightly better at recognising that species, with no model retraining required.

Explicit non-goals:
- No fine-tuning or retraining of BioCLIP itself. Model stays frozen.
- No per-account personalization. All confirmations help all users (scope: **global**).
- No new ML stack. Everything runs in existing Python + Postgres.
- No alembic migration to install pgvector or any other extension.
- No UI for users to view, manage, or delete embeddings.

## Insight driving the design

CLIP-style models embed text and images into the same 512-dimensional concept space. We currently anchor each species with ONE text vector ("a photo of Monstera deliciosa, a plant"). But image-to-image cosine similarity (the photo a user took compared to the photo a different user took, both encoded by the SAME model) is generally a *more reliable* signal than image-to-text similarity — both vectors come through the same visual encoder, so they "speak the same language." Each confirmed image is a high-quality, free, labelled reference point. Accumulating them is the cheapest possible accuracy boost.

Tests run earlier this session showed BioCLIP's text-only top-1 accuracy on the 1,734-species DB is ~14% (iNat eval) — the headroom for image-side anchoring is substantial.

## Components

### 1. New table — `user_confirmed_embeddings`

```sql
CREATE TABLE user_confirmed_embeddings (
  id                 SERIAL PRIMARY KEY,
  species_id         INT NOT NULL REFERENCES plant_species(id) ON DELETE CASCADE,
  embedding          BYTEA NOT NULL,            -- 512 × float32 = 2048 bytes
  source_account_id  INT REFERENCES accounts(id) ON DELETE SET NULL,
  source_photo_url   TEXT,                       -- for audit / debugging
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_uce_species_id ON user_confirmed_embeddings(species_id);
```

- `embedding` stored as raw bytes (numpy `tobytes()`). Decoded in-app via `np.frombuffer(b, dtype=np.float32)`.
- No `account_id` filter — embeddings are global. `source_account_id` is audit-only (lets us delete a malicious account's contributions later if needed).
- `source_photo_url` is the R2 URL of the photo this embedding came from. Helps with debugging ("which photo gave this embedding?") and enables future image-diversity logic (don't keep 10 near-identical embeddings from the same plant).

### 2. New worker endpoint — `POST /embed-image` on `bioclip_worker.py`

The existing `POST /identify` endpoint returns matches but discards the raw image embedding. We need access to that embedding to store it.

Cleanest: add a SEPARATE endpoint that just encodes:

```python
@app.post("/embed-image")
async def embed_image(image: UploadFile = File(...)):
    # Same validation as /identify
    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(400, "Image too large (max 5 MB)")
    pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    image_tensor = _preprocess(pil).unsqueeze(0).to(_device)
    with torch.no_grad():
        emb = _model.encode_image(image_tensor)
        emb = emb / emb.norm(dim=-1, keepdim=True)
    arr = emb.cpu().numpy().squeeze().astype(np.float32)
    return Response(content=arr.tobytes(), media_type="application/octet-stream")
```

Returns the raw 2048 bytes (binary octet-stream) — no JSON wrapping, no float-precision loss. Backend decodes with `np.frombuffer(resp.content, dtype=np.float32)`.

### 3. Write path — extend `/identify/commit` in `routers/plant_id.py`

After the existing `_save_identify_photo(...)` call, add a best-effort embedding capture:

```python
# Best-effort: capture embedding for self-improving retrieval. Failure here
# must NOT break the commit flow.
try:
    worker_url = _BIOCLIP_WORKER_URL
    if worker_url:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{worker_url.rstrip('/')}/embed-image",
                files={"image": ("plant.jpg", image_bytes, "image/jpeg")},
            )
        if resp.status_code == 200 and len(resp.content) == 2048:
            await db.execute(
                """INSERT INTO user_confirmed_embeddings
                     (species_id, embedding, source_account_id, source_photo_url)
                   VALUES (?, ?, ?, ?)""",
                (species_id, resp.content, account["account_id"], photo_path),
            )
            await db.commit()
except Exception as exc:
    logger.warning("Reference embedding capture failed for species %s: %s", species_id, exc)
```

Note: `image_bytes` is already in scope (decoded from `body.photo_base64` earlier in the function). No new image upload — we re-use the bytes we already have.

### 4. Read path — extend `_bioclip_identify` in `routers/plant_id.py`

Two modifications:

**4a. Worker `/identify` response must include the query image embedding** so the backend can compute image-to-image similarity itself. Add an `embedding` field (base64-encoded 2048 bytes) to the worker's JSON response:

```python
return {
    "matches": matches,
    "source": "bioclip",
    "embedding": base64.b64encode(image_emb.astype(np.float32).tobytes()).decode(),
}
```

**4b. Backend blends text and image scores.** New helper in `routers/plant_id.py`:

```python
async def _blend_with_user_refs(text_matches: list[tuple[int, float]],
                                 query_embedding: np.ndarray,
                                 db) -> list[tuple[int, float]]:
    """Combine text-based matches with image-to-image similarity against
    user_confirmed_embeddings. Returns re-ranked top-5 by combined score.

    Per-species combination: combined = max(text_score, image_score * 1.1)
    The 10% boost on image-to-image reflects that image-to-image cosine is
    a stronger signal than image-to-text.
    """
    refs = await _load_user_refs_cache(db)   # in-memory dict {species_id: np.array (N, 512)}
    if not refs:
        return text_matches  # cold start fallback

    text_score_map = {sid: s for sid, s in text_matches}
    image_score_map: dict[int, float] = {}
    for sid, ref_matrix in refs.items():
        cos = ref_matrix @ query_embedding   # shape (N,)
        image_score_map[sid] = float(cos.max())

    all_species = set(text_score_map.keys()) | set(image_score_map.keys())
    combined = []
    for sid in all_species:
        t = text_score_map.get(sid, 0.0)
        i = image_score_map.get(sid, 0.0) * 1.1
        combined.append((sid, max(t, i)))
    combined.sort(key=lambda x: x[1], reverse=True)
    return combined[:5]
```

**4c. In-memory cache** with TTL (avoid hitting Postgres on every identify):

```python
_user_refs_cache = {"loaded_at": None, "by_species": {}}
_USER_REFS_CACHE_TTL_S = 300   # 5 min

async def _load_user_refs_cache(db) -> dict[int, np.ndarray]:
    now = time.time()
    if _user_refs_cache["loaded_at"] and now - _user_refs_cache["loaded_at"] < _USER_REFS_CACHE_TTL_S:
        return _user_refs_cache["by_species"]
    rows = await db.execute_fetchall(
        "SELECT species_id, embedding FROM user_confirmed_embeddings"
    )
    by_species: dict[int, list[np.ndarray]] = {}
    for r in rows:
        emb = np.frombuffer(r["embedding"], dtype=np.float32)
        by_species.setdefault(r["species_id"], []).append(emb)
    _user_refs_cache["by_species"] = {sid: np.stack(arrs) for sid, arrs in by_species.items()}
    _user_refs_cache["loaded_at"] = now
    return _user_refs_cache["by_species"]
```

At 100 embeddings of 2 KB each = 200 KB in RAM. Trivially small for the foreseeable scale.

### 5. Where files live

| Piece | Path | Why |
|---|---|---|
| Schema migration | `backend/alembic/versions/0009_user_confirmed_embeddings.py` | Standard alembic migration pattern; next available number after 0008 |
| Worker endpoint | `backend/bioclip_worker.py` | Already lives there; small addition |
| Backend write path | `backend/routers/plant_id.py` (extend `identify_commit`) | Where the commit flow lives |
| Backend read path | `backend/routers/plant_id.py` (extend `_bioclip_identify` + new `_blend_with_user_refs` + cache) | Co-located with existing identify logic |
| Tests | `backend/tests/test_blend_with_user_refs.py` (new) | Pure function on numpy arrays — testable without DB |

## What this design explicitly does NOT do

- **No retraining of BioCLIP** — model file stays frozen.
- **No per-account / per-household personalization** — embeddings are global. Anyone's confirmation helps everyone's identification.
- **No UI for managing references** — no view, no edit, no delete from the user side. Admins can delete rows directly in Postgres if needed.
- **No retroactive backfill** — old confirmations (before this feature ships) won't get embedded retroactively. Only NEW confirmations contribute.
- **No image-diversity logic** — if a user keeps confirming Monstera from the same angle 50 times, all 50 embeddings get stored. Future enhancement: dedupe by cosine-similarity threshold within-species.
- **No pgvector or vector DB** — bytea + numpy is sufficient for the foreseeable scale.
- **No evaluation pipeline** — measuring "did this feature improve accuracy" is out of scope for the MVP. The existing `eval_bioclip.py` could be extended later to compare with-vs-without user refs.
- **No rate limiting on `/embed-image`** — internal service behind Cloudflare Tunnel. If it becomes abused, add auth (which is finding #4 from the bioclip review anyway).

## Order of operations

1. Worker side: add `POST /embed-image` endpoint to `bioclip_worker.py`. Test with curl. Restart worker.
2. Worker side: modify `/identify` response to include the query embedding as base64.
3. Backend: alembic migration for `user_confirmed_embeddings`.
4. Backend: extend `identify_commit` to call `/embed-image` and INSERT row.
5. Backend: extend `_bioclip_identify` to call `_blend_with_user_refs` on the returned matches.
6. Tests for `_blend_with_user_refs` (pure numpy logic, testable in isolation).
7. Deploy backend (Fly).
8. Deploy worker (restart on GPU box).
9. Sanity check: do `/identify/commit` once, verify a row appears in `user_confirmed_embeddings`. Do another `/identify` of the same species, verify the response shape includes the new embedding field.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| User confirms wrong species → bad reference embedding pollutes the pool | Single bad embedding has limited impact (max() aggregation per species — needs many bad ones to dominate). Manual deletion via SQL if a pattern emerges. |
| Worker `/embed-image` call is slow → commit endpoint degraded | 20s timeout + try/except + best-effort. Commit always succeeds even if embedding capture fails. |
| Cache staleness — new confirmations don't appear in identify for up to 5 min | Acceptable for a self-improving feature. Could shorten TTL or invalidate on write if it becomes a UX complaint. |
| In-memory cache duplicated across Fly machines | Currently 1 machine on Fly (per `fly.toml`). When scaled to >1, the staleness window per machine = TTL. Acceptable. |
| Database growth | At 100 confirmations/day × 2 KB = 200 KB/day = 73 MB/year. Negligible for Neon Postgres. |
| Worker offline at commit time | Best-effort: warning logged, no embedding stored for that confirmation. Next user's confirmation works as soon as worker is back. |

## Open question deferred to implementation

- The 1.1× boost factor on image-to-image similarity is an educated guess. After deploy, observation may suggest a different value. We'll tune it via the existing eval scaffolding if signal warrants.

## References

- Today's brainstorm in the `/floreren` session.
- `backend/bioclip_worker.py` — the BioCLIP worker on Leon's GPU box.
- `backend/routers/plant_id.py` — current `_bioclip_identify` and `identify_commit`.
- `docs/plans/2026-05-24-bioclip-confidence-calibration-design.md` — sister design from May 24; complements this work (calibration of returned scores).
- `docs/plans/2026-05-24-bioclip-eval-baseline.txt` — baseline for measuring whether this feature actually helps.
