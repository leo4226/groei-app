from fastapi import APIRouter, Depends, Query, HTTPException
from database import db_dep
from models import WeedSightingCreate, WeedSightingOut

router = APIRouter(tags=["weed-sightings"])


@router.get("/weed-sightings", response_model=list[WeedSightingOut])
async def list_sightings(
    map_id: int | None = Query(None),
    db=Depends(db_dep),
):
    if map_id is not None:
        cursor = await db.execute("""
            SELECT ws.id, ws.weed_id, wsp.common_name_nl as weed_name,
                   wsp.slug as weed_slug, wsp.latin_name,
                   json_extract(wsp.removal_json, '$.removal_difficulty') as removal_difficulty,
                   ws.map_id, ws.map_x, ws.map_y, ws.notes, ws.sighted_at, ws.created_at
            FROM weed_sightings ws
            JOIN weed_species wsp ON ws.weed_id = wsp.id
            WHERE ws.map_id = ?
            ORDER BY ws.created_at DESC
        """, (map_id,))
    else:
        cursor = await db.execute("""
            SELECT ws.id, ws.weed_id, wsp.common_name_nl as weed_name,
                   wsp.slug as weed_slug, wsp.latin_name,
                   json_extract(wsp.removal_json, '$.removal_difficulty') as removal_difficulty,
                   ws.map_id, ws.map_x, ws.map_y, ws.notes, ws.sighted_at, ws.created_at
            FROM weed_sightings ws
            JOIN weed_species wsp ON ws.weed_id = wsp.id
            ORDER BY ws.created_at DESC
        """)
    rows = await cursor.fetchall()
    return [
        WeedSightingOut(
            id=row["id"],
            weed_id=row["weed_id"],
            weed_name=row["weed_name"],
            weed_slug=row["weed_slug"],
            latin_name=row["latin_name"],
            removal_difficulty=row["removal_difficulty"],
            map_id=row["map_id"],
            map_x=row["map_x"],
            map_y=row["map_y"],
            notes=row.get("notes"),
            sighted_at=row["sighted_at"],
            created_at=row.get("created_at"),
        )
        for row in rows
    ]


@router.post("/weed-sightings", status_code=201, response_model=WeedSightingOut)
async def create_sighting(body: WeedSightingCreate, db=Depends(db_dep)):
    cursor = await db.execute(
        """INSERT INTO weed_sightings (weed_id, map_id, map_x, map_y, notes, sighted_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (body.weed_id, body.map_id, body.map_x, body.map_y, body.notes, body.sighted_at),
    )
    await db.commit()
    sighting_id = cursor.lastrowid

    # Fetch back the created sighting with joined weed data
    cursor = await db.execute("""
        SELECT ws.id, ws.weed_id, wsp.common_name_nl as weed_name,
               wsp.slug as weed_slug, wsp.latin_name,
               json_extract(wsp.removal_json, '$.removal_difficulty') as removal_difficulty,
               ws.map_id, ws.map_x, ws.map_y, ws.notes, ws.sighted_at, ws.created_at
        FROM weed_sightings ws
        JOIN weed_species wsp ON ws.weed_id = wsp.id
        WHERE ws.id = ?
    """, (sighting_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="Failed to retrieve created sighting")
    return WeedSightingOut(
        id=row["id"],
        weed_id=row["weed_id"],
        weed_name=row["weed_name"],
        weed_slug=row["weed_slug"],
        latin_name=row["latin_name"],
        removal_difficulty=row["removal_difficulty"],
        map_id=row["map_id"],
        map_x=row["map_x"],
        map_y=row["map_y"],
        notes=row.get("notes"),
        sighted_at=row["sighted_at"],
        created_at=row.get("created_at"),
    )


@router.delete("/weed-sightings/{sighting_id}", status_code=204)
async def delete_sighting(sighting_id: int, db=Depends(db_dep)):
    cursor = await db.execute("DELETE FROM weed_sightings WHERE id = ?", (sighting_id,))
    await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Sighting not found")
