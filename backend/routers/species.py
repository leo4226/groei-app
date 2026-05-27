from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from database import db_dep
from models import PlantSpeciesOut, SpeciesSearchResponse, PlantSpeciesSearchResult, SpeciesImageOut
from species_service import get_species_by_id, search_species
from services.ecology_enrichment import ensure_ecology

router = APIRouter(prefix="/species", tags=["species"])


class EcologyOut(BaseModel):
    native_to_nl: bool | None
    invasive_nl: bool | None
    flowering_months: list[int] | None
    pollinator_value: int | None
    host_plant_for: list[str] | None
    data_source: str
    enriched_at: str
    score: int | None        # 0..100 biodiversity score; null when no data


@router.get("/search", response_model=SpeciesSearchResponse)
async def search_species_endpoint(
    q: str = Query(..., min_length=1, description="Search query"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db=Depends(db_dep),
):
    results, total = await search_species(db, q, page, per_page)

    out = []
    for r in results:
        primary = r.get("primary_image")
        out.append(PlantSpeciesSearchResult(
            id=r["id"],
            slug=r["slug"],
            common_name_nl=r["common_name_nl"],
            common_name_en=r.get("common_name_en"),
            latin_name=r.get("latin_name"),
            family=r.get("family"),
            genus=r.get("genus"),
            images_count=r.get("images_count", 0),
            primary_image=SpeciesImageOut(**primary) if primary else None,
        ))

    return SpeciesSearchResponse(results=out, total=total, page=page, per_page=per_page)


@router.get("", response_model=list[PlantSpeciesOut])
async def list_species(db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, slug, common_name_nl, common_name_en, latin_name, "
        "family, genus, growth_form, climate_zone, images_count "
        "FROM plant_species ORDER BY common_name_nl"
    )
    return [dict(r) for r in rows]


@router.get("/{species_id}", response_model=PlantSpeciesOut)
async def get_species(species_id: int, db=Depends(db_dep)):
    species = await get_species_by_id(db, species_id)
    if not species:
        raise HTTPException(status_code=404, detail="Species not found")
    return species


@router.get("/{species_id}/ecology", response_model=EcologyOut)
async def get_species_ecology(species_id: int, db=Depends(db_dep)):
    """Return the ecology profile for a species. Runs lazy enrichment
    (GBIF + LLM) on first access, then caches on `plant_species`."""
    profile = await ensure_ecology(db, species_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Species not found")
    return profile
