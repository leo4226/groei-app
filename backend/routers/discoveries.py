"""Field journal — plant discovery log.

POST   /discover          save a new wild discovery
GET    /discover          list all discoveries for the household
DELETE /discover/{id}     delete a discovery
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth import get_current_account
from database import db_dep

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/discover", tags=["discoveries"])


class DiscoveryCreate(BaseModel):
    species_id: Optional[int] = None
    common_name: str
    latin_name: Optional[str] = None
    thumbnail_url: Optional[str] = None
    notes: Optional[str] = None
    location_lat: Optional[float] = None
    location_lon: Optional[float] = None


class DiscoveryOut(BaseModel):
    id: int
    species_id: Optional[int]
    common_name: str
    latin_name: Optional[str]
    thumbnail_url: Optional[str]
    notes: Optional[str]
    location_lat: Optional[float]
    location_lon: Optional[float]
    discovered_at: str


@router.post("", response_model=DiscoveryOut, status_code=201)
async def save_discovery(
    body: DiscoveryCreate,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = await db.execute_fetchall(
        """INSERT INTO plant_discoveries
               (account_id, household_id, species_id, common_name, latin_name,
                thumbnail_url, notes, location_lat, location_lon, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id, species_id, common_name, latin_name, thumbnail_url,
                     notes, location_lat, location_lon, discovered_at""",
        (
            account["account_id"],
            account["household_id"],
            body.species_id,
            body.common_name,
            body.latin_name,
            body.thumbnail_url,
            body.notes,
            body.location_lat,
            body.location_lon,
            now,
        ),
    )
    row = rows[0]
    return _format(row)


@router.get("", response_model=list[DiscoveryOut])
async def list_discoveries(
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    rows = await db.execute_fetchall(
        """SELECT id, species_id, common_name, latin_name, thumbnail_url,
                  notes, location_lat, location_lon, discovered_at
           FROM plant_discoveries
           WHERE household_id = ?
           ORDER BY discovered_at DESC""",
        (account["household_id"],),
    )
    return [_format(r) for r in rows]


@router.delete("/{discovery_id}", status_code=204)
async def delete_discovery(
    discovery_id: int,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    rows = await db.execute_fetchall(
        "SELECT id FROM plant_discoveries WHERE id = ? AND household_id = ?",
        (discovery_id, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Discovery not found")
    await db.execute(
        "DELETE FROM plant_discoveries WHERE id = ?",
        (discovery_id,),
    )


def _format(row) -> dict:
    dt = row["discovered_at"]
    if isinstance(dt, datetime):
        ts = dt.isoformat()
    else:
        ts = str(dt)
    return {
        "id": row["id"],
        "species_id": row["species_id"],
        "common_name": row["common_name"],
        "latin_name": row["latin_name"],
        "thumbnail_url": row["thumbnail_url"],
        "notes": row["notes"],
        "location_lat": row["location_lat"],
        "location_lon": row["location_lon"],
        "discovered_at": ts,
    }
