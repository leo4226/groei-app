"""Garden biodiversity scoring — computes per-map biodiversity profile from active plants.

Exposes:
  compute_for_map(db, map_id) -> BiodiversityProfile
"""

from dataclasses import dataclass
from database import Database


@dataclass
class BiodiversityProfile:
    score: int
    species_count: int
    native_count: int
    invasive_count: int
    pollinator_coverage_months: list[bool]
    components: dict


async def compute_for_map(db: Database, map_id: int) -> BiodiversityProfile:
    """Compute a biodiversity profile for a single outdoor map/garden.

    Queries the plants table (enriched via species_knowledge) and calculates
    species diversity, native/invasive ratio, and month-by-month pollinator
    coverage based on bloom periods.
    """
    plants = await db.execute_fetchall(
        """SELECT p.id, p.species_id,
                  sk.is_native, sk.is_invasive, sk.bloom_start, sk.bloom_end,
                  sk.pollinator_score
           FROM plants p
           LEFT JOIN species_knowledge sk ON sk.id = p.species_id
           WHERE p.map_id = ? AND p.is_active = TRUE""",
        (map_id,),
    )
    all_plants = [dict(r) for r in plants]

    # Counts
    with_species = [p for p in all_plants if p["species_id"]]
    species_ids = {p["species_id"] for p in with_species if p["species_id"]}
    species_count = len(species_ids)
    native_count = sum(1 for p in with_species if p.get("is_native"))
    invasive_count = sum(1 for p in with_species if p.get("is_invasive"))

    # Pollinator coverage — 12 months
    bloom_months = [False] * 12
    for p in all_plants:
        if not p.get("pollinator_score") or p["pollinator_score"] <= 0:
            continue
        start = p.get("bloom_start") or 1
        end = p.get("bloom_end") or 12
        for m in range(max(1, start), min(12, end) + 1):
            bloom_months[m - 1] = True

    covered = sum(1 for m in bloom_months if m)

    # Score components
    diversity_score = min(40, species_count * 5)
    native_score = min(30, int((native_count / max(1, len(with_species))) * 30))
    pollinator_score = min(30, int((covered / 12) * 30))

    score = min(100, diversity_score + native_score + pollinator_score)

    return BiodiversityProfile(
        score=score,
        species_count=species_count,
        native_count=native_count,
        invasive_count=invasive_count,
        pollinator_coverage_months=bloom_months,
        components={
            "diversity": diversity_score,
            "native_ratio": native_score,
            "pollinator_coverage": pollinator_score,
            "total_plants": len(all_plants),
        },
    )
