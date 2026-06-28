"""Per-garden biodiversity score.

Aggregates the per-species ecology data (already populated by
`services.ecology_enrichment`) across all plants on an outdoor map.

Breadth (pollinator / native / diversity) is still counted *per distinct
species* — five lavenders count once for those, keeping the bulk of the score
about ecological breadth, not arms-race-by-plant-count.

Abundance is a small, separate, diminishing-returns bonus (max 10) layered on
top: a clump of 6 ferns is worth a little more than a single fern, but breadth
still dominates and the curve saturates so it can never become an arms race.
Abundance uses the per-plant `quantity` field (Phase 2); extra map placements
are spatial only and do not add specimens.

See docs/plans/2026-05-27-public-gardens-and-biodiversity.md
("Per-garden score") and docs/plans/2026-06-27-map-density-multiplicity-plan.md
(Phase 5) for the rationale behind the components.

Components (additive, total capped at 100):
    - Pollinator coverage:  60   — 5 points per month where ≥1 species
                                   with pollinator_value ≥ 2 is flowering.
    - Native count:         30   — 6 points per native species, capped (5 = max).
    - Diversity bonus:      10   — log-scaled distinct-species count; max at 20.
    - Abundance bonus:      10   — diminishing returns on total extra specimens
                                   (specimens beyond the first of each species).

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
        """SELECT ps.id AS species_id,
                  ps.native_to_nl,
                  ps.invasive_nl,
                  ps.flowering_months,
                  ps.pollinator_value,
                  p.quantity
           FROM plants p
           JOIN plant_species ps ON p.species_id = ps.id
           WHERE p.map_id = ? AND p.is_active = TRUE""",
        (map_id,),
    )

    # Group per distinct species: breadth components use the distinct species,
    # while `specimens` (Σ quantity) feeds the abundance bonus.
    by_species: dict = {}
    for r in rows:
        d = dict(r)
        sid = d["species_id"]
        if sid not in by_species:
            by_species[sid] = {**d, "specimens": 0}
        by_species[sid]["specimens"] += max(1, int(d.get("quantity") or 1))
    species = list(by_species.values())
    species_count = len(species)

    if species_count == 0:
        return GardenBiodiversity(
            score=0,
            species_count=0,
            native_count=0,
            invasive_count=0,
            pollinator_coverage_months=[False] * 12,
            components={"pollinator": 0, "native": 0, "diversity": 0, "abundance": 0},
        )

    # Truthy (not `is True`): asyncpg returns real booleans, but other drivers
    # (e.g. sqlite in tests) return 1/0 — both should count. None stays falsy.
    native_count = sum(1 for s in species if s.get("native_to_nl"))
    invasive_count = sum(1 for s in species if s.get("invasive_nl"))

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

    # ── Native count ──
    # Count-based (not a ratio): every native species adds points up to a cap, so
    # adding plants never lowers the score and a garden with more natives ranks
    # higher. 6 points each → 5 natives reaches the 30-point cap.
    native_score = min(30, native_count * 6)    # 0..30

    # ── Diversity bonus ──
    # log scale capped at 20 distinct species → 10 points. Below that
    # rewards each new species; above, marginal gain diminishes.
    diversity_score = round(
        min(10, math.log(species_count + 1) / math.log(20 + 1) * 10)
    )

    # ── Abundance bonus ──
    # Diminishing returns on "extra" specimens (those beyond the first of each
    # species), so a clump of 6 ferns is worth a little more than one fern, but
    # the curve saturates (10·x/(x+10), max 10) — abundance never becomes an
    # arms race and never outweighs breadth.
    total_extra = sum(max(0, s["specimens"] - 1) for s in species)
    abundance_score = round(10 * total_extra / (total_extra + 10)) if total_extra else 0

    total = min(100, pollinator_score + native_score + diversity_score + abundance_score)

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
            "abundance": abundance_score,
        },
    )
