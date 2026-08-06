"""Public garden atlas — anonymous read surface for opt-in gardens.

GET /api/atlas/gardens          list opt-in outdoor gardens (browse/filter)
GET /api/atlas/gardens/{slug}   read-only detail (layout, zones, plants)

Deliberately NO auth dependency: this is the public browse surface. Privacy
contract (docs/plans/2026-05-27-public-gardens-and-biodiversity.md):

- Only maps with ``is_public = TRUE`` appear — explicit opt-in, default off.
- No account/household PII and no exact GPS: lat/lon are rounded to 2
  decimals (~1.1 km, city level) before leaving the server.
- Map photos stay private unless the owner also opted into ``photos_public``.

The token-share pattern (share.py) is NOT reused here: the atlas is a browse
surface, not a secret link.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db_dep
from models import (
    PublicGardenDetail,
    PublicGardenSummary,
    PublicGroundZoneOut,
    PublicPlantOut,
    PublicZoneOut,
)
from services.garden_biodiversity import compute_for_map as compute_biodiversity
from services.streek import all_streken

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/atlas", tags=["atlas"])

_MAP_SELECT = (
    "id, name, slug, viewbox, canvas_data, map_type, lat, lon, created_at, "
    "thumbnail_file, streek_slug, is_public, photos_public, place_name, country_code"
)


def _round_gps(value: float | None) -> float | None:
    # 2 decimals ≈ 1.1 km — neighbourhood/city level, never the street address.
    return round(value, 2) if value is not None else None


def _streek_names() -> dict[str, str]:
    return {s["slug"]: s["name"] for s in all_streken()}


def _coerce_months(raw) -> list[int]:
    """flowering_months is a JSONB int array in prod, JSON text in tests."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [int(m) for m in raw if isinstance(m, int) or str(m).isdigit()]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except Exception:
            return []
        if isinstance(parsed, list):
            return [int(m) for m in parsed if isinstance(m, int) or str(m).isdigit()]
    return []


async def _flower_months_for_maps(db, map_ids: list[int]) -> dict[int, list[int]]:
    """Months 1-12 in which at least one active plant on the map flowers."""
    if not map_ids:
        return {}
    placeholders = ",".join("?" for _ in map_ids)
    rows = await db.execute_fetchall(
        f"SELECT p.map_id, ps.flowering_months "
        f"FROM plants p JOIN plant_species ps ON ps.id = p.species_id "
        f"WHERE p.is_active = TRUE AND p.map_id IN ({placeholders})",
        tuple(map_ids),
    )
    months: dict[int, set[int]] = {}
    for r in rows:
        for m in _coerce_months(r["flowering_months"]):
            if 1 <= m <= 12:
                months.setdefault(r["map_id"], set()).add(m)
    return {mid: sorted(s) for mid, s in months.items()}


async def _plant_counts_for_maps(db, map_ids: list[int]) -> dict[int, int]:
    if not map_ids:
        return {}
    placeholders = ",".join("?" for _ in map_ids)
    rows = await db.execute_fetchall(
        f"SELECT map_id, COUNT(*) AS c FROM plants "
        f"WHERE is_active = TRUE AND map_id IN ({placeholders}) GROUP BY map_id",
        tuple(map_ids),
    )
    return {r["map_id"]: int(r["c"]) for r in rows}


async def _summary_for(db, m: dict, streek_names: dict[str, str]) -> PublicGardenSummary:
    bio = await compute_biodiversity(db, m["id"])
    return PublicGardenSummary(
        slug=m["slug"],
        name=m["name"],
        city=m.get("place_name") or streek_names.get(m.get("streek_slug") or ""),
        country_code=m.get("country_code"),
        approx_lat=_round_gps(m.get("lat")),
        approx_lon=_round_gps(m.get("lon")),
        biodiversity_score=bio.score,
        species_count=bio.species_count,
        streek_slug=m.get("streek_slug"),
        streek_name=streek_names.get(m.get("streek_slug") or ""),
        thumbnail_file=m.get("thumbnail_file") if m.get("photos_public") else None,
    )


@router.get("/gardens", response_model=list[PublicGardenSummary])
async def list_public_gardens(
    city: str | None = Query(default=None, max_length=80),
    month: int | None = Query(default=None, ge=1, le=12),
    min_score: int | None = Query(default=None, ge=0, le=100),
    sort: str = Query(default="score", pattern="^(score|name|newest)$"),
    db=Depends(db_dep),
):
    """Browse opt-in public gardens. Private maps never appear here."""
    rows = await db.execute_fetchall(
        f"SELECT {_MAP_SELECT} FROM maps "
        f"WHERE is_public = TRUE AND map_type = 'outdoor'",
    )
    if not rows:
        return []

    maps = [dict(r) for r in rows]
    map_ids = [m["id"] for m in maps]
    flower_months = await _flower_months_for_maps(db, map_ids)
    plant_counts = await _plant_counts_for_maps(db, map_ids)
    streek_names = _streek_names()

    city_query = city.strip().lower() if city else None
    pairs: list[tuple[PublicGardenSummary, str]] = []
    for m in maps:
        if month is not None and month not in flower_months.get(m["id"], []):
            continue
        summary = await _summary_for(db, m, streek_names)
        summary.plant_count = plant_counts.get(m["id"], 0)
        summary.flower_months = flower_months.get(m["id"], [])
        if min_score is not None and (summary.biodiversity_score or 0) < min_score:
            continue
        if city_query:
            haystack = " ".join(
                x for x in (summary.city or "", summary.name or "") if x
            ).lower()
            if city_query not in haystack:
                continue
        pairs.append((summary, m.get("created_at") or ""))

    if sort == "name":
        pairs.sort(key=lambda p: p[0].name.lower())
    elif sort == "newest":
        pairs.sort(key=lambda p: p[1], reverse=True)
    else:  # score
        pairs.sort(key=lambda p: p[0].biodiversity_score or 0, reverse=True)
    return [p[0] for p in pairs]


@router.get("/gardens/{slug}", response_model=PublicGardenDetail)
async def get_public_garden(slug: str, db=Depends(db_dep)):
    """Read-only detail for one opt-in garden. Private/nonexistent → 404."""
    rows = await db.execute_fetchall(
        f"SELECT {_MAP_SELECT} FROM maps "
        f"WHERE slug = ? AND is_public = TRUE AND map_type = 'outdoor'",
        (slug,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Garden not found")
    m = dict(rows[0])

    zone_rows = await db.execute_fetchall(
        "SELECT id, name, zone_type, sun_exposure, boundary, color, sort_order "
        "FROM zones WHERE map_id = ? ORDER BY sort_order, id",
        (m["id"],),
    )
    ground_rows = await db.execute_fetchall(
        "SELECT id, name, zone_type, polygon FROM ground_zones WHERE map_id = ?",
        (m["id"],),
    )
    plant_rows = await db.execute_fetchall(
        "SELECT p.id, p.name, p.map_x, p.map_y, p.display_radius_cm, "
        "       p.plant_type, p.icon_key, p.photo_path, "
        "       s.latin_name, s.common_name_nl AS species_common_name_nl, "
        "       s.common_name_en AS species_common_name_en "
        "FROM plants p LEFT JOIN plant_species s ON s.id = p.species_id "
        "WHERE p.map_id = ? AND p.is_active = TRUE "
        "  AND p.map_x IS NOT NULL AND p.map_y IS NOT NULL "
        "ORDER BY p.id",
        (m["id"],),
    )

    streek_names = _streek_names()
    summary = await _summary_for(db, m, streek_names)
    summary.plant_count = len(plant_rows)
    summary.flower_months = (await _flower_months_for_maps(db, [m["id"]])).get(m["id"], [])

    return PublicGardenDetail(
        **summary.model_dump(),
        viewbox=m["viewbox"],
        canvas_data=m.get("canvas_data"),
        zones=[PublicZoneOut(**dict(r)) for r in zone_rows],
        ground_zones=[PublicGroundZoneOut(**dict(r)) for r in ground_rows],
        plants=[
            PublicPlantOut(
                id=r["id"],
                name=r["name"],
                latin_name=r.get("latin_name"),
                species_common_name_nl=r.get("species_common_name_nl"),
                species_common_name_en=r.get("species_common_name_en"),
                map_x=r["map_x"],
                map_y=r["map_y"],
                display_radius_cm=r.get("display_radius_cm"),
                plant_type=r.get("plant_type"),
                icon_key=r.get("icon_key"),
                photo_path=r.get("photo_path") if m.get("photos_public") else None,
            )
            for r in plant_rows
        ],
    )
