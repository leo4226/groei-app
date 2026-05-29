"""Plant care + garden actions router.

Thin route definitions. Heavy lifting lives in:
  - services.species_knowledge (Trefle / curated / AI cascade + cache)
  - services.environment       (Open-Meteo rain + temp data)
  - services.garden_log        (garden-wide water/fertilize logs + status)

The module also hosts the AI "grow here" recommendation endpoint, which uses
Deepseek but operates on a sun-context (not a Species), so it doesn't fit the
species_knowledge service.
"""
import json
import os
from datetime import date

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account
from services.environment import get_rain_data, get_temp_data
from services.species_knowledge import get_species_knowledge
from services.garden_log import (
    get_last_garden_watered,
    get_last_garden_fertilized,
    log_garden_water,
    log_garden_fertilize,
    compute_water_status,
)
from services.plant_suggestions import recommend_for_spot
from services.garden_biodiversity import compute_for_map as _compute_bio
from models import RecommendationsOut, PlantRecommendationOut

router = APIRouter()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY") or ""
DEEPSEEK_URL     = "https://api.deepseek.com/v1/chat/completions"

_grow_here_cache: dict = {}  # key: (sun_hours_rounded, month) → response dict

MONTH_NAMES_NL = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
]


# ── Species care info ────────────────────────────────────────────────────────

@router.get("/plants/{plant_id}/care-info")
async def get_plant_care_info(plant_id: int, db = Depends(db_dep)):
    row = await db.execute_fetchall(
        "SELECT species, notes FROM plants WHERE id = ?", (plant_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")

    scientific_name = row[0]["species"]
    plant_notes     = row[0]["notes"]
    if not scientific_name:
        return {"source": "not_found", "scientific_name": None, "plant_notes": plant_notes}

    result = await get_species_knowledge(scientific_name, db)
    if not result:
        return {"source": "not_found", "scientific_name": scientific_name, "plant_notes": plant_notes}

    result["plant_notes"] = plant_notes
    return result


# ── Grow-here AI recommendation ──────────────────────────────────────────────

class GrowHereRequest(BaseModel):
    sun_hours: float
    selected_month: int          # 1-12
    existing_plants: list[str]   # plant names already in the garden


@router.post("/garden/grow-here")
async def grow_here(req: GrowHereRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")

    cache_key = (round(req.sun_hours, 1), req.selected_month)
    if cache_key in _grow_here_cache:
        return _grow_here_cache[cache_key]

    month_name = MONTH_NAMES_NL[req.selected_month - 1]
    plants_str = ", ".join(req.existing_plants) if req.existing_plants else "geen"

    system = (
        "Je bent een tuinadviseur voor tuinen in Amsterdam, Nederland (52.37°N). "
        "De tuin is oost-noordoost-gericht, met de huismuur aan de west-zuidwestzijde (langs de Hoofdweg, richting NNW–ZZO). "
        "Reageer volledig in het Nederlands. "
        "Geef alleen geldige JSON terug, zonder markdown omheen."
    )

    prompt = f"""Dit tuinpunt krijgt ~{req.sun_hours:.1f} uur directe zon per dag in {month_name}.

De gebruiker heeft al de volgende planten in de tuin: {plants_str}.

Stel 5 tot 7 planten voor die goed gedijen op dit punt. Houd rekening met het Amsterdamse klimaat
(koude winters, natte lentes, stedelijk hitte-eilandeffect).

Geef je antwoord als JSON met dit formaat:
{{
  "suggestions": [
    {{
      "commonName": "string",
      "latinName": "string",
      "dutchName": "string",
      "sunFit": "perfect | good | acceptable",
      "reasoning": "string (2-3 zinnen waarom dit punt geschikt is)",
      "caveat": "string | null",
      "companionNote": "string | null"
    }}
  ],
  "spotSummary": "string (1 zin die dit tuinpunt typeert)"
}}

Stel geen planten voor die al in de tuin staan. Geef alleen geldige JSON terug."""

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            DEEPSEEK_URL,
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "content-type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "max_tokens": 1500,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="AI request failed")

    raw_text = resp.json()["choices"][0]["message"]["content"]
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]

    result = json.loads(text)
    _grow_here_cache[cache_key] = result
    return result


# ── DB-first recommendations ─────────────────────────────────────────────────

@router.get("/garden/recommendations", response_model=RecommendationsOut)
async def get_recommendations(
    map_id: int,
    sun_hours: float,
    month: int,
    svf: float = 1.0,
    limit: int = 8,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    """Tier 1 spot recommendations — DB-first, no LLM, returns in ~10 ms."""
    recs, gap_months = await recommend_for_spot(db, map_id, sun_hours, month, svf, limit)
    bio = await _compute_bio(db, map_id)
    return RecommendationsOut(
        recommendations=[PlantRecommendationOut(**vars(r)) for r in recs],
        gap_months=gap_months,
        biodiversity_score=bio.score,
    )


# ── Environment context endpoints ────────────────────────────────────────────

@router.get("/garden/rain-context")
async def get_rain_context():
    return await get_rain_data()


@router.get("/garden/temperature-context")
async def get_temperature_context():
    return await get_temp_data()


# ── Garden water log ─────────────────────────────────────────────────────────

class WaterLogCreate(BaseModel):
    watered_by: int | None = None
    watered_at: date | None = None
    water_amount: float | None = None  # ml


@router.post("/garden/water-log")
async def log_garden_watering(body: WaterLogCreate, db = Depends(db_dep)):
    watered_at = (body.watered_at or date.today()).isoformat()
    updated = await log_garden_water(db, watered_at, body.watered_by, body.water_amount)
    await db.commit()
    return {"watered_at": watered_at, "schedules_updated": updated, "water_amount": body.water_amount}


@router.get("/garden/water-log/latest")
async def latest_garden_watering(db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT watered_at, water_amount FROM garden_water_log ORDER BY watered_at DESC LIMIT 1"
    )
    if not rows:
        return {"watered_at": None, "water_amount": None}
    row = rows[0]
    return {"watered_at": row["watered_at"], "water_amount": row["water_amount"]}


@router.get("/garden/water-status")
async def get_garden_water_status():
    """Garden-wide water status from 14-day Amsterdam rainfall vs. seasonal ET budget."""
    rain         = await get_rain_data()
    last_watered = await get_last_garden_watered()
    total_14d    = rain.get("total_14day_mm", 0)
    total_7d     = rain.get("total_7day_mm", 0)
    days_since   = (date.today() - last_watered).days if last_watered else None

    result = compute_water_status(total_14d, total_7d, days_since)
    result["watered_at"] = last_watered.isoformat() if last_watered else None
    return result


@router.delete("/garden/water-log/latest")
async def delete_latest_garden_watering(db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id FROM garden_water_log ORDER BY watered_at DESC LIMIT 1"
    )
    if rows:
        await db.execute("DELETE FROM garden_water_log WHERE id = ?", (rows[0]["id"],))
        await db.commit()
    return {"ok": True}


# ── Garden fertilize log ──────────────────────────────────────────────────────

class FertilizeLogCreate(BaseModel):
    fertilized_by: int | None = None
    fertilized_at: date | None = None


@router.post("/garden/fertilize-log")
async def log_garden_fertilizing(body: FertilizeLogCreate, db = Depends(db_dep)):
    fertilized_at = (body.fertilized_at or date.today()).isoformat()
    updated = await log_garden_fertilize(db, fertilized_at, body.fertilized_by)
    await db.commit()
    return {"fertilized_at": fertilized_at, "schedules_updated": updated}


@router.get("/garden/fertilize-status")
async def get_garden_fertilize_status(db = Depends(db_dep)):
    """Return garden-wide fertilize status and count of pending schedules."""
    last = await get_last_garden_fertilized()
    pending = await db.execute_fetchall(
        """SELECT COUNT(*) as cnt FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.care_type = 'fertilize' AND cs.is_active = 1
           AND p.is_active = 1 AND cs.next_due <= CURRENT_DATE"""
    )
    return {
        "fertilized_at": last.isoformat() if last else None,
        "pending_count": pending[0]["cnt"] if pending else 0,
    }


@router.delete("/garden/fertilize-log/latest")
async def delete_latest_garden_fertilizing(db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id FROM garden_fertilize_log ORDER BY fertilized_at DESC LIMIT 1"
    )
    if rows:
        await db.execute("DELETE FROM garden_fertilize_log WHERE id = ?", (rows[0]["id"],))
        await db.commit()
    return {"ok": True}
