from fastapi import APIRouter, Depends
from database import db_dep
from auth import get_current_account
from models import LocationOut, LocationCreate

router = APIRouter(tags=["locations"])


@router.get("/locations", response_model=list[LocationOut])
async def list_locations(db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute(
        "SELECT id, name, icon, sort_order FROM locations WHERE household_id = ? ORDER BY sort_order",
        (account["household_id"],)
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("/locations", response_model=LocationOut)
async def create_location(data: LocationCreate, db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute(
        "INSERT INTO locations (name, icon, household_id) VALUES (?, ?, ?)",
        (data.name, data.icon, account["household_id"]),
    )
    await db.commit()
    loc_id = cursor.lastrowid
    return {"id": loc_id, "name": data.name, "icon": data.icon, "sort_order": 0}
