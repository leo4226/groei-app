import json
import os

import httpx

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or ""
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

_REQUIRED_KEYS = {
    "drought_mm_per_week",
    "waterlog_mm_per_week",
    "min_temp_c",
    "max_temp_c",
    "bring_inside_below_c",
    "fertilise_months",
    "fertilise_tip",
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
  "water_interval_days": <int, gemiddeld aantal dagen tussen handmatig water geven, bijv. 7 voor wekelijks>
}}"""


async def _call_claude(prompt: str) -> dict | None:
    if not ANTHROPIC_API_KEY:
        return None

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 400,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if resp.status_code != 200:
        return None

    raw = resp.json()["content"][0]["text"].strip()
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
    """Generate care thresholds for a plant via Claude Haiku. Retries once on failure."""
    prompt = _build_prompt(plant_name, species)

    result = await _call_claude(prompt)
    if result is None:
        result = await _call_claude(prompt)

    if result is None:
        raise ValueError(f"Could not generate thresholds for {plant_name}")

    return result
