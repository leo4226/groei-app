import logging
import asyncio
import httpx
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
import json
from database import db_dep
from auth import get_current_account
from models import PlantSpeciesOut, SpeciesSearchResponse, PlantSpeciesSearchResult, SpeciesImageOut
from species_service import get_species_by_id, search_species
from services.ecology_enrichment import ensure_ecology
from services.phenology import parse_phenology

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


class BatchFitRequest(BaseModel):
    species_ids: list[int]


# Garden-fit reasons are shown verbatim in the discovery card and the field
# guide chips, so they must follow the request language — both endpoints used
# to emit Dutch to everyone. Keyed by grade, plus the two "no verdict" cases.
_FIT_REASONS: dict[str, dict[str, str]] = {
    "perfect": {"nl": "Ideaal licht", "en": "Ideal light"},
    "acceptable": {"nl": "Geschikt licht", "en": "Suitable light"},
    "marginal": {"nl": "Krap licht", "en": "Marginal light"},
    "tolerated": {"nl": "Past in elke tuin", "en": "Fits any garden"},
    "unknown": {"nl": "Onbekend", "en": "Unknown"},
    "no_preference": {"nl": "Geen lichtvoorkeur bekend", "en": "No light preference known"},
    "too_dark": {"nl": "Waarschijnlijk te donker", "en": "Probably too dark"},
}


def _fit_reason(key: str | None, lang: str) -> str:
    lang = "en" if lang == "en" else "nl"
    return _FIT_REASONS.get(key or "unknown", _FIT_REASONS["unknown"])[lang]


@router.post("/garden-fit/batch")
async def batch_species_garden_fit(
    body: BatchFitRequest,
    lang: str = Query("nl"),
    account=Depends(get_current_account),
    db=Depends(db_dep),
) -> dict[str, list[GardenFitVerdict]]:
    """Return garden-fit verdicts for multiple species in one round-trip."""
    if not body.species_ids:
        return {}
    if len(body.species_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 species per batch request")

    placeholders = ",".join("?" * len(body.species_ids))
    sp_rows = await db.execute_fetchall(
        f"SELECT id, sun_preference FROM plant_species WHERE id IN ({placeholders})",
        tuple(body.species_ids),
    )
    sp_map = {r["id"]: r["sun_preference"] for r in sp_rows}

    maps = await db.execute_fetchall(
        "SELECT id, name, map_type FROM maps WHERE household_id = ?",
        (account["household_id"],),
    )

    from services.plant_suggestions import fit_grade, bucket_for

    result: dict[str, list[GardenFitVerdict]] = {}
    for sid in body.species_ids:
        sun_preference = sp_map.get(sid)
        verdicts = []
        for m in maps:
            if not sun_preference:
                verdicts.append(GardenFitVerdict(
                    map_id=m["id"], map_name=m["name"],
                    sun_fit=None, reason=_fit_reason("no_preference", lang),
                ))
                continue
            avg_sun = 4.5 if m["map_type"] == "outdoor" else 2.0
            grade = fit_grade(sun_preference, bucket_for(float(avg_sun)))
            reason = _fit_reason(grade, lang) if grade else _fit_reason("too_dark", lang)
            verdicts.append(GardenFitVerdict(
                map_id=m["id"], map_name=m["name"], sun_fit=grade, reason=reason,
            ))
        result[str(sid)] = verdicts

    return result


def _normalise_fun_fact(nl: object, en: object) -> dict[str, str] | None:
    """Return a bilingual fun-fact payload, filling a missing language if needed."""
    fact_nl = str(nl).strip() if nl else ""
    fact_en = str(en).strip() if en else ""
    if not fact_nl and not fact_en:
        return None
    return {
        "fun_fact_nl": fact_nl or fact_en,
        "fun_fact_en": fact_en or fact_nl,
    }


def _phenology_fun_fact(phenology_json: object) -> dict[str, str] | None:
    """Fallback to existing species interesting facts when fun-fact generation fails."""
    phenology = parse_phenology(phenology_json)
    if phenology is None:
        return None
    return _normalise_fun_fact(
        phenology.get("interesting_facts_nl"),
        phenology.get("interesting_facts_en"),
    )


@router.get("/{species_id}/fun-fact", response_model=FunFactOut)
async def get_species_fun_fact(species_id: int, db=Depends(db_dep)):
    """Return a fun fact for a species.

    The dedicated fun_fact_* columns were added after phenology facts already
    existed. Read/cache those columns defensively so a schema mismatch or LLM
    failure does not make the DiscoveryCard show a permanent error.
    """
    row = await db.execute_fetchall(
        "SELECT latin_name, common_name_nl, phenology_json FROM plant_species WHERE id = ?",
        (species_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Species not found")
    r = row[0]
    fallback = _phenology_fun_fact(r.get("phenology_json"))

    cached_nl = cached_en = ""
    try:
        cached_rows = await db.execute_fetchall(
            "SELECT fun_fact_nl, fun_fact_en FROM plant_species WHERE id = ?",
            (species_id,),
        )
        if cached_rows:
            cached_nl = str(cached_rows[0].get("fun_fact_nl") or "").strip()
            cached_en = str(cached_rows[0].get("fun_fact_en") or "").strip()
            # Only a cache with BOTH languages short-circuits. A half-filled
            # cache used to be cross-filled silently, which is how English
            # users ended up reading Dutch facts — generate the missing
            # language instead (keeping whichever fact already exists).
            if cached_nl and cached_en:
                return {"fun_fact_nl": cached_nl, "fun_fact_en": cached_en}
    except Exception as exc:
        logger.warning("Fun fact cache unavailable for species %s: %s", species_id, exc)
        if fallback:
            return fallback

    fact_nl, fact_en = await _generate_fun_fact(r["latin_name"], r["common_name_nl"])
    merged_nl = cached_nl or str(fact_nl or "").strip()
    merged_en = cached_en or str(fact_en or "").strip()
    generated = _normalise_fun_fact(merged_nl, merged_en)

    if generated:
        # Persist only when each language holds a genuine fact in that language;
        # caching a cross-filled response would permanently mask the gap.
        if merged_nl and merged_en:
            try:
                await db.execute(
                    "UPDATE plant_species SET fun_fact_nl = ?, fun_fact_en = ? WHERE id = ?",
                    (merged_nl, merged_en, species_id),
                )
            except Exception as exc:
                logger.warning("Could not cache fun fact for species %s: %s", species_id, exc)
        return generated

    if fallback:
        return fallback

    raise HTTPException(status_code=503, detail="Fun fact generation unavailable")


@router.get("/{species_id}/garden-fit", response_model=list[GardenFitVerdict])
async def get_species_garden_fit(
    species_id: int,
    lang: str = Query("nl"),
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
                "reason": _fit_reason("no_preference", lang),
            })
            continue

        # Fall back to a rough outdoor/indoor heuristic — the full heatmap
        # is computed client-side and not stored in the DB.
        avg_sun = 4.5 if m["map_type"] == "outdoor" else 2.0
        bucket = bucket_for(float(avg_sun))
        grade = fit_grade(sun_preference, bucket)

        reason = _fit_reason(grade, lang) if grade else _fit_reason("too_dark", lang)

        verdicts.append({
            "map_id": m["id"],
            "map_name": m["name"],
            "sun_fit": grade,
            "reason": reason,
        })

    return verdicts


def _fun_fact_llm_config() -> tuple[str, str, str]:
    """Read the LLM config at call time (so env changes and tests both apply)."""
    from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_FUN_FACT_MODEL
    return LLM_API_KEY, LLM_CHAT_URL, LLM_FUN_FACT_MODEL


async def _generate_fun_fact(latin_name: str, common_name_nl: str | None) -> tuple[str, str]:
    """Generate NL + EN fun facts via LLM. Returns ('', '') on failure."""
    LLM_API_KEY, LLM_CHAT_URL, LLM_FUN_FACT_MODEL = _fun_fact_llm_config()
    if not LLM_API_KEY:
        return "", ""

    display_name = common_name_nl or latin_name
    system_prompt = (
        "You are a careful botanist writing for a friendly field guide. "
        "Return only valid JSON. Never invent medicinal, edible, toxic, or historical claims."
    )
    prompt = (
        f"Plant: {latin_name} (Dutch common name: {display_name}).\n"
        "Write one genuinely surprising, verifiable botanical or ecological fact about this species. "
        "Prefer pollination, seed dispersal, plant-animal relationships, unusual adaptations, "
        "name origins, or other memorable field-guide knowledge. Avoid generic care advice. "
        "Give the same fact naturally in Dutch and English, each in 1-2 short sentences. "
        "Do not start with 'Wist je dat' or 'Did you know'.\n"
        'Output schema: {"nl":"...","en":"..."}'
    )

    # Nous can occasionally take longer than the old 15-second budget or wrap
    # valid JSON in prose/markdown. Retry once and parse the first JSON object
    # rather than turning a transient/model-format issue into a permanent gap.
    for attempt in range(2):
        try:
            timeout = httpx.Timeout(30.0, connect=5.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    LLM_CHAT_URL,
                    headers={"Authorization": f"Bearer {LLM_API_KEY}", "content-type": "application/json"},
                    json={
                        "model": LLM_FUN_FACT_MODEL,
                        # DeepSeek V4 Flash reasons before answering; the old
                        # 150-token cap was often exhausted before JSON began.
                        "max_tokens": 4000,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt},
                        ],
                    },
                )
                resp.raise_for_status()
                choice = resp.json()["choices"][0]
                message = choice.get("message", {})
                content = message.get("content", "")
                finish_reason = choice.get("finish_reason")
            parsed = _parse_fun_fact_content(content)
            # Reasoning models (DeepSeek V4, o1, …) spend max_tokens on
            # reasoning BEFORE they start writing `content`, and when the budget
            # runs out they return an empty/partial `content` with the whole
            # answer left in `reasoning`. That is the common failure here, not a
            # provider outage: the fact was generated, we just weren't reading
            # the field it landed in. species_service.generate_fact_for_species
            # has handled this for a while; this endpoint never learned it.
            if not parsed:
                parsed = _parse_fun_fact_content(message.get("reasoning"), prefer_last=True)
            if parsed:
                return parsed
            logger.warning(
                "Fun fact LLM returned unexpected format for %s (finish_reason=%s): %r",
                latin_name, finish_reason, content,
            )
        except Exception as exc:
            logger.warning(
                "Fun fact LLM call failed for %s (attempt %s/2): %s",
                latin_name, attempt + 1, exc,
            )
        if attempt == 0:
            await asyncio.sleep(0.35)
    return "", ""


def _parse_fun_fact_content(content: object, prefer_last: bool = False) -> tuple[str, str] | None:
    """Extract a bilingual fact even when the model wraps JSON in prose.

    `prefer_last` is for reasoning text, which typically contains the model's
    discarded drafts before the answer it settled on — there the LAST usable
    object is the real one, whereas in `content` the first is.
    """
    text = str(content or "").strip()
    decoder = json.JSONDecoder()
    found: tuple[str, str] | None = None
    for offset, char in enumerate(text):
        if char != "{":
            continue
        try:
            data, _ = decoder.raw_decode(text[offset:])
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        nl = str(data.get("nl", "")).strip()
        en = str(data.get("en", "")).strip()
        if nl and en:
            if not prefer_last:
                return nl, en
            found = (nl, en)
    return found


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
