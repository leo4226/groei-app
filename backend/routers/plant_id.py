"""HTTP endpoints for plant identification.

Supports two backends:
  1. BioCLIP (self-hosted, unlimited) — primary
  2. Pl@ntNet API (external, 20/day) — fallback
"""

import base64
import io
import json
import logging
import os
import time
from datetime import date
from pathlib import Path

import numpy as np

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account
from services.plant_id import identify, PlantIdQuotaExceeded, PlantIdServiceError
# bioclip_id is lazily imported in _bioclip_identify (local fallback branch)
# to avoid requiring numpy/scipy/torch on Fly.io (which uses remote worker)
from services.storage import build_storage_from_env

logger = logging.getLogger(__name__)

_ADMIN_EMAIL = "leon_korbee@hotmail.com"
_DAILY_QUOTA = 20

router = APIRouter(prefix="/plants", tags=["plant-id"])

_MAX_IMAGE_BYTES = 5 * 1024 * 1024

# Confidence calibration thresholds (informed by scripts/eval_bioclip.py output).
# Tuned 2026-05-24 from 126-photo iNat-only eval (see docs/plans/2026-05-24-bioclip-eval-baseline.txt).
# Key insight from the eval: top-1 score alone barely discriminates correct from wrong
# (mean 0.302 vs 0.287), but margin (top1 - top2) separates strongly (mean 0.035 vs 0.012).
# So HIGH requires BOTH a moderate top-1 AND a meaningful margin; MEDIUM is the
# top-1 band above WRONG median (probably right, but margin doesn't confirm).
_CONFIDENCE_FLOOR = 0.10       # below this -> no_match (no candidates surfaced)
_HIGH_TOP1 = 0.28              # top-1 must clear this AND _HIGH_MARGIN to be "high"
_HIGH_MARGIN = 0.03            # top-1 minus top-2 — primary signal
_MEDIUM_TOP1 = 0.30            # top-1 above median-of-WRONG is at least medium

# (No legacy aliases — _CONFIDENCE_FLOOR / _HIGH_TOP1 / _HIGH_MARGIN / _MEDIUM_TOP1 are
#  the only constants. Old names removed; grep confirmed zero external imports.)


def _classify_confidence(top1: float, top2: float | None) -> str:
    """Bucket a (top1, top2) pair into one of high / medium / low / no_match.

    See docs/plans/2026-05-24-bioclip-confidence-calibration-design.md section 3.
    """
    if top1 < _CONFIDENCE_FLOOR:
        return "no_match"
    margin = top1 - (top2 or 0.0)
    if top1 >= _HIGH_TOP1 and margin >= _HIGH_MARGIN:
        return "high"
    if top1 >= _MEDIUM_TOP1:
        return "medium"
    return "low"


_IMAGE_REF_BOOST = 1.0  # no multiplier — image-to-image is only used when
                        # the text already found the species AND ≥2 refs back it up


def _blend_scores(
    text_matches: list[tuple[int, float]],
    query_embedding: np.ndarray,
    refs_by_species: dict[int, np.ndarray],
    top_k: int = 5,
) -> list[tuple[int, float]]:
    """Combine text-based top-K matches with image-to-image similarity from
    user-confirmed embeddings, return new top-K.

    Only species already in text_matches are considered (image-only species
    are discarded), and only if the species has ≥2 user-confirmed refs.
    Per-species score: combined = max(text_score, max_image_cosine * boost)
    """
    text_score_map: dict[int, float] = {sid: s for sid, s in text_matches}

    image_score_map: dict[int, float] = {}
    for sid, ref_matrix in refs_by_species.items():
        # ref_matrix: shape (N, 512), each row is unit-norm
        # require at least 2 confirmed refs before blending
        if ref_matrix.shape[0] < 2:
            continue
        cos = ref_matrix @ query_embedding  # shape (N,)
        image_score_map[sid] = float(cos.max())

    combined: list[tuple[int, float]] = []
    for sid in text_score_map:  # only species already in text top-K
        t = text_score_map[sid]
        i = image_score_map.get(sid, 0.0) * _IMAGE_REF_BOOST
        combined.append((sid, max(t, i)))

    combined.sort(key=lambda x: x[1], reverse=True)
    return combined[:top_k]


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


_ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "icons")


class CandidateOut(BaseModel):
    scientific_name: str
    common_names_nl: list[str]
    common_names_en: list[str]
    confidence: float
    species_id: int | None
    thumbnail_url: str | None
    source: str = "bioclip"  # "bioclip" or "plantnet"


class IdentifyResponse(BaseModel):
    candidates: list[CandidateOut]
    confidence: str = "no_match"  # high | medium | low | no_match
    # DEPRECATED: now derived as (confidence != "high"), which is broader than the
    # old "in band [0.10, 0.30)" definition — strong-but-thin-margin matches
    # (confidence = "medium") now flag as low_confidence too. Frontend should
    # migrate to reading `confidence` directly; remove this field after.
    low_confidence: bool = False
    source: str = "bioclip"


def _split_common_names(names: list[str], lang: str) -> tuple[list[str], list[str]]:
    """Route PlantNet's commonNames into the (nl, en) buckets based on the
    `lang` we asked PlantNet for. We only request one language per call, so
    the other bucket is empty — the frontend already falls back across
    buckets and to scientific_name."""
    if lang == "nl":
        return names, []
    return [], names


async def _attach_species_id(db, scientific_name: str) -> int | None:
    try:
        rows = await db.execute_fetchall(
            "SELECT id FROM plant_species WHERE latin_name = ? LIMIT 1",
            (scientific_name,),
        )
    except Exception:
        return None
    return rows[0]["id"] if rows else None


async def _check_quota(db, account: dict) -> str | None:
    """Check daily Pl@ntNet quota.

    Returns the account email if admin (unlimited), None otherwise.
    Raises HTTPException 429 if quota exceeded.
    """
    rows = await db.execute_fetchall(
        "SELECT email FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows:
        raise HTTPException(status_code=403, detail="Account not found")

    email = rows[0]["email"]
    if email == _ADMIN_EMAIL:
        return email

    today = date.today().isoformat()
    quota_rows = await db.execute_fetchall(
        "SELECT \"count\" FROM plantnet_quota WHERE account_id = ? AND date = ?",
        (account["account_id"], today),
    )
    used = quota_rows[0]["count"] if quota_rows else 0
    if used >= _DAILY_QUOTA:
        raise HTTPException(
            status_code=429,
            detail=f"Je hebt vandaag al {_DAILY_QUOTA} identificaties gebruikt. Morgen weer!",
        )
    return None


async def _increment_quota(db, account_id: int) -> None:
    today = date.today().isoformat()
    await db.execute_fetchall(
        """INSERT INTO plantnet_quota (account_id, date, "count")
           VALUES (?, ?, 1)
           ON CONFLICT (account_id, date) DO UPDATE SET "count" = plantnet_quota."count" + 1""",
        (account_id, today),
    )


_BIOCLIP_WORKER_URL = os.environ.get("BIOCLIP_WORKER_URL", "")
_BIOCLIP_WORKER_TOKEN = os.environ.get("BIOCLIP_WORKER_TOKEN", "")


def _worker_headers() -> dict:
    """Shared-secret header for the BioCLIP worker. Empty dict if no token set."""
    return {"X-Worker-Token": _BIOCLIP_WORKER_TOKEN} if _BIOCLIP_WORKER_TOKEN else {}


async def _bioclip_identify(image_bytes: bytes, db, lang: str = "nl") -> IdentifyResponse | None:
    """Identify a plant image using BioCLIP worker (remote or local).

    When BIOCLIP_WORKER_URL is set, POSTs the image to the worker over HTTP.
    Otherwise falls back to local BioCLIP (requires open_clip_torch + GPU).
    `lang` controls which common name bucket to populate (NL or EN).
    """
    import httpx

    worker_url = _BIOCLIP_WORKER_URL
    matches = None

    if worker_url:
        # Remote worker: POST image, get species_id + confidence back
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{worker_url.rstrip('/')}/identify",
                    files={"image": ("plant.jpg", image_bytes, "image/jpeg")},
                    headers=_worker_headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    matches = [(m["species_id"], m["confidence"]) for m in data.get("matches", [])]
                    # Decode the query embedding if present (new field; may be absent on old worker)
                    emb_b64 = data.get("embedding")
                    if emb_b64:
                        try:
                            query_embedding = np.frombuffer(base64.b64decode(emb_b64), dtype=np.float32)
                            if query_embedding.shape == (512,):
                                matches = await _apply_user_refs(matches, query_embedding, db)
                        except Exception as exc:
                            logger.warning("Failed to decode query embedding for blend: %s", exc)
                elif resp.status_code == 503:
                    logger.warning("BioCLIP worker not ready (503)")
                    return None
                else:
                    logger.warning("BioCLIP worker returned %s: %s", resp.status_code, resp.text[:200])
                    return None
        except Exception as exc:
            logger.warning("BioCLIP worker unreachable: %s", exc)
            return None
    else:
        # Local fallback: load BioCLIP in-process
        from PIL import Image
        from services.bioclip_id import get_service as get_bioclip_service
        bioclip = get_bioclip_service()

        bioclip.load_model()
        if not bioclip.load_embeddings():
            return None

        try:
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception:
            raise HTTPException(status_code=400, detail="Kon afbeelding niet verwerken")

        image_emb = bioclip.embed_image(pil_image)
        matches = bioclip.identify(image_emb, top_k=5)

    if matches:
        logger.info("BioCLIP top match: species_id=%s confidence=%.4f (all: %s)",
                     matches[0][0], matches[0][1],
                     [(m[0], round(m[1], 4)) for m in matches[:3]])
    if not matches or matches[0][1] < _CONFIDENCE_FLOOR:
        return IdentifyResponse(
            candidates=[],
            confidence="no_match",
            low_confidence=False,
            source="bioclip",
        )

    out: list[CandidateOut] = []
    for species_id, confidence in matches:
        # Look up species details from DB
        rows = await db.execute_fetchall(
            "SELECT latin_name, common_name_nl, common_name_en "
            "FROM plant_species WHERE id = ?",
            (species_id,),
        )
        if not rows:
            continue

        row = rows[0]
        latin_name = row["latin_name"]

        # Enrich if the species has no Dutch common name yet (lazy, one-time LLM call)
        nl_name = row.get("common_name_nl")
        if not nl_name:
            try:
                await _enrich_species_if_missing(db, latin_name)
                # Re-fetch after enrichment
                rows2 = await db.execute_fetchall(
                    "SELECT common_name_nl, common_name_en FROM plant_species WHERE id = ?",
                    (species_id,),
                )
                if rows2:
                    nl_name = rows2[0].get("common_name_nl") or ""
                    en_name = rows2[0].get("common_name_en")
                    row["common_name_nl"] = nl_name
                    row["common_name_en"] = en_name
            except Exception:
                pass  # Enrichment is best-effort; don't fail the identify request

        # Populate only the requested language's common name bucket,
        # mirroring how _split_common_names works for PlantNet results.
        if lang == "nl":
            nl = row.get("common_name_nl") or ""
            nl_names = [nl] if nl and nl.lower() != latin_name.lower() else []
            en_names = []
        else:
            en = row.get("common_name_en") or ""
            en_names = [en] if en and en.lower() != latin_name.lower() else []
            nl_names = []

        # Find any image for thumbnail
        img_rows = await db.execute_fetchall(
            "SELECT url FROM species_images "
            "WHERE species_id = ? AND url != '' "
            "LIMIT 1",
            (species_id,),
        )
        thumb = img_rows[0]["url"] if img_rows else None

        out.append(CandidateOut(
            scientific_name=latin_name,
            common_names_nl=nl_names,
            common_names_en=en_names,
            confidence=round(confidence, 3),
            species_id=species_id,
            thumbnail_url=thumb,
            source="bioclip",
        ))

    # Dedup: strip hybrid marker " x " / " × " to merge duplicate entries
    # (e.g. "Rosa × floribunda" = "Rosa floribunda")
    seen: dict[str, CandidateOut] = {}
    deduped: list[CandidateOut] = []
    for cand in out:
        key = cand.scientific_name.lower().replace(" × ", " ").replace(" x ", " ")
        if key not in seen:
            seen[key] = cand
            deduped.append(cand)
        elif cand.confidence > seen[key].confidence:
            # Replace with higher confidence entry
            deduped.remove(seen[key])
            seen[key] = cand
            deduped.append(cand)
    out = deduped

    top1 = matches[0][1]
    top2 = matches[1][1] if len(matches) > 1 else None
    confidence = _classify_confidence(top1, top2)
    return IdentifyResponse(
        candidates=out,
        confidence=confidence,
        low_confidence=(confidence != "high"),
        source="bioclip",
    )


_SUPPORTED_PLANTNET_LANGS = {"en", "nl", "fr", "de", "es", "it", "pt"}


@router.post("/identify", response_model=IdentifyResponse)
async def identify_endpoint(
    image: UploadFile = File(...),
    engine: str = Query("bioclip"),
    lang: str = Query("en"),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    lang = lang if lang in _SUPPORTED_PLANTNET_LANGS else "en"
    # 1. Validate image
    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Afbeelding te groot (max 5 MB)")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Onbekend afbeeldingsformaat")

    # 2. Try BioCLIP first (self-hosted, no quota) — unless user explicitly chose PlantNet
    if engine != "plantnet":
        try:
            result = await _bioclip_identify(image_bytes, db, lang)
            if result is not None:
                return result
        except Exception as exc:
            logger.warning("BioCLIP failed, falling back to Pl@ntNet: %s", exc)

    # 3. Fallback: Pl@ntNet API
    await _check_quota(db, account)

    try:
        candidates = await identify(image_bytes, lang=lang)
    except PlantIdQuotaExceeded:
        raise HTTPException(
            status_code=503, detail="Identificatie tijdelijk niet beschikbaar"
        )
    except PlantIdServiceError:
        raise HTTPException(
            status_code=502, detail="Kon niet verbinden met identificatieservice"
        )

    await _increment_quota(db, account["account_id"])

    if not candidates or candidates[0].confidence < _CONFIDENCE_FLOOR:
        return IdentifyResponse(
            candidates=[],
            confidence="no_match",
            low_confidence=False,
            source="plantnet",
        )

    top3 = candidates[:3]
    out: list[CandidateOut] = []
    for c in top3:
        common_nl, common_en = _split_common_names(c.common_names, lang)
        species_id = await _attach_species_id(db, c.scientific_name)
        out.append(CandidateOut(
            scientific_name=c.scientific_name,
            common_names_nl=common_nl,
            common_names_en=common_en,
            confidence=c.confidence,
            species_id=species_id,
            thumbnail_url=c.plantnet_image_url,
            source="plantnet",
        ))

    top1 = candidates[0].confidence
    top2 = candidates[1].confidence if len(candidates) > 1 else None
    confidence = _classify_confidence(top1, top2)
    return IdentifyResponse(
        candidates=out,
        confidence=confidence,
        low_confidence=(confidence != "high"),
        source="plantnet",
    )


class IdentifyCommitRequest(BaseModel):
    scientific_name: str
    photo_base64: str


class IdentifyCommitResponse(BaseModel):
    species_id: int
    name_nl_suggested: str
    scientific_name: str
    icon_key: str | None
    care_thresholds: dict
    photo_path: str


def _strip_data_url(b64: str) -> str:
    if "," in b64 and b64.lstrip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _match_icon_key(scientific_name: str) -> str | None:
    genus = scientific_name.strip().split(" ", 1)[0].lower()
    if not genus:
        return None
    candidate = Path(_ICONS_DIR) / f"{genus}.svg"
    if candidate.exists():
        return genus
    return None


async def _enrich_species_if_missing(db, scientific_name: str) -> int | None:
    """Ensure a species has Dutch common name data. Looks up by latin_name first,
    enriches existing rows, and only creates a new species as last resort."""
    # 1. Already exists with common_name_nl?
    row = await db.execute_fetchall(
        "SELECT id, common_name_nl FROM plant_species WHERE latin_name = ? LIMIT 1",
        (scientific_name,),
    )
    if row and row[0].get("common_name_nl"):
        return row[0]["id"]

    # 2. Exists but missing NL name — enrich via DeepSeek
    if row:
        species_id = row[0]["id"]
        from species_service import _generate_species
        try:
            data = await _generate_species(scientific_name)
            nl_name = data.get("common_name_nl") or ""
            en_name = data.get("common_name_en") or ""
            if nl_name:
                await db.execute(
                    "UPDATE plant_species SET common_name_nl = ?, common_name_en = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (nl_name, en_name, species_id),
                )
                await db.commit()
        except Exception:
            pass  # best-effort
        return species_id

    # 3. Doesn't exist at all — create from scratch
    from species_service import get_or_create_species
    try:
        return await get_or_create_species(db, scientific_name)
    except Exception:
        return None


def _save_identify_photo(image_bytes: bytes) -> str:
    key = f"photos/identify_{int(time.time())}.jpg"
    storage = build_storage_from_env()
    return storage.put(key, image_bytes, content_type="image/jpeg")


@router.post("/identify/commit", response_model=IdentifyCommitResponse)
async def identify_commit(
    body: IdentifyCommitRequest,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    try:
        rows = await db.execute_fetchall(
            "SELECT id, common_name_nl, common_name_en, care_thresholds "
            "FROM plant_species WHERE latin_name = ? LIMIT 1",
            (body.scientific_name,),
        )
    except Exception:
        rows = []

    if rows:
        row = dict(rows[0])
        species_id = row["id"]
        name_nl = row["common_name_nl"] or row["common_name_en"] or body.scientific_name
        thresholds_raw = row["care_thresholds"]
        thresholds = json.loads(thresholds_raw) if thresholds_raw else {}
    else:
        species_id = await _enrich_species_if_missing(db, body.scientific_name)
        if species_id is None:
            raise HTTPException(status_code=404, detail="Soort niet gevonden")
        re_rows = await db.execute_fetchall(
            "SELECT common_name_nl, common_name_en, care_thresholds FROM plant_species WHERE id = ?",
            (species_id,),
        )
        row = dict(re_rows[0])
        name_nl = row["common_name_nl"] or row["common_name_en"] or body.scientific_name
        thresholds_raw = row["care_thresholds"]
        thresholds = json.loads(thresholds_raw) if thresholds_raw else {}

    try:
        image_bytes = base64.b64decode(_strip_data_url(body.photo_base64))
    except Exception:
        raise HTTPException(status_code=400, detail="Onbekend afbeeldingsformaat")
    photo_path = _save_identify_photo(image_bytes)

    # Best-effort: capture the image embedding for the user-confirmed retrieval
    # layer. Failure here must NEVER break the commit flow — log and move on.
    try:
        if _BIOCLIP_WORKER_URL:
            import httpx
            async with httpx.AsyncClient(timeout=20) as client:
                emb_resp = await client.post(
                    f"{_BIOCLIP_WORKER_URL.rstrip('/')}/embed-image",
                    files={"image": ("plant.jpg", image_bytes, "image/jpeg")},
                    headers=_worker_headers(),
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

    return IdentifyCommitResponse(
        species_id=species_id,
        name_nl_suggested=name_nl,
        scientific_name=body.scientific_name,
        icon_key=_match_icon_key(body.scientific_name),
        care_thresholds=thresholds,
        photo_path=photo_path,
    )
