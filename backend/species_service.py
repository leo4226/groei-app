import json
import re

import httpx

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

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
                "max_tokens": 4000,
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


async def get_or_create_species(db, plant_name: str) -> int:
    """Return species_id for plant_name, generating via Claude if not cached."""
    row = await db.execute_fetchall(
        "SELECT id FROM plant_species WHERE LOWER(common_name_nl) = LOWER(?)",
        (plant_name,),
    )
    if row:
        return row[0]["id"]

    data = await _generate_species(plant_name)

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

    # Load images
    img_rows = await db.execute_fetchall(
        "SELECT id, url, thumbnail_url, source, license, is_primary "
        "FROM species_images WHERE species_id = ? ORDER BY is_primary DESC",
        (species_id,),
    )
    result["images"] = [dict(r) for r in img_rows] if img_rows else []
    return result


async def search_species(
    db, query: str, page: int = 1, per_page: int = 20
) -> tuple[list[dict], int]:
    """Full-text search on NL/EN/Latin names. Returns (results, total_count)."""
    offset = (page - 1) * per_page
    like = f"%{query}%"

    # Count
    count_rows = await db.execute_fetchall(
        """SELECT COUNT(*) AS total FROM plant_species
           WHERE common_name_nl ILIKE ?
              OR common_name_en ILIKE ?
              OR latin_name ILIKE ?""",
        (like, like, like),
    )
    total = count_rows[0]["total"] if count_rows else 0

    # Results
    rows = await db.execute_fetchall(
        """SELECT id, slug, common_name_nl, common_name_en,
                  latin_name, family, genus, images_count
           FROM plant_species
           WHERE common_name_nl ILIKE ?
              OR common_name_en ILIKE ?
              OR latin_name ILIKE ?
           ORDER BY
             CASE WHEN common_name_nl ILIKE ? THEN 0
                  WHEN common_name_en ILIKE ? THEN 1
                  WHEN latin_name ILIKE ?      THEN 2
                  ELSE 3
             END,
             common_name_nl
           LIMIT ? OFFSET ?""",
        (like, like, like, query, query, query, per_page, offset),
    )
    results = [dict(r) for r in rows]

    # Attach primary image to each result
    if results:
        ids = tuple(r["id"] for r in results)
        placeholders = ",".join("?" * len(ids))
        img_rows = await db.execute_fetchall(
            f"""SELECT DISTINCT ON (species_id) species_id, id, url, thumbnail_url,
                       source, license, is_primary
               FROM species_images
               WHERE species_id IN ({placeholders})
               ORDER BY species_id, is_primary DESC""",
            ids,
        )
        img_map = {r["species_id"]: dict(r) for r in img_rows} if img_rows else {}
        for r in results:
            r["primary_image"] = img_map.get(r["id"])

    return results, total


async def upsert_species_from_gbif(db, data: dict) -> int | None:
    """Insert or update a species row from GBIF data. Returns species_id."""
    await db.execute(
        """INSERT INTO plant_species
             (slug, common_name_nl, common_name_en, latin_name,
              family, genus, growth_form, gbif_taxon_key,
              images_count, climate_zone)
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
            data.get("slug", ""),
            data.get("common_name_nl", ""),
            data.get("common_name_en"),
            data.get("latin_name"),
            data.get("family"),
            data.get("genus"),
            data.get("growth_form"),
            data.get("gbif_taxon_key"),
            data.get("images_count", 0),
            data.get("climate_zone", "temperate"),
        ),
    )
    return db.lastrowid


async def insert_species_image(db, species_id: int, img: dict) -> None:
    """Insert a species image record."""
    await db.execute(
        """INSERT INTO species_images
             (species_id, url, thumbnail_url, source, license, width, height, is_primary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            species_id,
            img["url"],
            img.get("thumbnail_url"),
            img.get("source", "gbif"),
            img.get("license"),
            img.get("width"),
            img.get("height"),
            img.get("is_primary", False),
        ),
    )

_FACT_PROMPT = """\
Je bent een botanische expert die tuiniers in Nederland helpt.

Geef 1-2 interessante feiten over de volgende plant:

Plant: {plant_name}

De feiten moeten:
- Relevant zijn voor Nederlandse tuiniers (denk aan Nederlands klimaat, tuincultuur)
- Verrassend of nuttig zijn
- In het Nederlands
- Maximaal 2-3 zinnen

Geef ALLEEN de feiten terug, geen uitleg, geen aanhef, geen markdown.
"""


async def generate_fact_for_species(plant_name: str, latin_name: str | None = None) -> str:
    """Generate an interesting fact for a plant species using the LLM."""
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
                "max_tokens": 300,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        body = resp.json()
        raw = body["choices"][0]["message"]["content"].strip()
    raw = re.sub(r'^["\']|["\']$', "", raw)
    return raw


async def backfill_missing_facts(db, limit: int = 50) -> dict:
    """Find species without interesting_facts_nl and generate them via LLM.

    Returns a summary dict with counts of processed/updated/skipped.
    """
    rows = await db.execute_fetchall(
        "SELECT id, common_name_nl, latin_name, phenology_json FROM plant_species "
        "WHERE phenology_json IS NULL "
        "   OR phenology_json = '' "
        "   OR phenology_json NOT LIKE '%interesting_facts_nl%' "
        "LIMIT ?",
        (limit,),
    )

    if not rows:
        return {"processed": 0, "updated": 0, "skipped": 0, "message": "All species already have facts."}

    updated = 0
    skipped = 0
    errors = []

    for row in rows:
        species_id = row["id"]
        plant_name = row["common_name_nl"]
        latin_name = row.get("latin_name")
        phenology_str = row.get("phenology_json")

        try:
            fact = await generate_fact_for_species(plant_name, latin_name)
            if not fact:
                skipped += 1
                continue

            # Parse existing phenology or create new container
            if phenology_str:
                try:
                    phenology = json.loads(phenology_str)
                except json.JSONDecodeError:
                    phenology = {}
            else:
                phenology = {}

            phenology["interesting_facts_nl"] = fact
            new_phenology_str = json.dumps(phenology, ensure_ascii=False)

            await db.execute(
                "UPDATE plant_species SET phenology_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (new_phenology_str, species_id),
            )
            updated += 1
        except Exception as e:
            errors.append({"species_id": species_id, "name": plant_name, "error": str(e)})
            skipped += 1

    if updated:
        await db.commit()

    return {
        "processed": len(rows),
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }
