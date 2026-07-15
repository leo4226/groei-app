import asyncio
import json
import logging
import re

import httpx

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL
from services.deferred import fire_and_forget

logger = logging.getLogger(__name__)

_token_usage = {"input": 0, "output": 0}

def get_token_usage() -> dict:
    return dict(_token_usage)

_SPECIES_PROMPT = """\
Je bent een botanische expert die zowel Nederlandse als Engelse tuiniers helpt.

Genereer een JSON-object met fenologische data voor de volgende plant:
Plant: {plant_name}

Geef ALLEEN een geldig JSON-object terug, geen uitleg, geen markdown, geen backticks.
Het object moet dit exacte schema volgen — vul ALLE _nl EN _en velden in:

{{
  "slug": "lowercase-latijnse-naam-of-nederlandse-naam",
  "common_name_nl": "Nederlandse naam",
  "common_name_en": "English name",
  "latin_name": "Latijnse naam",
  "climate_zone": "temperate",
  "phenology": {{
    "months": [
      {{
        "month": 1,
        "phase": "dormant",
        "phase_label_nl": "Rustperiode",
        "phase_label_en": "Dormant period",
        "sun_hours_needed": 0,
        "description_nl": "Korte beschrijving wat de plant doet in het Nederlands",
        "description_en": "Brief description of what the plant is doing in English",
        "actions_nl": ["Nederlandse actie"],
        "actions_en": ["English action"]
      }}
    ],
    "sow_window": [],
    "transplant_window": [],
    "harvest_window": [],
    "frost_sensitive": true,
    "min_temp_c": 10,
    "max_height_cm": 60,
    "max_spread_cm": 40,
    "interesting_facts_nl": "Interessant feit over de plant in het Nederlands.",
    "interesting_facts_en": "Interesting fact about the plant in English.",
    "climate_zone": "temperate"
  }}
}}

Vul alle 12 maanden in. Vul zowel _nl als _en velden in voor phase_label, description, actions, en interesting_facts.
De _en velden moeten correct Engels zijn. Gebruik alleen deze phase-waarden:
dormant, establishing, growing, flowering, fruiting, harvest, dying_back, evergreen

Let op:
- sun_hours_needed is het aantal uur directe zon PER DAG dat de plant NODIG heeft in die fase
- Voor eenjarige planten: gebruik dormant of dying_back buiten het groeiseizoen
- Voor vaste planten en bomen: gebruik dormant in winter, evergreen als van toepassing
- sow_window, transplant_window, harvest_window zijn lijsten van maandnummers (1-12)
- interesting_facts_nl: schrijf 1-2 interessante zinnen specifiek voor Nederlandse tuiniers
- interesting_facts_en: write 1-2 interesting sentences specifically for Dutch gardeners
"""


# Small, fast call for the identify/commit hot path: the user is waiting and
# only needs display names. The full phenology calendar (_SPECIES_PROMPT,
# thousands of output tokens, 10-40s) runs as a deferred background job.
_NAMES_PROMPT = """\
Geef de gangbare Nederlandse en Engelse tuiniersnaam voor de plant "{plant_name}".
Antwoord ALLEEN met een geldig JSON-object, geen uitleg, geen markdown:
{{"slug": "lowercase-latijnse-naam", "latin_name": "Latijnse naam", "common_name_nl": "Nederlandse naam", "common_name_en": "English name"}}

BELANGRIJK: Als je NIET 100% zeker bent van de Nederlandse of Engelse naam, gebruik dan
ALTIJD de Latijnse naam voor dat veld. Verzin nooit een naam — een foute Nederlandse naam
is erger dan helemaal geen Nederlandse naam."""


async def _generate_names(plant_name: str) -> dict:
    """Names-only LLM call (~50 output tokens instead of ~5000)."""
    prompt = _NAMES_PROMPT.format(plant_name=plant_name)
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            LLM_CHAT_URL,
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "content-type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "max_tokens": 300,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        body = resp.json()
        usage = body.get("usage", {})
        _token_usage["input"] += usage.get("prompt_tokens", 0)
        _token_usage["output"] += usage.get("completion_tokens", 0)
        raw = body["choices"][0]["message"]["content"].strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


def schedule_phenology_enrichment(species_id: int, name_hint: str) -> None:
    """Generate the full phenology calendar in the background (own DB conn)."""
    async def _job():
        from database import get_db
        async with get_db() as bg_db:
            await ensure_phenology(bg_db, species_id, name_hint)

    fire_and_forget(_job, f"phenology-enrichment species={species_id}")


async def _generate_species(plant_name: str) -> dict:
    prompt = _SPECIES_PROMPT.format(plant_name=plant_name)
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            LLM_CHAT_URL,
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "content-type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "max_tokens": 10000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        body = resp.json()
        usage = body.get("usage", {})
        _token_usage["input"] += usage.get("prompt_tokens", 0)
        _token_usage["output"] += usage.get("completion_tokens", 0)
        raw = body["choices"][0]["message"]["content"].strip()

    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    # If response is an object with phenology or just the phenology directly
    try:
        parsed = json.loads(raw)
        # Could be {"phenology": {...}} or just {...} directly
        if "phenology" in parsed or "months" in parsed:
            return parsed
    except json.JSONDecodeError:
        pass

    return json.loads(raw)


async def ensure_phenology(db, species_id: int, name_hint: str) -> None:
    try:
        data = await _generate_species(name_hint)
    except Exception:
        return
    phen = data.get("phenology") or data
    if not phen or not phen.get("months"):
        return
    await db.execute(
        "UPDATE plant_species SET phenology_json = ?, updated_at = CURRENT_TIMESTAMP "
        "WHERE id = ? AND (phenology_json IS NULL OR phenology_json = '')",
        (json.dumps(phen, ensure_ascii=False), species_id),
    )
    await db.commit()


def _phenology_has_months(phenology_json) -> bool:
    """Whether stored phenology JSON has a usable month-by-month calendar.

    This is the data the UI needs to render the year calendar; a row can have a
    non-empty `phenology_json` (e.g. just a fact) yet still show
    "No species data available" because `months` is missing.
    """
    if not phenology_json:
        return False
    try:
        phen = json.loads(phenology_json)
    except (json.JSONDecodeError, TypeError):
        return False
    return isinstance(phen, dict) and bool(phen.get("months"))


async def regenerate_species_phenology(
    db, species_id: int, name_hint: str | None = None
) -> bool:
    """Force-regenerate a species' phenology when it has no usable month calendar.

    Unlike `ensure_phenology` (which only fills a NULL/empty column), this
    overwrites an *incomplete* phenology — present but missing `months` — which
    is the state a user hits as "No species data available" with no way to
    recover. Best-effort: returns True only when a usable calendar was written;
    LLM/parse failures leave the existing row untouched and return False.
    """
    rows = await db.execute_fetchall(
        "SELECT id, latin_name, common_name_nl, common_name_en, phenology_json "
        "FROM plant_species WHERE id = ?",
        (species_id,),
    )
    if not rows:
        return False
    rec = dict(rows[0])
    if _phenology_has_months(rec.get("phenology_json")):
        return False  # already has a usable calendar — nothing to do

    lookup_name = (
        _text_or_none(name_hint)
        or _text_or_none(rec.get("latin_name"))
        or _text_or_none(rec.get("common_name_nl"))
        or _text_or_none(rec.get("common_name_en"))
    )
    if not lookup_name:
        return False

    try:
        data = await _generate_species(lookup_name)
    except Exception:
        return False
    phen = data.get("phenology") or data
    if not isinstance(phen, dict) or not phen.get("months"):
        return False  # generation didn't yield a usable calendar; keep as-is

    await db.execute(
        "UPDATE plant_species SET phenology_json = ?, updated_at = CURRENT_TIMESTAMP "
        "WHERE id = ?",
        (json.dumps(phen, ensure_ascii=False), species_id),
    )
    await db.commit()
    return True


def _text_or_none(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _localized_name_missing(value, latin_name: str | None) -> bool:
    text = _text_or_none(value)
    if text is None:
        return True
    latin = _text_or_none(latin_name)
    return bool(latin and text.casefold() == latin.casefold())


async def ensure_species_localized_names(
    db, species_id: int, name_hint: str | None = None
) -> bool:
    """Fill missing NL/EN common names (and phenology) for an existing species.

    Some species rows originate from GBIF/BioCLIP imports with only the current
    UI language populated. The frontend intentionally falls back to the raw
    user-entered plant name when a localized species name is missing, so this
    helper repairs the source data instead of changing display logic.

    Returns True when the row was updated. LLM/API failures are deliberately
    allowed to bubble up so callers that run in user flows can decide whether
    the enrichment is best-effort.
    """
    rows = await db.execute_fetchall(
        "SELECT id, common_name_nl, common_name_en, latin_name, phenology_json "
        "FROM plant_species WHERE id = ?",
        (species_id,),
    )
    if not rows:
        return False

    rec = dict(rows[0])
    latin_name = _text_or_none(rec.get("latin_name"))
    missing_nl = _localized_name_missing(rec.get("common_name_nl"), latin_name)
    missing_en = _localized_name_missing(rec.get("common_name_en"), latin_name)
    missing_phenology = _text_or_none(rec.get("phenology_json")) is None

    if not (missing_nl or missing_en or missing_phenology):
        return False

    lookup_name = (
        _text_or_none(name_hint)
        or latin_name
        or _text_or_none(rec.get("common_name_nl"))
        or _text_or_none(rec.get("common_name_en"))
    )
    if not lookup_name:
        return False

    # Missing phenology is repaired OUT of the request path — the full
    # calendar generation takes 10-40s and the user only needs names now.
    if missing_phenology:
        schedule_phenology_enrichment(species_id, lookup_name)

    if not (missing_nl or missing_en or latin_name is None):
        return False

    data = await _generate_names(lookup_name)
    updates: list[str] = []
    params: list = []
    generated_latin = _text_or_none(data.get("latin_name"))
    canonical_latin = latin_name or generated_latin

    if latin_name is None and generated_latin:
        updates.append("latin_name = ?")
        params.append(generated_latin)

    if missing_nl:
        nl_name = _text_or_none(data.get("common_name_nl"))
        if nl_name and not _localized_name_missing(nl_name, canonical_latin):
            updates.append("common_name_nl = ?")
            params.append(nl_name)

    if missing_en:
        en_name = _text_or_none(data.get("common_name_en"))
        if en_name and not _localized_name_missing(en_name, canonical_latin):
            updates.append("common_name_en = ?")
            params.append(en_name)

    if not updates:
        return False

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(species_id)
    await db.execute(
        f"UPDATE plant_species SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    await db.commit()
    return True


async def get_or_create_species(db, plant_name: str) -> int:
    row = await db.execute_fetchall(
        """SELECT id, common_name_nl, common_name_en, latin_name, phenology_json
           FROM plant_species
           WHERE LOWER(common_name_nl) = LOWER(?)
              OR LOWER(COALESCE(common_name_en, '')) = LOWER(?)
              OR LOWER(COALESCE(latin_name, '')) = LOWER(?)
           LIMIT 1""",
        (plant_name, plant_name, plant_name),
    )
    if row:
        rec = dict(row[0])
        species_id = rec["id"]
        try:
            await ensure_species_localized_names(
                db, species_id, rec.get("latin_name") or plant_name
            )
        except Exception:
            # Existing species links must remain non-fatal in user flows. A later
            # retry/backfill can fill the localized fields if the LLM is down.
            pass
        return species_id

    # New species: create the row from a fast names-only call so the user
    # flow (identify commit / plant create) returns in seconds; the full
    # phenology calendar is generated right after, in the background.
    data = await _generate_names(plant_name)
    slug = data.get("slug") or plant_name.lower().replace(" ", "-")

    cursor = await db.execute(
        """INSERT INTO plant_species (slug, common_name_nl, common_name_en, latin_name, phenology_json, climate_zone)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             common_name_nl = COALESCE(NULLIF(plant_species.common_name_nl, ''), excluded.common_name_nl),
             common_name_en = COALESCE(NULLIF(plant_species.common_name_en, ''), excluded.common_name_en),
             latin_name     = COALESCE(NULLIF(plant_species.latin_name, ''), excluded.latin_name),
             phenology_json = COALESCE(NULLIF(plant_species.phenology_json, ''), excluded.phenology_json),
             climate_zone   = COALESCE(NULLIF(plant_species.climate_zone, ''), excluded.climate_zone),
             updated_at     = CURRENT_TIMESTAMP""",
        (
            slug,
            _text_or_none(data.get("common_name_nl")) or plant_name,
            _text_or_none(data.get("common_name_en")),
            _text_or_none(data.get("latin_name")),
            None,
            data.get("climate_zone", "temperate"),
        ),
    )
    await db.commit()
    species_id = cursor.lastrowid
    schedule_phenology_enrichment(species_id, _text_or_none(data.get("latin_name")) or plant_name)
    return species_id


async def get_species_by_id(db, species_id: int) -> dict | None:
    rows = await db.execute_fetchall(
        "SELECT * FROM plant_species WHERE id = ?", (species_id,)
    )
    if not rows:
        return None
    result = dict(rows[0])
    if result.get("phenology_json"):
        result["phenology"] = json.loads(result.pop("phenology_json"))
    else:
        result.pop("phenology_json", None)

    img_rows = await db.execute_fetchall(
        "SELECT id, url, thumbnail_url, source, license, is_primary "
        "FROM species_images WHERE species_id = ? ORDER BY is_primary DESC",
        (species_id,),
    )
    result["images"] = [dict(r) for r in img_rows] if img_rows else []
    return result


async def search_species(db, query: str, page: int = 1, per_page: int = 20) -> tuple[list[dict], int]:
    offset = (page - 1) * per_page
    like = f"%{query}%"
    count_rows = await db.execute_fetchall(
        """SELECT COUNT(*) AS total FROM plant_species
           WHERE common_name_nl ILIKE ? OR common_name_en ILIKE ? OR latin_name ILIKE ?""",
        (like, like, like),
    )
    total = count_rows[0]["total"] if count_rows else 0
    rows = await db.execute_fetchall(
        """SELECT id, slug, common_name_nl, common_name_en, latin_name, family, genus, images_count
           FROM plant_species
           WHERE common_name_nl ILIKE ? OR common_name_en ILIKE ? OR latin_name ILIKE ?
           ORDER BY CASE WHEN common_name_nl ILIKE ? THEN 0 WHEN common_name_en ILIKE ? THEN 1 WHEN latin_name ILIKE ? THEN 2 ELSE 3 END, common_name_nl
           LIMIT ? OFFSET ?""",
        (like, like, like, query, query, query, per_page, offset),
    )
    results = [dict(r) for r in rows]
    if results:
        ids = tuple(r["id"] for r in results)
        placeholders = ",".join("?" * len(ids))
        img_rows = await db.execute_fetchall(
            f"""SELECT DISTINCT ON (species_id) species_id, id, url, thumbnail_url, source, license, is_primary
                FROM species_images WHERE species_id IN ({placeholders}) ORDER BY species_id, is_primary DESC""",
            ids,
        )
        img_map = {r["species_id"]: dict(r) for r in img_rows} if img_rows else {}
        for r in results:
            r["primary_image"] = img_map.get(r["id"])
    return results, total


async def upsert_species_from_gbif(db, data: dict) -> int | None:
    await db.execute(
        """INSERT INTO plant_species
             (slug, common_name_nl, common_name_en, latin_name, family, genus, growth_form, gbif_taxon_key, images_count, climate_zone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (slug) DO UPDATE SET
             common_name_en  = COALESCE(excluded.common_name_en, plant_species.common_name_en),
             latin_name      = COALESCE(excluded.latin_name, plant_species.latin_name),
             family          = COALESCE(excluded.family, plant_species.family),
             genus           = COALESCE(excluded.genus, plant_species.genus),
             gbif_taxon_key  = COALESCE(excluded.gbif_taxon_key, plant_species.gbif_taxon_key),
             images_count    = excluded.images_count,
             updated_at      = CURRENT_TIMESTAMP
           RETURNING id""",
        (
            data.get("slug", ""), data.get("common_name_nl", ""), data.get("common_name_en"),
            data.get("latin_name"), data.get("family"), data.get("genus"),
            data.get("growth_form"), data.get("gbif_taxon_key"), data.get("images_count", 0),
            data.get("climate_zone", "temperate"),
        ),
    )
    return db.lastrowid


async def insert_species_image(db, species_id: int, img: dict) -> None:
    await db.execute(
        """INSERT INTO species_images (species_id, url, thumbnail_url, source, license, width, height, is_primary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (species_id, img["url"], img.get("thumbnail_url"), img.get("source", "gbif"),
         img.get("license"), img.get("width"), img.get("height"), img.get("is_primary", False)),
    )

_FACT_PROMPT = """\
Je bent een botanische expert die zowel Nederlandse als Engelse tuiniers helpt.

Geef 1-2 interessante feiten over de volgende plant, in BEIDE talen:

Plant: {plant_name}

De feiten moeten:
- Relevant zijn voor Nederlandse tuiniers (denk aan Nederlands klimaat, tuincultuur)
- Verrassend of nuttig zijn
- In het Nederlands voor fact_nl, en in het Engels voor fact_en

Geef ALLEEN dit JSON-formaat terug, geen uitleg, geen markdown:
{{
  "fact_nl": "Nederlands feit",
  "fact_en": "English fact"
}}
"""


def _strip_json_response(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"^```\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _normalise_fact_payload(payload) -> dict[str, str]:
    """Validate and normalise the bilingual fact shape returned by the LLM.

    Accepts both the prompt shape (`fact_nl`/`fact_en`) and the stored phenology
    shape (`interesting_facts_nl`/`interesting_facts_en`) so tests and admin
    tools can share one validation seam.
    """
    if not isinstance(payload, dict):
        raise ValueError("Expected JSON object with fact_nl and fact_en")

    fact_nl = (payload.get("fact_nl") or payload.get("interesting_facts_nl") or "").strip()
    fact_en = (payload.get("fact_en") or payload.get("interesting_facts_en") or "").strip()
    if not fact_nl or not fact_en:
        raise ValueError("LLM response must include non-empty fact_nl and fact_en")
    return {"fact_nl": fact_nl, "fact_en": fact_en}


async def generate_fact_for_species(plant_name: str, latin_name: str | None = None) -> dict[str, str]:
    name = plant_name
    if latin_name:
        name = f"{plant_name} ({latin_name})"
    prompt = _FACT_PROMPT.format(plant_name=name)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            LLM_CHAT_URL,
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "content-type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "max_tokens": 500,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        body = resp.json()
        raw = body["choices"][0]["message"]["content"]

    cleaned = _strip_json_response(raw)
    try:
        data = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError("LLM returned invalid fact JSON") from exc
    return _normalise_fact_payload(data)


def _load_phenology_json(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _has_bilingual_facts(phenology: dict) -> bool:
    return bool(
        str(phenology.get("interesting_facts_nl") or "").strip()
        and str(phenology.get("interesting_facts_en") or "").strip()
    )


async def _generate_fact_with_retries(
    plant_name: str,
    latin_name: str | None,
    attempts: int = 2,
) -> dict[str, str]:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return _normalise_fact_payload(await generate_fact_for_species(plant_name, latin_name))
        except Exception as exc:  # noqa: BLE001 - caller returns structured skip detail
            last_error = exc
            if attempt < attempts - 1:
                await asyncio.sleep(1 + attempt * 2)
    if last_error is not None:
        raise last_error
    raise RuntimeError("Fact generation failed")


def _normalise_fact_scope(scope: str | None) -> str:
    return "in_use" if scope == "in_use" else "all"


async def _fact_scope_rows(
    db,
    *,
    scope: str = "all",
    map_only: bool = False,
    household_id: int | None = None,
) -> list[dict]:
    scope = _normalise_fact_scope(scope)
    if scope == "in_use":
        sql = (
            "SELECT DISTINCT ps.id, ps.common_name_nl, ps.latin_name, ps.phenology_json "
            "FROM plant_species ps "
            "JOIN plants p ON p.species_id = ps.id "
            "WHERE p.is_active = 1 "
        )
        params: list[object] = []
        if household_id is not None:
            sql += "AND p.household_id = ? "
            params.append(household_id)
        if map_only:
            sql += "AND p.map_id IS NOT NULL "
        sql += "ORDER BY ps.common_name_nl"
        rows = await db.execute_fetchall(sql, tuple(params)) if params else await db.execute_fetchall(sql)
    else:
        rows = await db.execute_fetchall(
            "SELECT id, common_name_nl, latin_name, phenology_json "
            "FROM plant_species ORDER BY common_name_nl"
        )
    return [dict(row) for row in rows]


def _fact_rows_missing_bilingual_facts(rows: list[dict]) -> list[dict]:
    return [
        row for row in rows
        if not _has_bilingual_facts(_load_phenology_json(row.get("phenology_json")))
    ]


async def preview_missing_facts(
    db,
    *,
    scope: str = "all",
    map_only: bool = False,
    household_id: int | None = None,
) -> dict:
    scope = _normalise_fact_scope(scope)
    rows = await _fact_scope_rows(db, scope=scope, map_only=map_only, household_id=household_id)
    missing_nl = 0
    missing_en = 0
    missing_any = 0
    for row in rows:
        phenology = _load_phenology_json(row.get("phenology_json"))
        lacks_nl = not str(phenology.get("interesting_facts_nl") or "").strip()
        lacks_en = not str(phenology.get("interesting_facts_en") or "").strip()
        if lacks_nl:
            missing_nl += 1
        if lacks_en:
            missing_en += 1
        if lacks_nl or lacks_en:
            missing_any += 1
    return {
        "scope": scope,
        "map_only": bool(map_only),
        "total_species": len(rows),
        "missing_facts": missing_any,
        "missing_facts_nl": missing_nl,
        "missing_facts_en": missing_en,
    }


async def backfill_missing_facts(
    db,
    limit: int = 50,
    *,
    scope: str = "all",
    map_only: bool = False,
    household_id: int | None = None,
) -> dict:
    scope = _normalise_fact_scope(scope)
    all_rows = _fact_rows_missing_bilingual_facts(
        await _fact_scope_rows(db, scope=scope, map_only=map_only, household_id=household_id)
    )
    rows = all_rows[:limit] if limit and limit > 0 else all_rows

    if not rows:
        result = {
            "processed": 0,
            "updated": 0,
            "skipped": 0,
            "errors": [],
            "skipped_details": [],
            "message": "All selected species already have bilingual facts.",
        }
        if scope != "all" or map_only:
            result.update({"scope": scope, "map_only": bool(map_only), "remaining": 0})
        return result

    updated = 0
    errors = []
    skipped_details = []
    processed = 0

    for row in rows:
        species_id = row["id"]
        plant_name = row["common_name_nl"]
        latin_name = row.get("latin_name")
        phenology = _load_phenology_json(row.get("phenology_json"))
        if _has_bilingual_facts(phenology):
            continue

        processed += 1
        try:
            facts = await _generate_fact_with_retries(plant_name, latin_name)
            if not str(phenology.get("interesting_facts_nl") or "").strip():
                phenology["interesting_facts_nl"] = facts["fact_nl"]
            if not str(phenology.get("interesting_facts_en") or "").strip():
                phenology["interesting_facts_en"] = facts["fact_en"]

            await db.execute(
                "UPDATE plant_species SET phenology_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (json.dumps(phenology, ensure_ascii=False), species_id),
            )
            updated += 1
        except Exception as e:
            detail = {
                "species_id": species_id,
                "name": plant_name,
                "reason": "fact_generation_failed",
                "error": str(e),
            }
            errors.append({"species_id": species_id, "name": plant_name, "error": str(e)})
            skipped_details.append(detail)

    if updated:
        await db.commit()
    result = {
        "processed": processed,
        "updated": updated,
        "skipped": len(skipped_details),
        "errors": errors,
        "skipped_details": skipped_details,
    }
    if scope != "all" or map_only:
        result.update({
            "scope": scope,
            "map_only": bool(map_only),
            "remaining": max(0, len(all_rows) - len(rows)),
        })
    return result
