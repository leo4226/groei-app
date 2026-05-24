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

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
# Update these from a fresh eval run; current values are educated initial guesses.
_CONFIDENCE_FLOOR = 0.10       # below this -> no_match (no candidates surfaced)
_HIGH_TOP1 = 0.30              # top-1 must clear this AND _HIGH_MARGIN to be "high"
_HIGH_MARGIN = 0.04            # top-1 minus top-2
_MEDIUM_TOP1 = 0.25            # top-1 above this is at least medium

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


def _split_common_names(names: list[str]) -> tuple[list[str], list[str]]:
    return names, names


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
        "SELECT count FROM plantnet_quota WHERE account_id = ? AND date = ?",
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
        """INSERT INTO plantnet_quota (account_id, date, count)
           VALUES (?, ?, 1)
           ON CONFLICT (account_id, date) DO UPDATE SET count = count + 1""",
        (account_id, today),
    )


_BIOCLIP_WORKER_URL = os.environ.get("BIOCLIP_WORKER_URL", "")


async def _bioclip_identify(image_bytes: bytes, db) -> IdentifyResponse | None:
    """Identify a plant image using BioCLIP worker (remote or local).

    When BIOCLIP_WORKER_URL is set, POSTs the image to the worker over HTTP.
    Otherwise falls back to local BioCLIP (requires open_clip_torch + GPU).
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
                )
                if resp.status_code == 200:
                    data = resp.json()
                    matches = [(m["species_id"], m["confidence"]) for m in data.get("matches", [])]
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
        nl_names = [row["common_name_nl"]] if row.get("common_name_nl") else []
        en_names = [row["common_name_en"]] if row.get("common_name_en") else []

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

    top1 = matches[0][1]
    top2 = matches[1][1] if len(matches) > 1 else None
    confidence = _classify_confidence(top1, top2)
    return IdentifyResponse(
        candidates=out,
        confidence=confidence,
        low_confidence=(confidence != "high"),
        source="bioclip",
    )


@router.post("/identify", response_model=IdentifyResponse)
async def identify_endpoint(
    image: UploadFile = File(...),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    # 1. Validate image
    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Afbeelding te groot (max 5 MB)")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Onbekend afbeeldingsformaat")

    # 2. Try BioCLIP first (self-hosted, no quota)
    try:
        result = await _bioclip_identify(image_bytes, db)
        if result is not None:
            return result
    except Exception as exc:
        logger.warning("BioCLIP failed, falling back to Pl@ntNet: %s", exc)

    # 3. Fallback: Pl@ntNet API
    await _check_quota(db, account)

    try:
        candidates = await identify(image_bytes)
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
        common_nl, common_en = _split_common_names(c.common_names)
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

    return IdentifyCommitResponse(
        species_id=species_id,
        name_nl_suggested=name_nl,
        scientific_name=body.scientific_name,
        icon_key=_match_icon_key(body.scientific_name),
        care_thresholds=thresholds,
        photo_path=photo_path,
    )
