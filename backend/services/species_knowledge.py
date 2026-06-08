"""Species knowledge service.

Owns Species-level care knowledge: scientific name → family, light, precipitation
range, bloom months, height, toxicity, etc. Sourced (in order) from:
  1. plant_care_cache table (30-day TTL)
  2. Trefle API (if TREFLE_TOKEN set)
  3. Curated fallback table (10 species, RHS/Missouri Botanical/Gardenia.net)
  4. LLM fallback via OpenRouter (if OPENROUTER_API_KEY set)

Public API:
    fetch_species_knowledge(scientific_name) -> dict | None
        Trefle → curated → AI cascade, no caching. Returns the unified species dict.

    get_species_knowledge(scientific_name, db) -> dict | None
        Cache-aware: checks plant_care_cache, falls back to fetch_species_knowledge,
        writes the result to cache. Returns the dict with extra `source` and
        `cached_at` fields, or None if nothing was found.
"""
import json
import os
from datetime import datetime, timedelta, timezone

import httpx

TREFLE_TOKEN     = os.getenv("TREFLE_TOKEN") or ""
TREFLE_BASE      = "https://trefle.io/api/v1"
from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

# ── curated fallback data ────────────────────────────────────────────────────
# Growth fields sourced from RHS, Missouri Botanical Garden, Gardenia.net.
# Used to fill null fields when Trefle has no growth data for a species.

_CURATED: dict[str, dict] = {
    "Fargesia murielae": {
        "light_raw": 5, "light_label": "partial",
        "precip_min_mm": 600, "precip_max_mm": 1500,
        "bloom_months": [],
        "flower_colors": [],
        "avg_height_cm": 350, "max_height_cm": 450,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "none", "edible": False,
    },
    "Camellia japonica": {
        "light_raw": 4, "light_label": "partial",
        "precip_min_mm": 800, "precip_max_mm": 1200,
        "bloom_months": ["january", "february", "march", "april"],
        "flower_colors": ["red", "pink", "white"],
        "avg_height_cm": 200, "max_height_cm": 300,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "none", "edible": False,
    },
    "Miscanthus sinensis": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 500, "precip_max_mm": 1200,
        "bloom_months": ["august", "september", "october"],
        "flower_colors": ["silver", "white"],
        "avg_height_cm": 150, "max_height_cm": 200,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Quercus robur": {
        "light_raw": 7, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 900,
        "bloom_months": ["april", "may"],
        "flower_colors": ["yellow", "green"],
        "avg_height_cm": 2500, "max_height_cm": 4000,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "low", "edible": False,
    },
    "Rubus idaeus": {
        "light_raw": 7, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["may", "june"],
        "flower_colors": ["white", "pink"],
        "avg_height_cm": 150, "max_height_cm": 200,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": True,
    },
    "Nerium oleander": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 300, "precip_max_mm": 700,
        "bloom_months": ["june", "july", "august", "september"],
        "flower_colors": ["pink", "red", "white", "yellow"],
        "avg_height_cm": 200, "max_height_cm": 300,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "high", "edible": False,
    },
    "Verbena bonariensis": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 400, "precip_max_mm": 800,
        "bloom_months": ["june", "july", "august", "september", "october"],
        "flower_colors": ["purple"],
        "avg_height_cm": 120, "max_height_cm": 150,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Persea americana": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 1000, "precip_max_mm": 2000,
        "bloom_months": ["january", "february", "march"],
        "flower_colors": ["yellow", "green"],
        "avg_height_cm": 200, "max_height_cm": 400,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "none", "edible": True,
    },
    "Phaseolus vulgaris": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["june", "july", "august"],
        "flower_colors": ["white", "red", "purple"],
        "avg_height_cm": 100, "max_height_cm": 200,
        "duration": "annual", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Populus nigra 'Italica'": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 500, "precip_max_mm": 900,
        "bloom_months": ["march", "april"],
        "flower_colors": ["yellow", "green"],
        "avg_height_cm": 3000, "max_height_cm": 4500,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    # Common Dutch garden / picker plants (expanded per #57)

    "Hydrangea anomala subsp. petiolaris": {
        "light_raw": 4, "light_label": "partial",
        "precip_min_mm": 700, "precip_max_mm": 1200,
        "bloom_months": ["june", "july"],
        "flower_colors": ["white"],
        "avg_height_cm": 800, "max_height_cm": 1200,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "low", "edible": False,
    },
    "Lavandula angustifolia": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 400, "precip_max_mm": 800,
        "bloom_months": ["june", "july", "august"],
        "flower_colors": ["purple", "blue"],
        "avg_height_cm": 60, "max_height_cm": 100,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "none", "edible": True,
    },
    "Rosa (klimvarieteit)": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["june", "july", "august", "september"],
        "flower_colors": ["red", "pink", "white", "yellow", "orange"],
        "avg_height_cm": 250, "max_height_cm": 400,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Rosa (struikvarieteit)": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["june", "july", "august"],
        "flower_colors": ["red", "pink", "white", "yellow", "orange"],
        "avg_height_cm": 100, "max_height_cm": 200,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Clematis montana": {
        "light_raw": 7, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["april", "may", "june"],
        "flower_colors": ["white", "pink"],
        "avg_height_cm": 600, "max_height_cm": 800,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "low", "edible": False,
    },
    "Geranium 'Rozanne'": {
        "light_raw": 7, "light_label": "full_sun",
        "precip_min_mm": 500, "precip_max_mm": 900,
        "bloom_months": ["may", "june", "july", "august", "september", "october"],
        "flower_colors": ["blue", "purple"],
        "avg_height_cm": 40, "max_height_cm": 60,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Digitalis purpurea": {
        "light_raw": 6, "light_label": "partial",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["june", "july", "august"],
        "flower_colors": ["purple", "pink", "white"],
        "avg_height_cm": 100, "max_height_cm": 150,
        "duration": "biennial", "leaf_retention": False,
        "toxicity": "high", "edible": False,
    },
    "Agapanthus africanus": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 500, "precip_max_mm": 800,
        "bloom_months": ["july", "august", "september"],
        "flower_colors": ["blue", "white"],
        "avg_height_cm": 60, "max_height_cm": 100,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "low", "edible": False,
    },
    "Buddleja davidii": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 400, "precip_max_mm": 800,
        "bloom_months": ["july", "august", "september"],
        "flower_colors": ["purple", "pink", "white", "blue"],
        "avg_height_cm": 200, "max_height_cm": 300,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Hosta sieboldiana": {
        "light_raw": 3, "light_label": "shade",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["july", "august"],
        "flower_colors": ["white", "lavender"],
        "avg_height_cm": 60, "max_height_cm": 80,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": True,
    },
    "Echinacea purpurea": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 500, "precip_max_mm": 800,
        "bloom_months": ["july", "august", "september"],
        "flower_colors": ["purple", "pink", "white"],
        "avg_height_cm": 80, "max_height_cm": 120,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": True,
    },
    "Allium hollandicum": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 400, "precip_max_mm": 700,
        "bloom_months": ["may", "june"],
        "flower_colors": ["purple"],
        "avg_height_cm": 60, "max_height_cm": 100,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": True,
    },
    "Alchemilla mollis": {
        "light_raw": 6, "light_label": "partial",
        "precip_min_mm": 500, "precip_max_mm": 900,
        "bloom_months": ["june", "july", "august"],
        "flower_colors": ["yellow", "green"],
        "avg_height_cm": 40, "max_height_cm": 50,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Salvia nemorosa": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 400, "precip_max_mm": 700,
        "bloom_months": ["june", "july", "august", "september"],
        "flower_colors": ["purple", "blue"],
        "avg_height_cm": 40, "max_height_cm": 60,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Pennisetum alopecuroides": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 400, "precip_max_mm": 800,
        "bloom_months": ["august", "september", "october"],
        "flower_colors": ["silver", "white", "pink"],
        "avg_height_cm": 60, "max_height_cm": 100,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Nepeta x faassenii": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 300, "precip_max_mm": 600,
        "bloom_months": ["may", "june", "july", "august", "september"],
        "flower_colors": ["blue", "purple"],
        "avg_height_cm": 30, "max_height_cm": 50,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },

}

CURATED_FIELDS = [
    "light_raw", "light_label", "precip_min_mm", "precip_max_mm",
    "bloom_months", "flower_colors", "avg_height_cm", "max_height_cm",
    "duration", "leaf_retention", "toxicity", "edible",
]


def _merge_curated(data: dict, scientific_name: str) -> dict:
    """Fill missing/empty growth fields from curated data."""
    curated = _CURATED.get(scientific_name, {})
    for field in CURATED_FIELDS:
        if field not in curated:
            continue
        val = data.get(field)
        if val is None or val == []:
            data[field] = curated[field]
    return data


def _curated_as_species_dict(scientific_name: str) -> dict | None:
    curated = _CURATED.get(scientific_name)
    if not curated:
        return None
    return {"trefle_slug": None, "common_name": None, "family": None,
            "humidity_raw": None, "image_url": None, **curated}


# ── normalisation helpers ────────────────────────────────────────────────────

def _normalise_light(light) -> str | None:
    if light is None:
        return None
    try:
        v = int(light)
    except (TypeError, ValueError):
        return None
    if v <= 3:
        return "shade"
    if v <= 6:
        return "partial"
    return "full_sun"


_MONTH_EXPAND = {
    "jan": "january",  "feb": "february", "mar": "march",    "apr": "april",
    "may": "may",      "jun": "june",     "jul": "july",     "aug": "august",
    "sep": "september","oct": "october",  "nov": "november", "dec": "december",
}


def _expand_months(months: list) -> list[str]:
    out = []
    for m in months:
        if isinstance(m, str):
            key = m.lower()[:3]
            out.append(_MONTH_EXPAND.get(key, m.lower()))
    return out


def _normalise_duration(duration) -> str | None:
    if not duration or not isinstance(duration, list):
        return None
    return duration[0].lower()


# ── Trefle fetch ──────────────────────────────────────────────────────────────

async def _fetch_trefle(scientific_name: str) -> dict | None:
    """Search Trefle by species name, fall back to genus only."""
    async with httpx.AsyncClient(timeout=12) as client:
        for query in [scientific_name, scientific_name.split()[0]]:
            search_resp = await client.get(
                f"{TREFLE_BASE}/species/search",
                params={"q": query, "token": TREFLE_TOKEN},
            )
            if search_resp.status_code != 200:
                continue
            results = search_resp.json().get("data") or []
            if not results:
                continue

            accepted = next(
                (r for r in results if r.get("status") == "accepted"),
                results[0],
            )
            slug = accepted.get("slug")
            if not slug:
                continue

            detail_resp = await client.get(
                f"{TREFLE_BASE}/species/{slug}",
                params={"token": TREFLE_TOKEN},
            )
            if detail_resp.status_code != 200:
                continue
            d = (detail_resp.json().get("data") or {})

            growth  = d.get("growth")  or {}
            specs   = d.get("specifications") or {}
            foliage = d.get("foliage")  or {}
            flower  = d.get("flower")   or {}

            precip_min = (growth.get("minimum_precipitation") or {}).get("value")
            precip_max = (growth.get("maximum_precipitation") or {}).get("value")
            avg_h      = (specs.get("average_height") or {}).get("value")
            max_h      = (specs.get("maximum_height") or {}).get("value")
            bloom      = growth.get("bloom_months") or []
            colors     = flower.get("color") or []
            light_raw  = growth.get("light")

            result = {
                "trefle_slug":    slug,
                "common_name":    d.get("common_name") or accepted.get("common_name"),
                "family":         d.get("family"),
                "duration":       _normalise_duration(d.get("duration")),
                "leaf_retention": foliage.get("leaf_retention"),
                "light_raw":      light_raw,
                "light_label":    _normalise_light(light_raw),
                "humidity_raw":   growth.get("atmospheric_humidity"),
                "precip_min_mm":  int(precip_min) if precip_min is not None else None,
                "precip_max_mm":  int(precip_max) if precip_max is not None else None,
                "bloom_months":   _expand_months(bloom),
                "flower_colors":  [c.lower() for c in colors if isinstance(c, str)],
                "avg_height_cm":  int(avg_h) if avg_h is not None else None,
                "max_height_cm":  int(max_h) if max_h is not None else None,
                "toxicity":       specs.get("toxicity"),
                "edible":         d.get("edible"),
                "image_url":      d.get("image_url"),
            }
            return _merge_curated(result, scientific_name)

    return None


# ── AI (Deepseek) fallback ───────────────────────────────────────────────────

async def _fetch_ai_species(scientific_name: str) -> dict | None:
    """Ask Deepseek for care data when Trefle has no results."""
    if not LLM_API_KEY:
        return None

    prompt = f"""Geef verzorgingsdata voor de plantensoort: {scientific_name}

Geef alleen geldige JSON terug met dit formaat:
{{
  "common_name": "string (Nederlandse naam)",
  "family": "string (familienaam)",
  "duration": "perennial" of "annual" of "biennial",
  "leaf_retention": true of false,
  "light_raw": getal 0-10,
  "light_label": "shade" of "partial" of "full_sun",
  "precip_min_mm": getal (jaarlijkse neerslag minimum in mm),
  "precip_max_mm": getal (jaarlijkse neerslag maximum in mm),
  "bloom_months": ["month", ...] (lowercase Engelse maandnamen),
  "flower_colors": ["color", ...] (lowercase Engels),
  "avg_height_cm": getal,
  "max_height_cm": getal,
  "toxicity": "none" of "low" of "medium" of "high",
  "edible": true of false
}}"""

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            LLM_CHAT_URL,
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "content-type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                # DeepSeek V4 Flash (Nous) is a reasoning model — reasoning tokens
                # count against max_tokens, so a tight cap leaves `content` empty.
                "max_tokens": 2500,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if resp.status_code != 200:
        return None

    try:
        content = resp.json()["choices"][0]["message"].get("content")
    except (KeyError, IndexError, ValueError):
        return None
    if not content:  # null/empty (e.g. reasoning consumed the whole budget)
        return None
    raw = content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return None

    return {
        "trefle_slug":   None,
        "common_name":   d.get("common_name"),
        "family":        d.get("family"),
        "duration":      d.get("duration"),
        "leaf_retention": d.get("leaf_retention"),
        "light_raw":     d.get("light_raw"),
        "light_label":   d.get("light_label"),
        "humidity_raw":  None,
        "precip_min_mm": d.get("precip_min_mm"),
        "precip_max_mm": d.get("precip_max_mm"),
        "bloom_months":  d.get("bloom_months") or [],
        "flower_colors": d.get("flower_colors") or [],
        "avg_height_cm": d.get("avg_height_cm"),
        "max_height_cm": d.get("max_height_cm"),
        "toxicity":      d.get("toxicity"),
        "edible":        d.get("edible"),
        "image_url":     None,
    }


# ── public cascade ────────────────────────────────────────────────────────────

async def _from_plant_species(scientific_name: str, db) -> dict | None:
    """Derive care-info fields from the local plant_species registry."""
    rows = await db.execute_fetchall(
        "SELECT phenology_json FROM plant_species WHERE latin_name ILIKE ?",
        (scientific_name,),
    )
    if not rows or not rows[0]["phenology_json"]:
        return None
    try:
        pheno = json.loads(rows[0]["phenology_json"])
    except (json.JSONDecodeError, TypeError):
        return None
    months = pheno.get("months", [])

    growing = [m for m in months if m.get("phase") not in ("dormant", "dying_back")]
    sun_hours = [m["sun_hours_needed"] for m in growing if m.get("sun_hours_needed")]
    avg_sun = sum(sun_hours) / len(sun_hours) if sun_hours else None

    if avg_sun is None:
        light_raw = None
        light_label = None
    elif avg_sun < 3:
        light_raw = round(avg_sun / 1.2, 1)
        light_label = "shade"
    elif avg_sun < 6:
        light_raw = round(avg_sun / 1.2, 1)
        light_label = "partial"
    else:
        light_raw = min(round(avg_sun / 1.2, 1), 10)
        light_label = "full_sun"

    bloom_months = [
        ["january","february","march","april","may","june",
         "july","august","september","october","november","december"][m["month"] - 1]
        for m in months if m.get("phase") == "flowering"
    ]

    leaf_retention = any(m.get("phase") == "evergreen" for m in months) or None
    max_h = pheno.get("max_height_cm")

    return {
        "trefle_slug": None, "common_name": None, "family": None,
        "duration": "perennial",
        "leaf_retention": leaf_retention,
        "light_raw": light_raw, "light_label": light_label,
        "humidity_raw": None,
        "precip_min_mm": None, "precip_max_mm": None,
        "bloom_months": bloom_months, "flower_colors": [],
        "avg_height_cm": max_h, "max_height_cm": max_h,
        "toxicity": None, "edible": None,
        "image_url": None,
        "source": "local_registry",
    }


async def fetch_species_knowledge(scientific_name: str, db=None) -> dict | None:
    """Run the Trefle → curated → plant_species → AI cascade. No caching."""
    if TREFLE_TOKEN:
        data = await _fetch_trefle(scientific_name)
        if data:
            return data
    curated = _curated_as_species_dict(scientific_name)
    if curated:
        return curated
    if db is not None:
        local = await _from_plant_species(scientific_name, db)
        if local:
            return local
    return await _fetch_ai_species(scientific_name)


_CACHE_FIELDS = [
    "trefle_slug", "common_name", "family", "duration", "leaf_retention",
    "light_raw", "light_label", "humidity_raw", "precip_min_mm", "precip_max_mm",
    "bloom_months", "flower_colors", "avg_height_cm", "max_height_cm",
    "toxicity", "edible", "image_url",
]


def _cache_row_to_dict(c) -> dict:
    return {
        "scientific_name": c["scientific_name"],
        "common_name":     c["common_name"],
        "family":          c["family"],
        "duration":        c["duration"],
        "leaf_retention":  bool(c["leaf_retention"]) if c["leaf_retention"] is not None else None,
        "light_label":     c["light_label"],
        "light_raw":       c["light_raw"],
        "precip_min_mm":   c["precip_min_mm"],
        "precip_max_mm":   c["precip_max_mm"],
        "bloom_months":    json.loads(c["bloom_months"]) if c["bloom_months"] else [],
        "flower_colors":   json.loads(c["flower_colors"]) if c["flower_colors"] else [],
        "avg_height_cm":   c["avg_height_cm"],
        "toxicity":        c["toxicity"],
        "edible":          bool(c["edible"]) if c["edible"] is not None else None,
        "image_url":       c["image_url"],
        "source":          "cache",
        "cached_at":       c["fetched_at"],
    }


async def get_species_knowledge(scientific_name: str, db) -> dict | None:
    """Cache-aware species knowledge lookup with 30-day TTL.

    Returns a dict including `source` ("cache" or "trefle") and `cached_at`,
    or None if nothing could be fetched.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    cached = await db.execute_fetchall(
        "SELECT * FROM plant_care_cache WHERE scientific_name = ? AND fetched_at > ?",
        (scientific_name, cutoff),
    )
    if cached:
        return _cache_row_to_dict(cached[0])

    data = await fetch_species_knowledge(scientific_name, db)
    if not data:
        return None

    fetched_at = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO plant_care_cache
           (scientific_name, trefle_slug, common_name, family, duration,
            leaf_retention, light_raw, light_label, humidity_raw,
            precip_min_mm, precip_max_mm, bloom_months, flower_colors,
            avg_height_cm, max_height_cm, toxicity, edible, image_url, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (scientific_name) DO UPDATE SET
               trefle_slug=EXCLUDED.trefle_slug, common_name=EXCLUDED.common_name,
               family=EXCLUDED.family, duration=EXCLUDED.duration,
               leaf_retention=EXCLUDED.leaf_retention, light_raw=EXCLUDED.light_raw,
               light_label=EXCLUDED.light_label, humidity_raw=EXCLUDED.humidity_raw,
               precip_min_mm=EXCLUDED.precip_min_mm, precip_max_mm=EXCLUDED.precip_max_mm,
               bloom_months=EXCLUDED.bloom_months, flower_colors=EXCLUDED.flower_colors,
               avg_height_cm=EXCLUDED.avg_height_cm, max_height_cm=EXCLUDED.max_height_cm,
               toxicity=EXCLUDED.toxicity, edible=EXCLUDED.edible,
               image_url=EXCLUDED.image_url, fetched_at=EXCLUDED.fetched_at""",
        (
            scientific_name,
            data["trefle_slug"], data["common_name"], data["family"], data["duration"],
            data["leaf_retention"], data["light_raw"], data["light_label"], data["humidity_raw"],
            data["precip_min_mm"], data["precip_max_mm"],
            json.dumps(data["bloom_months"]), json.dumps(data["flower_colors"]),
            data["avg_height_cm"], data["max_height_cm"],
            data["toxicity"], data["edible"], data["image_url"],
            fetched_at,
        ),
    )
    await db.commit()

    return {
        "scientific_name": scientific_name,
        "common_name":     data["common_name"],
        "family":          data["family"],
        "duration":        data["duration"],
        "leaf_retention":  data["leaf_retention"],
        "light_label":     data["light_label"],
        "light_raw":       data["light_raw"],
        "precip_min_mm":   data["precip_min_mm"],
        "precip_max_mm":   data["precip_max_mm"],
        "bloom_months":    data["bloom_months"],
        "flower_colors":   data["flower_colors"],
        "avg_height_cm":   data["avg_height_cm"],
        "toxicity":        data["toxicity"],
        "edible":          data["edible"],
        "image_url":       data["image_url"],
        "source":          data.get("source", "trefle"),
        "cached_at":       fetched_at,
    }
