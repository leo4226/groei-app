"""BioCLIP sanity-check for journal photos.

One call to the GPU worker's /identify yields both the top species matches
AND the image embedding (base64 in the response — verified against
bioclip_worker.py), so no separate /embed-image round-trip is needed.

Returns the fields to store on the plant_photos row, or None when the
worker is not configured or unreachable. Never raises — a failed check is
a non-event; the journal works identically without it.
"""
import base64
import logging
import os

import httpx

logger = logging.getLogger(__name__)

_WORKER_URL = os.environ.get("BIOCLIP_WORKER_URL", "")
_WORKER_TOKEN = os.environ.get("BIOCLIP_WORKER_TOKEN", "")

# Below this confidence the model is guessing — disagreement proves nothing.
MISMATCH_THRESHOLD = 0.35


async def check_photo(image_bytes: bytes, plant_species_id: int | None) -> dict | None:
    if not _WORKER_URL:
        return None
    headers = {"X-Worker-Token": _WORKER_TOKEN} if _WORKER_TOKEN else {}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_WORKER_URL.rstrip('/')}/identify", headers=headers,
                files={"image": ("photo.jpg", image_bytes, "image/jpeg")},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("photo check skipped (worker unreachable): %s", exc)
        return None

    matches = data.get("matches") or []
    top = matches[0] if matches else None
    species_id = top.get("species_id") if top else None
    confidence = float(top.get("confidence", 0)) if top else 0.0
    try:
        embedding = base64.b64decode(data.get("embedding") or "")
    except Exception:
        logger.warning("Photo check embedding decode failed, using empty")
        embedding = b""

    mismatch = bool(
        plant_species_id is not None
        and species_id is not None
        and species_id != plant_species_id
        and confidence >= MISMATCH_THRESHOLD
    )
    return {
        "bioclip_species_id": species_id,
        "bioclip_confidence": confidence,
        "species_mismatch": mismatch,
        "embedding": embedding,
    }
