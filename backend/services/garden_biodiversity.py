"""Per-garden biodiversity score.

Aggregates the per-species ecology data (already populated by
`services.ecology_enrichment`) across all plants on an outdoor map.

Counted *per distinct species* — five lavenders count once. That keeps
the score about ecological breadth, not arms-race-by-plant-count.

See docs/plans/2026-05-27-public-gardens-and-biodiversity.md
("Per-garden score") for the rationale behind the components.

Components (max 100):
    - Pollinator coverage:  60   — 5 points per month where ≥1 species
                                   with pollinator_value ≥ 2 is flowering.
    - Native ratio:         30   — fraction of species native to NL.
    - Diversity bonus:      10   — log-scaled species count; max at 20.

Invasive count is reported alongside the score but *not* deducted —
following the anti-purism principle: a plant great for butterflies
shouldn't be erased from the score because it's also invasive. The UI
shows both honestly.
"""

import json
import math
from dataclasses import dataclass, field


@dataclass
class GardenBiodiversity:
    score: int                           # 0..100, rounded
    species_count: int
    native_count: int
    invasive_count: int
    pollinator_coverage_months: list[bool]   # 12 booleans, index 0 = January
    components: dict = field(default_factory=dict)   # raw subscores for transparency


def _coerce_months(value) -> list[int]:
    if value is None:
        return []
    if isinstance(value, list):
        return [int(m) for m in value if isinstance(m, int) and 1 <= m <= 12]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [int(m) for m in parsed if isinstance(m, int) and 1 <= m <= 12]
    return []


async def compute_for_map(db, map_id: int) -> GardenBiodiversity:
    """Aggregate ecology over distinct species placed on this map.

    Empty gardens return a zero-everything profile rather than None — the
    UI can decide how to present 'no data yet' on its own."""
    rows = await db.execute_fetchall(
        """SELECT DISTINCT ps.id AS species_id,
                  ps.native_to_nl,
                  ps.invasive_nl,
                  ps.flowering_months,
                  ps.pollinator_value
           FROM plants p
           JOIN plant_species ps ON p.species_id = ps.id
           WHERE p.map_id = ? AND p.is_active = TRUE""",
        (map_id,),
    )

    species = [dict(r) for r in rows]
    species_count = len(species)

    if species_count == 0:
        return GardenBiodiversity(
            score=0,
            species_count=0,
            native_count=0,
            invasive_count=0,
            pollinator_coverage_months=[False] * 12,
            components={"pollinator": 0, "native": 0, "diversity": 0},
        )

    native_count = sum(1 for s in species if s.get("native_to_nl") is True)
    invasive_count = sum(1 for s in species if s.get("invasive_nl") is True)

    # ── Pollinator coverage per month ──
    # Month is "covered" if any species with pollinator_value ≥ 2 is
    # flowering in that month.
    coverage = [False] * 12
    for s in species:
        pv = s.get("pollinator_value") or 0
        if pv < 2:
            continue
        for m in _coerce_months(s.get("flowering_months")):
            coverage[m - 1] = True
    covered_months = sum(coverage)
    pollinator_score = covered_months * 5      # 0..60

    # ── Native ratio ──
    native_ratio = native_count / species_count
    native_score = round(native_ratio * 30)    # 0..30

    # ── Diversity bonus ──
    # log scale capped at 20 distinct species → 10 points. Below that
    # rewards each new species; above, marginal gain diminishes.
    diversity_score = round(
        min(10, math.log(species_count + 1) / math.log(20 + 1) * 10)
    )

    total = min(100, pollinator_score + native_score + diversity_score)

    return GardenBiodiversity(
        score=total,
        species_count=species_count,
        native_count=native_count,
        invasive_count=invasive_count,
        pollinator_coverage_months=coverage,
        components={
            "pollinator": pollinator_score,
            "native": native_score,
            "diversity": diversity_score,
        },
    )
