from fastapi import APIRouter, Depends, HTTPException, Query
from database import db_dep
from auth import get_current_account
from models import LocationOut, LocationCreate, LocationUpdate

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

@router.patch("/locations/{location_id}", response_model=LocationOut)
async def update_location(location_id: int, data: LocationUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    """Update a location (name, icon, sort_order). Scoped to household_id."""
    # Build dynamic SET clause
    fields = []
    values = []
    for field in ['name', 'icon', 'sort_order']:
        val = getattr(data, field, None)
        if val is not None:
            fields.append(f"{field} = ?")
            values.append(val)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    values.append(location_id)
    values.append(account['household_id'])
    
    cursor = await db.execute(
        f"UPDATE locations SET {', '.join(fields)} WHERE id = ? AND household_id = ?",
        tuple(values)
    )
    await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    
    cursor2 = await db.execute(
        "SELECT id, name, icon, sort_order FROM locations WHERE id = ?", (location_id,)
    )
    row = await cursor2.fetchone()
    return dict(row)


@router.delete("/locations/{location_id}")
async def delete_location(
    location_id: int,
    lang: str = Query("nl"),
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    """Delete a location. Block if it still has plants.

    The 409 detail is localized to the caller's UI language rather than being
    a hardcoded Dutch sentence — and the frontend branches on the 409 status,
    never on this text (see the language rules in CLAUDE.md).
    """
    # Check the location belongs to this household
    cursor = await db.execute(
        "SELECT id FROM locations WHERE id = ? AND household_id = ?",
        (location_id, account['household_id'])
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Location not found")
    
    # Check for plants at this location
    cursor2 = await db.execute(
        "SELECT COUNT(*) as cnt FROM plants WHERE location_id = ? AND is_active = 1",
        (location_id,)
    )
    count_row = await cursor2.fetchone()
    if count_row['cnt'] > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                "Move your plants to another location first"
                if lang == "en"
                else "Verplaats eerst je planten naar een andere locatie"
            ),
        )
    
    await db.execute("DELETE FROM locations WHERE id = ?", (location_id,))
    await db.commit()
    return {"ok": True}

