import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_account
from database import db_dep

router = APIRouter(prefix="/spots", tags=["spots"])

ACTIVE_PHASES = {"growing", "flowering", "fruiting", "harvest", "establishing", "evergreen"}


class SpotPayload(BaseModel):
    x: float
    y: float
    map_id: int | None = None
    sun_by_month: list[float]  # 12 values, index 0 = January


@router.post("/suitability")
async def get_spot_suitability(
    payload: SpotPayload,
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    sun = payload.sun_by_month

    rows = await db.execute_fetchall(
        "SELECT id, common_name_nl, common_name_en, latin_name, phenology_json, "
        "native_to_nl, pollinator_value, is_drachtplant, is_moth_plant "
        "FROM plant_species WHERE phenology_json IS NOT NULL"
    )

    # Biodiversity lens: which of these species belong to this garden's streek,
    # so the crop/sun inspector can also flag ecologically valuable picks. Since
    # streek is derived from the user's map/location, only resolve it after the
    # usual household ownership check.
    streek_ids: set[int] = set()
    if payload.map_id is not None:
        owned = await db.execute_fetchall(
            "SELECT id FROM maps WHERE id = ? AND household_id = ?",
            (payload.map_id, account["household_id"]),
        )
        if not owned:
            raise HTTPException(status_code=404, detail="Map not found")

        from services.plant_suggestions import _streek_for_map
        _, _, streek_ids = await _streek_for_map(db, payload.map_id)

    results = []
    for row in rows:
        phenology = json.loads(row["phenology_json"])
        months = phenology.get("months", [])

        active_months = [m for m in months if m["phase"] in ACTIVE_PHASES]
        if not active_months:
            continue

        shortfalls = []
        for m in active_months:
            idx = m["month"] - 1
            sun_actual = sun[idx] if idx < len(sun) else 0.0
            shortfalls.append(max(0.0, m["sun_hours_needed"] - sun_actual))

        avg_shortfall = sum(shortfalls) / len(shortfalls)
        max_shortfall = max(shortfalls)

        if avg_shortfall <= 0.5:
            tier = "suitable"
        elif avg_shortfall <= 1.5:
            tier = "marginal"
        else:
            tier = "unsuitable"

        results.append({
            "species_id": row["id"],
            "common_name_nl": row["common_name_nl"],
            "common_name_en": row["common_name_en"],
            "latin_name": row["latin_name"],
            "tier": tier,
            "avg_shortfall_hours": round(avg_shortfall, 2),
            "max_shortfall_hours": round(max_shortfall, 2),
            "sow_window": phenology.get("sow_window", []),
            "transplant_window": phenology.get("transplant_window", []),
            "harvest_window": phenology.get("harvest_window", []),
            "frost_sensitive": phenology.get("frost_sensitive", False),
            "interesting_facts_nl": phenology.get("interesting_facts_nl", ""),
            "active_months": [m["month"] for m in active_months],
            # Biodiversity lens
            "is_native": bool(row["native_to_nl"]),
            "pollinator_value": row["pollinator_value"],
            "is_drachtplant": bool(row["is_drachtplant"]),
            "is_streek": row["id"] in streek_ids,
            "is_moth_plant": bool(row["is_moth_plant"]),
        })

    tier_order = {"suitable": 0, "marginal": 1, "unsuitable": 2}
    results.sort(key=lambda r: (tier_order[r["tier"]], r["avg_shortfall_hours"]))

    return {"x": payload.x, "y": payload.y, "sun_by_month": sun, "species": results}
