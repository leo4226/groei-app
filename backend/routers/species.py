import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
import json
from database import db_dep
from auth import get_current_account
from models import PlantSpeciesOut, SpeciesSearchResponse, PlantSpeciesSearchResult, SpeciesImageOut
from species_service import get_species_by_id, search_species
from services.ecology_enrichment import ensure_ecology

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/species", tags=["species"])


class EcologyOut(BaseModel):
    native_to_nl: bool | None
    invasive_nl: bool | None
    flowering_months: list[int] | None
    pollinator_value: int | None
    host_plant_for: list[str] | None
    sun_preference: str | None
    data_source: str
    enriched_at: str
    score: int | None        # 0..100 biodiversity score; null when no data


@router.get("/search", response_model=SpeciesSearchResponse)
async def search_species_endpoint(
    q: str = Query(..., min_length=1, description="Search query"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db=Depends(db_dep),
):
    results, total = await search_species(db, q, page, per_page)

    out = []
    for r in results:
        primary = r.get("primary_image")
        out.append(PlantSpeciesSearchResult(
            id=r["id"],
            slug=r["slug"],
            common_name_nl=r["common_name_nl"],
            common_name_en=r.get("common_name_en"),
            latin_name=r.get("latin_name"),
            family=r.get("family"),
            genus=r.get("genus"),
            images_count=r.get("images_count", 0),
            primary_image=SpeciesImageOut(**primary) if primary else None,
        ))

    return SpeciesSearchResponse(results=out, total=total, page=page, per_page=per_page)


@router.get("", response_model=list[PlantSpeciesOut])
async def list_species(db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, slug, common_name_nl, common_name_en, latin_name, "
        "family, genus, growth_form, climate_zone, images_count "
        "FROM plant_species ORDER BY common_name_nl"
    )
    return [dict(r) for r in rows]


@router.get("/{species_id}", response_model=PlantSpeciesOut)
async def get_species(species_id: int, db=Depends(db_dep)):
    species = await get_species_by_id(db, species_id)
    if not species:
        raise HTTPException(status_code=404, detail="Species not found")
    return species


@router.get("/{species_id}/ecology", response_model=EcologyOut)
async def get_species_ecology(species_id: int, db=Depends(db_dep)):
    """Return the ecology profile for a species. Runs lazy enrichment
    (GBIF + LLM) on first access, then caches on `plant_species`."""
    profile = await ensure_ecology(db, species_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Species not found")
    return profile


class FunFactOut(BaseModel):
    fun_fact_nl: str
    fun_fact_en: str


class GardenFitVerdict(BaseModel):
    map_id: int
    map_name: str
    sun_fit: str | None
    reason: str


@router.get("/{species_id}/fun-fact", response_model=FunFactOut)
async def get_species_fun_fact(species_id: int, db=Depends(db_dep)):
    """Return a fun fact for a species. Generates via LLM on first access, then caches."""
    row = await db.execute_fetchall(
        "SELECT latin_name, common_name_nl, fun_fact_nl, fun_fact_en FROM plant_species WHERE id = ?",
        (species_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Species not found")
    r = row[0]
    if r["fun_fact_nl"] and r["fun_fact_en"]:
        return {"fun_fact_nl": r["fun_fact_nl"], "fun_fact_en": r["fun_fact_en"]}

    # Generate fun fact via LLM
    fact_nl, fact_en = await _generate_fun_fact(r["latin_name"], r["common_name_nl"])
    if not fact_nl:
        raise HTTPException(status_code=503, detail="Fun fact generation unavailable")

    await db.execute(
        "UPDATE plant_species SET fun_fact_nl = ?, fun_fact_en = ? WHERE id = ?",
        (fact_nl, fact_en, species_id),
    )
    return {"fun_fact_nl": fact_nl, "fun_fact_en": fact_en}


@router.get("/{species_id}/garden-fit", response_model=list[GardenFitVerdict])
async def get_species_garden_fit(
    species_id: int,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Return a garden-fit verdict per map for the user's household."""
    sp_rows = await db.execute_fetchall(
        "SELECT id, sun_preference FROM plant_species WHERE id = ?",
        (species_id,),
    )
    if not sp_rows:
        raise HTTPException(status_code=404, detail="Species not found")
    sun_preference = sp_rows[0]["sun_preference"]

    maps = await db.execute_fetchall(
        "SELECT id, name, map_type FROM maps WHERE household_id = ?",
        (account["household_id"],),
    )

    from services.plant_suggestions import fit_grade, bucket_for

    verdicts = []
    for m in maps:
        if not sun_preference:
            verdicts.append({
                "map_id": m["id"],
                "map_name": m["name"],
                "sun_fit": None,
                "reason": "Geen lichtvoorkeur bekend" if True else "No light preference known",
            })
            continue

        # Fall back to a rough outdoor/indoor heuristic — the full heatmap
        # is computed client-side and not stored in the DB.
        avg_sun = 4.5 if m["map_type"] == "outdoor" else 2.0
        bucket = bucket_for(float(avg_sun))
        grade = fit_grade(sun_preference, bucket)

        _FIT_LABEL_NL = {
            "perfect": "Ideaal licht",
            "acceptable": "Geschikt licht",
            "marginal": "Krap licht",
            "tolerated": "Past in elke tuin",
        }
        reason = _FIT_LABEL_NL.get(grade, "Onbekend") if grade else "Waarschijnlijk te donker"

        verdicts.append({
            "map_id": m["id"],
            "map_name": m["name"],
            "sun_fit": grade,
            "reason": reason,
        })

    return verdicts


async def _generate_fun_fact(latin_name: str, common_name_nl: str | None) -> tuple[str, str]:
    """Generate NL + EN fun facts via LLM. Returns ('', '') on failure."""
    from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL
    if not LLM_API_KEY:
        return "", ""

    display_name = common_name_nl or latin_name
    prompt = (
        f"Write one short, surprising fun fact about the plant {latin_name} ({display_name}). "
        "The fact should be genuinely interesting — something most gardeners don't know. "
        "Respond ONLY with a JSON object like: "
        '{"nl": "...", "en": "..."} '
        "Both facts must be 1-2 sentences, no filler phrases like 'Did you know'."
    )

    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                LLM_CHAT_URL,
                headers={"Authorization": f"Bearer {LLM_API_KEY}", "content-type": "application/json"},
                json={
                    "model": LLM_MODEL,
                    "max_tokens": 300,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"].get("content", "")
    except Exception as exc:
        logger.warning("Fun fact LLM call failed for %s: %s", latin_name, exc)
        return "", ""

    import re
    content = content.strip()
    content = re.sub(r"^```json\s*", "", content)
    content = re.sub(r"\s*```$", "", content)
    try:
        data = json.loads(content)
        nl = str(data.get("nl", "")).strip()
        en = str(data.get("en", "")).strip()
        if nl and en:
            return nl, en
    except (json.JSONDecodeError, AttributeError):
        pass
    logger.warning("Fun fact LLM returned unexpected format for %s: %r", latin_name, content)
    return "", ""


@router.get("/by-latin/{latin_name}")
async def get_species_by_latin(latin_name: str, db=Depends(db_dep)):
    """Look up a species by latin name, return care_thresholds if available."""
    row = await db.execute_fetchall(
        "SELECT id, care_thresholds FROM plant_species WHERE LOWER(latin_name) = LOWER(?)",
        (latin_name,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Species not found")
    thresholds = row[0]["care_thresholds"]
    return {
        "id": row[0]["id"],
        "care_thresholds": json.loads(thresholds) if isinstance(thresholds, str) else thresholds,
    }
