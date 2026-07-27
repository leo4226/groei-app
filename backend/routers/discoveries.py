"""Field journal — plant discovery log.

POST   /discover          save a new wild discovery
GET    /discover          list all discoveries for the household
DELETE /discover/{id}     delete a discovery
"""
import base64
import json
import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from pydantic import BaseModel, Field

from auth import get_current_account
from database import db_dep
from services.geocode import reverse_geocode
from services.storage import Storage, build_storage_from_env

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/discover", tags=["discoveries"])


class DiscoveryCreate(BaseModel):
    species_id: Optional[int] = None
    common_name: str
    latin_name: Optional[str] = None
    thumbnail_url: Optional[str] = None
    thumbnail_data: Optional[str] = None
    notes: Optional[str] = None
    location_lat: Optional[float] = None
    location_lon: Optional[float] = None


class DiscoveryOut(BaseModel):
    id: int
    species_id: Optional[int]
    common_name: str
    species_common_name_nl: Optional[str] = None
    species_common_name_en: Optional[str] = None
    latin_name: Optional[str]
    thumbnail_url: Optional[str]
    notes: Optional[str]
    location_lat: Optional[float]
    location_lon: Optional[float]
    place_name: Optional[str] = None
    country_code: Optional[str] = None
    fun_fact_nl: Optional[str] = None
    fun_fact_en: Optional[str] = None
    discovered_at: str


@router.post("", response_model=DiscoveryOut, status_code=201)
async def save_discovery(
    body: DiscoveryCreate,
    background: BackgroundTasks,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    thumbnail_url = body.thumbnail_url
    if not thumbnail_url and body.thumbnail_data:
        thumbnail_url = _store_thumbnail(body.thumbnail_data)
    # Reverse geocoding (Nominatim, up to 8s) happens AFTER the response —
    # the save must feel instant. The list endpoint's backfill also catches
    # any row the task missed.
    place_name = None
    country_code = None
    rows = await db.execute_fetchall(
        """INSERT INTO plant_discoveries
               (account_id, household_id, species_id, common_name, latin_name,
                thumbnail_url, notes, location_lat, location_lon,
                place_name, country_code, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id, species_id, common_name, latin_name, thumbnail_url,
                     notes, location_lat, location_lon, place_name, country_code,
                     discovered_at""",
        (
            account["account_id"],
            account["household_id"],
            body.species_id,
            body.common_name,
            body.latin_name,
            thumbnail_url,
            body.notes,
            body.location_lat,
            body.location_lon,
            place_name,
            country_code,
            now,
        ),
    )
    if body.location_lat is not None and body.location_lon is not None:
        background.add_task(
            _backfill_places, [(rows[0]["id"], body.location_lat, body.location_lon)]
        )
    species = await _species_lookup(db, [body.species_id] if body.species_id else [])
    return _format(rows[0], species.get(body.species_id) if body.species_id else None)


@router.get("", response_model=list[DiscoveryOut])
async def list_discoveries(
    background: BackgroundTasks,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    rows = await db.execute_fetchall(
        """SELECT id, species_id, common_name, latin_name, thumbnail_url,
                  notes, location_lat, location_lon, place_name, country_code,
                  discovered_at
           FROM plant_discoveries
           WHERE household_id = ?
           ORDER BY discovered_at DESC""",
        (account["household_id"],),
    )
    # Rows saved before the place columns existed backfill in the background
    # (Nominatim policy: 1 req/s, so the task sleeps between lookups).
    missing = [
        (r["id"], r["location_lat"], r["location_lon"])
        for r in rows
        if r["location_lat"] is not None and r["location_lon"] is not None
        and _row_get(r, "place_name") is None
    ]
    if missing:
        background.add_task(_backfill_places, missing[:5])
    species_ids = [r["species_id"] for r in rows if r["species_id"] is not None]
    species = await _species_lookup(db, species_ids)
    return [_format(r, species.get(r["species_id"])) for r in rows]


async def _backfill_places(rows: list[tuple[int, float, float]]) -> None:
    import asyncio

    from database import get_db

    for discovery_id, lat, lon in rows:
        geocoded = await reverse_geocode(lat, lon)
        if geocoded:
            place_name, country_code = geocoded
            try:
                async with get_db() as db:
                    await db.execute(
                        "UPDATE plant_discoveries SET place_name = ?, country_code = ? WHERE id = ?",
                        (place_name, country_code, discovery_id),
                    )
                    await db.commit()
            except Exception:
                logger.exception("Failed to persist geocoded place for discovery %s", discovery_id)
        await asyncio.sleep(1.1)


class DiscoveryUpdate(BaseModel):
    notes: Optional[str] = None


class DiscoveryLocationUpdate(BaseModel):
    location_lat: float = Field(ge=-90, le=90)
    location_lon: float = Field(ge=-180, le=180)


@router.patch("/{discovery_id}", response_model=DiscoveryOut)
async def update_discovery(
    discovery_id: int,
    body: DiscoveryUpdate,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Update a discovery's field notes (the only mutable part of an entry)."""
    rows = await db.execute_fetchall(
        """UPDATE plant_discoveries SET notes = ?
           WHERE id = ? AND household_id = ?
           RETURNING id, species_id, common_name, latin_name, thumbnail_url,
                     notes, location_lat, location_lon, place_name, country_code,
                     discovered_at""",
        (body.notes, discovery_id, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Discovery not found")
    row = rows[0]
    species = await _species_lookup(db, [row["species_id"]] if row["species_id"] else [])
    return _format(row, species.get(row["species_id"]) if row["species_id"] else None)


@router.patch("/{discovery_id}/location", response_model=DiscoveryOut)
async def update_discovery_location(
    discovery_id: int,
    body: DiscoveryLocationUpdate,
    background: BackgroundTasks,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Attach the current browser location to an existing field discovery."""
    rows = await db.execute_fetchall(
        """UPDATE plant_discoveries
           SET location_lat = ?, location_lon = ?, place_name = NULL, country_code = NULL
           WHERE id = ? AND household_id = ?
           RETURNING id, species_id, common_name, latin_name, thumbnail_url,
                     notes, location_lat, location_lon, place_name, country_code,
                     discovered_at""",
        (body.location_lat, body.location_lon, discovery_id, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Discovery not found")
    row = rows[0]
    background.add_task(
        _backfill_places, [(row["id"], body.location_lat, body.location_lon)]
    )
    species = await _species_lookup(db, [row["species_id"]] if row["species_id"] else [])
    return _format(row, species.get(row["species_id"]) if row["species_id"] else None)


class ShareOut(BaseModel):
    share_url: str


@router.post("/{discovery_id}/share", response_model=ShareOut)
async def share_discovery(
    discovery_id: int,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Mint (or return) the public share link for a find.

    Sharing is opt-in per discovery: nothing is publicly reachable until this
    endpoint has been called. The token is unguessable and stable, so the same
    find always shares to the same URL.
    """
    rows = await db.execute_fetchall(
        "SELECT id, share_token FROM plant_discoveries WHERE id = ? AND household_id = ?",
        (discovery_id, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Discovery not found")
    token = _row_get(rows[0], "share_token")
    if not token:
        # Make token minting idempotent under concurrent/double-tap shares: only
        # the first request fills the empty token; later contenders re-read and
        # return the persisted URL instead of briefly handing out a stale link.
        candidate = secrets.token_urlsafe(9)
        await db.execute(
            """UPDATE plant_discoveries
               SET share_token = ?
               WHERE id = ? AND household_id = ? AND share_token IS NULL""",
            (candidate, discovery_id, account["household_id"]),
        )
        await db.commit()
        refreshed = await db.execute_fetchall(
            "SELECT share_token FROM plant_discoveries WHERE id = ? AND household_id = ?",
            (discovery_id, account["household_id"]),
        )
        token = _row_get(refreshed[0], "share_token") if refreshed else candidate
    base = os.environ.get("PUBLIC_APP_URL", "https://floreren.app").rstrip("/")
    return {"share_url": f"{base}/s/{token}"}


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


def _get_storage() -> Storage | None:
    try:
        return build_storage_from_env()
    except Exception:
        return None


def _decode_photo_data(photo_data: str) -> tuple[bytes, str] | None:
    if not photo_data:
        return None
    content_type = "image/jpeg"
    if "," in photo_data:
        header, photo_data = photo_data.split(",", 1)
        if header.startswith("data:") and ";" in header:
            content_type = header[5:].split(";", 1)[0] or content_type
    try:
        return base64.b64decode(photo_data), content_type
    except Exception:
        return None


def _store_thumbnail(photo_data: str) -> str | None:
    storage = _get_storage()
    decoded = _decode_photo_data(photo_data)
    if not storage or not decoded:
        return None
    data, content_type = decoded
    extension = "png" if content_type == "image/png" else "jpg"
    key = f"field-journal/{int(time.time() * 1000)}.{extension}"
    try:
        return storage.put(key, data, content_type)
    except Exception:
        logger.exception("Failed to store discovery thumbnail")
        return None


async def _species_lookup(db, species_ids: list[int]) -> dict[int, dict]:
    ids = sorted({sid for sid in species_ids if sid is not None})
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    try:
        rows = await db.execute_fetchall(
            f"""SELECT id, common_name_nl, common_name_en, phenology_json,
                       fun_fact_nl, fun_fact_en
                FROM plant_species
                WHERE id IN ({placeholders})""",
            tuple(ids),
        )
    except Exception as exc:
        logger.warning("Discovery species enrichment unavailable: %s", exc)
        return {}
    return {r["id"]: _format_species(r) for r in rows}


def _format_species(row) -> dict:
    # Species created by the identify flow (GBIF upsert) have no phenology at
    # all, but DO get a cached fact in the dedicated fun_fact_* columns when the
    # DiscoveryCard generates one — prefer those, fall back to phenology facts
    # (the only source that existed before the columns were added).
    fact_nl = _clean(_row_get(row, "fun_fact_nl"))
    fact_en = _clean(_row_get(row, "fun_fact_en"))
    if not fact_nl or not fact_en:
        raw = _row_get(row, "phenology_json")
        phenology = None
        if raw:
            try:
                phenology = json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                phenology = None
        if isinstance(phenology, dict):
            fact_nl = fact_nl or _clean(phenology.get("interesting_facts_nl"))
            fact_en = fact_en or _clean(phenology.get("interesting_facts_en"))
    return {
        "common_name_nl": _row_get(row, "common_name_nl"),
        "common_name_en": _row_get(row, "common_name_en"),
        "fun_fact_nl": fact_nl,
        "fun_fact_en": fact_en,
    }


def _clean(value) -> str | None:
    text = str(value).strip() if value else ""
    return text or None


def _row_get(row, key: str, default=None):
    try:
        return row[key]
    except Exception:
        return default


def _format(row, species: dict | None = None) -> dict:
    dt = row["discovered_at"]
    if isinstance(dt, datetime):
        ts = dt.isoformat()
    else:
        ts = str(dt)
    species = species or {}
    return {
        "id": row["id"],
        "species_id": row["species_id"],
        "common_name": row["common_name"],
        "species_common_name_nl": species.get("common_name_nl"),
        "species_common_name_en": species.get("common_name_en"),
        "latin_name": row["latin_name"],
        "thumbnail_url": row["thumbnail_url"],
        "notes": row["notes"],
        "location_lat": row["location_lat"],
        "location_lon": row["location_lon"],
        "place_name": _row_get(row, "place_name"),
        "country_code": _row_get(row, "country_code"),
        "fun_fact_nl": species.get("fun_fact_nl"),
        "fun_fact_en": species.get("fun_fact_en"),
        "discovered_at": ts,
    }
