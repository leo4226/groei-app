"""Soil-pH advice for a garden (advice-only, not scored).

Aggregates the soil-pH preference (`plant_species.soil_ph_pref`, set from the
Ellenberg snapshot) across the distinct species planted on an outdoor map and
derives a single machine-readable advice code. The frontend and Stekkie
translate the code into localized copy — the backend never invents Dutch
sentences (see CLAUDE.md language rules).

Advice codes:
    "prefers_acid"     — plants skew kalkmijdend; avoid lime, a zuurmeting confirms.
    "prefers_alkaline" — plants skew kalkminnend; a zuurmeting shows if lime helps.
    "mixed"            — both acid- and lime-lovers present; group by preference.
    None               — no pH signal (too few flagged species).

Per the biodiversity research/scoring doc (Deel 3), soil is surfaced as advice,
never folded into the 0-100 score.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SoilPhAdvice:
    acid_count: int
    alkaline_count: int
    advice_code: str | None  # 'prefers_acid'|'prefers_alkaline'|'mixed'|None
    # A couple of example species per side, for the UI to name names.
    acid_examples: list[str]
    alkaline_examples: list[str]


# A single lopsided plant shouldn't trigger advice; require a small foothold so
# the tip only fires when the garden genuinely leans one way (or clearly mixes).
_MIN_SIGNAL = 2


async def soil_ph_advice_for_map(db, map_id: int) -> SoilPhAdvice:
    """Distinct planted species grouped by soil-pH preference → advice code.

    Guarded: the reduced test schemas may lack plant_species.soil_ph_pref, in
    which case this returns an empty (no-advice) result rather than raising."""
    try:
        rows = await db.execute_fetchall(
            """SELECT DISTINCT ps.id AS species_id,
                      ps.soil_ph_pref AS ph,
                      COALESCE(ps.common_name_nl, ps.latin_name) AS name
               FROM plants p JOIN plant_species ps ON p.species_id = ps.id
               WHERE p.map_id = ? AND p.is_active = TRUE
                 AND ps.soil_ph_pref IN ('acid', 'alkaline')""",
            (map_id,),
        )
    except Exception:
        return SoilPhAdvice(0, 0, None, [], [])

    acid = [r["name"] for r in rows if r["ph"] == "acid"]
    alkaline = [r["name"] for r in rows if r["ph"] == "alkaline"]

    advice: str | None
    if acid and alkaline:
        advice = "mixed"
    elif len(acid) >= _MIN_SIGNAL:
        advice = "prefers_acid"
    elif len(alkaline) >= _MIN_SIGNAL:
        advice = "prefers_alkaline"
    else:
        advice = None

    return SoilPhAdvice(
        acid_count=len(acid),
        alkaline_count=len(alkaline),
        advice_code=advice,
        acid_examples=acid[:3],
        alkaline_examples=alkaline[:3],
    )
