"""HTTP endpoints for plant identification."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account
from services.plant_id import identify, PlantIdQuotaExceeded, PlantIdServiceError


router = APIRouter(prefix="/plants", tags=["plant-id"])

_MAX_IMAGE_BYTES = 5 * 1024 * 1024
_MIN_CONFIDENCE_FOR_RESULT = 0.10
_LOW_CONFIDENCE_UPPER = 0.30


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
