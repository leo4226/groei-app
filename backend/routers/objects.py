from fastapi import APIRouter, HTTPException, Depends
from database import db_dep
from auth import get_current_account, require_editor
from models import ObjectOut, ObjectCreate, ObjectUpdate, ObjectPositionUpdate, MapObjectOut, MapPlantOut

router = APIRouter(tags=["objects"])


async def _assert_owned_map(db, map_id: int, household_id: int) -> None:
    """Raise 404 unless the map belongs to the caller's household."""
    rows = await db.execute_fetchall(
        "SELECT id FROM maps WHERE id = ? AND household_id = ?",
        (map_id, household_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Map not found")


async def _assert_owned_object(db, object_id: int, household_id: int) -> None:
    """Raise 404 unless the object sits on a map in the caller's household.

    Objects carry no household_id — tenancy is enforced via their parent map,
    so every by-id object endpoint must join through maps.
    """
    rows = await db.execute_fetchall(
        """SELECT o.id FROM objects o
           JOIN maps m ON o.map_id = m.id
           WHERE o.id = ? AND m.household_id = ?""",
        (object_id, household_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Object not found")


@router.get("/objects", response_model=list[ObjectOut])
async def list_objects(db = Depends(db_dep), account = Depends(get_current_account)):
    rows = await db.execute_fetchall(
        """SELECT o.* FROM objects o
           JOIN maps m ON o.map_id = m.id
           WHERE o.is_active = 1 AND m.household_id = ?
           ORDER BY o.name""",
        (account["household_id"],),
    )
    return rows


@router.get("/objects/{object_id}", response_model=MapObjectOut)
async def get_object(object_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    rows = await db.execute_fetchall(
        """SELECT o.* FROM objects o
           JOIN maps m ON o.map_id = m.id
           WHERE o.id = ? AND o.is_active = 1 AND m.household_id = ?""",
        (object_id, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Object not found")

    obj = dict(rows[0])
    obj["contained_plants"] = await _get_contained_plants(db, object_id)
    return obj


async def _get_contained_plants(db, object_id: int) -> list[dict]:
    plant_rows = await db.execute_fetchall("""
        SELECT p.id, p.name, p.species, p.map_x, p.map_y, p.photo_path, p.container_id
        FROM plants p
        WHERE p.container_id = ? AND p.is_active = 1
    """, (object_id,))
    plants = []
    for row in plant_rows:
        plant = dict(row)
        # Compute care_status
        sched_rows = await db.execute_fetchall("""
            SELECT care_type, next_due,
                   EXTRACT(epoch FROM (next_due::timestamp - CURRENT_TIMESTAMP)) / 86400.0 as days_until,
                   (SELECT u.name FROM users u WHERE u.id = cs.last_done_by) as last_done_by
            FROM care_schedules cs
            WHERE cs.plant_id = $1 AND cs.is_active = 1
            ORDER BY days_until ASC
        """, (plant["id"],))
        schedules = [dict(s) for s in sched_rows]

        care_status = "good"
        most_urgent = None
        for s in schedules:
            days = s["days_until"] or 0
            if days < 0:
                care_status = "overdue"
                most_urgent = {"care_type": s["care_type"], "days_overdue": abs(int(days)), "last_done_by": s["last_done_by"]}
                break
            elif days < 1:
                if care_status != "overdue":
                    care_status = "due_today"
                    most_urgent = {"care_type": s["care_type"], "days_overdue": 0, "last_done_by": s["last_done_by"]}

        plant["care_status"] = care_status
        plant["most_urgent"] = most_urgent
        # Contained plants need valid map_x/map_y for the model — use 0,0 as they inherit from container
        plant["map_x"] = plant["map_x"] or 0
        plant["map_y"] = plant["map_y"] or 0
        plants.append(plant)
    return plants


@router.post("/objects", response_model=ObjectOut)
async def create_object(data: ObjectCreate, db = Depends(db_dep), account = Depends(require_editor)):
    await _assert_owned_map(db, data.map_id, account["household_id"])
    cursor = await db.execute(
        """INSERT INTO objects (name, object_type, shape, diameter_cm, width_cm, depth_cm,
           material, color, map_id, map_x, map_y, rotation, notes,
           category, label, preset)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.name, data.object_type, data.shape, data.diameter_cm,
         data.width_cm, data.depth_cm, data.material, data.color,
         data.map_id, data.map_x, data.map_y, data.rotation, data.notes,
         data.category, data.label, data.preset),
    )
    object_id = cursor.lastrowid
    await db.commit()

    rows = await db.execute_fetchall("SELECT * FROM objects WHERE id = ?", (object_id,))
    return rows[0]


@router.put("/objects/{object_id}", response_model=ObjectOut)
async def update_object(object_id: int, data: ObjectUpdate, db = Depends(db_dep), account = Depends(require_editor)):
    await _assert_owned_object(db, object_id, account["household_id"])
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [object_id]

    await db.execute(
        f"UPDATE objects SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1",
        values,
    )
    await db.commit()

    rows = await db.execute_fetchall("SELECT * FROM objects WHERE id = ?", (object_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Object not found")
    return rows[0]


@router.put("/objects/{object_id}/position", response_model=ObjectOut)
async def update_object_position(object_id: int, data: ObjectPositionUpdate, db = Depends(db_dep), account = Depends(require_editor)):
    await _assert_owned_object(db, object_id, account["household_id"])

    if data.rotation is not None:
        await db.execute(
            "UPDATE objects SET map_x = ?, map_y = ?, rotation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (data.map_x, data.map_y, data.rotation, object_id),
        )
    else:
        await db.execute(
            "UPDATE objects SET map_x = ?, map_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (data.map_x, data.map_y, object_id),
        )
    await db.commit()

    rows = await db.execute_fetchall("SELECT * FROM objects WHERE id = ?", (object_id,))
    return rows[0]


@router.delete("/objects/{object_id}")
async def archive_object(object_id: int, db = Depends(db_dep), account = Depends(require_editor)):
    await _assert_owned_object(db, object_id, account["household_id"])
    # Release any contained plants
    await db.execute(
        "UPDATE plants SET container_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE container_id = ?",
        (object_id,),
    )
    await db.execute(
        "UPDATE objects SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (object_id,),
    )
    await db.commit()
    return {"ok": True}


@router.patch("/objects/{object_id}/restore")
async def restore_object(object_id: int, db = Depends(db_dep), account = Depends(require_editor)):
    await _assert_owned_object(db, object_id, account["household_id"])
    await db.execute(
        "UPDATE objects SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (object_id,),
    )
    await db.commit()
    return {"ok": True}
