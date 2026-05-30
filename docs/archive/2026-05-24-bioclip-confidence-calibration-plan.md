# BioCLIP Confidence Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BioCLIP's raw-cosine "low_confidence" boolean with a 4-label (high/medium/low/no_match) confidence calibration informed by GBIF-sourced eval data, surfaced in the identify UI with tone-appropriate Dutch microcopy.

**Architecture:** Two new one-shot scripts (`fetch_eval_set.py`, `eval_bioclip.py`) populate `backend/data/eval/` from GBIF and report margin-based score distributions. The router gains a pure `_classify_confidence(top1, top2)` function with thresholds informed by the eval report. The `IdentifyResponse` model gains a `confidence` field; `low_confidence` stays as a derived back-compat alias. The frontend's `IdentifyResults` component renders one of four UX states based on the new field.

**Tech Stack:** Python 3.13 + FastAPI + asyncpg (backend), pytest + httpx async (tests), React 19 + Vite + Vitest (frontend), GBIF Occurrence API (no auth), existing BioCLIP worker (no changes).

**Spec:** `docs/plans/2026-05-24-bioclip-confidence-calibration-design.md`

---

## File map

**Create:**
- `backend/scripts/fetch_eval_set.py` — GBIF-sourced eval set downloader
- `backend/scripts/eval_bioclip.py` — runs eval, prints metrics + suggested thresholds
- `backend/tests/test_fetch_eval_set.py` — unit tests for the GBIF response parser
- `backend/tests/test_eval_bioclip.py` — unit tests for metrics/distribution/threshold helpers
- `backend/tests/test_plant_id_confidence.py` — unit tests for `_classify_confidence`
- `backend/tests/fixtures/gbif_occurrence_response.json` — recorded GBIF response for tests

**Modify:**
- `backend/routers/plant_id.py` — add `_classify_confidence`, add `confidence` field to `IdentifyResponse`, wire it into both bioclip + plantnet code paths, derive `low_confidence` from it.
- `frontend/src/types/index.ts` — add `confidence` field to the identify response type (or wherever it lives — verify with `grep -rn "low_confidence" frontend/src/types`).
- `frontend/src/components/identify/IdentifyResults.tsx` — replace `lowConfidence` boolean handling with `confidence`-keyed rendering.
- `frontend/src/pages/IdentifyPlant.tsx` — pass `confidence` through to `IdentifyResults`.
- `frontend/src/i18n/*` (or wherever `t.identify.lowConfidence` is defined — verify with `grep -rn "lowConfidence" frontend/src/i18n`) — add Dutch + English strings for the 4 confidence states.

**Read-only references:**
- `backend/services/bioclip_id.py` — for understanding the local-mode call path (do not modify)
- `backend/bioclip_worker.py` — for understanding the response shape `{matches: [{species_id, confidence}]}` (do not modify)
- `backend/scripts/precompute_embeddings.py` — pattern to mirror for the new scripts

---

## Task 1: GBIF eval set fetcher

**Files:**
- Create: `backend/scripts/fetch_eval_set.py`
- Create: `backend/tests/test_fetch_eval_set.py`
- Create: `backend/tests/fixtures/gbif_occurrence_response.json`

- [ ] **Step 1.1: Capture a real GBIF response to use as test fixture**

Run this in a Python shell or as a one-off script — DO NOT commit the script:

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -c "
import httpx, json
r = httpx.get('https://api.gbif.org/v1/occurrence/search', params={
    'scientificName': 'Monstera deliciosa',
    'mediaType': 'StillImage',
    'limit': 10,
})
with open('tests/fixtures/gbif_occurrence_response.json', 'w', encoding='utf-8') as f:
    json.dump(r.json(), f, indent=2)
print('Saved', r.status_code, len(r.json().get('results', [])), 'results')
"
```

Expected: prints `Saved 200 10 results` (or fewer). File written to `backend/tests/fixtures/gbif_occurrence_response.json`.

- [ ] **Step 1.2: Write the failing test for the GBIF response parser**

Create `backend/tests/test_fetch_eval_set.py`:

```python
"""Unit tests for the GBIF eval set fetcher."""
import json
from pathlib import Path

import pytest

from scripts.fetch_eval_set import extract_image_urls

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "gbif_occurrence_response.json"


@pytest.fixture
def gbif_response():
    with FIXTURE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def test_extract_image_urls_returns_at_most_n(gbif_response):
    """Returns at most `limit` URLs, in order of occurrence."""
    urls = extract_image_urls(gbif_response, limit=3)
    assert len(urls) <= 3
    assert all(isinstance(u, str) and u.startswith("http") for u in urls)


def test_extract_image_urls_skips_records_without_media(gbif_response):
    """Records lacking a `media` array are skipped without erroring."""
    # Inject a no-media record at the head
    modified = {"results": [{"key": 999, "media": []}] + gbif_response.get("results", [])}
    urls = extract_image_urls(modified, limit=3)
    # Should not include the injected dummy
    assert all(u != "" for u in urls)


def test_extract_image_urls_handles_empty_response():
    """Empty results returns empty list, not error."""
    assert extract_image_urls({"results": []}, limit=3) == []
    assert extract_image_urls({}, limit=3) == []
```

- [ ] **Step 1.3: Run the test to verify it fails**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_fetch_eval_set.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` on `scripts.fetch_eval_set` — the script doesn't exist yet.

- [ ] **Step 1.4: Implement the script (minimal: just the parser)**

Create `backend/scripts/fetch_eval_set.py`:

```python
#!/usr/bin/env python3
"""Download a GBIF-sourced eval set for BioCLIP into backend/data/eval/.

Usage:
    python scripts/fetch_eval_set.py --n-species 100 --photos-per-species 3
"""
import argparse
import asyncio
import logging
import random
import sys
import time
from pathlib import Path

# Add backend root for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

_EVAL_DIR = Path(__file__).resolve().parent.parent / "data" / "eval"
_GBIF_URL = "https://api.gbif.org/v1/occurrence/search"
_REQUEST_DELAY_S = 1.0  # GBIF courtesy rate-limit


def extract_image_urls(gbif_response: dict, limit: int) -> list[str]:
    """Pull up to `limit` image URLs from a GBIF Occurrence-Search response.

    GBIF shape:
        {"results": [{"key": ..., "media": [{"type": "StillImage", "identifier": "https://..."}]}, ...]}
    """
    urls: list[str] = []
    for record in gbif_response.get("results") or []:
        media = record.get("media") or []
        for m in media:
            url = m.get("identifier") or ""
            if url.startswith("http"):
                urls.append(url)
                break  # one image per record
        if len(urls) >= limit:
            break
    return urls[:limit]


async def fetch_species_images(client: httpx.AsyncClient, latin_name: str, limit: int) -> list[str]:
    """Query GBIF for image URLs for one species."""
    try:
        resp = await client.get(
            _GBIF_URL,
            params={"scientificName": latin_name, "mediaType": "StillImage", "limit": 20},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("GBIF %s for %s", resp.status_code, latin_name)
            return []
        return extract_image_urls(resp.json(), limit)
    except Exception as exc:
        logger.warning("GBIF fetch failed for %s: %s", latin_name, exc)
        return []


async def download_image(client: httpx.AsyncClient, url: str, dest: Path) -> bool:
    try:
        resp = await client.get(url, timeout=20, follow_redirects=True)
        if resp.status_code != 200 or len(resp.content) < 1024:
            return False
        dest.write_bytes(resp.content)
        return True
    except Exception as exc:
        logger.warning("Image download failed for %s: %s", url, exc)
        return False


async def main(n_species: int, photos_per_species: int):
    from database import init_pool, close_pool, get_db

    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall(
                "SELECT id, latin_name FROM plant_species "
                "WHERE latin_name IS NOT NULL AND latin_name != '' "
                "ORDER BY random() LIMIT $1",
                (n_species,),
            )
        species = [(r["id"], r["latin_name"]) for r in rows]
        logger.info("Sampling %d species", len(species))

        _EVAL_DIR.mkdir(parents=True, exist_ok=True)

        stats = {"fetched": 0, "skipped": 0, "no_images": 0, "photos": 0}

        async with httpx.AsyncClient() as client:
            for sid, name in species:
                species_dir = _EVAL_DIR / str(sid)
                existing = list(species_dir.glob("gbif_*.jpg")) if species_dir.exists() else []
                if len(existing) >= photos_per_species:
                    stats["skipped"] += 1
                    continue

                urls = await fetch_species_images(client, name, photos_per_species)
                await asyncio.sleep(_REQUEST_DELAY_S)
                if not urls:
                    stats["no_images"] += 1
                    continue

                species_dir.mkdir(exist_ok=True)
                for i, url in enumerate(urls):
                    dest = species_dir / f"gbif_{int(time.time() * 1000)}_{i}.jpg"
                    ok = await download_image(client, url, dest)
                    if ok:
                        stats["photos"] += 1
                stats["fetched"] += 1

        logger.info("Done. %s", stats)
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--n-species", type=int, default=100)
    p.add_argument("--photos-per-species", type=int, default=3)
    args = p.parse_args()
    asyncio.run(main(args.n_species, args.photos_per_species))
```

- [ ] **Step 1.5: Run the test, verify it passes**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_fetch_eval_set.py -v
```

Expected: 3 passed.

- [ ] **Step 1.6: Smoke-test the script with N=2**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python scripts/fetch_eval_set.py --n-species 2 --photos-per-species 2
```

Expected: logs "Sampling 2 species", "Done. {'fetched': 2, 'skipped': 0, 'no_images': 0, 'photos': 4}" (or similar with some no_images if GBIF lacks images for the random species).

Verify on disk:
```bash
ls backend/data/eval/
```
Expected: two folders (species IDs as names) each containing 1-2 `.jpg` files.

If the script fails with `init_pool` errors, confirm `DATABASE_URL` is set: `python -c "import os; print(os.environ.get('DATABASE_URL'))"`. If missing, set it per `backend/.env.example`.

- [ ] **Step 1.7: Commit**

```bash
git add backend/scripts/fetch_eval_set.py backend/tests/test_fetch_eval_set.py backend/tests/fixtures/gbif_occurrence_response.json
git commit -m "feat(bioclip): GBIF eval set fetcher script"
```

---

## Task 2: BioCLIP eval runner

**Files:**
- Create: `backend/scripts/eval_bioclip.py`
- Create: `backend/tests/test_eval_bioclip.py`

- [ ] **Step 2.1: Write the failing tests for the pure metric/distribution/threshold helpers**

Create `backend/tests/test_eval_bioclip.py`:

```python
"""Unit tests for eval_bioclip helpers."""
import pytest

from scripts.eval_bioclip import (
    score_distribution,
    suggest_thresholds,
    classify_prediction,
)


def test_classify_prediction_correct_top1():
    """correct_id is the first of the predictions → top-1 hit."""
    predictions = [(123, 0.31), (456, 0.27), (789, 0.20)]
    out = classify_prediction(predictions, correct_id=123)
    assert out["correct_top1"] is True
    assert out["correct_top5"] is True
    assert out["top1_score"] == pytest.approx(0.31)
    assert out["margin"] == pytest.approx(0.04, abs=1e-6)


def test_classify_prediction_correct_in_top5_not_top1():
    """correct_id is in the list but not first → top-5 hit, not top-1."""
    predictions = [(456, 0.28), (123, 0.27), (789, 0.20)]
    out = classify_prediction(predictions, correct_id=123)
    assert out["correct_top1"] is False
    assert out["correct_top5"] is True


def test_classify_prediction_empty_predictions():
    """No predictions returned → not correct, no scores."""
    out = classify_prediction([], correct_id=123)
    assert out["correct_top1"] is False
    assert out["correct_top5"] is False
    assert out["top1_score"] is None
    assert out["margin"] is None


def test_score_distribution_basic_stats():
    """Returns mean/median/min/max for a list of floats."""
    stats = score_distribution([0.10, 0.20, 0.30, 0.40, 0.50])
    assert stats["mean"] == pytest.approx(0.30)
    assert stats["median"] == pytest.approx(0.30)
    assert stats["min"] == pytest.approx(0.10)
    assert stats["max"] == pytest.approx(0.50)


def test_score_distribution_empty_returns_zeros():
    """Empty list returns zeros, never errors."""
    stats = score_distribution([])
    assert stats["mean"] == 0.0
    assert stats["median"] == 0.0


def test_suggest_thresholds_returns_4_buckets():
    """Output has high/medium/low/no_match keys with float thresholds."""
    correct_top1 = [0.30, 0.32, 0.28, 0.35, 0.31]
    wrong_top1 = [0.22, 0.24, 0.20, 0.26, 0.23]
    correct_margins = [0.05, 0.04, 0.06, 0.05, 0.04]
    wrong_margins = [0.01, 0.02, 0.01, 0.02, 0.01]

    out = suggest_thresholds(correct_top1, wrong_top1, correct_margins, wrong_margins)
    assert set(out.keys()) >= {"high_top1", "high_margin", "medium_top1", "low_top1"}
    # High should be at least the 75th percentile of CORRECT (most discriminating)
    assert out["high_top1"] >= 0.28
    # Low matches the existing _MIN_CONFIDENCE_FOR_RESULT floor
    assert out["low_top1"] == 0.10
```

- [ ] **Step 2.2: Run the test to verify it fails**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_eval_bioclip.py -v
```

Expected: `ImportError` on `scripts.eval_bioclip` — module doesn't exist.

- [ ] **Step 2.3: Implement the script**

Create `backend/scripts/eval_bioclip.py`:

```python
#!/usr/bin/env python3
"""Run the BioCLIP worker against backend/data/eval/ and print accuracy + score distributions.

Usage:
    python scripts/eval_bioclip.py [--worker-url URL]

Reads BIOCLIP_WORKER_URL from env if --worker-url is omitted.
"""
import argparse
import asyncio
import logging
import os
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

_EVAL_DIR = Path(__file__).resolve().parent.parent / "data" / "eval"


def classify_prediction(predictions: list[tuple[int, float]], correct_id: int) -> dict:
    """Compare predictions (list of (species_id, score), top-K sorted desc) against correct_id.

    Returns:
        {"correct_top1": bool, "correct_top5": bool, "top1_score": float|None, "margin": float|None}
    """
    if not predictions:
        return {"correct_top1": False, "correct_top5": False, "top1_score": None, "margin": None}
    top_ids = [p[0] for p in predictions]
    top1_score = predictions[0][1]
    top2_score = predictions[1][1] if len(predictions) > 1 else 0.0
    return {
        "correct_top1": top_ids[0] == correct_id,
        "correct_top5": correct_id in top_ids[:5],
        "top1_score": top1_score,
        "margin": top1_score - top2_score,
    }


def score_distribution(values: list[float]) -> dict:
    """Compute mean/median/min/max/p25/p75 for a list of floats."""
    if not values:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0, "p25": 0.0, "p75": 0.0}
    sorted_v = sorted(values)
    n = len(sorted_v)
    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
        "p25": sorted_v[n // 4],
        "p75": sorted_v[(3 * n) // 4],
    }


def suggest_thresholds(
    correct_top1: list[float],
    wrong_top1: list[float],
    correct_margins: list[float],
    wrong_margins: list[float],
) -> dict:
    """Compute reasonable threshold candidates from observed distributions.

    Heuristic:
      high_top1   = max(0.28, p25 of CORRECT top-1)  — at least most-correct land here
      high_margin = max(0.03, p25 of CORRECT margins) — meaningful gap to top-2
      medium_top1 = max(0.20, median of WRONG top-1)  — above where wrong cluster
      low_top1    = 0.10 (existing floor, unchanged)
    """
    correct_t1_dist = score_distribution(correct_top1)
    wrong_t1_dist = score_distribution(wrong_top1)
    correct_m_dist = score_distribution(correct_margins)
    return {
        "high_top1": max(0.28, correct_t1_dist["p25"]),
        "high_margin": max(0.03, correct_m_dist["p25"]),
        "medium_top1": max(0.20, wrong_t1_dist["median"]),
        "low_top1": 0.10,
    }


async def call_worker(client: httpx.AsyncClient, worker_url: str, photo_path: Path) -> list[tuple[int, float]]:
    """POST one photo to the BioCLIP worker, return predictions or empty list."""
    try:
        with photo_path.open("rb") as f:
            resp = await client.post(
                f"{worker_url.rstrip('/')}/identify",
                files={"image": (photo_path.name, f.read(), "image/jpeg")},
                timeout=30,
            )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return [(m["species_id"], m["confidence"]) for m in data.get("matches", [])]
    except Exception as exc:
        logger.warning("Worker call failed for %s: %s", photo_path.name, exc)
        return []


async def main(worker_url: str):
    if not _EVAL_DIR.exists():
        logger.error("Eval dir not found: %s. Run fetch_eval_set.py first.", _EVAL_DIR)
        return

    photos = []
    for species_dir in sorted(_EVAL_DIR.iterdir()):
        if not species_dir.is_dir():
            continue
        try:
            sid = int(species_dir.name)
        except ValueError:
            continue
        for photo in species_dir.glob("gbif_*.jpg"):
            photos.append((sid, photo))

    if not photos:
        logger.error("No photos in %s", _EVAL_DIR)
        return

    logger.info("Evaluating %d photos across %d species using worker %s",
                len(photos), len({sid for sid, _ in photos}), worker_url)

    correct_top1_scores: list[float] = []
    wrong_top1_scores: list[float] = []
    correct_margins: list[float] = []
    wrong_margins: list[float] = []
    n_top1 = 0
    n_top5 = 0
    n_with_pred = 0

    async with httpx.AsyncClient() as client:
        for sid, photo in photos:
            predictions = await call_worker(client, worker_url, photo)
            result = classify_prediction(predictions, sid)
            if result["top1_score"] is None:
                continue
            n_with_pred += 1
            if result["correct_top1"]:
                n_top1 += 1
                correct_top1_scores.append(result["top1_score"])
                correct_margins.append(result["margin"])
            else:
                wrong_top1_scores.append(result["top1_score"])
                wrong_margins.append(result["margin"])
            if result["correct_top5"]:
                n_top5 += 1

    correct_dist = score_distribution(correct_top1_scores)
    wrong_dist = score_distribution(wrong_top1_scores)
    correct_m_dist = score_distribution(correct_margins)
    wrong_m_dist = score_distribution(wrong_margins)
    suggested = suggest_thresholds(correct_top1_scores, wrong_top1_scores, correct_margins, wrong_margins)

    print()
    print(f"BioCLIP eval report")
    print(f"Worker:  {worker_url}")
    print(f"Photos:  {n_with_pred}/{len(photos)}   Species: {len({sid for sid, _ in photos})}")
    print()
    print("⚠  Eval source is GBIF — likely overlap with BioCLIP training data.")
    print("   Real-user accuracy will be lower than these numbers.")
    print()
    print(f"Top-1 accuracy: {n_top1}/{n_with_pred}  ({100*n_top1/max(n_with_pred,1):.0f}%)")
    print(f"Top-5 accuracy: {n_top5}/{n_with_pred}  ({100*n_top5/max(n_with_pred,1):.0f}%)")
    print()
    print(f"Score distribution when CORRECT (top-1):")
    print(f"  mean={correct_dist['mean']:.3f}  median={correct_dist['median']:.3f}  "
          f"min={correct_dist['min']:.3f}  max={correct_dist['max']:.3f}")
    print(f"Score distribution when WRONG (top-1):")
    print(f"  mean={wrong_dist['mean']:.3f}  median={wrong_dist['median']:.3f}  "
          f"min={wrong_dist['min']:.3f}  max={wrong_dist['max']:.3f}")
    print()
    print(f"Margin (top1 − top2) when CORRECT:  "
          f"mean={correct_m_dist['mean']:.3f}  p25={correct_m_dist['p25']:.3f}  p75={correct_m_dist['p75']:.3f}")
    print(f"Margin (top1 − top2) when WRONG:    "
          f"mean={wrong_m_dist['mean']:.3f}  p25={wrong_m_dist['p25']:.3f}  p75={wrong_m_dist['p75']:.3f}")
    print()
    print(f"Suggested threshold values (based on this run):")
    print(f"  high     :  top1 >= {suggested['high_top1']:.2f}  AND  margin >= {suggested['high_margin']:.3f}")
    print(f"  medium   :  top1 >= {suggested['medium_top1']:.2f}")
    print(f"  low      :  top1 >= {suggested['low_top1']:.2f}")
    print(f"  no_match :  top1 <  {suggested['low_top1']:.2f}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--worker-url", default=os.environ.get("BIOCLIP_WORKER_URL", ""))
    args = p.parse_args()
    if not args.worker_url:
        logger.error("Worker URL required: pass --worker-url or set BIOCLIP_WORKER_URL")
        sys.exit(1)
    asyncio.run(main(args.worker_url))
```

- [ ] **Step 2.4: Run the unit tests, verify they pass**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_eval_bioclip.py -v
```

Expected: 6 passed.

- [ ] **Step 2.5: Smoke-test the script (requires worker reachable + eval data)**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python scripts/eval_bioclip.py --worker-url $BIOCLIP_WORKER_URL
```

Expected: prints an eval report with whatever numbers the small eval set produces. (Don't worry about the actual numbers yet — Task 5 will run the full eval after Task 1's full population.)

If the worker is not yet reachable, skip this smoke test and proceed to commit. The script's correctness is covered by the unit tests; the worker integration is exercised in Task 5.

- [ ] **Step 2.6: Commit**

```bash
git add backend/scripts/eval_bioclip.py backend/tests/test_eval_bioclip.py
git commit -m "feat(bioclip): eval runner with accuracy + score distribution report"
```

---

## Task 3: Calibration layer in the router

**Files:**
- Modify: `backend/routers/plant_id.py:35-37` (constants), `backend/routers/plant_id.py:51-55` (`IdentifyResponse`), `backend/routers/plant_id.py:206-207` (bioclip return), `backend/routers/plant_id.py:265-266` (plantnet return)
- Create: `backend/tests/test_plant_id_confidence.py`

- [ ] **Step 3.1: Write the failing tests for `_classify_confidence`**

Create `backend/tests/test_plant_id_confidence.py`:

```python
"""Unit tests for the confidence classifier."""
import pytest

from routers.plant_id import _classify_confidence


def test_high_when_top1_strong_and_margin_clear():
    """top1=0.35, margin to top2=0.05 → high."""
    assert _classify_confidence(0.35, 0.30) == "high"


def test_medium_when_top1_strong_but_margin_thin():
    """top1=0.32 but top2=0.31 → margin too small for high; still ≥0.25 → medium."""
    assert _classify_confidence(0.32, 0.31) == "medium"


def test_medium_when_top1_just_above_threshold():
    """top1=0.27, no top2 → medium (above 0.25, not above 0.30)."""
    assert _classify_confidence(0.27, None) == "medium"


def test_low_when_top1_above_floor_but_below_medium():
    """top1=0.20 → low."""
    assert _classify_confidence(0.20, 0.15) == "low"


def test_no_match_when_top1_below_floor():
    """top1=0.08 → no_match."""
    assert _classify_confidence(0.08, 0.05) == "no_match"


def test_no_match_when_top1_exactly_at_floor_lower_bound():
    """top1=0.099 (< 0.10) → no_match. Boundary check."""
    assert _classify_confidence(0.099, 0.05) == "no_match"


def test_low_when_top1_exactly_at_floor():
    """top1=0.10 → low (the floor is inclusive)."""
    assert _classify_confidence(0.10, 0.05) == "low"


def test_high_requires_both_top1_and_margin():
    """top1 above high threshold but margin below → falls to medium."""
    # top1=0.35, margin=0.02 → high_margin not met
    assert _classify_confidence(0.35, 0.33) == "medium"
```

- [ ] **Step 3.2: Run the test to verify it fails**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_plant_id_confidence.py -v
```

Expected: `ImportError` — `_classify_confidence` doesn't exist yet.

- [ ] **Step 3.3: Add `_classify_confidence` and threshold constants to `plant_id.py`**

In `backend/routers/plant_id.py`, replace lines 35-36 (existing `_MIN_CONFIDENCE_FOR_RESULT` and `_LOW_CONFIDENCE_UPPER`) with:

```python
_MAX_IMAGE_BYTES = 5 * 1024 * 1024

# Confidence calibration thresholds (informed by scripts/eval_bioclip.py output).
# Update these from a fresh eval run; current values are educated initial guesses.
_CONFIDENCE_FLOOR = 0.10       # below this → no_match (no candidates surfaced)
_HIGH_TOP1 = 0.30              # top-1 must clear this AND _HIGH_MARGIN to be "high"
_HIGH_MARGIN = 0.04            # top-1 minus top-2
_MEDIUM_TOP1 = 0.25            # top-1 above this is at least medium

# Legacy aliases retained so existing call-sites don't break. Prefer the named
# constants above in new code; remove these once everything migrates.
_MIN_CONFIDENCE_FOR_RESULT = _CONFIDENCE_FLOOR
_LOW_CONFIDENCE_UPPER = _HIGH_TOP1


def _classify_confidence(top1: float, top2: float | None) -> str:
    """Bucket a (top1, top2) pair into one of high / medium / low / no_match.

    See docs/plans/2026-05-24-bioclip-confidence-calibration-design.md §3.
    """
    if top1 < _CONFIDENCE_FLOOR:
        return "no_match"
    margin = top1 - (top2 or 0.0)
    if top1 >= _HIGH_TOP1 and margin >= _HIGH_MARGIN:
        return "high"
    if top1 >= _MEDIUM_TOP1:
        return "medium"
    return "low"
```

(Note: keep `_ICONS_DIR` from line 38 unchanged below this block.)

- [ ] **Step 3.4: Run the confidence tests, verify they pass**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_plant_id_confidence.py -v
```

Expected: 8 passed.

- [ ] **Step 3.5: Add `confidence` field to `IdentifyResponse` model**

In `backend/routers/plant_id.py`, replace lines 51-55:

```python
class IdentifyResponse(BaseModel):
    candidates: list[CandidateOut]
    confidence: str = "no_match"  # high | medium | low | no_match
    low_confidence: bool = False  # DEPRECATED: derived from confidence; remove once frontend migrates
    source: str = "bioclip"
```

- [ ] **Step 3.6: Update the BioCLIP return path to set the new field**

In `backend/routers/plant_id.py`, locate the return statements inside `_bioclip_identify` (around lines 168-207). Replace the early-return at line 168-169:

```python
    if not matches or matches[0][1] < _MIN_CONFIDENCE_FOR_RESULT:
        return IdentifyResponse(candidates=[], low_confidence=False, source="bioclip")
```

with:

```python
    if not matches or matches[0][1] < _CONFIDENCE_FLOOR:
        return IdentifyResponse(
            candidates=[],
            confidence="no_match",
            low_confidence=False,
            source="bioclip",
        )
```

And the final return at lines 206-207:

```python
    low_conf = _MIN_CONFIDENCE_FOR_RESULT <= matches[0][1] < _LOW_CONFIDENCE_UPPER
    return IdentifyResponse(candidates=out, low_confidence=low_conf, source="bioclip")
```

with:

```python
    top1 = matches[0][1]
    top2 = matches[1][1] if len(matches) > 1 else None
    confidence = _classify_confidence(top1, top2)
    return IdentifyResponse(
        candidates=out,
        confidence=confidence,
        low_confidence=(confidence != "high"),
        source="bioclip",
    )
```

- [ ] **Step 3.7: Update the PlantNet return path to set the new field**

In `backend/routers/plant_id.py`, locate lines 247-248:

```python
    if not candidates or candidates[0].confidence < _MIN_CONFIDENCE_FOR_RESULT:
        return IdentifyResponse(candidates=[], low_confidence=False, source="plantnet")
```

Replace with:

```python
    if not candidates or candidates[0].confidence < _CONFIDENCE_FLOOR:
        return IdentifyResponse(
            candidates=[],
            confidence="no_match",
            low_confidence=False,
            source="plantnet",
        )
```

And lines 265-266:

```python
    low_conf = _MIN_CONFIDENCE_FOR_RESULT <= candidates[0].confidence < _LOW_CONFIDENCE_UPPER
    return IdentifyResponse(candidates=out, low_confidence=low_conf, source="plantnet")
```

Replace with:

```python
    top1 = candidates[0].confidence
    top2 = candidates[1].confidence if len(candidates) > 1 else None
    confidence = _classify_confidence(top1, top2)
    return IdentifyResponse(
        candidates=out,
        confidence=confidence,
        low_confidence=(confidence != "high"),
        source="plantnet",
    )
```

- [ ] **Step 3.8: Smoke-test the import + run all backend tests**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -c "import main; print('main OK')"
python -m pytest tests/test_plant_id.py tests/test_plant_id_confidence.py tests/test_plant_id_endpoint.py -v
```

Expected: `main OK` then all tests pass. Some existing `test_plant_id_endpoint.py` tests may need updating if they assert the exact response shape — if so, update them to include `confidence` in expected output before continuing.

- [ ] **Step 3.9: Commit**

```bash
git add backend/routers/plant_id.py backend/tests/test_plant_id_confidence.py
git commit -m "feat(plant-id): margin-based 4-label confidence classifier"
```

---

## Task 4: Frontend — surface the new confidence field

**Files:**
- Modify: `frontend/src/types/index.ts:500-503` (`IdentifyResponse` type)
- Modify: `frontend/src/i18n/translations.ts:495-507` (typed structure of `t.identify.*`)
- Modify: `frontend/src/i18n/nl.ts:540-555` (Dutch strings)
- Modify: `frontend/src/i18n/en.ts:540-555` (English strings)
- Modify: `frontend/src/components/identify/IdentifyResults.tsx`
- Modify: `frontend/src/pages/IdentifyPlant.tsx`
- Create: `frontend/src/components/identify/confidenceTone.ts`
- Create: `frontend/src/components/identify/__tests__/confidenceTone.test.ts`

- [ ] **Step 4.1: Add the `confidence` field + `IdentifyConfidence` type to `frontend/src/types/index.ts`**

At the end of the existing `IdentifyResponse` type at line 500-503, add the `confidence` field:

```typescript
export type IdentifyConfidence = 'high' | 'medium' | 'low' | 'no_match'

export type IdentifyResponse = {
  candidates: PlantIdCandidate[]
  confidence: IdentifyConfidence    // ← add
  low_confidence: boolean            // kept for back-compat during deploy window
}
```

- [ ] **Step 4.2: Extend the i18n type in `frontend/src/i18n/translations.ts`**

In `frontend/src/i18n/translations.ts` around lines 495-507, the `identify` block lists `lowConfidence: string` and a `noMatch` sub-object. Add a `confidence` sub-object and a `bodyDetailed` field to `noMatch`:

```typescript
    identify: {
      // ... existing keys (camera, results, etc.) ...
      lowConfidence: string  // DEPRECATED, kept until confidence.low rollout completes
      confidence: {
        medium: string       // "Fairly confident" / "Redelijk zeker"
        low: string          // "Not sure — pick one manually or try a better photo"
      }
      noMatch: {
        title: string
        body: string
        bodyDetailed: string  // "No identification. Try another photo (focus closer on a leaf or flower)."
        retry: string
        manualFallback: string
      }
      // ... existing remaining keys ...
    }
```

Don't remove `lowConfidence` from the type yet — the string stays available so any other call sites keep typechecking.

- [ ] **Step 4.3: Add the matching Dutch + English strings**

In `frontend/src/i18n/nl.ts` around line 544 (next to the existing `lowConfidence` Dutch string), add inside the `identify` block:

```typescript
    confidence: {
      medium: 'Redelijk zeker',
      low: 'Niet zeker — kies handmatig of probeer een betere foto',
    },
    // Inside the existing noMatch block, add:
    //   bodyDetailed: 'Geen herkenning. Probeer een andere foto (kies het blad of de bloem dichterbij).',
```

In `frontend/src/i18n/en.ts` at the analogous location, add:

```typescript
    confidence: {
      medium: 'Fairly confident',
      low: 'Not sure — pick one manually or try a better photo',
    },
    // Inside noMatch:
    //   bodyDetailed: 'No identification. Try another photo (focus closer on a leaf or flower).',
```

- [ ] **Step 4.4: Write the failing test for `confidenceTone`**

Create `frontend/src/components/identify/__tests__/confidenceTone.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { confidenceTone } from '../confidenceTone'

describe('confidenceTone', () => {
  it('returns no-banner tone for high', () => {
    expect(confidenceTone('high')).toEqual({ showBanner: false, subtitleKey: null, bannerKey: null })
  })
  it('returns subtitle key for medium', () => {
    expect(confidenceTone('medium')).toEqual({
      showBanner: false,
      subtitleKey: 'confidence.medium',
      bannerKey: null,
    })
  })
  it('returns banner key for low', () => {
    expect(confidenceTone('low')).toEqual({
      showBanner: true,
      subtitleKey: null,
      bannerKey: 'confidence.low',
    })
  })
  it('returns special body for no_match', () => {
    expect(confidenceTone('no_match')).toEqual({
      showBanner: false,
      subtitleKey: null,
      bannerKey: null,
      noMatchBodyKey: 'noMatch.bodyDetailed',
    })
  })
})
```

- [ ] **Step 4.5: Run the test, verify it fails**

```bash
cd "C:\Users\leon_\Projects\Floreren\frontend"
npx vitest run src/components/identify/__tests__/confidenceTone.test.ts
```

Expected: import error — `confidenceTone` module doesn't exist yet.

- [ ] **Step 4.6: Implement `confidenceTone`**

Create `frontend/src/components/identify/confidenceTone.ts`:

```typescript
import type { IdentifyConfidence } from '../../types'

export type ConfidenceTone = {
  showBanner: boolean
  subtitleKey: string | null
  bannerKey: string | null
  noMatchBodyKey?: string
}

export function confidenceTone(confidence: IdentifyConfidence): ConfidenceTone {
  switch (confidence) {
    case 'high':
      return { showBanner: false, subtitleKey: null, bannerKey: null }
    case 'medium':
      return { showBanner: false, subtitleKey: 'confidence.medium', bannerKey: null }
    case 'low':
      return { showBanner: true, subtitleKey: null, bannerKey: 'confidence.low' }
    case 'no_match':
      return {
        showBanner: false,
        subtitleKey: null,
        bannerKey: null,
        noMatchBodyKey: 'noMatch.bodyDetailed',
      }
  }
}
```

- [ ] **Step 4.7: Run the test, verify it passes**

```bash
cd "C:\Users\leon_\Projects\Floreren\frontend"
npx vitest run src/components/identify/__tests__/confidenceTone.test.ts
```

Expected: 4 passed.

- [ ] **Step 4.8: Wire `confidence` through the page → results**

In `frontend/src/pages/IdentifyPlant.tsx`, find where the identify response is received (look for `low_confidence` use). Replace whatever currently passes `lowConfidence` to `<IdentifyResults />` to pass the new `confidence` instead. Example (adjust to actual prop names found):

```tsx
// Before:
<IdentifyResults
  candidates={response.candidates}
  lowConfidence={response.low_confidence}
  // ... other props ...
/>

// After:
<IdentifyResults
  candidates={response.candidates}
  confidence={response.confidence}
  // ... other props unchanged ...
/>
```

- [ ] **Step 4.9: Update `IdentifyResults` to use `confidenceTone`**

In `frontend/src/components/identify/IdentifyResults.tsx`, change the `Props` type:

```typescript
import type { IdentifyConfidence } from '../../types'
import { confidenceTone } from './confidenceTone'

type Props = {
  candidates: PlantIdCandidate[]
  confidence: IdentifyConfidence    // ← was: lowConfidence: boolean
  capturedThumbnailUrl: string | null
  onChoose: (candidate: PlantIdCandidate) => void
  onRetry: () => void
  onManualFallback: () => void
}
```

Update the component body:

```tsx
export function IdentifyResults({
  candidates, confidence, capturedThumbnailUrl, onChoose, onRetry, onManualFallback,
}: Props) {
  const t = useT()
  const tone = confidenceTone(confidence)

  if (candidates.length === 0) {
    // Use the detailed no-match body when confidence is no_match, fall back to existing
    const bodyText = tone.noMatchBodyKey
      ? t.identify.noMatch.bodyDetailed
      : t.identify.noMatch.body
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <h2 className="text-xl font-semibold mb-2">{t.identify.noMatch.title}</h2>
        <p className="text-gray-600 mb-6">{bodyText}</p>
        {capturedThumbnailUrl && (
          <img src={capturedThumbnailUrl} alt="" className="w-32 h-32 object-cover rounded mx-auto mb-6 opacity-75" />
        )}
        <div className="flex flex-col gap-3">
          <button onClick={onRetry} className="bg-green-700 text-white px-4 py-3 rounded">
            {t.identify.noMatch.retry}
          </button>
          <button onClick={onManualFallback} className="text-gray-700 px-4 py-3 rounded border">
            {t.identify.noMatch.manualFallback}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-2">{t.identify.results.title}</h2>
      {tone.showBanner && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 mb-4 text-sm">
          {t.identify.confidence.low}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {candidates.map((c, idx) => {
          const pct = Math.round(c.confidence * 100)
          const commonName = c.common_names_en[0] || c.common_names_nl[0] || c.scientific_name
          const isTop = idx === 0
          return (
            <button
              key={c.scientific_name}
              onClick={() => onChoose(c)}
              className="flex items-center gap-3 p-3 bg-white border rounded-lg text-left active:bg-gray-50"
            >
              {c.thumbnail_url ? (
                <img src={c.thumbnail_url} alt="" className="w-16 h-16 object-cover rounded" />
              ) : (
                <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-2xl">🌿</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{commonName}</div>
                <div className="text-xs italic text-gray-500 truncate">{c.scientific_name}</div>
                {isTop && tone.subtitleKey === 'confidence.medium' && (
                  <div className="text-xs text-gray-600 mt-0.5">{t.identify.confidence.medium}</div>
                )}
                <div className="mt-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                  <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{pct}% {t.identify.results.confidence}</div>
              </div>
            </button>
          )
        })}
      </div>
      <div className="text-center text-xs text-gray-400 mt-6">{t.identify.results.poweredBy}</div>
    </div>
  )
}
```

- [ ] **Step 4.10: Typecheck + run frontend tests**

```bash
cd "C:\Users\leon_\Projects\Floreren\frontend"
npx tsc --noEmit
npx vitest run
```

Expected: zero TypeScript errors; all tests pass (including the new `confidenceTone` test).

- [ ] **Step 4.11: Commit**

```bash
git add frontend/src/types frontend/src/components/identify frontend/src/pages/IdentifyPlant.tsx frontend/src/i18n
git commit -m "feat(identify): render 4-state confidence (high/medium/low/no_match) UX"
```

---

## Task 5: Run the eval + tune thresholds + deploy

**Files:**
- Modify: `backend/routers/plant_id.py` (threshold constants, after eval data is in hand)

- [ ] **Step 5.1: Populate the eval set (~100 species × 3 photos)**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python scripts/fetch_eval_set.py --n-species 100 --photos-per-species 3
```

Expected: takes ~5 minutes (rate-limited at ~1 req/sec). Logs `Done. {...}` with non-zero `fetched` and `photos`.

If GBIF returns no images for many random species, re-run with a larger `--n-species`. Aim for at least 200 total photos.

- [ ] **Step 5.2: Run the eval against the live worker**

Confirm `BIOCLIP_WORKER_URL` is set in your local env (it should match what's in Fly secrets):

```bash
echo $BIOCLIP_WORKER_URL
```

If empty, set it (look up via `fly secrets list -a floreren-api` if you don't remember).

Then run:

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python scripts/eval_bioclip.py
```

Expected: prints the eval report with accuracy + distributions + suggested thresholds. Copy the suggested threshold values into a note.

- [ ] **Step 5.3: Update threshold constants in `plant_id.py`**

In `backend/routers/plant_id.py`, update the four threshold constants added in Task 3.3 with the values from the eval report. Example (replace with actual numbers from your run):

```python
_CONFIDENCE_FLOOR = 0.10
_HIGH_TOP1 = 0.31              # ← from eval suggested high_top1
_HIGH_MARGIN = 0.05            # ← from eval suggested high_margin
_MEDIUM_TOP1 = 0.24            # ← from eval suggested medium_top1
```

- [ ] **Step 5.4: Re-run the confidence unit tests to confirm they still pass with new thresholds**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python -m pytest tests/test_plant_id_confidence.py -v
```

If any test fails because the threshold change moved a boundary case, update the test's expected value to match the new threshold (NOT the other way around — the eval data is the source of truth for thresholds).

- [ ] **Step 5.5: Commit the tuned thresholds**

```bash
git add backend/routers/plant_id.py backend/tests/test_plant_id_confidence.py
git commit -m "tune(plant-id): confidence thresholds from BioCLIP eval run"
```

- [ ] **Step 5.6: Push + deploy**

```bash
cd "C:\Users\leon_\Projects\Floreren"
git push origin master         # triggers Vercel deploy (frontend)
fly deploy                     # deploys backend to Fly
```

Expected: Vercel deploy succeeds (check `vercel.com` dashboard). `fly deploy` runs the release_command (`alembic upgrade head`, no-op since no new migrations), then rolls the new image with the calibration logic.

- [ ] **Step 5.7: Verify in production**

In a browser (incognito to bypass any cached PWA state), go to `https://floreren.app`, log in, navigate to identify, take or upload a plant photo, and observe:
- The new confidence UX renders (subtitle for "medium", banner for "low", detailed body for "no_match")
- The candidate list still works at "high"

If something looks off, check the browser network tab for the response payload — confirm `confidence` is present in the `/api/plants/identify` response.

- [ ] **Step 5.8: Re-run the eval one more time post-deploy as a sanity check**

```bash
cd "C:\Users\leon_\Projects\Floreren\backend"
python scripts/eval_bioclip.py
```

Expected: same numbers as Step 5.2 (the eval runs against the worker, not the backend, so it shouldn't change). This is a checkpoint that nothing regressed in the worker or threshold script.

---

## Done criteria

- All 5 tasks committed, pushed, deployed.
- `python -m pytest tests/test_plant_id_confidence.py tests/test_fetch_eval_set.py tests/test_eval_bioclip.py` all pass.
- A live identify request against production returns a `confidence` field with one of the four expected values.
- The UI shows the right tone for each confidence band, verified manually.
- The eval report from Step 5.2 is saved (paste it into a comment on the relevant commit, or store as `docs/plans/2026-05-24-bioclip-eval-baseline.txt` for future comparison).
