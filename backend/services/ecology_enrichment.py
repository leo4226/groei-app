"""Species ecology enrichment pipeline.

Two data sources for the first iteration:
  1. GBIF /species/{taxonKey}/distributions → native_to_nl, invasive_nl
  2. DeepSeek LLM                           → flowering_months, pollinator_value

iNaturalist (cross-check native flag) and Wikidata (host-plant relations)
are stubs for a later iteration.

Entry point: `ensure_ecology(db, species_id)` — checks the cached columns
on `plant_species`, runs the chain if not yet enriched, persists the
result, returns the ecology dict.

See docs/plans/2026-05-27-species-ecology-enrichment-spec.md.
"""

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

GBIF_API = "https://api.gbif.org/v1"
_VALID_SUN = {"full_sun", "partial_sun", "shade", "any"}


@dataclass
class EcologyProfile:
    native_to_nl: bool | None
    invasive_nl: bool | None
    flowering_months: list[int] | None
    pollinator_value: int | None        # 0..3
    host_plant_for: list[str] | None
    sun_preference: str | None          # 'full_sun'|'partial_sun'|'shade'|'any'
    data_source: str                    # 'gbif' / 'llm' / 'mixed' / 'failed'


def compute_biodiversity_score(
    native_to_nl: bool | None,
    pollinator_value: int | None,
    flowering_months: list[int] | None,
    host_plant_for: list[str] | None,
) -> int | None:
    """0-100 per-plant biodiversity score.

    Invasive flag is *not* part of this number — it's a separate warning
    shown alongside. Otherwise a plant great for butterflies but listed
    as invasive (e.g. Buddleja davidii) would score 0, which is dishonest
    to the thousands of butterflies that actually feed on it.

    Components:
      - Native to NL:        +25
      - Pollinator value:    +0..30 (value × 10)
      - Flowering coverage:  +0..30 (months × 30 / 12)
      - Host plant:          +15 if non-empty

    Returns None when we know nothing — all inputs null. Returns 0 only
    when the plant is *known* to contribute nothing (pollinator=0,
    no flowering, non-native, no host)."""
    has_any_signal = (
        native_to_nl is not None
        or pollinator_value is not None
        or (flowering_months is not None)
        or (host_plant_for is not None)
    )
    if not has_any_signal:
        return None

    score = 0
    if native_to_nl is True:
        score += 25
    if pollinator_value is not None:
        score += max(0, min(3, pollinator_value)) * 10
    if flowering_months:
        score += min(30, round(len(flowering_months) / 12 * 30))
    if host_plant_for:
        score += 15
    return min(100, score)


async def _from_gbif(taxon_key: int) -> dict:
    """Query GBIF distributions endpoint. Returns dict with native_to_nl and
    invasive_nl, or empty dict on failure / no NL record."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{GBIF_API}/species/{taxon_key}/distributions")
            resp.raise_for_status()
            payload = resp.json()
    except Exception as exc:
        logger.warning("GBIF distributions failed for taxon %s: %s", taxon_key, exc)
        return {}

    for record in payload.get("results", []):
        country = record.get("country", "")
        # GBIF returns 2-letter ISO country codes
        if country != "NL":
            continue
        est = (record.get("establishmentMeans") or "").upper()
        if est == "NATIVE":
            return {"native_to_nl": True, "invasive_nl": False}
        if est == "INVASIVE":
            return {"native_to_nl": False, "invasive_nl": True}
        if est in {"INTRODUCED", "NATURALISED", "NATURALIZED"}:
            return {"native_to_nl": False, "invasive_nl": False}
        # Other values (UNKNOWN, MANAGED, ...) — skip and keep looking.
    return {}


_ECOLOGY_PROMPT = """\
You are a Dutch botanical expert. For the plant species below, return a
small JSON object with the requested ecology data.

Species: {latin_name}

Return ONLY a valid JSON object with this exact schema:

{{
  "native_to_nl": [boolean — true if this species is indigenous to the
                   Netherlands (not introduced/cultivated)],
  "invasive_nl": [boolean — true only if officially listed as invasive
                  in the Netherlands],
  "flowering_months": [list of integer month numbers 1-12 when this plant
                       blooms outdoors in the Netherlands; empty list if
                       it does not reliably flower here],
  "pollinator_value": [integer 0-3 where 0 = no floral resources or wind-
                       pollinated, 1 = minor value, 2 = good for bees and
                       butterflies, 3 = top-tier pollinator plant],
  "sun_preference": ["full_sun" | "partial_sun" | "shade" | "any" —
                     what this species prefers; "any" for truly
                     adaptable species; use the most specific that applies]
}}

No markdown, no backticks, no explanation. Use null for any field you are
unsure about. Use an empty list for unknown flowering months.
"""


async def _from_llm(latin_name: str) -> dict:
    """Ask DeepSeek for native_to_nl, invasive_nl, flowering_months,
    pollinator_value, and sun_preference. Returns a dict with the
    validated fields, or empty on failure / invalid response."""
    if not LLM_API_KEY:
        return {}
    prompt = _ECOLOGY_PROMPT.format(latin_name=latin_name)
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                LLM_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "content-type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    # Reasoning model: 200 tokens was consumed by reasoning before
                    # any JSON was emitted, so content came back null/empty.
                    "max_tokens": 1500,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"].get("content")
    except Exception as exc:
        logger.warning("LLM ecology call failed for %s: %s", latin_name, exc)
        return {}
    if not content:
        logger.warning("LLM ecology returned empty content for %s", latin_name)
        return {}
    raw = content.strip()

    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("LLM ecology response not JSON for %s: %s", latin_name, exc)
        return {}

    out: dict = {}
    native = data.get("native_to_nl")
    if isinstance(native, bool):
        out["native_to_nl"] = native
    invasive = data.get("invasive_nl")
    if isinstance(invasive, bool):
        out["invasive_nl"] = invasive
    months = data.get("flowering_months")
    if isinstance(months, list) and all(
        isinstance(m, int) and 1 <= m <= 12 for m in months
    ):
        out["flowering_months"] = months
    pv = data.get("pollinator_value")
    if isinstance(pv, int) and 0 <= pv <= 3:
        out["pollinator_value"] = pv
    sp = data.get("sun_preference")
    if isinstance(sp, str) and sp in _VALID_SUN:
        out["sun_preference"] = sp
    return out


async def enrich(latin_name: str, gbif_taxon_key: int | None) -> EcologyProfile:
    """Run the source chain. GBIF supplies native/invasive flags (only if a
    taxon key is known); LLM fills flowering_months + pollinator_value.
    host_plant_for is always None for this iteration.

    Returns a profile whose fields may all be null. `data_source` reflects
    which sources actually contributed: 'gbif', 'llm', 'mixed', or 'failed'."""
    sources_used: set[str] = set()
    merged: dict = {}

    if gbif_taxon_key:
        gbif_data = await _from_gbif(gbif_taxon_key)
        if gbif_data:
            sources_used.add("gbif")
            merged.update(gbif_data)

    llm_data = await _from_llm(latin_name)
    if llm_data:
        # Only fill fields GBIF didn't already provide. GBIF is the
        # authoritative source for native/invasive; LLM is a fallback.
        added_from_llm = False
        for k, v in llm_data.items():
            if merged.get(k) is None:
                merged[k] = v
                added_from_llm = True
        if added_from_llm:
            sources_used.add("llm")

    if not sources_used:
        data_source = "failed"
    elif len(sources_used) == 1:
        data_source = next(iter(sources_used))
    else:
        data_source = "mixed"

    return EcologyProfile(
        native_to_nl=merged.get("native_to_nl"),
        invasive_nl=merged.get("invasive_nl"),
        flowering_months=merged.get("flowering_months"),
        pollinator_value=merged.get("pollinator_value"),
        host_plant_for=None,
        sun_preference=merged.get("sun_preference"),
        data_source=data_source,
    )


async def ensure_ecology(db, species_id: int) -> dict | None:
    """Return the ecology dict for `species_id`. If the row has never been
    enriched, run `enrich()`, persist, then return. Returns None if the
    species doesn't exist."""
    rows = await db.execute_fetchall(
        "SELECT latin_name, gbif_taxon_key, native_to_nl, invasive_nl, "
        "flowering_months, pollinator_value, host_plant_for, sun_preference, "
        "ecology_data_source, ecology_enriched_at "
        "FROM plant_species WHERE id = ?",
        (species_id,),
    )
    if not rows:
        return None
    row = dict(rows[0])

    # Serve from cache once enriched — but a previous "failed" run (e.g. the LLM
    # was down) cached all-null fields; let those retry instead of being stuck
    # blank forever.
    if row.get("ecology_enriched_at") is not None and row.get("ecology_data_source") != "failed":
        return _row_to_dict(row)

    profile = await enrich(row["latin_name"], row.get("gbif_taxon_key"))
    enriched_at = datetime.now(timezone.utc)

    await db.execute(
        """UPDATE plant_species SET
             native_to_nl = ?,
             invasive_nl = ?,
             flowering_months = ?,
             pollinator_value = ?,
             host_plant_for = ?,
             sun_preference = ?,
             ecology_data_source = ?,
             ecology_enriched_at = ?
           WHERE id = ?""",
        (
            profile.native_to_nl,
            profile.invasive_nl,
            json.dumps(profile.flowering_months) if profile.flowering_months is not None else None,
            profile.pollinator_value,
            json.dumps(profile.host_plant_for) if profile.host_plant_for is not None else None,
            profile.sun_preference,
            profile.data_source,
            enriched_at,
            species_id,
        ),
    )
    await db.commit()

    return {
        "native_to_nl": profile.native_to_nl,
        "invasive_nl": profile.invasive_nl,
        "flowering_months": profile.flowering_months,
        "pollinator_value": profile.pollinator_value,
        "host_plant_for": profile.host_plant_for,
        "sun_preference": profile.sun_preference,
        "data_source": profile.data_source,
        "enriched_at": enriched_at.isoformat(),
        "score": compute_biodiversity_score(
            profile.native_to_nl,
            profile.pollinator_value,
            profile.flowering_months,
            profile.host_plant_for,
        ),
    }


def _row_to_dict(row: dict) -> dict:
    """Coerce a DB row into the API-shaped ecology dict, parsing JSON
    columns that may arrive as strings (SQLite) or already-decoded lists
    (asyncpg JSONB). The biodiversity score is computed fresh on every
    read — no schema change needed if we tune weights later."""
    enriched_at = row.get("ecology_enriched_at")
    if isinstance(enriched_at, datetime):
        enriched_at = enriched_at.isoformat()
    flowering = _maybe_json(row.get("flowering_months"))
    host = _maybe_json(row.get("host_plant_for"))
    return {
        "native_to_nl": row.get("native_to_nl"),
        "invasive_nl": row.get("invasive_nl"),
        "flowering_months": flowering,
        "pollinator_value": row.get("pollinator_value"),
        "host_plant_for": host,
        "sun_preference": row.get("sun_preference"),
        "data_source": row.get("ecology_data_source"),
        "enriched_at": enriched_at,
        "score": compute_biodiversity_score(
            row.get("native_to_nl"),
            row.get("pollinator_value"),
            flowering,
            host,
        ),
    }


def _maybe_json(value):
    if value is None or isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return None
