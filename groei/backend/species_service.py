import json
import os
import re

import httpx

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or ""
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

_token_usage = {"input": 0, "output": 0}

def get_token_usage() -> dict:
    return dict(_token_usage)

_SPECIES_PROMPT = """\
Je bent een botanische expert die tuiniers in Nederland helpt.

Genereer een JSON-object met fenologische data voor de volgende plant:
Plant: {plant_name}

Geef ALLEEN een geldig JSON-object terug, geen uitleg, geen markdown, geen backticks.
Het object moet dit exacte schema volgen:

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
        "sun_hours_needed": 0,
        "description_nl": "Korte beschrijving wat de plant doet",
        "actions_nl": []
      }}
    ],
    "sow_window": [],
    "transplant_window": [],
    "harvest_window": [],
    "frost_sensitive": true,
    "min_temp_c": 10,
    "max_height_cm": 60,
    "max_spread_cm": 40,
    "interesting_facts_nl": "Interessant feit over de plant.",
    "climate_zone": "temperate"
  }}
}}

Vul alle 12 maanden in. Gebruik alleen deze phase-waarden:
dormant, establishing, growing, flowering, fruiting, harvest, dying_back, evergreen

Let op:
- sun_hours_needed is het aantal uur directe zon PER DAG dat de plant NODIG heeft in die fase
- Voor eenjarige planten: gebruik dormant of dying_back buiten het groeiseizoen
- Voor vaste planten en bomen: gebruik dormant in winter, evergreen als van toepassing
- sow_window, transplant_window, harvest_window zijn lijsten van maandnummers (1-12)
- interesting_facts_nl: schrijf 1-2 interessante zinnen specifiek voor Nederlandse tuiniers
"""


async def _generate_from_claude(plant_name: str) -> dict:
    prompt = _SPECIES_PROMPT.format(plant_name=plant_name)
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 4000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        body = resp.json()
        usage = body.get("usage", {})
        _token_usage["input"] += usage.get("input_tokens", 0)
        _token_usage["output"] += usage.get("output_tokens", 0)
        raw = body["content"][0]["text"].strip()

    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


async def get_or_create_species(db, plant_name: str) -> int:
    """Return species_id for plant_name, generating via Claude if not cached."""
    row = await db.execute_fetchall(
        "SELECT id FROM plant_species WHERE LOWER(common_name_nl) = LOWER(?)",
        (plant_name,),
    )
    if row:
        return row[0]["id"]

    data = await _generate_from_claude(plant_name)

    slug = data.get("slug") or plant_name.lower().replace(" ", "-")
    phenology_json = json.dumps(data.get("phenology", {}), ensure_ascii=False)

    cursor = await db.execute(
        """
        INSERT INTO plant_species (slug, common_name_nl, common_name_en, latin_name, phenology_json, climate_zone)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          phenology_json = excluded.phenology_json,
          updated_at     = CURRENT_TIMESTAMP
        """,
        (
            slug,
            data.get("common_name_nl", plant_name),
            data.get("common_name_en"),
            data.get("latin_name"),
            phenology_json,
            data.get("climate_zone", "temperate"),
        ),
    )
    await db.commit()
    return cursor.lastrowid


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
    return result
