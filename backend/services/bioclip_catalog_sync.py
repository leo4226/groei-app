"""Keep the BioCLIP worker's reference catalog in sync with plant_species (#866).

Identification matches a photo against one text embedding per species, held in a
`.npy` on the worker box. Historically that file was only ever rebuilt by a
manual `scripts/precompute_embeddings.py` run, so a species the user taught us —
BioCLIP got it wrong, PlantNet got it right, `get_or_create_species` created the
row — never entered the candidate set. It could only ever come back via the
user-confirmed image rescue in `_blend_scores`, which needs the next photo to
look much like the confirmed one.

This service closes that loop by pushing species to the worker's `/embed-text`
endpoint:

- `sync_pending()`   — embed species marked `embedded_at IS NULL` (the queue).
- `reconcile()`      — diff the DB against the worker's `/coverage` and repair
                       the queue in both directions, then drain it. Self-heals
                       after a worker rebuild, restore, or a lost `.npy`.

Both are best-effort: identification keeps working (minus the new species) if
the worker is unreachable, so no caller should fail because of a sync error.
"""
import logging
import os
import re
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# One /embed-text request per this many species. The worker caps a request at
# 256; 64 keeps a single GPU pass short so identify latency isn't affected.
_BATCH_SIZE = 64

# Ceiling per sync run, so a large drift (fresh worker, restored backup) is
# spread over several runs instead of monopolising the GPU in one go.
_MAX_PER_RUN = 500

_HTTP_TIMEOUT_S = 60.0

# Cheap sanity filter on LLM/PlantNet-provided names before they enter the
# identification catalog. Full GBIF-backbone validation is the follow-up; this
# only keeps obvious junk ("Unknown plant 2", "???") out of the reference set.
_LATIN_NAME_RE = re.compile(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-'.×x]{2,}$")


def _worker_url() -> str:
    return (os.environ.get("BIOCLIP_WORKER_URL") or "").strip().rstrip("/")


def _worker_headers() -> dict:
    token = (os.environ.get("BIOCLIP_WORKER_TOKEN") or "").strip()
    return {"X-Worker-Token": token} if token else {}


def is_embeddable_latin_name(name) -> bool:
    """True if `name` looks like a real botanical name worth embedding.

    Rejects blanks, digits (LLM placeholders like "Unknown plant 2") and
    punctuation soup. Deliberately permissive about genus-only names and
    hybrid markers — both occur legitimately in the catalog.
    """
    value = str(name or "").strip()
    if not value or len(value) < 3:
        return False
    return bool(_LATIN_NAME_RE.match(value))


async def _fetch_worker_species_ids() -> set[int] | None:
    """Species ids currently loaded by the worker, or None if it can't be reached."""
    url = _worker_url()
    if not url:
        return None
    import httpx

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S) as client:
            resp = await client.get(f"{url}/coverage", headers=_worker_headers())
    except Exception as exc:
        logger.warning("BioCLIP /coverage unreachable: %s", exc)
        return None
    if resp.status_code != 200:
        logger.warning("BioCLIP /coverage returned %s", resp.status_code)
        return None
    try:
        payload = resp.json()
    except ValueError:
        return None
    if not isinstance(payload, dict) or not payload.get("ready", False):
        logger.info("BioCLIP worker not ready — skipping catalog sync")
        return None
    ids: set[int] = set()
    for sid in payload.get("species_ids") or []:
        try:
            ids.add(int(sid))
        except (TypeError, ValueError):
            continue
    return ids


async def _post_embed_text(species: list[dict]) -> bool:
    """Push one batch to the worker. Returns True when it was accepted."""
    url = _worker_url()
    if not url:
        return False
    import httpx

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S) as client:
            resp = await client.post(
                f"{url}/embed-text",
                json={"species": species},
                headers=_worker_headers(),
            )
    except Exception as exc:
        logger.warning("BioCLIP /embed-text unreachable: %s", exc)
        return False
    if resp.status_code != 200:
        logger.warning("BioCLIP /embed-text returned %s: %s", resp.status_code, resp.text[:200])
        return False
    return True


async def mark_species_pending(db, species_id: int) -> None:
    """Queue a species for (re-)embedding — e.g. after its latin name changed."""
    await db.execute(
        "UPDATE plant_species SET embedded_at = NULL WHERE id = ?", (int(species_id),)
    )
    await db.commit()


async def _fetch_pending(db, limit: int) -> list[dict]:
    rows = await db.execute_fetchall(
        "SELECT id, latin_name, common_name_en FROM plant_species "
        "WHERE embedded_at IS NULL "
        "  AND id_enabled = TRUE "
        "  AND latin_name IS NOT NULL AND latin_name != '' "
        # Newest first: when a backlog exists, the species the user just taught
        # us is the one they are most likely to photograph again today.
        "ORDER BY id DESC "
        "LIMIT ?",
        (int(limit),),
    )
    return [dict(r) for r in rows]


async def _mark_embedded(db, species_ids: list[int]) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for sid in species_ids:
        await db.execute(
            "UPDATE plant_species SET embedded_at = ? WHERE id = ?", (now, int(sid))
        )
    await db.commit()


async def sync_pending(db, limit: int = _MAX_PER_RUN) -> dict:
    """Embed every queued species (up to `limit`) on the worker.

    Returns a summary dict; never raises. Species whose latin name fails the
    sanity check are skipped and left queued, so a later name fix picks them up
    instead of them being silently marked done.
    """
    if not _worker_url():
        return {"status": "unconfigured", "embedded": 0, "skipped": 0, "failed": 0}

    pending = await _fetch_pending(db, limit)
    if not pending:
        return {"status": "ok", "embedded": 0, "skipped": 0, "failed": 0}

    embeddable, skipped = [], 0
    for row in pending:
        if is_embeddable_latin_name(row.get("latin_name")):
            embeddable.append(row)
        else:
            skipped += 1
            logger.info(
                "Skipping species_id=%s — latin_name %r fails the sanity check",
                row.get("id"), row.get("latin_name"),
            )

    embedded, failed = 0, 0
    for start in range(0, len(embeddable), _BATCH_SIZE):
        batch = embeddable[start : start + _BATCH_SIZE]
        payload = [
            {
                "species_id": int(r["id"]),
                "latin_name": r["latin_name"],
                "common_name_en": r.get("common_name_en") or None,
            }
            for r in batch
        ]
        if await _post_embed_text(payload):
            await _mark_embedded(db, [int(r["id"]) for r in batch])
            embedded += len(batch)
        else:
            failed += len(batch)
            break  # worker is down or rejecting — stop, the queue survives

    if embedded:
        logger.info("BioCLIP catalog sync: embedded %d species", embedded)
    return {
        "status": "ok" if not failed else "partial",
        "embedded": embedded,
        "skipped": skipped,
        "failed": failed,
    }


async def reconcile(db, limit: int = _MAX_PER_RUN) -> dict:
    """Diff DB vs worker, repair the queue in both directions, then drain it.

    - In the DB but not on the worker → queue it (covers a rebuilt/restored
      worker, and rows that predate this service).
    - Already on the worker but marked pending → mark embedded, so a fresh
      deploy doesn't re-embed the whole catalog.
    """
    worker_ids = await _fetch_worker_species_ids()
    if worker_ids is None:
        return {"status": "worker_unavailable", "requeued": 0, "embedded": 0}

    rows = await db.execute_fetchall(
        "SELECT id, embedded_at FROM plant_species "
        "WHERE id_enabled = TRUE AND latin_name IS NOT NULL AND latin_name != ''"
    )
    requeue, resolve = [], []
    for row in rows:
        sid = int(row["id"])
        on_worker = sid in worker_ids
        marked = row["embedded_at"] is not None
        if marked and not on_worker:
            requeue.append(sid)
        elif on_worker and not marked:
            resolve.append(sid)

    if requeue:
        for sid in requeue:
            await db.execute(
                "UPDATE plant_species SET embedded_at = NULL WHERE id = ?", (sid,)
            )
        await db.commit()
        logger.info("BioCLIP catalog sync: re-queued %d species missing from worker", len(requeue))
    if resolve:
        await _mark_embedded(db, resolve)

    result = await sync_pending(db, limit=limit)
    return {
        "status": result["status"],
        "requeued": len(requeue),
        "resolved": len(resolve),
        "embedded": result["embedded"],
        "skipped": result["skipped"],
        "failed": result["failed"],
    }
