"""DB-first plant recommendation service.

Tier 1 of the three-tier recommendation system: queries enriched
plant_species rows, filters by light compatibility and gap months,
sorts by biodiversity value, generates template reasons.

No LLM calls. No HTTP. Returns results in ~10 ms.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

# Light-bucket thresholds — mirror frontend/src/utils/lightQuality.ts
_FULL_SUN_HOURS   = 4.0
_PART_SUN_HOURS   = 2.0
_BRIGHT_SHADE_SVF = 0.5

# Unified light model.
#
# Each spot bucket and each plant preference live on a 0..3 light ladder, and a
# plant's fit at a spot is graded by how far the spot sits from where the plant
# thrives:
#   perfect    — spot is the plant's ideal light
#   acceptable — one step off; the plant does well
#   marginal   — two steps off; survives but underperforms (still shown, ranked low)
#   tolerated  — plant preference is "any"/unknown; fits anywhere but ranks below
#                a plant whose *known* preference matches the spot
#   None       — too far off to ever recommend (scorch / won't flower)
#
# Including "marginal" rather than excluding it keeps shady gardens from returning
# empty lists, while the scoring multiplier (LIGHT_MULT) pushes those picks down.
_FIT_GRADES: dict[str, dict[str, str | None]] = {
    "full": {
        "full_sun":    "perfect",
        "partial_sun": "acceptable",
        "shade":       None,          # scorch
    },
    "part": {
        "full_sun":    "acceptable",
        "partial_sun": "perfect",
        "shade":       "marginal",
    },
    "bright_shade": {
        "full_sun":    "marginal",
        "partial_sun": "acceptable",
        "shade":       "perfect",
    },
    "deep_shade": {
        "full_sun":    None,          # won't flower
        "partial_sun": "marginal",
        "shade":       "perfect",
    },
}

# Ranking weight per fit grade. Light scales the ecology subscore so two spots with
# different light produce different *orderings*, while ecology still drives close calls.
# Tunable after a season of observation.
_LIGHT_MULT: dict[str, float] = {
    "perfect":    1.00,
    "acceptable": 0.80,
    "tolerated":  0.65,
    "marginal":   0.55,
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
    sun_fit: str                        # 'perfect'|'acceptable'|'marginal'|'tolerated'
    gap_months_covered: list[int]
    reason: str                         # template text — may be replaced by LLM (Tier 2)
    sun_preference: str | None = None
    is_native: bool | None = None
    pollinator_value: int | None = None
    flowering_months: list[int] | None = None
    english_name: str | None = None
    reason_en: str | None = None
    caveat: str | None = None           # filled by Tier 2 LLM enrichment
    is_streek: bool = False             # belongs to the garden's streek (streekeigen)
    is_drachtplant: bool = False        # Naturalis bee-forage plant (Bloeibogen)
    fills_forage_gap: bool = False      # a drachtplant blooming in a bee forage-gap month


def bucket_for(direct_hours: float, svf: float = 1.0) -> str:
    """Classify sun hours + sky-view factor into a light bucket.
    Thresholds match frontend/src/utils/lightQuality.ts."""
    if direct_hours >= _FULL_SUN_HOURS:
        return "full"
    if direct_hours >= _PART_SUN_HOURS:
        return "part"
    return "bright_shade" if svf >= _BRIGHT_SHADE_SVF else "deep_shade"


def fit_grade(sun_preference: str | None, bucket: str) -> str | None:
    """Grade how well a plant's sun preference fits a spot's light bucket.

    Returns 'perfect' | 'acceptable' | 'marginal' | 'tolerated', or None when the
    pairing is too far off to ever recommend. A NULL/'any' preference is always
    'tolerated' (fits anywhere, ranks below a known match)."""
    if sun_preference is None or sun_preference == "any":
        return "tolerated"
    return _FIT_GRADES.get(bucket, {}).get(sun_preference, "tolerated")


def template_reason(
    is_native: bool | None,
    pollinator_value: int | None,
    gap_months_covered: list[int],
    month_names: list[str] = _MONTH_NL_SHORT,
    lang: str = "nl",
) -> str:
    """Generate a short descriptive reason string from ecology facts.
    No LLM — fully deterministic. Returns "" when nothing useful to say."""
    parts: list[str] = []
    en = (lang == "en")
    if is_native:
        parts.append("Native to Netherlands" if en else "Inheems in Nederland")
    if (pollinator_value or 0) >= 3:
        parts.append("top pollinator plant" if en else "top bestuiversplant")
    elif (pollinator_value or 0) >= 2:
        parts.append("good for bees and butterflies" if en else "goed voor bijen en vlinders")
    elif (pollinator_value or 0) == 1:
        parts.append("some pollinator value" if en else "enige waarde voor bestuivers")
    if gap_months_covered:
        month_str = ", ".join(month_names[m - 1] for m in gap_months_covered[:4])
        if en:
            parts.append(f"blooms in {month_str} (fills your garden calendar)")
        else:
            parts.append(f"bloeit in {month_str} (vult je tuinkalender in)")
    return " · ".join(parts)


def _score_candidate(
    gap_months_covered: list[int],
    pollinator_value: int | None,
    is_native: bool | None,
    sun_fit: str,
    flowers_now: bool = False,
    is_streek: bool = False,
    fills_forage_gap: bool = False,
) -> float:
    """Higher is better. Used for sorting candidates.

    The ecology subscore (gap coverage, pollinator value, native, flowers-now,
    streekeigen, bee-forage-gap) is scaled by a light-suitability multiplier so the
    same plant ranks higher where it thrives — while a strong gap-filler in imperfect
    light still beats a weak plant in perfect light. A flat bonus for a perfect fit
    breaks ties."""
    ecology = 0
    ecology += len(gap_months_covered) * 10    # pollinator-month gap coverage is most important
    ecology += 8 if fills_forage_gap else 0    # closes a wild-bee forage gap (Bloeibogen)
    ecology += (pollinator_value or 0) * 5     # pollinator value
    ecology += 4 if is_streek else 0           # belongs in this region (streekeigen)
    ecology += 3 if is_native else 0           # native preference
    ecology += 1 if flowers_now else 0         # currently in bloom
    return ecology * _LIGHT_MULT.get(sun_fit, 0.65) + (2 if sun_fit == "perfect" else 0)


def _streek_clause(streek_name: str | None, lang: str = "nl") -> str:
    """Reason fragment marking a pick as streekeigen (belongs to this region)."""
    if not streek_name:
        return ""
    return f"belongs in {streek_name}" if lang == "en" else f"hoort thuis in {streek_name}"


def _with_streek_reason(rec: "PlantRecommendation", streek_name: str | None) -> None:
    """Append the streekeigen clause to a recommendation's reason strings in place."""
    if not rec.is_streek:
        return
    for attr, lang in (("reason", "nl"), ("reason_en", "en")):
        clause = _streek_clause(streek_name, lang)
        cur = getattr(rec, attr) or ""
        setattr(rec, attr, f"{cur} · {clause}" if cur else clause)


def _with_forage_reason(rec: "PlantRecommendation") -> None:
    """Append the bee-forage-gap clause when a drachtplant closes a forage gap."""
    if not rec.fills_forage_gap:
        return
    for attr, clause in (("reason", "vult een bijen-drachtgat"), ("reason_en", "fills a bee-forage gap")):
        cur = getattr(rec, attr) or ""
        setattr(rec, attr, f"{cur} · {clause}" if cur else clause)


async def _streek_for_map(db, map_id: int) -> tuple[str | None, str | None, set[int]]:
    """(streek_slug, streek_name, {species_id}) for a map — guarded for the
    reduced test schemas (returns empties when the streek tables are absent)."""
    try:
        rows = await db.execute_fetchall("SELECT streek_slug FROM maps WHERE id = ?", (map_id,))
        slug = rows[0]["streek_slug"] if rows else None
        if not slug:
            return None, None, set()
        sp = await db.execute_fetchall(
            "SELECT DISTINCT species_id FROM streek_species WHERE streek_slug = ? AND species_id IS NOT NULL",
            (slug,),
        )
        ids = {r["species_id"] for r in sp}
    except Exception:
        return None, None, set()
    from services.streek import all_streken
    name = next((s["name"] for s in all_streken() if s["slug"] == slug), slug)
    return slug, name, ids


async def _fetch_enriched_candidates(db, exclude_ids: set[int]) -> list:
    if exclude_ids:
        placeholders = ",".join("?" * len(exclude_ids))
        exclude_clause = f"AND id NOT IN ({placeholders})"
        params: tuple = tuple(exclude_ids)
    else:
        exclude_clause = ""
        params = ()
    return await db.execute_fetchall(
        f"""SELECT id, common_name_nl, common_name_en, latin_name, sun_preference,
                   native_to_nl, pollinator_value, flowering_months, is_drachtplant
            FROM plant_species
            WHERE ecology_enriched_at IS NOT NULL
              {exclude_clause}
            ORDER BY COALESCE(pollinator_value, -1) DESC""",
        params,
    )


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

    # Gap months from garden biodiversity
    from services.garden_biodiversity import compute_for_map
    bio = await compute_for_map(db, map_id)
    gap_months = [i + 1 for i, covered in enumerate(bio.pollinator_coverage_months) if not covered]
    gap_set = set(gap_months)

    # Species already in this garden (exclude from suggestions)
    existing = await db.execute_fetchall(
        "SELECT DISTINCT species_id FROM plants WHERE map_id = ? AND is_active = TRUE AND species_id IS NOT NULL",
        (map_id,),
    )
    exclude_ids = {r["species_id"] for r in existing}

    _, streek_name, streek_ids = await _streek_for_map(db, map_id)
    from services.bees import forage_gap_months
    forage_gap = await forage_gap_months(db, map_id)

    # Fetch enriched candidates — no light filter in SQL since sun_preference
    # may be NULL for recently-enriched species; we filter in Python.
    rows = await _fetch_enriched_candidates(db, exclude_ids)

    candidates: list[PlantRecommendation] = []
    for row in rows:
        sp = row["sun_preference"]
        # Grade light fit; None means the pairing is too far off to recommend.
        # NULL sun_preference grades as "tolerated" (graceful degradation).
        fit = fit_grade(sp, bucket)
        if fit is None:
            continue

        flowering = _coerce_months(row["flowering_months"])
        gap_covered = [m for m in flowering if m in gap_set]
        flowers_now = month in flowering  # bool: does this plant flower in the current month?
        is_dracht = bool(row.get("is_drachtplant"))
        fills_gap = is_dracht and any(m in forage_gap for m in flowering)

        rec = PlantRecommendation(
            species_id=row["id"],
            dutch_name=row["common_name_nl"] or row["latin_name"],
            english_name=row.get("common_name_en") or None,
            latin_name=row["latin_name"],
            sun_preference=sp,
            sun_fit=fit,
            is_native=row["native_to_nl"],
            pollinator_value=row["pollinator_value"],
            flowering_months=flowering or None,
            gap_months_covered=gap_covered,
            reason=template_reason(row["native_to_nl"], row["pollinator_value"], gap_covered),
            reason_en=template_reason(row["native_to_nl"], row["pollinator_value"], gap_covered, lang="en"),
            is_streek=row["id"] in streek_ids,
            is_drachtplant=is_dracht,
            fills_forage_gap=fills_gap,
        )
        _with_streek_reason(rec, streek_name)
        _with_forage_reason(rec)
        candidates.append(rec)

    # Sort by composite score
    candidates.sort(
        key=lambda r: _score_candidate(
            r.gap_months_covered, r.pollinator_value, r.is_native, r.sun_fit,
            flowers_now=month in (r.flowering_months or []), is_streek=r.is_streek,
            fills_forage_gap=r.fills_forage_gap,
        ),
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
    gap_set = set(gap_months)

    existing = await db.execute_fetchall(
        "SELECT DISTINCT species_id FROM plants WHERE map_id = ? AND is_active = TRUE AND species_id IS NOT NULL",
        (map_id,),
    )
    exclude_ids = {r["species_id"] for r in existing}

    _, streek_name, streek_ids = await _streek_for_map(db, map_id)
    from services.bees import forage_gap_months
    forage_gap = await forage_gap_months(db, map_id)
    rows = await _fetch_enriched_candidates(db, exclude_ids)

    candidates: list[PlantRecommendation] = []
    for row in rows:
        flowering = _coerce_months(row["flowering_months"])
        gap_covered = [m for m in flowering if m in gap_set]
        is_dracht = bool(row.get("is_drachtplant"))
        fills_gap = is_dracht and any(m in forage_gap for m in flowering)

        rec = PlantRecommendation(
            species_id=row["id"],
            dutch_name=row["common_name_nl"] or row["latin_name"],
            english_name=row.get("common_name_en") or None,
            latin_name=row["latin_name"],
            sun_preference=row["sun_preference"],
            sun_fit="acceptable",       # no spot context for garden-level
            is_native=row["native_to_nl"],
            pollinator_value=row["pollinator_value"],
            flowering_months=flowering or None,
            gap_months_covered=gap_covered,
            reason=template_reason(row["native_to_nl"], row["pollinator_value"], gap_covered),
            reason_en=template_reason(row["native_to_nl"], row["pollinator_value"], gap_covered, lang="en"),
            is_streek=row["id"] in streek_ids,
            is_drachtplant=is_dracht,
            fills_forage_gap=fills_gap,
        )
        _with_streek_reason(rec, streek_name)
        _with_forage_reason(rec)
        candidates.append(rec)

    candidates.sort(
        key=lambda r: _score_candidate(r.gap_months_covered, r.pollinator_value, r.is_native, r.sun_fit,
                                       is_streek=r.is_streek, fills_forage_gap=r.fills_forage_gap),
        reverse=True,
    )
    return candidates[:limit], gap_months


async def recommend_for_streek(
    db,
    map_id: int,
    limit: int = 12,
) -> tuple[str | None, list[PlantRecommendation]]:
    """"Planten uit jouw streek" — the garden's streek flora not yet planted.

    Regionally-correct planting list: streekeigen (streektuinen) flora that we've
    resolved to an enriched species, excluding what's already in the garden,
    ranked by pollinator value / gap coverage / native. Returns (streek_name,
    recommendations); ([]/None) when the garden has no streek or nothing resolved.
    """
    streek_slug, streek_name, streek_ids = await _streek_for_map(db, map_id)
    if not streek_ids:
        return streek_name, []

    from services.garden_biodiversity import compute_for_map
    bio = await compute_for_map(db, map_id)
    gap_set = {i + 1 for i, covered in enumerate(bio.pollinator_coverage_months) if not covered}

    existing = await db.execute_fetchall(
        "SELECT DISTINCT species_id FROM plants WHERE map_id = ? AND is_active = TRUE AND species_id IS NOT NULL",
        (map_id,),
    )
    have = {r["species_id"] for r in existing}
    want = streek_ids - have
    if not want:
        return streek_name, []

    from services.bees import forage_gap_months
    forage_gap = await forage_gap_months(db, map_id)

    placeholders = ",".join("?" * len(want))
    rows = await db.execute_fetchall(
        f"""SELECT id, common_name_nl, common_name_en, latin_name, sun_preference,
                   native_to_nl, pollinator_value, flowering_months, is_drachtplant
            FROM plant_species
            WHERE id IN ({placeholders})
            ORDER BY COALESCE(pollinator_value, -1) DESC""",
        tuple(want),
    )

    recs: list[PlantRecommendation] = []
    for row in rows:
        flowering = _coerce_months(row["flowering_months"])
        gap_covered = [m for m in flowering if m in gap_set]
        is_dracht = bool(row.get("is_drachtplant"))
        fills_gap = is_dracht and any(m in forage_gap for m in flowering)
        rec = PlantRecommendation(
            species_id=row["id"],
            dutch_name=row["common_name_nl"] or row["latin_name"],
            english_name=row.get("common_name_en") or None,
            latin_name=row["latin_name"],
            sun_preference=row["sun_preference"],
            sun_fit="acceptable",
            is_native=row["native_to_nl"],
            pollinator_value=row["pollinator_value"],
            flowering_months=flowering or None,
            gap_months_covered=gap_covered,
            reason=template_reason(row["native_to_nl"], row["pollinator_value"], gap_covered),
            reason_en=template_reason(row["native_to_nl"], row["pollinator_value"], gap_covered, lang="en"),
            is_streek=True,
            is_drachtplant=is_dracht,
            fills_forage_gap=fills_gap,
        )
        _with_streek_reason(rec, streek_name)
        _with_forage_reason(rec)
        recs.append(rec)

    recs.sort(
        key=lambda r: _score_candidate(r.gap_months_covered, r.pollinator_value, r.is_native, r.sun_fit,
                                       is_streek=True),
        reverse=True,
    )
    return streek_name, recs[:limit]
