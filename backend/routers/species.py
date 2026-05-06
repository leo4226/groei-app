from fastapi import APIRouter, HTTPException
from database import get_db
from models import PlantSpeciesOut
from species_service import get_species_by_id

router = APIRouter(prefix="/species", tags=["species"])


@router.get("", response_model=list[PlantSpeciesOut])
async def list_species():
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, slug, common_name_nl, common_name_en, latin_name, climate_zone "
            "FROM plant_species ORDER BY common_name_nl"
        )
        return [dict(r) for r in rows]


@router.get("/{species_id}", response_model=PlantSpeciesOut)
async def get_species(species_id: int):
    async with get_db() as db:
        species = await get_species_by_id(db, species_id)
    if not species:
        raise HTTPException(status_code=404, detail="Species not found")
    return species
