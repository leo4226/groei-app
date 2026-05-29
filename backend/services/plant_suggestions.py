"""DB-first plant recommendation service.

Tier 1 of the three-tier recommendation system: queries enriched
plant_species rows, filters by light compatibility and gap months,
sorts by biodiversity value, generates template reasons.

No LLM calls. No HTTP. Returns results in ~10 ms.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

# Light-bucket thresholds — mirror frontend/src/utils/lightQuality.ts
_FULL_SUN_HOURS   = 4.0
_PART_SUN_HOURS   = 2.0
_BRIGHT_SHADE_SVF = 0.5

# Which sun_preference values are compatible per light bucket.
# "acceptable" = plant can survive; "perfect" = plant thrives.
_COMPATIBLE: dict[str, list[str]] = {
    "full":        ["full_sun", "any"],
    "part":        ["full_sun", "partial_sun", "any"],
    "bright_shade":["partial_sun", "shade", "any"],
    "deep_shade":  ["shade", "any"],
}
_PERFECT: dict[str, list[str]] = {
    "full":        ["full_sun"],
    "part":        ["partial_sun"],
    "bright_shade":["partial_sun", "shade"],
    "deep_shade":  ["shade"],
}

_MONTH_NL_SHORT = [
    "jan","feb","mrt","apr","mei","jun",
    "jul","aug","sep","okt","nov","dec",
]


@dataclass
class PlantRecommendation:
    species_id: int
    dutch_name: str
    latin_name: str
    sun_preference: str | None
    sun_fit: str                        # 'perfect' | 'acceptable'
    is_native: bool | None
    pollinator_value: int | None
    flowering_months: list[int] | None
    gap_months_covered: list[int]
    reason: str                         # template text — may be replaced by LLM (Tier 2)
    caveat: str | None = None           # filled by Tier 2 LLM enrichment


def bucket_for(direct_hours: float, svf: float = 1.0) -> str:
    """Classify sun hours + sky-view factor into a light bucket.
    Thresholds match frontend/src/utils/lightQuality.ts."""
    if direct_hours >= _FULL_SUN_HOURS:
        return "full"
    if direct_hours >= _PART_SUN_HOURS:
        return "part"
    return "bright_shade" if svf >= _BRIGHT_SHADE_SVF else "deep_shade"


def compatible_sun_preferences(bucket: str) -> list[str]:
    return _COMPATIBLE.get(bucket, ["any"])


def sun_fit_label(sun_preference: str | None, bucket: str) -> str:
    if sun_preference is None:
        return "acceptable"
    if sun_preference in _PERFECT.get(bucket, []):
        return "perfect"
    return "acceptable"


def template_reason(
    is_native: bool | None,
    pollinator_value: int | None,
    gap_months_covered: list[int],
    month_names: list[str] = _MONTH_NL_SHORT,
) -> str:
    """Generate a short descriptive reason string from ecology facts.
    No LLM — fully deterministic. Returns "" when nothing useful to say."""
    parts: list[str] = []
    if is_native is True:
        parts.append("Inheems in Nederland")
    if (pollinator_value or 0) >= 3:
        parts.append("top bestuiversplant")
    elif (pollinator_value or 0) >= 2:
        parts.append("goed voor bijen en vlinders")
    elif (pollinator_value or 0) == 1:
        parts.append("enige waarde voor bestuivers")
    if gap_months_covered:
        month_str = ", ".join(month_names[m - 1] for m in gap_months_covered[:4])
        parts.append(f"bloeit in {month_str} (vult je tuinkalender in)")
    return " · ".join(parts)


def _score_candidate(
    gap_months_covered: list[int],
    pollinator_value: int | None,
    is_native: bool | None,
    sun_fit: str,
) -> int:
    """Higher is better. Used for sorting candidates."""
    score = 0
    score += len(gap_months_covered) * 10      # gap coverage is most important
    score += (pollinator_value or 0) * 5       # pollinator value second
    score += 3 if is_native is True else 0     # native preference
    score += 2 if sun_fit == "perfect" else 0  # perfect light fit
    return score


def _coerce_months(value) -> list[int]:
    if value is None:
        return []
    if isinstance(value, list):
        return [int(m) for m in value if isinstance(m, (int, float)) and 1 <= m <= 12]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [int(m) for m in parsed if isinstance(m, (int, float)) and 1 <= m <= 12]
        except (json.JSONDecodeError, ValueError):
            pass
    return []


async def recommend_for_spot(
    db,
    map_id: int,
    sun_hours: float,
    month: int,
    svf: float = 1.0,
    limit: int = 8,
) -> tuple[list[PlantRecommendation], list[int]]:
    """Return DB-sourced recommendations for a specific spot.

    Returns (recommendations, gap_months) — gap_months is exposed so the
    frontend can show context ("fills your March–May gap").
    """
    bucket = bucket_for(sun_hours, svf)
    compatible = compatible_sun_preferences(bucket)

    # Gap months from garden biodiversity
    from services.garden_biodiversity import compute_for_map
    bio = await compute_for_map(db, map_id)
    gap_months = [i + 1 for i, covered in enumerate(bio.pollinator_coverage_months) if not covered]

    # Species already in this garden (exclude from suggestions)
    existing = await db.execute_fetchall(
        "SELECT DISTINCT species_id FROM plants WHERE map_id = ? AND is_active = TRUE AND species_id IS NOT NULL",
        (map_id,),
    )
    exclude_ids = {r["species_id"] for r in existing}

    # Fetch enriched candidates — no light filter in SQL since sun_preference
    # may be NULL for recently-enriched species; we filter in Python.
    rows = await db.execute_fetchall(
        """SELECT id, common_name_nl, latin_name, sun_preference,
                  native_to_nl, pollinator_value, flowering_months
           FROM plant_species
           WHERE ecology_enriched_at IS NOT NULL
             AND id NOT IN ({placeholders})
           ORDER BY COALESCE(pollinator_value, -1) DESC""".format(
            placeholders=",".join("?" * len(exclude_ids)) if exclude_ids else "NULL"
        ),
        tuple(exclude_ids) if exclude_ids else (),
    )

    candidates: list[PlantRecommendation] = []
    for row in rows:
        sp = row["sun_preference"]
        # Include species with NULL sun_preference as "any" (graceful degradation)
        effective_pref = sp if sp else "any"
        if effective_pref not in compatible:
            continue

        flowering = _coerce_months(row["flowering_months"])
        gap_covered = [m for m in flowering if m in gap_months]
        fit = sun_fit_label(sp, bucket)

        candidates.append(PlantRecommendation(
            species_id=row["id"],
            dutch_name=row["common_name_nl"] or row["latin_name"],
            latin_name=row["latin_name"],
            sun_preference=sp,
            sun_fit=fit,
            is_native=row["native_to_nl"],
            pollinator_value=row["pollinator_value"],
            flowering_months=flowering or None,
            gap_months_covered=gap_covered,
            reason=template_reason(row["native_to_nl"], row["pollinator_value"], gap_covered),
        ))

    # Sort by composite score
    candidates.sort(
        key=lambda r: _score_candidate(r.gap_months_covered, r.pollinator_value, r.is_native, r.sun_fit),
        reverse=True,
    )
    return candidates[:limit], gap_months


async def recommend_for_garden(
    db,
    map_id: int,
    limit: int = 8,
) -> tuple[list[PlantRecommendation], list[int]]:
    """Return DB-sourced recommendations to improve garden biodiversity.
    No light filter — garden-level suggestions span all zones.
    Returns (recommendations, gap_months).
    """
    from services.garden_biodiversity import compute_for_map
    bio = await compute_for_map(db, map_id)
    gap_months = [i + 1 for i, covered in enumerate(bio.pollinator_coverage_months) if not covered]

    existing = await db.execute_fetchall(
        "SELECT DISTINCT species_id FROM plants WHERE map_id = ? AND is_active = TRUE AND species_id IS NOT NULL",
        (map_id,),
    )
    exclude_ids = {r["species_id"] for r in existing}

    rows = await db.execute_fetchall(
        """SELECT id, common_name_nl, latin_name, sun_preference,
                  native_to_nl, pollinator_value, flowering_months
           FROM plant_species
           WHERE ecology_enriched_at IS NOT NULL
             AND id NOT IN ({placeholders})
           ORDER BY COALESCE(pollinator_value, -1) DESC""".format(
            placeholders=",".join("?" * len(exclude_ids)) if exclude_ids else "NULL"
        ),
        tuple(exclude_ids) if exclude_ids else (),
    )

    candidates: list[PlantRecommendation] = []
    for row in rows:
        flowering = _coerce_months(row["flowering_months"])
        gap_covered = [m for m in flowering if m in gap_months]

        candidates.append(PlantRecommendation(
            species_id=row["id"],
            dutch_name=row["common_name_nl"] or row["latin_name"],
            latin_name=row["latin_name"],
            sun_preference=row["sun_preference"],
            sun_fit="acceptable",       # no spot context for garden-level
            is_native=row["native_to_nl"],
            pollinator_value=row["pollinator_value"],
            flowering_months=flowering or None,
            gap_months_covered=gap_covered,
            reason=template_reason(row["native_to_nl"], row["pollinator_value"], gap_covered),
        ))

    candidates.sort(
        key=lambda r: _score_candidate(r.gap_months_covered, r.pollinator_value, r.is_native, r.sun_fit),
        reverse=True,
    )
    return candidates[:limit], gap_months
