#!/usr/bin/env python3
"""Validate the un-gated user-confirmed blend (#442) on real photos.

Answers two questions the `_IMAGE_MATCH_MIN` floor depends on, using ONLY the
worker + the eval photo set (no prod DB):

  1. Where should the floor sit? Reports the image-to-image cosine distribution
     for SAME-species photo pairs vs DIFFERENT-species pairs. A good floor sits
     above most cross-species pairs and below most same-species pairs.

  2. Does the blend actually help? Leave-one-out: for each photo, treat every
     OTHER eval photo as a user-confirmed reference, run the real _blend_scores,
     and compare text-only vs blended top-1 / top-5 accuracy.

Eval set layout (same as eval_bioclip.py):  data/eval/<species_id>/gbif_*.jpg
Needs ≥2 photos for at least some species (leave-one-out needs a held-out pair).

Usage:
    python scripts/eval_blend.py [--worker-url URL]

Reads BIOCLIP_WORKER_URL from env if --worker-url is omitted.
"""
import argparse
import asyncio
import base64
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
import numpy as np

from routers.plant_id import _blend_scores, _IMAGE_MATCH_MIN

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

_EVAL_DIR = Path(__file__).resolve().parent.parent / "data" / "eval"

# Worker auth: when BIOCLIP_WORKER_TOKEN is set, send it on every request.
def _worker_headers() -> dict[str, str]:
    token = os.environ.get("BIOCLIP_WORKER_TOKEN", "")
    return {"X-Worker-Token": token} if token else {}


async def identify(client: httpx.AsyncClient, worker_url: str, path: Path):
    """POST one photo to /identify → (matches, query_embedding) or (None, None)."""
    try:
        with path.open("rb") as f:
            resp = await client.post(
                f"{worker_url.rstrip('/')}/identify",
                files={"image": (path.name, f.read(), "image/jpeg")},
                headers=_worker_headers(),
                timeout=30,
            )
        if resp.status_code != 200:
            return None, None
        data = resp.json()
        matches = [(m["species_id"], m["confidence"]) for m in data.get("matches", [])]
        emb_b64 = data.get("embedding")
        emb = np.frombuffer(base64.b64decode(emb_b64), dtype=np.float32) if emb_b64 else None
        return matches, emb
    except Exception as exc:
        logger.warning("identify failed for %s: %s", path.name, exc)
        return None, None


def _pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    return s[min(len(s) - 1, int(q * len(s)))]


def _dist(values: list[float]) -> str:
    if not values:
        return "(none)"
    return (f"n={len(values)} mean={statistics.mean(values):.3f} "
            f"p10={_pct(values,0.10):.3f} p50={_pct(values,0.50):.3f} "
            f"p90={_pct(values,0.90):.3f} p95={_pct(values,0.95):.3f}")


def _top(preds: list[tuple[int, float]], correct: int) -> tuple[bool, bool]:
    ids = [p[0] for p in preds]
    return (bool(ids) and ids[0] == correct, correct in ids[:5])


async def main(worker_url: str):
    if not _EVAL_DIR.exists():
        logger.error("Eval dir not found: %s. Run fetch_eval_set.py first.", _EVAL_DIR)
        return

    # Collect (species_id, path) and embed every photo once (cache matches + emb).
    photos: list[tuple[int, Path]] = []
    for d in sorted(_EVAL_DIR.iterdir()):
        if not d.is_dir():
            continue
        try:
            sid = int(d.name)
        except ValueError:
            continue
        photos += [(sid, p) for p in d.glob("gbif_*.jpg")]
    if not photos:
        logger.error("No photos in %s", _EVAL_DIR)
        return

    logger.info("Embedding %d photos via %s ...", len(photos), worker_url)
    records: list[dict] = []  # {sid, path, matches, emb}
    async with httpx.AsyncClient() as client:
        for sid, path in photos:
            matches, emb = await identify(client, worker_url, path)
            if emb is None or matches is None:
                continue
            records.append({"sid": sid, "matches": matches, "emb": emb})

    if len(records) < 2:
        logger.error("Too few usable photos (%d).", len(records))
        return

    embs = np.stack([r["emb"] for r in records])       # (M, 512), unit-norm
    sims = embs @ embs.T                                # pairwise image-to-image cosine

    # --- 1. cosine distributions: same-species vs different-species pairs ---
    within, cross = [], []
    for i in range(len(records)):
        for j in range(i + 1, len(records)):
            (within if records[i]["sid"] == records[j]["sid"] else cross).append(float(sims[i, j]))

    # --- 2. leave-one-out: text-only vs blended accuracy ---
    t1 = t5 = b1 = b5 = 0
    rescued = 0  # blended got top-1 right where text-only did not
    for i, rec in enumerate(records):
        # Refs = every OTHER photo, grouped by its species (the "confirmed" pool).
        refs: dict[int, list[np.ndarray]] = {}
        for j, other in enumerate(records):
            if j == i:
                continue
            refs.setdefault(other["sid"], []).append(other["emb"])
        refs_stacked = {s: np.stack(v) for s, v in refs.items()}

        text = rec["matches"]
        blended = _blend_scores(text, rec["emb"], refs_stacked)
        tt1, tt5 = _top(text, rec["sid"])
        bb1, bb5 = _top(blended, rec["sid"])
        t1 += tt1; t5 += tt5; b1 += bb1; b5 += bb5
        rescued += (bb1 and not tt1)

    n = len(records)
    print()
    print("BioCLIP blend validation (#442)")
    print(f"Worker: {worker_url}   photos: {n}   current _IMAGE_MATCH_MIN = {_IMAGE_MATCH_MIN}")
    print()
    print("Image-to-image cosine distribution (drives the floor):")
    print(f"  SAME species pairs:      {_dist(within)}")
    print(f"  DIFFERENT species pairs: {_dist(cross)}")
    suggested = round(max(_pct(cross, 0.95), 0.5), 2)
    print(f"  → suggested floor ≈ p95(different) = {suggested:.2f}  "
          f"(want it below same-species p50={_pct(within,0.50):.2f})")
    print()
    print("Leave-one-out accuracy (each photo, all others as confirmed refs):")
    print(f"  text-only :  top-1 {t1}/{n} ({100*t1/n:.0f}%)   top-5 {t5}/{n} ({100*t5/n:.0f}%)")
    print(f"  blended   :  top-1 {b1}/{n} ({100*b1/n:.0f}%)   top-5 {b5}/{n} ({100*b5/n:.0f}%)")
    print(f"  rescued by blend (wrong→right at top-1): {rescued}")
    print()
    print("Interpretation: if blended top-1 >> text-only, the un-gate helps. If the")
    print("floor sits between the two distributions, look-alikes won't be wrongly")
    print("rescued. Tune _IMAGE_MATCH_MIN in routers/plant_id.py accordingly.")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--worker-url", default=os.environ.get("BIOCLIP_WORKER_URL", ""))
    args = p.parse_args()
    if not args.worker_url:
        logger.error("Worker URL required: pass --worker-url or set BIOCLIP_WORKER_URL")
        sys.exit(1)
    asyncio.run(main(args.worker_url))
