from fastapi import APIRouter
from database import get_db
from models import LocationOut, LocationCreate

router = APIRouter(tags=["locations"])


@router.get("/locations", response_model=list[LocationOut])
async def list_locations():
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, name, icon, sort_order FROM locations ORDER BY sort_order"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


@router.post("/locations", response_model=LocationOut)
async def create_location(data: LocationCreate):
    async with get_db() as db:
        cursor = await db.execute(
            "INSERT INTO locations (name, icon) VALUES (?, ?)",
            (data.name, data.icon),
        )
        await db.commit()
        loc_id = cursor.lastrowid
        return {"id": loc_id, "name": data.name, "icon": data.icon, "sort_order": 0}
