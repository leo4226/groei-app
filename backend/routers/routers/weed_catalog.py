import json

from fastapi import APIRouter, Depends, Query, HTTPException
from database import db_dep
from models import WeedSpeciesOut, WeedSpeciesListItem, WeedAppearanceOut, WeedHabitatOut, WeedRemovalOut

router = APIRouter(tags=["weed-catalog"])


def _parse_json_subobjects(row: dict) -> dict:
    """Parse the three JSON sub-object columns from a DB row into Python dicts."""
    for col in ("appearance_json", "habitat_json", "removal_json"):
        val = row.get(col)
        try:
            row[col] = json.loads(val) if isinstance(val, str) else val
        except (json.JSONDecodeError, TypeError):
            row[col] = None
    return row


def _row_to_out(row: dict) -> WeedSpeciesOut:
    row = _parse_json_subobjects(row)
    return WeedSpeciesOut(
        id=row["id"],
        slug=row["slug"],
        common_name_nl=row["common_name_nl"],
        latin_name=row["latin_name"],
        family=row.get("family"),
        common_names=json.loads(row.get("common_names") or "[]"),
        appearance=WeedAppearanceOut(**row["appearance_json"]) if row.get("appearance_json") else None,
        habitat=WeedHabitatOut(**row["habitat_json"]) if row.get("habitat_json") else None,
        removal=WeedRemovalOut(**row["removal_json"]) if row.get("removal_json") else None,
        edible=bool(row.get("edible", False)),
        edible_note=row.get("edible_note"),
        interesting=row.get("interesting"),
        native_to_nl=bool(row.get("native_to_nl", True)),
    )


def _row_to_listitem(row: dict) -> WeedSpeciesListItem:
    appearance = None
    try:
        val = row.get("appearance_json")
        appearance = json.loads(val) if isinstance(val, str) else val
    except (json.JSONDecodeError, TypeError):
        pass

    habitat = None
    try:
        val = row.get("habitat_json")
        habitat = json.loads(val) if isinstance(val, str) else val
    except (json.JSONDecodeError, TypeError):
        pass

    return WeedSpeciesListItem(
        id=row["id"],
        slug=row["slug"],
        common_name_nl=row["common_name_nl"],
        latin_name=row["latin_name"],
        family=row.get("family"),
        flower_color=appearance.get("flower_color") if appearance else None,
        places=habitat.get("places", []) if habitat else [],
    )


@router.get("/weed-catalog", response_model=list[WeedSpeciesListItem])
async def list_weed_catalog(
    place: str | None = Query(None),
    bloom_month: int | None = Query(None),
    flower_color: str | None = Query(None),
    growth_form: str | None = Query(None),
    sun_preference: str | None = Query(None),
    search: str | None = Query(None),
    db=Depends(db_dep),
):
    cursor = await db.execute(
        "SELECT id, slug, common_name_nl, latin_name, family, appearance_json, habitat_json FROM weed_species ORDER BY common_name_nl"
    )
    rows = await cursor.fetchall()

    out: list[WeedSpeciesListItem] = []
    for row in rows:
        r = dict(row)
        item = _row_to_listitem(r)

        # Apply simple filters early to avoid unnecessary JSON parsing
        if place and place not in item.places:
            continue
        if flower_color and item.flower_color != flower_color:
            continue
        if search and search.lower() not in item.common_name_nl.lower() and search.lower() not in item.latin_name.lower():
            continue

        # Filters that need full sub-object JSON parsing
        if bloom_month is not None or growth_form or sun_preference:
            hab = None
            try:
                val = row["habitat_json"]
                hab = json.loads(val) if isinstance(val, str) else val
            except (json.JSONDecodeError, TypeError):
                pass

            app = None
            try:
                val = row["appearance_json"]
                app = json.loads(val) if isinstance(val, str) else val
            except (json.JSONDecodeError, TypeError):
                pass

            if bloom_month is not None and (not hab or bloom_month not in hab.get("bloom_months", [])):
                continue
            if growth_form and (not app or app.get("growth_form") != growth_form):
                continue
            if sun_preference and (not hab or hab.get("sun_preference") != sun_preference):
                continue

        out.append(item)
    return out


@router.get("/weed-catalog/{weed_id}", response_model=WeedSpeciesOut)
async def get_weed_detail(weed_id: int, db=Depends(db_dep)):
    cursor = await db.execute("SELECT * FROM weed_species WHERE id = ?", (weed_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Weed not found")
    return _row_to_out(dict(row))
