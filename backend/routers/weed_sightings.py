from fastapi import APIRouter, Depends, Query, HTTPException
import base64
import json
import time
from database import db_dep
from models import WeedSightingCreate, WeedSightingOut
from services.storage import build_storage_from_env, Storage

router = APIRouter(tags=["weed-sightings"])


class SightingDetailOut(WeedSightingOut):
    ecology_data: dict | None = None
    fun_fact_nl: str | None = None
    fun_fact_en: str | None = None
    removal_json: dict | None = None
    common_name_nl: str | None = None
    common_name_en: str | None = None
    family: str | None = None
    flowering_months: list[int] = []
    native_status: str | None = None
    pollinator_value: str | None = None


SIGHTING_SELECT = """
    SELECT ws.id, ws.weed_id, wsp.common_name_nl as weed_name,
           wsp.slug as weed_slug, wsp.latin_name,
           (wsp.removal_json::json->>'removal_difficulty') as removal_difficulty,
           ws.map_id, ws.map_x, ws.map_y, ws.notes, ws.sighted_at, ws.photo_url, ws.created_at
"""
SIGHTING_JOIN = "FROM weed_sightings ws JOIN weed_species wsp ON ws.weed_id = wsp.id"


async def _build_sighting(row) -> WeedSightingOut:
    return WeedSightingOut(
        id=row["id"], weed_id=row["weed_id"],
        weed_name=row["weed_name"], weed_slug=row["weed_slug"],
        latin_name=row["latin_name"],
        removal_difficulty=row["removal_difficulty"],
        map_id=row["map_id"], map_x=row["map_x"], map_y=row["map_y"],
        notes=row.get("notes"), sighted_at=row["sighted_at"],
        photo_url=row.get("photo_url"), created_at=row.get("created_at"),
    )


def _get_storage() -> Storage | None:
    try:
        return build_storage_from_env()
    except Exception:
        return None


def _decode_photo_data(photo_data: str) -> bytes | None:
    if not photo_data:
        return None
    if "," in photo_data:
        photo_data = photo_data.split(",", 1)[1]
    try:
        return base64.b64decode(photo_data)
    except Exception:
        return None


def _parse_json(val):
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return str(val)


@router.get("/weed-sightings", response_model=list[WeedSightingOut])
async def list_sightings(map_id: int | None = Query(None), db=Depends(db_dep)):
    if map_id is not None:
        cursor = await db.execute(SIGHTING_SELECT + SIGHTING_JOIN + " WHERE ws.map_id = ? ORDER BY ws.created_at DESC", (map_id,))
    else:
        cursor = await db.execute(SIGHTING_SELECT + SIGHTING_JOIN + " ORDER BY ws.created_at DESC")
    rows = await cursor.fetchall()
    return [_build_sighting(row) for row in rows]


@router.get("/weed-sightings/{sighting_id}", response_model=SightingDetailOut)
async def get_sighting(sighting_id: int, db=Depends(db_dep)):
    cursor = await db.execute("""
        SELECT ws.id, ws.weed_id, wsp.common_name_nl as weed_name,
               wsp.slug as weed_slug, wsp.latin_name,
               wsp.common_name_nl, wsp.common_name_en,
               wsp.family, wsp.flowering_months, wsp.native_status,
               wsp.pollinator_value,
               (wsp.removal_json::json->>'removal_difficulty') as removal_difficulty,
               wsp.removal_json,
               ws.map_id, ws.map_x, ws.map_y, ws.notes, ws.sighted_at,
               ws.photo_url, ws.created_at,
               spe.ecology_data,
               spf.fun_fact_nl, spf.fun_fact_en
        FROM weed_sightings ws
        JOIN weed_species wsp ON ws.weed_id = wsp.id
        LEFT JOIN species_ecology spe ON spe.species_id = wsp.id
        LEFT JOIN species_facts spf ON spf.species_id = wsp.id
        WHERE ws.id = ?
    """, (sighting_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Sighting not found")
    fm = _parse_json(row.get("flowering_months"))
    return SightingDetailOut(
        id=row["id"], weed_id=row["weed_id"],
        weed_name=row["weed_name"], weed_slug=row["weed_slug"],
        latin_name=row["latin_name"],
        removal_difficulty=row["removal_difficulty"],
        map_id=row["map_id"], map_x=row["map_x"], map_y=row["map_y"],
        notes=row.get("notes"), sighted_at=row["sighted_at"],
        photo_url=row.get("photo_url"), created_at=row.get("created_at"),
        ecology_data=_parse_json(row.get("ecology_data")),
        fun_fact_nl=row.get("fun_fact_nl"), fun_fact_en=row.get("fun_fact_en"),
        removal_json=_parse_json(row.get("removal_json")),
        common_name_nl=row.get("common_name_nl"),
        common_name_en=row.get("common_name_en"),
        family=row.get("family"),
        flowering_months=fm if isinstance(fm, list) else [],
        native_status=row.get("native_status"),
        pollinator_value=row.get("pollinator_value"),
    )


@router.post("/weed-sightings", status_code=201, response_model=WeedSightingOut)
async def create_sighting(body: WeedSightingCreate, db=Depends(db_dep)):
    photo_url = None
    if body.photo_data:
        storage = _get_storage()
        decoded = _decode_photo_data(body.photo_data)
        if decoded and storage:
            try:
                key = f"weed-photos/{int(time.time() * 1000)}.jpg"
                photo_url = storage.put(key, decoded, "image/jpeg")
            except Exception:
                pass
    cursor = await db.execute(
        "INSERT INTO weed_sightings (weed_id, map_id, map_x, map_y, notes, sighted_at, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (body.weed_id, body.map_id, body.map_x, body.map_y, body.notes, body.sighted_at, photo_url),
    )
    await db.commit()
    sighting_id = cursor.lastrowid
    cursor = await db.execute(SIGHTING_SELECT + SIGHTING_JOIN + " WHERE ws.id = ?", (sighting_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="Failed to retrieve created sighting")
    return _build_sighting(row)


@router.delete("/weed-sightings/{sighting_id}", status_code=204)
async def delete_sighting(sighting_id: int, db=Depends(db_dep)):
    cursor = await db.execute("SELECT photo_url FROM weed_sightings WHERE id = ?", (sighting_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Sighting not found")
    cursor = await db.execute("DELETE FROM weed_sightings WHERE id = ?", (sighting_id,))
    await db.commit()
    photo_url = row.get("photo_url")
    if photo_url:
        storage = _get_storage()
        if storage:
            try:
                key = "/".join(photo_url.rstrip("/").split("/")[-2:])
                storage.delete(key)
            except Exception:
                pass
