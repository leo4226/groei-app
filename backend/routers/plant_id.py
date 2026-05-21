"""HTTP endpoints for plant identification."""
import base64
import json
import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account
from services.plant_id import identify, PlantIdQuotaExceeded, PlantIdServiceError
from services.storage import build_storage_from_env


router = APIRouter(prefix="/plants", tags=["plant-id"])

_MAX_IMAGE_BYTES = 5 * 1024 * 1024
_MIN_CONFIDENCE_FOR_RESULT = 0.10
_LOW_CONFIDENCE_UPPER = 0.30

_ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "icons")


class CandidateOut(BaseModel):
    scientific_name: str
    common_names_nl: list[str]
    common_names_en: list[str]
    confidence: float
    species_id: int | None
    thumbnail_url: str | None


class IdentifyResponse(BaseModel):
    candidates: list[CandidateOut]
    low_confidence: bool


def _split_common_names(names: list[str]) -> tuple[list[str], list[str]]:
    """Pl@ntNet returns common names without language tags. Treat all as both
    languages for now; species enrichment disambiguates later."""
    return names, names


async def _attach_species_id(db, scientific_name: str) -> int | None:
    try:
        rows = await db.execute_fetchall(
            "SELECT id FROM plant_species WHERE latin_name = ? LIMIT 1",
            (scientific_name,),
        )
    except Exception:
        # plant_species may not exist on every deployment / test schema
        return None
    return rows[0]["id"] if rows else None


@router.post("/identify", response_model=IdentifyResponse)
async def identify_endpoint(
    image: UploadFile = File(...),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Afbeelding te groot (max 5 MB)")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Onbekend afbeeldingsformaat")

    try:
        candidates = await identify(image_bytes)
    except PlantIdQuotaExceeded:
        raise HTTPException(status_code=503, detail="Identificatie tijdelijk niet beschikbaar")
    except PlantIdServiceError:
        raise HTTPException(status_code=502, detail="Kon niet verbinden met identificatieservice")

    if not candidates or candidates[0].confidence < _MIN_CONFIDENCE_FOR_RESULT:
        return IdentifyResponse(candidates=[], low_confidence=False)

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
        ))

    low_conf = _MIN_CONFIDENCE_FOR_RESULT <= candidates[0].confidence < _LOW_CONFIDENCE_UPPER
    return IdentifyResponse(candidates=out, low_confidence=low_conf)


class IdentifyCommitRequest(BaseModel):
    scientific_name: str
    photo_base64: str   # raw base64 OR a data: URL prefix


class IdentifyCommitResponse(BaseModel):
    species_id: int
    name_nl_suggested: str
    scientific_name: str
    icon_key: str | None
    care_thresholds: dict
    photo_path: str


def _strip_data_url(b64: str) -> str:
    """Accept either raw base64 or a 'data:...;base64,XXX' data URL."""
    if "," in b64 and b64.lstrip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _match_icon_key(scientific_name: str) -> str | None:
    """Cheap icon match: lowercase genus → look for icon file. Returns icon_key or None."""
    genus = scientific_name.strip().split(" ", 1)[0].lower()
    if not genus:
        return None
    candidate = Path(_ICONS_DIR) / f"{genus}.svg"
    if candidate.exists():
        return genus
    return None


async def _enrich_species_if_missing(db, scientific_name: str) -> int | None:
    """Trigger the existing species-enrichment pipeline. Returns species_id or None.

    Delegates to species_service.get_or_create_species which generates a
    plant_species row via Claude when no match exists. Any failure (missing
    API key, Trefle/Claude timeout, network down, JSON parse error) is
    swallowed so the endpoint returns 404 rather than 500, letting the user
    fall back to manual entry.
    """
    from species_service import get_or_create_species
    try:
        return await get_or_create_species(db, scientific_name)
    except Exception:
        return None


def _save_identify_photo(image_bytes: bytes) -> str:
    """Upload identify photo to R2 and return the public URL."""
    key = f"photos/identify_{int(time.time())}.jpg"
    storage = build_storage_from_env()
    return storage.put(key, image_bytes, content_type="image/jpeg")


@router.post("/identify/commit", response_model=IdentifyCommitResponse)
async def identify_commit(
    body: IdentifyCommitRequest,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    # Look up species
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

    # Decode + save the photo
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
