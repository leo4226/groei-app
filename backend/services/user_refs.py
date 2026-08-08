"""User-confirmed image anchors for identification (#866 phase 2).

`user_confirmed_embeddings` is the strongest signal we have: real photos of a
real plant, labelled by the person who owns it. `_blend_scores` matches new
photos against these image-to-image, which is a far better signal than the
Latin-name text embedding — strong enough to rescue a species the text ranking
missed entirely.

Until now the only way in was `/identify/commit`: one photo, at the moment of
identification. Every later photo of that plant — better light, different
season, the plant grown in — was embedded by the journal's sanity-check and
then thrown away. This module is the shared write path that harvests those too,
with the guardrails a growing anchor set needs:

- **dedupe** — near-identical photos add no information and would let one angle
  dominate a species by weight of numbers.
- **cap** — a species is capped; at the cap the oldest anchor makes way, so a
  plant that changes over seasons stays represented by recent photos.
- **retraction** — anchors are labelled data. When the user says the plant is
  something else, or deletes the photo, the anchor must go with it, or we keep
  matching future photos against a label the user already rejected.
"""
import logging

import numpy as np

logger = logging.getLogger(__name__)

#: 512 float32 — the BioCLIP embedding width. Anything else is not an embedding.
EMBEDDING_BYTES = 2048

#: Above this cosine two photos say the same thing; keep the one already stored.
DEDUPE_MAX_COSINE = 0.98

#: Anchors kept per species. Chosen to bound both the identify-time matmul and
#: the influence any single plant can have on a species' representation.
MAX_ANCHORS_PER_SPECIES = 20


def _as_vector(embedding: bytes) -> np.ndarray | None:
    if not embedding or len(embedding) != EMBEDDING_BYTES:
        return None
    vector = np.frombuffer(embedding, dtype=np.float32)
    norm = float(np.linalg.norm(vector))
    if not np.isfinite(norm) or norm == 0:
        return None
    return vector / norm


async def add_anchor(
    db,
    species_id: int,
    embedding: bytes,
    *,
    account_id: int | None = None,
    photo_url: str | None = None,
    plant_id: int | None = None,
) -> str:
    """Store one confirmed embedding as an anchor for `species_id`.

    Returns what happened — "added", "duplicate", "invalid" — for logging and
    tests. Never raises: an anchor is an optimisation, and no user-facing flow
    should fail because one could not be stored.
    """
    vector = _as_vector(embedding)
    if vector is None or not species_id:
        return "invalid"

    try:
        existing = await db.execute_fetchall(
            "SELECT id, embedding FROM user_confirmed_embeddings "
            "WHERE species_id = ? ORDER BY id",
            (int(species_id),),
        )

        for row in existing:
            other = _as_vector(row["embedding"])
            if other is None:
                continue
            if float(vector @ other) >= DEDUPE_MAX_COSINE:
                return "duplicate"

        # At the cap, the oldest anchor makes way: a plant photographed over
        # years should be represented by what it looks like now.
        overflow = len(existing) + 1 - MAX_ANCHORS_PER_SPECIES
        for row in existing[:max(0, overflow)]:
            await db.execute(
                "DELETE FROM user_confirmed_embeddings WHERE id = ?", (row["id"],)
            )

        await db.execute(
            """INSERT INTO user_confirmed_embeddings
                 (species_id, embedding, source_account_id, source_photo_url, source_plant_id)
               VALUES (?, ?, ?, ?, ?)""",
            (int(species_id), embedding, account_id, photo_url, plant_id),
        )
        await db.commit()
    except Exception:
        logger.warning("Anchor write failed for species_id=%s", species_id, exc_info=True)
        return "invalid"

    logger.info(
        "Anchor stored species_id=%s plant_id=%s (evicted %d)",
        species_id, plant_id, max(0, overflow),
    )
    return "added"


async def retract_plant_anchors(db, plant_id: int, photo_url: str | None = None) -> int:
    """Drop the anchors a plant contributed. Returns how many went.

    Called when the user re-identifies the plant as something else: every
    anchor it produced now carries a label the user has rejected, and leaving
    them in place would keep pulling future photos towards the wrong species.

    `photo_url` covers the anchor captured at `/identify/commit`, which predates
    the plant row and so has no plant_id to match on — the commit photo becomes
    the plant's `photo_path`, which is what the caller passes here.
    """
    removed = 0
    try:
        rows = await db.execute_fetchall(
            "SELECT id FROM user_confirmed_embeddings WHERE source_plant_id = ?",
            (int(plant_id),),
        )
        ids = [r["id"] for r in rows]
        if photo_url:
            extra = await db.execute_fetchall(
                "SELECT id FROM user_confirmed_embeddings WHERE source_photo_url = ?",
                (photo_url,),
            )
            ids.extend(r["id"] for r in extra if r["id"] not in ids)

        for anchor_id in ids:
            await db.execute(
                "DELETE FROM user_confirmed_embeddings WHERE id = ?", (anchor_id,)
            )
        removed = len(ids)
        if removed:
            await db.commit()
    except Exception:
        logger.warning("Anchor retraction failed for plant_id=%s", plant_id, exc_info=True)
        return 0

    if removed:
        logger.info("Retracted %d anchor(s) for plant_id=%s", removed, plant_id)
    return removed


async def retract_photo_anchor(db, photo_url: str) -> int:
    """Drop the anchor a single deleted photo contributed."""
    if not photo_url:
        return 0
    try:
        rows = await db.execute_fetchall(
            "SELECT id FROM user_confirmed_embeddings WHERE source_photo_url = ?",
            (photo_url,),
        )
        for row in rows:
            await db.execute(
                "DELETE FROM user_confirmed_embeddings WHERE id = ?", (row["id"],)
            )
        if rows:
            await db.commit()
        return len(rows)
    except Exception:
        logger.warning("Anchor retraction failed for photo %s", photo_url, exc_info=True)
        return 0
