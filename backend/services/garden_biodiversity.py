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
from dataclasses import dataclass, field


@dataclass
class GardenBiodiversity:
    score: int                           # 0..100, rounded
    species_count: int
    native_count: int
    invasive_count: int
    pollinator_coverage_months: list[bool]   # 12 booleans, index 0 = January
    components: dict = field(default_factory=dict)   # raw subscores for transparency
    streek_slug: str | None = None       # the garden's Dutch ecological region
    streek_name: str | None = None
    streek_native_count: int = 0         # distinct garden species belonging to that streek
    drachtplant_count: int = 0           # distinct bee-forage species (Naturalis/Bloeibogen)
    area_m2: float | None = None         # garden footprint (drives the count targets)
    score_targets: dict = field(default_factory=dict)  # area-scaled targets, for transparency
    soil_ph: dict = field(default_factory=dict)  # advice-only: {advice_code, acid_count, …}
    growth_form: dict = field(default_factory=dict)  # advice-only: {carbon_level, ground_cover_advice, …}


def _streek_name(slug: str | None) -> str | None:
    if not slug:
        return None
    from services.streek import all_streken
    for s in all_streken():
        if s["slug"] == slug:
            return s["name"]
    return slug


async def _drachtplant_ids(db, map_id: int) -> set:
    """species_ids in this garden flagged as drachtplant (Naturalis bee-forage).

    Guarded: the reduced test schemas may lack the plant_species.is_drachtplant
    column, in which case drachtplant simply contributes nothing."""
    try:
        rows = await db.execute_fetchall(
            """SELECT DISTINCT ps.id AS species_id
               FROM plants p JOIN plant_species ps ON p.species_id = ps.id
               WHERE p.map_id = ? AND p.is_active = TRUE AND ps.is_drachtplant = TRUE""",
            (map_id,),
        )
        return {r["species_id"] for r in rows}
    except Exception:
        return set()


async def _streek_context(db, map_id: int) -> tuple[str | None, int]:
    """(streek_slug, streek_native_count) for a map, or (None, 0).

    Defensive by design: compute_for_map runs against reduced test schemas (the
    aiosqlite seam) that may lack the maps.streek_slug column or the
    streek_species table — there, streek simply contributes nothing."""
    try:
        rows = await db.execute_fetchall(
            "SELECT streek_slug FROM maps WHERE id = ?", (map_id,)
        )
        streek_slug = rows[0]["streek_slug"] if rows else None
        if not streek_slug:
            return None, 0
        cnt = await db.execute_fetchall(
            """SELECT COUNT(DISTINCT p.species_id) AS n
               FROM plants p
               JOIN streek_species ss
                 ON ss.species_id = p.species_id AND ss.streek_slug = ?
               WHERE p.map_id = ? AND p.is_active = TRUE""",
            (streek_slug, map_id),
        )
        return streek_slug, int(cnt[0]["n"] or 0)
    except Exception:
        return None, 0


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


# ── Scoring weights (sum to 100) ──
# Recalibrated 2026-07-18 (audit): the old model's components summed to 125 and
# hard-capped at 100, so a 6-species balcony hit ~99. These weights sum to
# exactly 100, and the count-based components are graded against an *area-scaled
# target* (a bigger garden must plant proportionally more for full marks). See
# docs/plans/2026-07-18-streek-biodiversity.md / issue #444.
_W_POLLINATOR = 40    # 12-month flowering succession (calendar, not area-scaled)
_W_NATIVE     = 25    # native species, vs area target
_W_DIVERSITY  = 15    # distinct species, vs area target
_W_STREEK     = 12    # streekeigen species, vs area target
_W_ABUNDANCE  = 8     # clumping (diminishing), not area-scaled
_INVASIVE_CAP = 90    # soft cap: a garden with invasives can't display 100

_REF_AREA_M2 = 40.0   # reference garden; targets scale as sqrt(area / ref)


async def _garden_area_m2(db, map_id: int) -> float | None:
    """Garden footprint in m² from canvas_data (width×depth), or None if unknown.

    Guarded — the reduced test schemas have no maps.canvas_data column, so area
    simply defaults (neutral) there."""
    try:
        rows = await db.execute_fetchall("SELECT canvas_data FROM maps WHERE id = ?", (map_id,))
        if not rows or not rows[0]["canvas_data"]:
            return None
        cd = rows[0]["canvas_data"]
        d = json.loads(cd) if isinstance(cd, str) else cd
        scale = float(d.get("scale_px_per_m") or 46) or 46
        area = (float(d.get("canvas_w") or 0) / scale) * (float(d.get("canvas_h") or 0) / scale)
        return area if area > 0 else None
    except Exception:
        return None


def _score_targets(area_m2: float | None) -> dict:
    """Species targets for the count-based components, scaled by garden area.

    Sub-linear (sqrt) so a big garden needs *more* plants for full marks without
    an arms race, and a small dense garden still reaches the floor easily. Unknown
    area falls back to the reference (floor targets)."""
    f = (max(area_m2 or _REF_AREA_M2, 4.0) / _REF_AREA_M2) ** 0.5
    return {
        "diversity": min(40, max(8, round(8 * f))),
        "native":    min(25, max(5, round(5 * f))),
        "streek":    min(16, max(4, round(4 * f))),
    }


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

    # Regional (streek) context — the garden's Dutch ecological region and how
    # many of its species belong there. Resolved even for empty gardens so the
    # UI can show "your region" before anything is planted.
    streek_slug, streek_native_count = await _streek_context(db, map_id)
    streek_name = _streek_name(streek_slug)
    area_m2 = await _garden_area_m2(db, map_id)
    targets = _score_targets(area_m2)

    # Soil-pH advice (advice-only, never scored). Empty gardens get an empty
    # (no-advice) packet, which is correct — there's nothing to advise on yet.
    from services.soil_advice import soil_ph_advice_for_map
    soil = await soil_ph_advice_for_map(db, map_id)
    soil_ph = {
        "advice_code": soil.advice_code,
        "acid_count": soil.acid_count,
        "alkaline_count": soil.alkaline_count,
        "acid_examples": soil.acid_examples,
        "alkaline_examples": soil.alkaline_examples,
    }

    # Growth-form signals (carbon proxy + ground cover) — advice-only.
    from services.growth_signals import growth_form_signals_for_map
    gf = await growth_form_signals_for_map(db, map_id)
    growth_form = {
        "carbon_level": gf.carbon_level,
        "woody_count": gf.woody_count,
        "ground_cover_count": gf.ground_cover_count,
        "ground_cover_advice": gf.ground_cover_advice,
        "woody_examples": gf.woody_examples,
        "ground_cover_examples": gf.ground_cover_examples,
    }

    if species_count == 0:
        return GardenBiodiversity(
            score=0,
            species_count=0,
            native_count=0,
            invasive_count=0,
            pollinator_coverage_months=[False] * 12,
            components={"pollinator": 0, "native": 0, "diversity": 0, "abundance": 0, "streek": 0},
            streek_slug=streek_slug,
            streek_name=streek_name,
            streek_native_count=0,
            area_m2=area_m2,
            score_targets=targets,
            soil_ph=soil_ph,
            growth_form=growth_form,
        )

    # Truthy (not `is True`): asyncpg returns real booleans, but other drivers
    # (e.g. sqlite in tests) return 1/0 — both should count. None stays falsy.
    native_count = sum(1 for s in species if s.get("native_to_nl"))
    invasive_count = sum(1 for s in species if s.get("invasive_nl"))

    # ── Pollinator coverage per month ──
    # Month is "covered" if, in that month, a bee-forage plant is flowering — i.e.
    # a species with pollinator_value ≥ 2 OR a Naturalis-flagged drachtplant
    # (bee-forage). Drachtplant is a hard authoritative signal from Bloeibogen
    # that only *adds* coverage (never removes any), strengthening the otherwise
    # LLM/GBIF-derived pollinator_value. See issue #709.
    dracht_ids = await _drachtplant_ids(db, map_id)
    drachtplant_count = len(dracht_ids)
    coverage = [False] * 12
    for s in species:
        pv = s.get("pollinator_value") or 0
        if pv < 2 and s["species_id"] not in dracht_ids:
            continue
        for m in _coerce_months(s.get("flowering_months")):
            coverage[m - 1] = True
    covered_months = sum(coverage)

    # ── Pollinator coverage (0..40) ──
    # Flowering succession across the calendar. Not area-scaled: 12-month forage
    # is equally valuable on a balcony or an acre.
    pollinator_score = round(_W_POLLINATOR * covered_months / 12)

    # The count-based components (native, diversity, streek) are graded against an
    # area-scaled *target* rather than a flat cap: a bigger garden must plant
    # proportionally more for full marks (#444 audit, choice 1A). min(1, …) keeps
    # them additive — adding a plant only ever raises the score (targets depend on
    # area, not plant count).
    native_score    = round(_W_NATIVE    * min(1.0, native_count        / targets["native"]))
    diversity_score = round(_W_DIVERSITY * min(1.0, species_count       / targets["diversity"]))
    streek_score    = round(_W_STREEK    * min(1.0, streek_native_count / targets["streek"]))

    # ── Abundance (0..8) ──
    # Diminishing returns on "extra" specimens (beyond the first of each species):
    # a clump of 6 is worth a little more than one, but the curve saturates so
    # abundance never becomes an arms race or outweighs breadth.
    total_extra = sum(max(0, s["specimens"] - 1) for s in species)
    abundance_score = round(_W_ABUNDANCE * total_extra / (total_extra + 10)) if total_extra else 0

    # Weights sum to 100, so the raw total is already 0..100.
    total = pollinator_score + native_score + diversity_score + abundance_score + streek_score
    # Soft invasive cap (#444 audit, choice 3A): a garden with invasive species
    # can't display a perfect score — honest, without a purist point-by-point
    # penalty. The invasive count is still surfaced separately.
    if invasive_count > 0:
        total = min(total, _INVASIVE_CAP)
    total = min(100, total)

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
            "streek": streek_score,
        },
        streek_slug=streek_slug,
        streek_name=streek_name,
        streek_native_count=streek_native_count,
        drachtplant_count=drachtplant_count,
        area_m2=area_m2,
        score_targets=targets,
        soil_ph=soil_ph,
        growth_form=growth_form,
    )
