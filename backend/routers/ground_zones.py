from fastapi import APIRouter, HTTPException, Depends
from database import db_dep
from auth import get_current_account
from models import GroundZoneOut

router = APIRouter(tags=["ground_zones"])


@router.get("/maps/{slug}/ground-zones", response_model=list[GroundZoneOut])
async def list_ground_zones(slug: str, db = Depends(db_dep), account = Depends(get_current_account)):
    map_row = await db.execute_fetchall("SELECT id FROM maps WHERE slug = ? AND household_id = ?", (slug, account["household_id"]))
    if not map_row:
        raise HTTPException(404, "Map not found")
    map_id = map_row[0]["id"]
    rows = await db.execute_fetchall(
        "SELECT id, map_id, name, zone_type, polygon, soil_note FROM ground_zones WHERE map_id = ?",
        (map_id,),
    )
    return [dict(r) for r in rows]
