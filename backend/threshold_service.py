import json

import httpx

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

_REQUIRED_KEYS = {
    "drought_mm_per_week",
    "waterlog_mm_per_week",
    "min_temp_c",
    "max_temp_c",
    "bring_inside_below_c",
    "fertilise_months",
    "fertilise_tip",
    "fertilise_tip_en",
    "water_interval_days",
}


def _build_prompt(plant_name: str, species: str | None) -> str:
    species_part = f" (soort: {species})" if species else ""
    return f"""Geef verzorgingsdrempelwaarden voor de plant: {plant_name}{species_part}

Geef ALLEEN geldige JSON terug, zonder extra tekst of markdown. Gebruik dit exacte formaat:
{{
  "drought_mm_per_week": <int, neerslag onder dit niveau = te droog>,
  "waterlog_mm_per_week": <int, neerslag boven dit niveau = te nat>,
  "min_temp_c": <float, plant krijgt stress onder deze temperatuur>,
  "max_temp_c": <float, plant krijgt stress boven deze temperatuur>,
  "bring_inside_below_c": <float of null, null voor volledig winterharde buitenplanten>,
  "fertilise_months": [<int 1-12>, ...],
  "fertilise_tip": "<string max 80 tekens, Nederlandse bemestingstip>",
  "fertilise_tip_en": "<string max 80 chars, English fertilising tip>",
  "water_interval_days": <int, gemiddeld aantal dagen tussen handmatig water geven, bijv. 7 voor wekelijks>
}}

Vul ZOWEL fertilise_tip (NL) als fertilise_tip_en (EN) in."""


async def _call_ai(prompt: str) -> dict | None:
    if not LLM_API_KEY:
        return None

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            LLM_CHAT_URL,
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "content-type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if resp.status_code != 200:
        return None

    content = resp.json()["choices"][0]["message"].get("content")
    if not content:
        return None
    raw = content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not _REQUIRED_KEYS.issubset(data.keys()):
        return None

    return data


async def generate_thresholds(plant_name: str, species: str | None) -> dict:
    prompt = _build_prompt(plant_name, species)

    result = await _call_ai(prompt)
    if result is None:
        result = await _call_ai(prompt)

    if result is None:
        raise ValueError(f"Could not generate thresholds for {plant_name}")

    return result
