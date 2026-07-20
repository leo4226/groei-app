"""Growth-form companion signals for a garden (advice-only, not scored).

Two signals aggregated across the distinct species planted on an outdoor map,
from the curated growth-form snapshot (plant_species.is_woody /
is_ground_cover):

  - carbon (koolstof): woody species store more carbon in wood + roots. A
    proxy level (low/moderate/strong) from how many woody species are planted —
    NOT a measured CO2 figure.
  - ground cover (bodembedekking): creeping/mat-forming species protect bare
    soil. Advice fires when a planted garden has none.

Both are surfaced as advice on the biodiversity card + Stekkie context, and are
never folded into the 0-100 score (biodiversity research doc, Deel 3).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class GrowthFormSignals:
    woody_count: int = 0
    ground_cover_count: int = 0
    species_count: int = 0
    carbon_level: str | None = None          # 'low' | 'moderate' | 'strong'
    ground_cover_advice: str | None = None   # 'add' when garden has plants but no cover
    woody_examples: list[str] = field(default_factory=list)
    ground_cover_examples: list[str] = field(default_factory=list)


# A garden needs a few plants before "no ground cover" is worth mentioning.
_GC_ADVICE_MIN_SPECIES = 3


def _carbon_level(woody_count: int) -> str | None:
    if woody_count >= 3:
        return "strong"
    if woody_count >= 1:
        return "moderate"
    return "low"


async def growth_form_signals_for_map(db, map_id: int) -> GrowthFormSignals:
    """Distinct planted species grouped by growth-form flags → carbon + cover signals.

    Guarded: the reduced test schemas may lack is_woody / is_ground_cover, in
    which case this returns an empty (no-signal) result rather than raising."""
    try:
        rows = await db.execute_fetchall(
            """SELECT DISTINCT ps.id AS species_id,
                      ps.is_woody AS woody,
                      ps.is_ground_cover AS ground,
                      COALESCE(ps.common_name_nl, ps.latin_name) AS name
               FROM plants p JOIN plant_species ps ON p.species_id = ps.id
               WHERE p.map_id = ? AND p.is_active = TRUE""",
            (map_id,),
        )
    except Exception:
        return GrowthFormSignals()

    woody = [r["name"] for r in rows if r["woody"]]
    ground = [r["name"] for r in rows if r["ground"]]
    species_count = len(rows)

    ground_advice = (
        "add" if species_count >= _GC_ADVICE_MIN_SPECIES and not ground else None
    )

    return GrowthFormSignals(
        woody_count=len(woody),
        ground_cover_count=len(ground),
        species_count=species_count,
        carbon_level=_carbon_level(len(woody)) if species_count else None,
        ground_cover_advice=ground_advice,
        woody_examples=woody[:3],
        ground_cover_examples=ground[:3],
    )
