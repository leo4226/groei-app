# BioCLIP User-Confirmed Image Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture image embeddings of `/identify/commit` confirmations into a new `user_confirmed_embeddings` table, then on subsequent `/identify` calls blend image-to-image cosine similarity (against accumulated user-confirmed refs) with the existing text-only matches — a self-improving retrieval loop with no BioCLIP retraining.

**Architecture:** Worker exposes a new `/embed-image` endpoint and includes the query embedding in `/identify` responses. Backend stores embeddings as BYTEA in Postgres, blends per-species text and image-to-image scores in Python via numpy. A 5-min TTL in-memory cache keeps the per-request cost trivial.

**Tech Stack:** Python 3.13/3.14 + FastAPI + asyncpg (backend), open_clip + torch on the WSL GPU worker, alembic for the schema migration, numpy for similarity math, pytest for the pure-function tests.

**Spec:** `docs/plans/2026-05-26-bioclip-user-confirmed-retrieval-design.md`

---

## File map

**Create:**
- `backend/alembic/versions/0009_user_confirmed_embeddings.py` — schema migration
- `backend/tests/test_blend_scores.py` — unit tests for the pure score-combining helper

**Modify:**
- `backend/bioclip_worker.py` — add `POST /embed-image`, include `embedding` in `/identify` response
- `backend/routers/plant_id.py` — extend `_bioclip_identify` (read path), extend `identify_commit` (write path), add `_blend_scores` (pure), add `_load_user_refs_cache` (async with TTL), add `_apply_user_refs` (async wrapper)

**No changes:**
- Frontend (the new behavior is invisible to it — same `/identify` response shape, just better ranking)
- Other backend routers
- `precompute_embeddings.py` (unchanged — text embeddings stay as-is)
- `services/bioclip_id.py` (the local fallback path is rarely used in production — out of scope; the remote-worker path is what matters)

---

## Task 1: Worker — add `POST /embed-image` endpoint + include embedding in `/identify` response

**Files:**
- Modify: `backend/bioclip_worker.py`

This task is the worker-side foundation. Both the write path (Task 3) and the read path (Task 5) depend on it.

- [ ] **Step 1.1: Add base64 import to worker**

In `backend/bioclip_worker.py`, near the top with the other imports:

```python
import base64
```

- [ ] **Step 1.2: Add `POST /embed-image` endpoint**

In `backend/bioclip_worker.py`, after the existing `/identify` endpoint (around line 132) and BEFORE the `/health` endpoint, add:

```python
@app.post("/embed-image")
async def embed_image(image: UploadFile = File(...)):
    """Encode an image into BioCLIP's 512-dim embedding space. Returns
    the raw 2048 bytes (512 × float32) as application/octet-stream.

    Used by the backend to capture user-confirmed image embeddings for
    the retrieval layer (see /identify/commit).
    """
    if _model is None:
        raise HTTPException(status_code=503, detail="BioCLIP model not loaded")

    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")

    try:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image")

    import torch  # safe — _model already loaded
    _load_model()

    image_tensor = _preprocess(pil_image).unsqueeze(0).to(_device)
    with torch.no_grad():
        emb = _model.encode_image(image_tensor)
        emb = emb / emb.norm(dim=-1, keepdim=True)
    arr = emb.cpu().numpy().squeeze().astype(np.float32)

    from fastapi.responses import Response
    return Response(content=arr.tobytes(), media_type="application/octet-stream")
```

- [ ] **Step 1.3: Modify `/identify` response to include the query embedding**

In `backend/bioclip_worker.py`, locate the `_identify_image` function (around line 69). Change its return to include the embedding alongside the matches:

```python
def _identify_image(image: Image.Image, top_k: int = 5) -> tuple[list[dict], np.ndarray]:
    """Embed image, match against text embeddings, return top-K + the raw embedding."""
    import torch

    _load_model()

    image_tensor = _preprocess(image).unsqueeze(0).to(_device)
    with torch.no_grad():
        embedding = _model.encode_image(image_tensor)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    image_emb = embedding.cpu().numpy().squeeze().astype(np.float32)

    similarities = _text_embeddings @ image_emb
    top_indices = np.argsort(similarities)[-top_k:][::-1]

    results = []
    for idx in top_indices:
        results.append({
            "species_id": int(_species_ids[idx]),
            "confidence": round(float(similarities[idx]), 4),
        })
    return results, image_emb
```

Then in the `/identify` endpoint (around line 109), update to unpack both values and include the embedding in the response:

```python
@app.post("/identify")
async def identify(image: UploadFile = File(...)):
    """Accept an image file, return BioCLIP top-5 matches + the query embedding."""
    if _model is None:
        raise HTTPException(status_code=503, detail="BioCLIP model not loaded")
    if _text_embeddings is None:
        raise HTTPException(status_code=503, detail="Embeddings not loaded")

    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")

    try:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image")

    try:
        matches, image_emb = _identify_image(pil_image)
    except Exception as e:
        logger.error("Inference error: %s", e)
        raise HTTPException(status_code=500, detail="Inference failed")

    return {
        "matches": matches,
        "source": "bioclip",
        "embedding": base64.b64encode(image_emb.tobytes()).decode(),
    }
```

- [ ] **Step 1.4: Restart the worker in WSL**

```bash
wsl.exe -d Ubuntu -e bash -lc 'kill $(ps aux | grep "bioclip_worker.py" | grep -v grep | awk "{print \$2}") 2>/dev/null ; sleep 2'
wsl.exe -d Ubuntu --exec bash -lc 'cd /mnt/c/Users/leon_/Projects/Floreren/backend && setsid nohup .venv/bin/python3 bioclip_worker.py < /dev/null > /home/leon_/bioclip_worker.log 2>&1 & sleep 3 ; ps -ef | grep bioclip_worker | grep -v grep'
```

Expected: a single python3 process running bioclip_worker.py.

Then wait for it to load (~30-60s) and verify health:

```bash
curl -sS http://localhost:8001/health
```

Expected: `{"status":"ok","model_loaded":true,"embeddings_loaded":true,"device":"cuda"}`

- [ ] **Step 1.5: Smoke test both endpoints**

Find any plant photo on disk (a test image) and run:

```bash
# /embed-image returns 2048 bytes
curl -sS -o /tmp/emb.bin -w "HTTP %{http_code} Size %{size_download}\n" \
  -X POST -F "image=@<path-to-a-jpg>" http://localhost:8001/embed-image

# Expected: HTTP 200 Size 2048

# /identify returns matches + embedding
curl -sS -X POST -F "image=@<path-to-a-jpg>" http://localhost:8001/identify | \
  python -c "import sys, json, base64; d = json.load(sys.stdin); print('matches:', len(d['matches'])); print('embedding bytes:', len(base64.b64decode(d['embedding'])))"

# Expected: matches: 5  embedding bytes: 2048
```

If both return the expected sizes, the worker is correctly producing 512×float32 embeddings (2048 bytes).

- [ ] **Step 1.6: Commit**

```bash
git add backend/bioclip_worker.py
git commit -m "feat(bioclip-worker): add /embed-image endpoint + include query embedding in /identify response

Both are foundational for the user-confirmed retrieval feature:
- /embed-image: backend calls this on /identify/commit to capture the
  image embedding of confirmed plants
- /identify response now includes the query embedding (base64) so the
  backend can compute image-to-image similarity against user refs

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Schema migration — `user_confirmed_embeddings` table

**Files:**
- Create: `backend/alembic/versions/0009_user_confirmed_embeddings.py`

- [ ] **Step 2.1: Create the migration file**

Create `backend/alembic/versions/0009_user_confirmed_embeddings.py`:

```python
"""user_confirmed_embeddings table

Stores image embeddings of plants users have confirmed via /identify/commit,
so future /identify calls can blend image-to-image similarity into ranking.
See docs/plans/2026-05-26-bioclip-user-confirmed-retrieval-design.md.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-26
"""
from alembic import op


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE user_confirmed_embeddings (
            id                 SERIAL PRIMARY KEY,
            species_id         INT NOT NULL REFERENCES plant_species(id) ON DELETE CASCADE,
            embedding          BYTEA NOT NULL,
            source_account_id  INT REFERENCES accounts(id) ON DELETE SET NULL,
            source_photo_url   TEXT,
            created_at         TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    op.execute(
        "CREATE INDEX idx_uce_species_id ON user_confirmed_embeddings(species_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_uce_species_id")
    op.execute("DROP TABLE IF EXISTS user_confirmed_embeddings")
```

- [ ] **Step 2.2: Apply the migration locally against Neon (production DB — same DB used by dev)**

From `backend/`:

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
.venv/bin/python -m alembic upgrade head
```

Or in PowerShell on native Windows (no WSL venv):

```powershell
cd C:\Users\leon_\Projects\Floreren\backend
python -m alembic upgrade head
```

Expected output: `INFO  [alembic.runtime.migration] Running upgrade 0008 -> 0009, user_confirmed_embeddings table`

- [ ] **Step 2.3: Verify the table exists and has the expected shape**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -c "
import asyncio
from dotenv import load_dotenv
load_dotenv()
from database import init_pool, close_pool, get_db
async def m():
    await init_pool()
    try:
        async with get_db() as db:
            cols = await db.execute_fetchall(\"\"\"
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'user_confirmed_embeddings'
                ORDER BY ordinal_position
            \"\"\")
        for c in cols:
            print(f'  {c[\"column_name\"]:<22s} {c[\"data_type\"]:<25s} {\"NULL\" if c[\"is_nullable\"] == \"YES\" else \"NOT NULL\"}')
    finally:
        await close_pool()
asyncio.run(m())
"
```

Expected:
```
  id                     integer                   NOT NULL
  species_id             integer                   NOT NULL
  embedding              bytea                     NOT NULL
  source_account_id      integer                   NULL
  source_photo_url       text                      NULL
  created_at             timestamp with time zone  NULL
```

- [ ] **Step 2.4: Commit**

```bash
git add backend/alembic/versions/0009_user_confirmed_embeddings.py
git commit -m "feat(db): user_confirmed_embeddings table for retrieval refs

Stores 512-dim image embeddings captured on /identify/commit. Indexed
by species_id; cascade-deletes when a plant_species row goes away.
source_account_id is SET NULL on account deletion (audit field only).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Write path — capture embedding on `/identify/commit`

**Files:**
- Modify: `backend/routers/plant_id.py`

- [ ] **Step 3.1: Add httpx import if not already present**

Check the top of `backend/routers/plant_id.py`. If `httpx` is NOT in the imports at module level, leave it for now — the existing `_bioclip_identify` does `import httpx` inside the function. We'll do the same in `identify_commit`.

- [ ] **Step 3.2: Extend `identify_commit` with best-effort embedding capture**

In `backend/routers/plant_id.py`, locate `identify_commit` and find the line:

```python
photo_path = _save_identify_photo(image_bytes)
```

Immediately AFTER that line and BEFORE the `return IdentifyCommitResponse(...)`, add:

```python
    # Best-effort: capture the image embedding for the user-confirmed retrieval
    # layer. Failure here must NEVER break the commit flow — log and move on.
    try:
        if _BIOCLIP_WORKER_URL:
            import httpx
            async with httpx.AsyncClient(timeout=20) as client:
                emb_resp = await client.post(
                    f"{_BIOCLIP_WORKER_URL.rstrip('/')}/embed-image",
                    files={"image": ("plant.jpg", image_bytes, "image/jpeg")},
                )
            if emb_resp.status_code == 200 and len(emb_resp.content) == 2048:
                await db.execute(
                    """INSERT INTO user_confirmed_embeddings
                         (species_id, embedding, source_account_id, source_photo_url)
                       VALUES (?, ?, ?, ?)""",
                    (species_id, emb_resp.content, account["account_id"], photo_path),
                )
                await db.commit()
                logger.info("Captured user-confirmed embedding for species_id=%s", species_id)
            else:
                logger.warning(
                    "Worker /embed-image returned status=%s size=%s — skipping capture",
                    emb_resp.status_code, len(emb_resp.content),
                )
    except Exception as exc:
        logger.warning("User-ref embedding capture failed for species %s: %s",
                       species_id, exc)
```

- [ ] **Step 3.3: Smoke test the write path manually**

The endpoint requires auth, so we'll exercise it via the LIVE production flow once deployed. For local validation, just ensure the module still imports:

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -c "import main; print('OK')"
```

Expected: `OK` (no import errors).

- [ ] **Step 3.4: Commit**

```bash
git add backend/routers/plant_id.py
git commit -m "feat(plant-id): capture image embedding on /identify/commit

Best-effort POST to worker's /embed-image after a successful commit,
then INSERT into user_confirmed_embeddings. Wrapped in try/except so
the commit flow is never broken by a worker outage or DB hiccup —
worst case is one embedding doesn't get captured.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Pure helper — `_blend_scores` + tests

**Files:**
- Modify: `backend/routers/plant_id.py` (add `_blend_scores` function)
- Create: `backend/tests/test_blend_scores.py`

This task isolates the pure ranking logic so it's easy to test without DB or HTTP. The wrapper that loads refs from DB and calls this helper comes in Task 5.

- [ ] **Step 4.1: Write the failing tests**

Create `backend/tests/test_blend_scores.py`:

```python
"""Unit tests for the pure score-blending helper."""
import numpy as np
import pytest

from routers.plant_id import _blend_scores


def _make_unit(*vals: float) -> np.ndarray:
    """Helper: build a normalised 1D vector from raw floats."""
    arr = np.array(vals, dtype=np.float32)
    return arr / np.linalg.norm(arr)


def test_no_refs_returns_text_matches_unchanged():
    """With empty refs dict, blend collapses to identity on text_matches."""
    text = [(1, 0.30), (2, 0.25), (3, 0.20)]
    query = _make_unit(1.0, 0.0)
    out = _blend_scores(text, query, refs_by_species={})
    assert out == text


def test_user_ref_match_beats_text_score():
    """A species with a strongly-matching image ref outranks text-only competitors."""
    text = [(1, 0.30), (2, 0.25), (3, 0.20)]
    query = _make_unit(1.0, 0.0)
    # Species 3 has a ref pointing in the same direction as the query (cos = 1.0)
    refs = {3: np.array([[1.0, 0.0]], dtype=np.float32)}
    out = _blend_scores(text, query, refs_by_species=refs)
    assert out[0][0] == 3  # species 3 should now be first
    # combined score uses 1.1x boost on image-to-image: 1.0 * 1.1 = 1.1
    assert out[0][1] == pytest.approx(1.1, abs=1e-5)


def test_multiple_refs_per_species_uses_max():
    """If a species has multiple refs, the best (highest cosine) wins."""
    text = [(1, 0.30)]
    query = _make_unit(1.0, 0.0)
    # Two refs for species 1: one weak (cos 0.2), one strong (cos 1.0)
    refs = {1: np.array([[0.2, 0.98], [1.0, 0.0]], dtype=np.float32)}
    # Normalize for cosine
    refs[1] = refs[1] / np.linalg.norm(refs[1], axis=1, keepdims=True)
    out = _blend_scores(text, query, refs_by_species=refs)
    # Image score = max(cos with [0.2,0.98], cos with [1.0,0.0]) = ~1.0
    # combined = max(0.30 text, 1.0 * 1.1 image) = 1.1
    assert out[0] == (1, pytest.approx(1.1, abs=1e-5))


def test_species_in_refs_but_not_text_gets_ranked():
    """A species present only in user-refs (not in text top-K) still appears in result."""
    text = [(1, 0.30), (2, 0.25)]
    query = _make_unit(1.0, 0.0)
    # Species 99 only has user refs, no text match
    refs = {99: np.array([[1.0, 0.0]], dtype=np.float32)}
    out = _blend_scores(text, query, refs_by_species=refs)
    # Species 99: text=0, image=1.0*1.1=1.1 → wins
    assert out[0][0] == 99
    assert {s for s, _ in out} >= {1, 2, 99}


def test_returns_at_most_top_k():
    """Output length is capped at top_k (default 5)."""
    text = [(i, 0.30 - i * 0.01) for i in range(1, 11)]  # 10 text matches
    query = _make_unit(1.0, 0.0)
    out = _blend_scores(text, query, refs_by_species={}, top_k=5)
    assert len(out) == 5


def test_text_wins_when_image_ref_is_distant():
    """Image ref pointing in opposite direction → image score is low; text wins."""
    text = [(1, 0.30)]
    query = _make_unit(1.0, 0.0)
    # Ref pointing opposite to query (cos = -1)
    refs = {1: np.array([[-1.0, 0.0]], dtype=np.float32)}
    out = _blend_scores(text, query, refs_by_species=refs)
    # combined = max(0.30, -1.0 * 1.1) = 0.30 (text wins)
    assert out[0] == (1, pytest.approx(0.30, abs=1e-5))
```

- [ ] **Step 4.2: Run the test, expect ImportError**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_blend_scores.py -v
```

Expected: `ImportError: cannot import name '_blend_scores' from 'routers.plant_id'`.

- [ ] **Step 4.3: Implement `_blend_scores` in `plant_id.py`**

In `backend/routers/plant_id.py`, add this near the top of the file (after the threshold constants and `_classify_confidence`, before the `IdentifyResponse` model):

```python
import numpy as np

_IMAGE_REF_BOOST = 1.1  # multiplier on image-to-image cosine; image-to-image is
                        # a stronger signal than image-to-text so we trust it more


def _blend_scores(
    text_matches: list[tuple[int, float]],
    query_embedding: np.ndarray,
    refs_by_species: dict[int, np.ndarray],
    top_k: int = 5,
) -> list[tuple[int, float]]:
    """Combine text-based top-K matches with image-to-image similarity from
    user-confirmed embeddings, return new top-K.

    Per-species score: combined = max(text_score, max_image_cosine * boost)
    Species present in refs but not in text_matches are still considered.
    """
    text_score_map: dict[int, float] = {sid: s for sid, s in text_matches}

    image_score_map: dict[int, float] = {}
    for sid, ref_matrix in refs_by_species.items():
        # ref_matrix: shape (N, 512), each row is unit-norm
        # query_embedding: shape (512,), unit-norm
        cos = ref_matrix @ query_embedding  # shape (N,)
        image_score_map[sid] = float(cos.max())

    all_species = set(text_score_map.keys()) | set(image_score_map.keys())
    combined: list[tuple[int, float]] = []
    for sid in all_species:
        t = text_score_map.get(sid, 0.0)
        i = image_score_map.get(sid, 0.0) * _IMAGE_REF_BOOST
        combined.append((sid, max(t, i)))

    combined.sort(key=lambda x: x[1], reverse=True)
    return combined[:top_k]
```

- [ ] **Step 4.4: Run the tests, verify 6 pass**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_blend_scores.py -v
```

Expected: 6 passed.

- [ ] **Step 4.5: Commit**

```bash
git add backend/routers/plant_id.py backend/tests/test_blend_scores.py
git commit -m "feat(plant-id): pure _blend_scores helper + 6 unit tests

Per-species combination: combined = max(text_score, image_cosine * 1.1).
The 10% boost on image-to-image reflects that image-to-image is a more
reliable signal than image-to-text. Species present only in user refs
(not in text top-K) still get ranked. Pure numpy, no DB, fast to test.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Wire the blend into `_bioclip_identify`

**Files:**
- Modify: `backend/routers/plant_id.py`

- [ ] **Step 5.1: Add the in-memory cache + `_load_user_refs_cache` helper**

In `backend/routers/plant_id.py`, add these near `_blend_scores` (already added in Task 4):

```python
import time

_USER_REFS_CACHE_TTL_S = 300  # 5 min
_user_refs_cache: dict = {"loaded_at": None, "by_species": {}}


async def _load_user_refs_cache(db) -> dict[int, np.ndarray]:
    """Load all user_confirmed_embeddings into an in-memory dict, refreshing
    at most every _USER_REFS_CACHE_TTL_S seconds.
    """
    global _user_refs_cache
    now = time.time()
    if (
        _user_refs_cache["loaded_at"] is not None
        and now - _user_refs_cache["loaded_at"] < _USER_REFS_CACHE_TTL_S
    ):
        return _user_refs_cache["by_species"]

    rows = await db.execute_fetchall(
        "SELECT species_id, embedding FROM user_confirmed_embeddings"
    )
    by_species: dict[int, list[np.ndarray]] = {}
    for r in rows:
        emb = np.frombuffer(r["embedding"], dtype=np.float32)
        by_species.setdefault(r["species_id"], []).append(emb)
    stacked = {sid: np.stack(arrs) for sid, arrs in by_species.items()}

    _user_refs_cache = {"loaded_at": now, "by_species": stacked}
    return stacked
```

- [ ] **Step 5.2: Add the async wrapper that loads refs + calls `_blend_scores`**

In `backend/routers/plant_id.py`, add right after `_load_user_refs_cache`:

```python
async def _apply_user_refs(
    text_matches: list[tuple[int, float]],
    query_embedding: np.ndarray | None,
    db,
) -> list[tuple[int, float]]:
    """Async wrapper: load refs from cache, blend with text matches. If query
    embedding is None (worker didn't return one — old version), short-circuit
    to text_matches unchanged.
    """
    if query_embedding is None:
        return text_matches
    refs = await _load_user_refs_cache(db)
    if not refs:
        return text_matches
    return _blend_scores(text_matches, query_embedding, refs)
```

- [ ] **Step 5.3: Modify `_bioclip_identify` to decode the embedding and call `_apply_user_refs`**

In `backend/routers/plant_id.py`, locate `_bioclip_identify`. Find the block that handles the worker response (around line 161-170 — the `if resp.status_code == 200:` branch):

Current:
```python
if resp.status_code == 200:
    data = resp.json()
    matches = [(m["species_id"], m["confidence"]) for m in data.get("matches", [])]
```

Replace with:
```python
if resp.status_code == 200:
    data = resp.json()
    matches = [(m["species_id"], m["confidence"]) for m in data.get("matches", [])]
    # Decode the query embedding if present (new field; may be absent on old worker)
    emb_b64 = data.get("embedding")
    if emb_b64:
        import base64
        try:
            query_embedding = np.frombuffer(base64.b64decode(emb_b64), dtype=np.float32)
            if query_embedding.shape == (512,):
                matches = await _apply_user_refs(matches, query_embedding, db)
        except Exception as exc:
            logger.warning("Failed to decode query embedding for blend: %s", exc)
```

(The `matches` variable gets re-bound to the blended list. The rest of `_bioclip_identify` — building `out`, computing confidence — works unchanged on the re-ranked top-5.)

- [ ] **Step 5.4: Smoke test that the module still imports**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -c "import main; print('OK')"
```

Expected: `OK`.

- [ ] **Step 5.5: Run all plant_id tests to confirm nothing regressed**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_plant_id_confidence.py tests/test_blend_scores.py tests/test_plant_id.py -v
```

Expected: all pass (10 + 6 + 10 = 26 tests).

- [ ] **Step 5.6: Commit**

```bash
git add backend/routers/plant_id.py
git commit -m "feat(plant-id): blend user-confirmed image refs into /identify results

_bioclip_identify now decodes the query embedding from the worker
response and calls _apply_user_refs, which loads embeddings from
user_confirmed_embeddings via a 5-min in-memory cache and blends
per-species scores. Backward-compatible: if the worker doesn't
return an embedding (old version), behavior is unchanged.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Deploy + end-to-end verification

**Files:** none new

- [ ] **Step 6.1: Push commits**

```bash
cd "C:\Users\leon_\Projects\Floreren"
git push origin master
```

This triggers a Vercel auto-deploy for the frontend (no-op — frontend not touched, but harmless).

- [ ] **Step 6.2: Deploy backend to Fly**

```bash
cd "C:\Users\leon_\Projects\Floreren"
~/.fly/bin/flyctl deploy -a floreren-api --remote-only
```

The release_command in `fly.toml` will run `alembic upgrade head` as part of the deploy. Expected: it shows `Running upgrade 0008 -> 0009`. (If the migration was already applied locally in Task 2.2, alembic will just no-op here.)

Expected end: `Machine ... is now in a good state`. Verify with:

```bash
curl -sS https://floreren-api.fly.dev/health
```

Expected: `{"status":"ok"}`.

- [ ] **Step 6.3: Confirm the worker is already running with Task 1's changes**

```bash
curl -sS https://bioclip.floreren.app/health
```

Expected: `{"status":"ok","model_loaded":true,"embeddings_loaded":true,"device":"cuda"}`

(The worker was restarted in Task 1.4. Sanity-check it's still up.)

- [ ] **Step 6.4: End-to-end test — verify a real commit captures an embedding**

In an incognito browser, log in to `https://floreren.app`, navigate to identify, take a plant photo, pick a candidate from the results, and complete the commit (the "add this plant" flow).

Then check the database:

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -c "
import asyncio
from dotenv import load_dotenv
load_dotenv()
from database import init_pool, close_pool, get_db
async def m():
    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall(
                'SELECT id, species_id, length(embedding) as emb_size, source_photo_url, created_at '
                'FROM user_confirmed_embeddings ORDER BY id DESC LIMIT 5'
            )
        if not rows:
            print('NO embeddings captured yet')
        else:
            for r in rows:
                print(r)
    finally:
        await close_pool()
asyncio.run(m())
"
```

Expected: at least one row, with `emb_size = 2048` and a recent `created_at`.

- [ ] **Step 6.5: End-to-end test — verify the blend kicks in on a subsequent /identify**

Photo the SAME plant again from a slightly different angle, identify it, and check that:
1. The top candidate is the species you just confirmed (or at least ranks higher than it would without the blend).
2. The Fly logs show no errors:

```bash
~/.fly/bin/flyctl logs -a floreren-api | grep -E "User-ref|blend" | tail -5
```

Expected: lines like `Captured user-confirmed embedding for species_id=...` for prior commits. (No errors about decoding or DB inserts.)

- [ ] **Step 6.6: Save baseline note for future regression tracking**

Append a short note to `docs/plans/2026-05-24-bioclip-eval-baseline.txt` documenting that the retrieval layer is now live, so future re-runs of `eval_bioclip.py` can be interpreted in context:

```bash
cd "C:\Users\leon_\Projects\Floreren"
cat >> docs/plans/2026-05-24-bioclip-eval-baseline.txt <<'EOF'


Update 2026-05-26: BioCLIP user-confirmed image retrieval shipped.
From this point forward, /identify scores blend text matches with
image-to-image similarity against accumulated user_confirmed_embeddings.
Re-running eval_bioclip.py with N user-confirmed refs of evaluated
species will inflate accuracy relative to pure text-only — that's
expected and is the whole point of the feature.

To re-baseline pure-text accuracy, query against the embedding file
directly (skipping the worker's /identify endpoint) — eval_bioclip.py
itself would need an opt-out flag for the blend.
EOF

git add docs/plans/2026-05-24-bioclip-eval-baseline.txt
git commit -m "docs(eval): note retrieval-layer shipping in baseline file"
git push origin master
```

---

## Done criteria

- All 6 tasks committed, pushed, deployed.
- `python -m pytest tests/test_blend_scores.py` reports 6/6 pass.
- A POST `/embed-image` to the worker returns 2048 bytes.
- A real `/identify/commit` flow creates a row in `user_confirmed_embeddings`.
- A subsequent `/identify` of the same species ranks it correctly (top-1 or near-top with measurably higher confidence than first time).
- No new errors in Fly logs related to the feature.
