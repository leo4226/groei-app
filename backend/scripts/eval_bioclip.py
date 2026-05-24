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

# Threshold floor values for suggest_thresholds. Numbers are intentional minima:
# even with a degenerate eval (very few samples), the suggested band edges
# can never fall below these — keeps the surfaced thresholds in a sane range.
_HIGH_TOP1_FLOOR   = 0.28
_HIGH_MARGIN_FLOOR = 0.03
_MEDIUM_TOP1_FLOOR = 0.20
_LOW_TOP1_FLOOR    = 0.10


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
) -> dict:
    """Compute reasonable threshold candidates from observed distributions.

    Heuristic:
      high_top1   = max(_HIGH_TOP1_FLOOR, p25 of CORRECT top-1)
      high_margin = max(_HIGH_MARGIN_FLOOR, p25 of CORRECT margins)
      medium_top1 = max(_MEDIUM_TOP1_FLOOR, median of WRONG top-1)
      low_top1    = _LOW_TOP1_FLOOR (existing floor, unchanged)
    """
    correct_t1_dist = score_distribution(correct_top1)
    wrong_t1_dist = score_distribution(wrong_top1)
    correct_m_dist = score_distribution(correct_margins)
    return {
        "high_top1": max(_HIGH_TOP1_FLOOR, correct_t1_dist["p25"]),
        "high_margin": max(_HIGH_MARGIN_FLOOR, correct_m_dist["p25"]),
        "medium_top1": max(_MEDIUM_TOP1_FLOOR, wrong_t1_dist["median"]),
        "low_top1": _LOW_TOP1_FLOOR,
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

    unique_species = {sid for sid, _ in photos}
    logger.info("Evaluating %d photos across %d species using worker %s",
                len(photos), len(unique_species), worker_url)

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
    suggested = suggest_thresholds(correct_top1_scores, wrong_top1_scores, correct_margins)

    print()
    print(f"BioCLIP eval report")
    print(f"Worker:  {worker_url}")
    print(f"Photos:  {n_with_pred}/{len(photos)}   Species: {len(unique_species)}")
    print()
    print("  Eval source is GBIF -- likely overlap with BioCLIP training data.")
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
    print(f"Margin (top1 - top2) when CORRECT:  "
          f"mean={correct_m_dist['mean']:.3f}  p25={correct_m_dist['p25']:.3f}  p75={correct_m_dist['p75']:.3f}")
    print(f"Margin (top1 - top2) when WRONG:    "
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
