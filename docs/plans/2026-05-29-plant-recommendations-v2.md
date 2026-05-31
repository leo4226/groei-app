# Plant Recommendations v2 — Light + Biodiversity Intelligence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-on LLM spot-picker with a three-tier recommendation system: (1) instant DB query using existing ecology data, (2) optional LLM reasoning pass to add plain-language context to the DB picks, (3) full LLM brainstorm on demand when the DB yields too few results.

**Architecture:** A new `services/plant_suggestions.py` does pure Python filtering and sorting on already-enriched `plant_species` rows — no tokens, no latency. A new `sun_preference` column (one-time LLM cost per species, stored permanently) enables light-aware filtering. Template text replaces LLM reasoning for the default view. The old `POST /garden/grow-here` LLM endpoint stays intact as Tier 3 ("Discover more").

**Tech Stack:** FastAPI + asyncpg/SQLite, React 19 + TypeScript, Tailwind CSS, DeepSeek LLM (optional Tier 2/3 only)

---

## Tier summary

| Tier | Trigger | Cost | Latency | Output |
|---|---|---|---|---|
| 1 — DB + templates | Always, on sheet open | Free | ~10 ms | Plant cards with ecology badges + template reason |
| 2 — LLM reasoning | Auto-loads async after Tier 1 renders | ~$0.001 | 2–5 s | Richer reason + caveats replace template text |
| 3 — LLM brainstorm | "Ontdek meer" button, or when DB yields < 3 | ~$0.005 | 3–8 s | New plant suggestions not in DB |

---

## What already exists (do not re-implement)

| Symbol | Location |
|---|---|
| `compute_for_map(db, map_id)` | `backend/services/garden_biodiversity.py` |
| `ensure_ecology(db, species_id)` | `backend/services/ecology_enrichment.py` |
| `enrich()` LLM call | `backend/services/ecology_enrichment.py:194` |
| `_from_llm()` | `backend/services/ecology_enrichment.py:141` |
| `POST /garden/grow-here` | `backend/routers/plant_care.py:75` — Tier 3, unchanged |
| `GrowHereSheet` | `frontend/src/components/sheets/GrowHereSheet.tsx` |
| `GardenBiodiversityCard` | `frontend/src/components/GardenBiodiversityCard.tsx` |
| `bucketFor(hours, svf)` | `frontend/src/utils/lightQuality.ts:19` — thresholds: 4h full, 2h part, SVF 0.5 bright shade |

---

## File map

| File | Change |
|---|---|
| `backend/alembic/versions/0011_add_sun_preference.py` | New — adds `sun_preference` column |
| `backend/migrations/0006_add_sun_preference.py` | New — SQLite mirror |
| `backend/services/ecology_enrichment.py` | Add `sun_preference` to LLM prompt + persist |
| `backend/services/plant_suggestions.py` | New — Tier 1 service: DB query + template reasons |
| `backend/routers/plant_care.py` | Add `GET /garden/recommendations` (Tier 1+2) |
| `backend/routers/maps.py` | Add `GET /maps/{slug}/plant-suggestions` (garden-level Tier 1) |
| `backend/models.py` | Add `PlantRecommendation`, `RecommendationsOut`, `GardenSuggestionsOut` |
| `frontend/src/api/client.ts` | Add `garden.recommendations()`, `maps.plantSuggestions()` |
| `frontend/src/types/index.ts` | Add `PlantRecommendation`, `RecommendationsOut`, `GardenSuggestionsOut` |
| `frontend/src/components/sheets/GrowHereSheet.tsx` | Show DB picks instantly; keep AI section as async/opt-in |
| `frontend/src/components/GardenBiodiversityCard.tsx` | Add "Verbeter je tuin" section |
| `frontend/src/i18n/{translations,nl,en}.ts` | New keys |

---

## Task 1: Add `sun_preference` to `plant_species`

**Files:**
- Create: `backend/alembic/versions/0011_add_sun_preference.py`
- Create: `backend/migrations/0006_add_sun_preference.py`
- Modify: `backend/services/ecology_enrichment.py`

`sun_preference` is a VARCHAR(16) that maps to the same 4 light buckets as the frontend (`full_sun`, `partial_sun`, `shade`, `any`). It is requested alongside the existing LLM fields in `_from_llm` and stored permanently — one-time cost per species.

- [ ] **Step 1: Write failing test**

In `backend/tests/test_ecology_enrichment.py`, add:

```python
def test_from_llm_parses_sun_preference(monkeypatch):
    """_from_llm must parse and validate sun_preference."""
    import asyncio
    from services.ecology_enrichment import _from_llm

    async def fake_post(*a, **kw):
        class R:
            status_code = 200
            def raise_for_status(self): pass
            def json(self):
                return {"choices": [{"message": {"content":
                    '{"native_to_nl": true, "invasive_nl": false, '
                    '"flowering_months": [4,5,6], "pollinator_value": 2, '
                    '"sun_preference": "partial_sun"}'
                }}]}
        return R()

    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)
    result = asyncio.get_event_loop().run_until_complete(_from_llm("Ajuga reptans"))
    assert result.get("sun_preference") == "partial_sun"


def test_from_llm_rejects_invalid_sun_preference(monkeypatch):
    """Invalid sun_preference values must be dropped silently."""
    import asyncio
    from services.ecology_enrichment import _from_llm

    async def fake_post(*a, **kw):
        class R:
            status_code = 200
            def raise_for_status(self): pass
            def json(self):
                return {"choices": [{"message": {"content":
                    '{"native_to_nl": true, "sun_preference": "dappled"}'
                }}]}
        return R()

    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)
    result = asyncio.get_event_loop().run_until_complete(_from_llm("Ajuga reptans"))
    assert "sun_preference" not in result
```

Run: `cd backend && python -m pytest tests/test_ecology_enrichment.py::test_from_llm_parses_sun_preference tests/test_ecology_enrichment.py::test_from_llm_rejects_invalid_sun_preference -v`
Expected: FAIL (sun_preference not yet in code)

- [ ] **Step 2: Create Alembic migration**

```python
# backend/alembic/versions/0011_add_sun_preference.py
"""Add sun_preference column to plant_species.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-29
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE plant_species ADD COLUMN sun_preference VARCHAR(16)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE plant_species DROP COLUMN IF EXISTS sun_preference"
    )
```

- [ ] **Step 3: Create yoyo migration (SQLite)**

```python
# backend/migrations/0006_add_sun_preference.py
"""Add sun_preference column to plant_species (SQLite dev path)."""
from yoyo import step

step("ALTER TABLE plant_species ADD COLUMN sun_preference TEXT")
```

- [ ] **Step 4: Update `_ECOLOGY_PROMPT` in `ecology_enrichment.py`**

Find `_ECOLOGY_PROMPT` (around line 114). Add `sun_preference` to the schema description:

```python
_ECOLOGY_PROMPT = """\
You are a Dutch botanical expert. For the plant species below, return a
small JSON object with the requested ecology data.

Species: {latin_name}

Return ONLY a valid JSON object with this exact schema:

{{
  "native_to_nl": [boolean — true if this species is indigenous to the
                   Netherlands (not introduced/cultivated)],
  "invasive_nl": [boolean — true only if officially listed as invasive
                  in the Netherlands],
  "flowering_months": [list of integer month numbers 1-12 when this plant
                       blooms outdoors in the Netherlands; empty list if
                       it does not reliably flower here],
  "pollinator_value": [integer 0-3 where 0 = no floral resources or wind-
                       pollinated, 1 = minor value, 2 = good for bees and
                       butterflies, 3 = top-tier pollinator plant],
  "sun_preference": ["full_sun" | "partial_sun" | "shade" | "any" —
                     what this species prefers; "any" for truly
                     adaptable species; use the most specific that applies]
}}

No markdown, no backticks, no explanation. Use null for any field you are
unsure about. Use an empty list for unknown flowering months.
"""
```

- [ ] **Step 5: Parse `sun_preference` in `_from_llm`**

In the `_from_llm` function, after the `pv` validation block (around line 188), add:

```python
    _VALID_SUN = {"full_sun", "partial_sun", "shade", "any"}
    sp = data.get("sun_preference")
    if isinstance(sp, str) and sp in _VALID_SUN:
        out["sun_preference"] = sp
```

- [ ] **Step 6: Add `sun_preference` to `EcologyProfile` dataclass**

```python
@dataclass
class EcologyProfile:
    native_to_nl: bool | None
    invasive_nl: bool | None
    flowering_months: list[int] | None
    pollinator_value: int | None        # 0..3
    host_plant_for: list[str] | None
    sun_preference: str | None          # 'full_sun'|'partial_sun'|'shade'|'any'
    data_source: str
```

- [ ] **Step 7: Persist `sun_preference` in `enrich()` and `ensure_ecology()`**

In `enrich()` (around line 194), the merged dict now may contain `sun_preference` from `llm_data`. Add to the `EcologyProfile` constructor at the end:

```python
    return EcologyProfile(
        native_to_nl=merged.get("native_to_nl"),
        invasive_nl=merged.get("invasive_nl"),
        flowering_months=merged.get("flowering_months"),
        pollinator_value=merged.get("pollinator_value"),
        host_plant_for=None,
        sun_preference=merged.get("sun_preference"),
        data_source=data_source,
    )
```

In `ensure_ecology()`, add `sun_preference` to the SELECT and the UPDATE:

```python
    # SELECT: add sun_preference
    rows = await db.execute_fetchall(
        "SELECT latin_name, gbif_taxon_key, native_to_nl, invasive_nl, "
        "flowering_months, pollinator_value, host_plant_for, sun_preference, "
        "ecology_data_source, ecology_enriched_at "
        "FROM plant_species WHERE id = ?",
        (species_id,),
    )

    # UPDATE: add sun_preference
    await db.execute(
        """UPDATE plant_species SET
             native_to_nl = ?,
             invasive_nl = ?,
             flowering_months = ?,
             pollinator_value = ?,
             host_plant_for = ?,
             sun_preference = ?,
             ecology_data_source = ?,
             ecology_enriched_at = ?
           WHERE id = ?""",
        (
            profile.native_to_nl,
            profile.invasive_nl,
            json.dumps(profile.flowering_months) if profile.flowering_months is not None else None,
            profile.pollinator_value,
            json.dumps(profile.host_plant_for) if profile.host_plant_for is not None else None,
            profile.sun_preference,
            profile.data_source,
            enriched_at,
            species_id,
        ),
    )
```

Also expose it from `_row_to_dict`:
```python
def _row_to_dict(row: dict) -> dict:
    ...
    return {
        ...
        "sun_preference": row.get("sun_preference"),
        ...
    }
```

- [ ] **Step 8: Run migration on dev DB**

```bash
cd backend
alembic upgrade head
```

Expected: `Running upgrade 0010 -> 0011, Add sun_preference column to plant_species`

- [ ] **Step 9: Run tests**

```bash
cd backend && python -m pytest tests/test_ecology_enrichment.py -v
```

Expected: `test_from_llm_parses_sun_preference` PASS, `test_from_llm_rejects_invalid_sun_preference` PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/alembic/versions/0011_add_sun_preference.py \
        backend/migrations/0006_add_sun_preference.py \
        backend/services/ecology_enrichment.py
git commit -m "feat(ecology): add sun_preference to species enrichment"
```

---

## Task 2: Plant recommendations service (DB-first, no LLM)

**Files:**
- Create: `backend/services/plant_suggestions.py`
- Create: `backend/tests/test_plant_suggestions.py`

This is the core of the new system. Pure Python — no HTTP calls, no LLM. It queries enriched `plant_species` rows, filters by light compatibility and gap months, sorts by biodiversity value, and generates short template reasons.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_plant_suggestions.py`:

```python
"""Tests for the DB-first plant recommendations service."""
import pytest
from services.plant_suggestions import (
    bucket_for,
    compatible_sun_preferences,
    sun_fit_label,
    template_reason,
    _score_candidate,
)

MONTH_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"]


# ── bucket_for ────────────────────────────────────────────────────────────────

def test_bucket_for_full_sun():
    assert bucket_for(5.0, 0.8) == "full"

def test_bucket_for_part():
    assert bucket_for(3.0, 0.8) == "part"

def test_bucket_for_bright_shade():
    assert bucket_for(1.0, 0.6) == "bright_shade"

def test_bucket_for_deep_shade():
    assert bucket_for(1.0, 0.3) == "deep_shade"

def test_bucket_for_boundary_full():
    assert bucket_for(4.0, 0.9) == "full"   # exactly 4 → full

def test_bucket_for_boundary_part():
    assert bucket_for(2.0, 0.9) == "part"   # exactly 2 → part


# ── compatible_sun_preferences ───────────────────────────────────────────────

def test_full_spot_accepts_full_sun_and_any():
    prefs = compatible_sun_preferences("full")
    assert "full_sun" in prefs
    assert "any" in prefs
    assert "shade" not in prefs

def test_part_spot_accepts_partial_and_full_and_any():
    prefs = compatible_sun_preferences("part")
    assert "partial_sun" in prefs
    assert "full_sun" in prefs   # full-sun plants tolerate part sun
    assert "shade" not in prefs

def test_bright_shade_accepts_partial_shade_any():
    prefs = compatible_sun_preferences("bright_shade")
    assert "partial_sun" in prefs
    assert "shade" in prefs
    assert "full_sun" not in prefs

def test_deep_shade_accepts_shade_any():
    prefs = compatible_sun_preferences("deep_shade")
    assert "shade" in prefs
    assert "any" in prefs
    assert "partial_sun" not in prefs


# ── sun_fit_label ─────────────────────────────────────────────────────────────

def test_perfect_fit_partial_in_part():
    assert sun_fit_label("partial_sun", "part") == "perfect"

def test_acceptable_full_sun_in_part():
    assert sun_fit_label("full_sun", "part") == "acceptable"

def test_perfect_fit_shade_in_deep():
    assert sun_fit_label("shade", "deep_shade") == "perfect"


# ── template_reason ──────────────────────────────────────────────────────────

def test_template_native_pollinator_gap():
    r = template_reason(
        is_native=True,
        pollinator_value=3,
        gap_months_covered=[3, 4],
        month_names=MONTH_NL,
    )
    assert "Inheems" in r
    assert "bestuiver" in r
    assert "mrt" in r

def test_template_empty_when_no_data():
    r = template_reason(is_native=None, pollinator_value=None,
                        gap_months_covered=[], month_names=MONTH_NL)
    assert r == ""


# ── _score_candidate ─────────────────────────────────────────────────────────

def test_higher_gap_coverage_scores_higher():
    a = _score_candidate(gap_months_covered=[3, 4, 5], pollinator_value=1, is_native=False, sun_fit="acceptable")
    b = _score_candidate(gap_months_covered=[3], pollinator_value=1, is_native=False, sun_fit="acceptable")
    assert a > b

def test_native_beats_non_native_same_rest():
    native = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=True, sun_fit="perfect")
    non = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=False, sun_fit="perfect")
    assert native > non

def test_perfect_fit_beats_acceptable():
    perfect = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=True, sun_fit="perfect")
    acceptable = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=True, sun_fit="acceptable")
    assert perfect > acceptable
```

Run: `cd backend && python -m pytest tests/test_plant_suggestions.py -v`
Expected: ImportError (module not yet created) — counts as FAIL.

- [ ] **Step 2: Implement `backend/services/plant_suggestions.py`**

```python
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
           ORDER BY pollinator_value DESC NULLS LAST""".format(
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
           ORDER BY pollinator_value DESC NULLS LAST""".format(
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
```

- [ ] **Step 3: Run tests**

```bash
cd backend && python -m pytest tests/test_plant_suggestions.py -v
```

Expected: all 14 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/services/plant_suggestions.py backend/tests/test_plant_suggestions.py
git commit -m "feat(recommendations): add DB-first plant suggestions service"
```

---

## Task 3: Backend endpoints

**Files:**
- Modify: `backend/routers/plant_care.py`
- Modify: `backend/routers/maps.py`
- Modify: `backend/models.py`

- [ ] **Step 1: Add response models to `backend/models.py`**

```python
class PlantRecommendationOut(BaseModel):
    species_id: int
    dutch_name: str
    latin_name: str
    sun_preference: str | None
    sun_fit: str                     # 'perfect' | 'acceptable'
    is_native: bool | None
    pollinator_value: int | None
    flowering_months: list[int] | None
    gap_months_covered: list[int]
    reason: str                      # template text initially
    caveat: str | None


class RecommendationsOut(BaseModel):
    recommendations: list[PlantRecommendationOut]
    gap_months: list[int]
    biodiversity_score: int


class GardenSuggestionsOut(BaseModel):
    suggestions: list[PlantRecommendationOut]
    gap_months: list[int]
    biodiversity_score: int
```

- [ ] **Step 2: Add `GET /garden/recommendations` to `plant_care.py`**

Add after the `grow_here` endpoint:

```python
from services.plant_suggestions import recommend_for_spot
from services.garden_biodiversity import compute_for_map as _compute_bio
from models import RecommendationsOut, PlantRecommendationOut


@router.get("/garden/recommendations", response_model=RecommendationsOut)
async def get_recommendations(
    map_id: int,
    sun_hours: float,
    month: int,
    svf: float = 1.0,
    limit: int = 8,
    db=Depends(db_dep),
):
    """Tier 1 spot recommendations — DB-first, no LLM, returns in ~10 ms."""
    recs, gap_months = await recommend_for_spot(db, map_id, sun_hours, month, svf, limit)
    bio = await _compute_bio(db, map_id)
    return RecommendationsOut(
        recommendations=[PlantRecommendationOut(**vars(r)) for r in recs],
        gap_months=gap_months,
        biodiversity_score=bio.score,
    )
```

- [ ] **Step 3: Add `GET /maps/{slug}/plant-suggestions` to `maps.py`**

Add after the existing `GET /maps/{slug}/biodiversity` endpoint:

```python
from services.plant_suggestions import recommend_for_garden
from models import GardenSuggestionsOut, PlantRecommendationOut


@router.get("/maps/{slug}/plant-suggestions", response_model=GardenSuggestionsOut)
async def get_plant_suggestions(
    slug: str,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Garden-level Tier 1 recommendations — what to add to improve biodiversity."""
    rows = await db.execute_fetchall(
        "SELECT id, map_type FROM maps WHERE slug = ? AND household_id = ?",
        (slug, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Map not found")
    m = dict(rows[0])
    if m.get("map_type") == "indoor":
        raise HTTPException(status_code=400, detail="Plant suggestions only available for outdoor maps")

    recs, gap_months = await recommend_for_garden(db, m["id"])
    bio = await compute_biodiversity(db, m["id"])

    return GardenSuggestionsOut(
        suggestions=[PlantRecommendationOut(**vars(r)) for r in recs],
        gap_months=gap_months,
        biodiversity_score=bio.score,
    )
```

- [ ] **Step 4: Verify both endpoints manually**

Apply migrations first:
```bash
cd backend
alembic upgrade head
# Reset ecology for one species to trigger re-enrichment with sun_preference:
python -c "
import asyncio
from database import init_pool, close_pool, get_db
async def run():
    await init_pool()
    async with get_db() as db:
        await db.execute('UPDATE plant_species SET ecology_enriched_at = NULL LIMIT 3')
        await db.commit()
    await close_pool()
asyncio.run(run())
"
```

Start the server:
```bash
uvicorn main:app --reload --port 8000
```

Test spot recommendations (replace `<token>` and `<map_id>` with real values):
```bash
curl -s "http://localhost:8000/api/garden/recommendations?map_id=1&sun_hours=4.5&month=6&svf=0.8" \
  -H "Authorization: Bearer <token>" | python -m json.tool
```

Expected: `recommendations` list with `sun_fit`, `reason`, `gap_months_covered`. Response in < 200 ms.

Test garden suggestions:
```bash
curl -s "http://localhost:8000/api/maps/garden/plant-suggestions" \
  -H "Authorization: Bearer <token>" | python -m json.tool
```

Expected: up to 8 suggestions sorted by gap coverage + pollinator value.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/plant_care.py backend/routers/maps.py backend/models.py
git commit -m "feat(api): add DB-first /garden/recommendations and /maps/{slug}/plant-suggestions"
```

---

## Task 4: Frontend — GrowHereSheet with instant DB results

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/components/sheets/GrowHereSheet.tsx`
- Modify: `frontend/src/i18n/translations.ts`
- Modify: `frontend/src/i18n/nl.ts`
- Modify: `frontend/src/i18n/en.ts`

The sheet gets a new section that renders instantly (DB results), then the existing AI section loads async below it. The user sees plant cards immediately — no 3-second spinner.

- [ ] **Step 1: Add types to `frontend/src/types/index.ts`**

```typescript
export type PlantRecommendation = {
  species_id: number
  dutch_name: string
  latin_name: string
  sun_preference: string | null
  sun_fit: 'perfect' | 'acceptable'
  is_native: boolean | null
  pollinator_value: number | null      // 0..3
  flowering_months: number[] | null
  gap_months_covered: number[]
  reason: string
  caveat: string | null
}

export type RecommendationsOut = {
  recommendations: PlantRecommendation[]
  gap_months: number[]
  biodiversity_score: number
}
```

- [ ] **Step 2: Add API method to `client.ts`**

In the `garden` export:
```typescript
recommendations: (mapId: number, sunHours: number, month: number, svf?: number, limit?: number) =>
  api<import('../types').RecommendationsOut>('GET', '/garden/recommendations', {
    params: {
      map_id: String(mapId),
      sun_hours: String(sunHours),
      month: String(month),
      ...(svf !== undefined ? { svf: String(svf) } : {}),
      ...(limit !== undefined ? { limit: String(limit) } : {}),
    },
  }),
```

- [ ] **Step 3: Add translation keys**

In `translations.ts`, add to the `growHere` block:

```typescript
growHere: {
  // ... existing keys ...
  dbSuggestions: string        // "Passende planten"
  ecologyNative: string        // "🇳🇱 Inheems"
  ecologyPollinatorHigh: string // "🐝 Top bestuiver"
  ecologyPollinatorGood: string // "🐝 Goed voor bijen"
  ecologyFillsGap: string      // "Vult: {months}"
  sunFitPerfect: string        // "Ideaal licht"
  sunFitAcceptable: string     // "Geschikt licht"
  noDbResults: string          // "Weinig data beschikbaar — zie AI-suggesties hieronder"
}
```

In `nl.ts`:
```typescript
dbSuggestions: 'Passende planten',
ecologyNative: 'Inheems 🇳🇱',
ecologyPollinatorHigh: '🐝 Top bestuiver',
ecologyPollinatorGood: '🐝 Goed voor bijen',
ecologyFillsGap: 'Vult: {months}',
sunFitPerfect: 'Ideaal licht',
sunFitAcceptable: 'Geschikt licht',
noDbResults: 'Weinig soortdata beschikbaar — zie AI-suggesties hieronder',
```

In `en.ts`:
```typescript
dbSuggestions: 'Matching plants',
ecologyNative: 'Native 🇳🇱',
ecologyPollinatorHigh: '🐝 Top pollinator',
ecologyPollinatorGood: '🐝 Good for bees',
ecologyFillsGap: 'Fills: {months}',
sunFitPerfect: 'Ideal light',
sunFitAcceptable: 'Suitable light',
noDbResults: 'Limited species data — see AI suggestions below',
```

- [ ] **Step 4: Add `RecommendationCard` component inside `GrowHereSheet.tsx`**

Add imports at the top:
```tsx
import { garden as gardenApi } from '../../api/client'
import type { PlantRecommendation, RecommendationsOut } from '../../types'
```

Add the helper components above `GrowHereSheet`:

```tsx
const MONTH_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

function EcologyBadges({ rec, t }: { rec: PlantRecommendation; t: Translations['growHere'] }) {
  const badges: { label: string; cls: string }[] = []
  if (rec.is_native) badges.push({ label: t.ecologyNative, cls: 'bg-green-500/10 text-green-700 dark:text-green-400' })
  if ((rec.pollinator_value ?? 0) >= 3) badges.push({ label: t.ecologyPollinatorHigh, cls: 'bg-amber-400/15 text-amber-700' })
  else if ((rec.pollinator_value ?? 0) === 2) badges.push({ label: t.ecologyPollinatorGood, cls: 'bg-amber-400/10 text-amber-600' })
  if (rec.sun_fit === 'perfect') badges.push({ label: t.sunFitPerfect, cls: 'bg-primary/10 text-primary' })
  else badges.push({ label: t.sunFitAcceptable, cls: 'bg-surface text-text-muted border border-border/50' })
  if (rec.gap_months_covered.length > 0) {
    const monthStr = rec.gap_months_covered.map(m => MONTH_SHORT[m - 1]).join(', ')
    badges.push({ label: t.ecologyFillsGap.replace('{months}', monthStr), cls: 'bg-primary/10 text-primary' })
  }
  if (badges.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badges.map(b => (
        <span key={b.label} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
      ))}
    </div>
  )
}

function RecommendationCard({
  rec, onAdd, addingName, t,
}: {
  rec: PlantRecommendation
  onAdd: (name: string, species: string, sunReq?: string) => void
  addingName: string | null
  t: Translations['growHere']
}) {
  return (
    <div className="card p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-text">{rec.dutch_name}</p>
          <p className="text-xs text-text-muted italic">{rec.latin_name}</p>
          <EcologyBadges rec={rec} t={t} />
        </div>
        <button
          onClick={() => onAdd(rec.dutch_name, rec.latin_name, rec.sun_preference ?? undefined)}
          disabled={!!addingName}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
        >
          {addingName === rec.dutch_name ? t.addLoading : t.add}
        </button>
      </div>
      {rec.reason && (
        <p className="text-xs text-text-muted leading-relaxed">{rec.reason}</p>
      )}
      {rec.caveat && (
        <p className="text-xs text-amber-500/80 leading-relaxed">⚠ {rec.caveat}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Add DB recommendations state and fetch to `GrowHereSheet`**

Inside the `GrowHereSheet` component function, add after the existing `aiData`/`aiLoading`/`aiError` state:

```tsx
// Tier 1: DB-based recommendations — fetched on mount, instant
const [dbRecs, setDbRecs] = useState<RecommendationsOut | null>(null)
const [dbLoading, setDbLoading] = useState(true)

useEffect(() => {
  if (mapId == null) return
  gardenApi.recommendations(mapId, sunHours, selectedMonth)
    .then(data => { setDbRecs(data); setDbLoading(false) })
    .catch(() => setDbLoading(false))
}, [mapId, sunHours, selectedMonth])
```

- [ ] **Step 6: Render DB recommendations section**

In the scrollable body section of `GrowHereSheet`, add a new section **before** the existing "AI suggestions" section:

```tsx
{/* Tier 1: DB-matched plants — renders immediately */}
{mapId != null && (
  <section>
    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
      {t.growHere.dbSuggestions}
    </h3>
    {dbLoading && (
      <div className="space-y-2">
        {[0,1,2].map(i => (
          <div key={i} className="card p-3"><div className="skeleton h-4 w-3/5 rounded" /></div>
        ))}
      </div>
    )}
    {!dbLoading && dbRecs && dbRecs.recommendations.length === 0 && (
      <p className="text-xs text-text-muted">{t.growHere.noDbResults}</p>
    )}
    {!dbLoading && dbRecs && dbRecs.recommendations.length > 0 && (
      <div className="space-y-2">
        {dbRecs.recommendations.map(rec => (
          <RecommendationCard
            key={rec.species_id}
            rec={rec}
            onAdd={handleAddToGarden}
            addingName={addingName}
            t={t.growHere}
          />
        ))}
      </div>
    )}
  </section>
)}
```

The existing AI section stays below this, unchanged — it still loads async and shows Tier 3 LLM suggestions.

- [ ] **Step 7: Verify in browser**

```bash
cd frontend && npm run dev
```

Open the sun heatmap on a map. Tap a cell. The GrowHere sheet opens:
- Immediately: "Passende planten" section renders — plant cards with ecology badges and template reasons appear without any loading delay
- After 2-4 s: existing "AI suggesties" section fills in below

Edge cases:
- `mapId` is null (called from outside map context): DB section not shown, only AI section
- Garden has no enriched species: shows `noDbResults` message
- Same plant in DB section and AI section: both can show it (user may see it twice — acceptable, AI section has different reasoning)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/client.ts \
        frontend/src/types/index.ts \
        frontend/src/components/sheets/GrowHereSheet.tsx \
        frontend/src/i18n/translations.ts \
        frontend/src/i18n/nl.ts \
        frontend/src/i18n/en.ts
git commit -m "feat(map): GrowHereSheet shows DB-based recommendations instantly"
```

---

## Task 5: Frontend — "Verbeter je tuin" in BiodiversityCard

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/GardenBiodiversityCard.tsx`
- Modify: `frontend/src/i18n/translations.ts`
- Modify: `frontend/src/i18n/nl.ts`
- Modify: `frontend/src/i18n/en.ts`

- [ ] **Step 1: Add `maps.plantSuggestions` to `client.ts`**

In the `maps` export:
```typescript
plantSuggestions: (slug: string) =>
  api<import('../types').GardenSuggestionsOut>('GET', `/maps/${slug}/plant-suggestions`),
```

Add `GardenSuggestionsOut` type to `types/index.ts`:
```typescript
export type GardenSuggestionsOut = {
  suggestions: PlantRecommendation[]
  gap_months: number[]
  biodiversity_score: number
}
```

- [ ] **Step 2: Add translation keys**

In `translations.ts`, add to the `garden.biodiversity` block (or alongside it):

```typescript
garden: {
  biodiversity: { /* existing */ },
  suggestions: {
    title: string        // "Verbeter je tuin"
    gapLabel: string     // "Maanden zonder bestuivers: {months}"
    noData: string       // "Voeg planten toe om aanbevelingen te zien"
    sunFull: string      // "☀️ Volle zon"
    sunPartial: string   // "⛅ Halfschaduw"
    sunShade: string     // "🌿 Schaduw"
  }
}
```

In `nl.ts`:
```typescript
suggestions: {
  title: 'Verbeter je tuin',
  gapLabel: 'Maanden zonder bestuivers: {months}',
  noData: 'Voeg planten toe om aanbevelingen te zien',
  sunFull: '☀️ Volle zon',
  sunPartial: '⛅ Halfschaduw',
  sunShade: '🌿 Schaduw',
},
```

In `en.ts`:
```typescript
suggestions: {
  title: 'Improve your garden',
  gapLabel: 'Months without pollinators: {months}',
  noData: 'Add plants to see recommendations',
  sunFull: '☀️ Full sun',
  sunPartial: '⛅ Partial shade',
  sunShade: '🌿 Shade',
},
```

- [ ] **Step 3: Add suggestions section to `GardenBiodiversityCard.tsx`**

In the modal (`GardenBiodiversityCardFull` or equivalent), add state and fetch:

```tsx
import type { GardenSuggestionsOut } from '../types'
import { maps as mapsApi } from '../api/client'

// Inside the component:
const [suggestions, setSuggestions] = useState<GardenSuggestionsOut | null>(null)

useEffect(() => {
  if (!slug) return
  mapsApi.plantSuggestions(slug).then(setSuggestions).catch(() => {})
}, [slug])
```

Add section at the bottom of the modal body:

```tsx
{suggestions && (
  <section className="pt-4 mt-4 border-t border-border/40">
    <h3 className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">
      {t.garden.suggestions.title}
    </h3>

    {suggestions.gap_months.length > 0 && (
      <p className="text-xs text-text-muted mb-3">
        {t.garden.suggestions.gapLabel.replace(
          '{months}',
          suggestions.gap_months.map(m => MONTH_SHORT[m - 1]).join(', ')
        )}
      </p>
    )}

    {suggestions.suggestions.length === 0 ? (
      <p className="text-xs text-text-muted">{t.garden.suggestions.noData}</p>
    ) : (
      <div className="space-y-3">
        {suggestions.suggestions.map((s, i) => {
          const sunLabel = s.sun_preference === 'full_sun'
            ? t.garden.suggestions.sunFull
            : s.sun_preference === 'partial_sun'
            ? t.garden.suggestions.sunPartial
            : s.sun_preference === 'shade'
            ? t.garden.suggestions.sunShade
            : null

          return (
            <div key={i} className="card p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-sm text-text">{s.dutch_name}</span>
                    {sunLabel && (
                      <span className="text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded-full border border-border/50">
                        {sunLabel}
                      </span>
                    )}
                    {s.is_native && (
                      <span className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                        Inheems 🇳🇱
                      </span>
                    )}
                    {(s.pollinator_value ?? 0) >= 2 && (
                      <span className="text-[10px] bg-amber-400/10 text-amber-700 px-1.5 py-0.5 rounded-full">
                        🐝
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted italic">{s.latin_name}</p>
                </div>
              </div>
              {s.reason && (
                <p className="text-xs text-text-muted leading-relaxed">{s.reason}</p>
              )}
            </div>
          )
        })}
      </div>
    )}
  </section>
)}
```

Add the `MONTH_SHORT` constant at the top of the file if not already present:
```tsx
const MONTH_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
```

- [ ] **Step 4: Verify in browser**

Open the map. Click the biodiversity pill. In the modal, scroll to the bottom — "Verbeter je tuin" section loads (fast, DB-only). Cards show plant name, sun preference, native/pollinator badges, template reason.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts \
        frontend/src/types/index.ts \
        frontend/src/components/GardenBiodiversityCard.tsx \
        frontend/src/i18n/translations.ts \
        frontend/src/i18n/nl.ts \
        frontend/src/i18n/en.ts
git commit -m "feat(biodiversity): add Verbeter je tuin plant suggestions to biodiversity modal"
```

---

## Task 6: Post-identify ecology nudge

**Files:**
- Modify: `frontend/src/pages/IdentifyPlant.tsx`
- Modify: `frontend/src/i18n/translations.ts`
- Modify: `frontend/src/i18n/nl.ts`
- Modify: `frontend/src/i18n/en.ts`

After `commitIdentify` returns a `species_id`, fetch `GET /species/{id}/ecology` (already exists, no new endpoint). If the result has anything interesting, show a one-screen preview before navigating to AddPlant. Zero LLM cost — this is purely reading already-stored ecology data.

- [ ] **Step 1: Add translation keys**

In `translations.ts`, add to the `identify` block:

```typescript
identify: {
  // ... existing keys ...
  ecologyTitle: string         // "Wat je net vond"
  ecologyFillsGap: string      // "Vult je tuinkalender in {months}"
  ecologyContinue: string      // "Doorgaan met toevoegen"
}
```

In `nl.ts`:
```typescript
ecologyTitle: 'Wat je net vond',
ecologyFillsGap: 'Vult je tuinkalender in {months}',
ecologyContinue: 'Doorgaan met toevoegen',
```

In `en.ts`:
```typescript
ecologyTitle: 'What you just found',
ecologyFillsGap: 'Fills your garden calendar in {months}',
ecologyContinue: 'Continue adding',
```

- [ ] **Step 2: Add `ecology_preview` step to `IdentifyPlant.tsx`**

Add imports:
```tsx
import type { IdentifyCommitResult, EcologyOut } from '../types'
import { species as speciesApi, maps as mapsApi } from '../api/client'
```

Extend the `Step` union:
```typescript
type Step =
  | { kind: 'camera' }
  | { kind: 'identifying'; thumbnail: string }
  | ({ kind: 'results' } & ResultsState)
  | { kind: 'enriching' }
  | { kind: 'ecology_preview'; commitResult: IdentifyCommitResult; ecology: EcologyOut }
  | ({ kind: 'sighting'; weedId: number; weedName: string; from: ResultsState })
  | { kind: 'error'; message: string; thumbnail: string | null }
```

Add garden biodiversity state (to compute gap months for gap-fill message):
```tsx
const mapSlug = (location.state as { mapSlug?: string } | null)?.mapSlug ?? null
const [gapMonths, setGapMonths] = useState<number[]>([])

useEffect(() => {
  if (!mapSlug) return
  mapsApi.biodiversity(mapSlug)
    .then(bio => {
      const gaps = bio.pollinator_coverage_months
        .map((covered, i) => (covered ? null : i + 1))
        .filter((m): m is number => m !== null)
      setGapMonths(gaps)
    })
    .catch(() => {})
}, [mapSlug])
```

- [ ] **Step 3: Modify `handleChoose` to show ecology preview**

Replace the `handleChoose` function:

```tsx
async function handleChoose(candidate: PlantIdCandidate) {
  if (!capturedPhotoDataUrl) return
  setStep({ kind: 'enriching' })
  try {
    const commitResult = await plantsApi.commitIdentify(candidate.scientific_name, capturedPhotoDataUrl)

    // Fetch ecology data — already stored, no LLM cost
    let ecology: EcologyOut | null = null
    try {
      ecology = await speciesApi.ecology(commitResult.species_id)
    } catch { /* non-critical */ }

    // Show preview only when ecology has something interesting
    const hasContent = ecology &&
      ecology.data_source !== 'failed' && (
        ecology.pollinator_value != null ||
        ecology.is_native != null ||
        (ecology.flowering_months && ecology.flowering_months.length > 0)
      )

    if (hasContent) {
      setStep({ kind: 'ecology_preview', commitResult, ecology: ecology! })
    } else {
      navigate('/plants/add', { state: { prefill: commitResult, from: 'identify' } })
    }
  } catch {
    setStep({ kind: 'error', message: t.identify.errorService, thumbnail: capturedPhotoDataUrl })
  }
}
```

- [ ] **Step 4: Render ecology preview step**

Add in the render section (alongside the other `step.kind === '...'` blocks):

```tsx
{step.kind === 'ecology_preview' && (() => {
  const { commitResult, ecology } = step
  const MONTH_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
  const fills = (ecology.flowering_months ?? []).filter(m => gapMonths.includes(m))

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <div className="px-4 pt-safe-top pt-6 pb-4 border-b border-border">
        <p className="text-xs text-text-muted italic mb-1">{commitResult.scientific_name}</p>
        <h1 className="text-xl font-bold text-text">{t.identify.ecologyTitle}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {ecology.is_native === true && (
          <div className="card p-3 flex items-center gap-3">
            <span className="text-2xl">🇳🇱</span>
            <p className="text-sm text-text">{t.ecology.native}</p>
          </div>
        )}
        {ecology.invasive_nl && (
          <div className="card p-3 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <p className="text-sm font-semibold text-red-500">{t.ecology.invasive}</p>
          </div>
        )}
        {(ecology.pollinator_value ?? 0) >= 2 && (
          <div className="card p-3 flex items-center gap-3">
            <span className="text-2xl">🐝</span>
            <p className="text-sm text-text">
              {ecology.pollinator_value === 3 ? t.ecology.pollinatorTopTier : t.ecology.pollinatorGood}
            </p>
          </div>
        )}
        {ecology.flowering_months && ecology.flowering_months.length > 0 && (
          <div className="card p-3">
            <p className="text-sm text-text mb-1">
              🌸 {t.ecology.floweringPrefix}: {ecology.flowering_months.map(m => MONTH_SHORT[m - 1]).join(', ')}
            </p>
            {fills.length > 0 && (
              <p className="text-xs text-primary mt-1">
                {t.identify.ecologyFillsGap.replace('{months}', fills.map(m => MONTH_SHORT[m - 1]).join(', '))}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pb-safe-bottom pb-6 pt-3 border-t border-border">
        <button
          onClick={() => navigate('/plants/add', { state: { prefill: commitResult, from: 'identify' } })}
          className="w-full py-3 rounded-2xl bg-primary text-white font-semibold text-sm"
        >
          {t.identify.ecologyContinue}
        </button>
      </div>
    </div>
  )
})()}
```

- [ ] **Step 5: Verify in browser**

1. Navigate to `/identify` from a map (route state must include `mapSlug`).
2. Photograph and identify a plant (lavender, calendula, or similar common species).
3. Confirm the top candidate.
4. If the species has ecology data: ecology preview screen appears showing relevant badges.
5. Tap "Doorgaan" → navigates to `/plants/add` with prefill.

Edge cases:
- Species not enriched yet: `ecology.data_source === 'failed'` or 404 → skip preview, navigate directly.
- No `mapSlug` in route state (e.g., identify from dashboard): preview still shows but no "Vult je tuinkalender in" line.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/IdentifyPlant.tsx \
        frontend/src/i18n/translations.ts \
        frontend/src/i18n/nl.ts \
        frontend/src/i18n/en.ts
git commit -m "feat(identify): add ecology preview step after plant identification"
```

---

## Self-review

### Spec coverage

| User requirement | Covered by |
|---|---|
| Use lightscore for spot recommendations | Task 1 (sun_preference field) + Task 2 (bucket_for + compatible_sun_preferences) + Task 3 (GET /garden/recommendations) + Task 4 (GrowHereSheet DB section) |
| Use bioscore for garden-level recommendations | Task 2 (recommend_for_garden uses gap_months from biodiversity) + Task 3 (GET /maps/{slug}/plant-suggestions) + Task 5 (BiodiversityCard section) |
| No LLM call on every tap | Task 4 (DB section renders before AI section; AI section is optional async) |
| Post-identify ecology context | Task 6 |

### Token usage per action (after this plan)

| Action | LLM calls |
|---|---|
| Tap heatmap cell — view recommendations | 0 (DB only; AI section lazy-loads if user waits) |
| Open biodiversity card modal | 0 |
| Identify a plant and confirm it | 0 (ecology already stored) |
| Tap "AI suggesties" section in GrowHereSheet | 1 (existing Tier 3, unchanged) |

### Task dependencies

- Task 1 must run before Task 2 (new column needed for sun preference filtering)
- Task 2 must run before Task 3 (service needed for endpoints)
- Task 3 must run before Tasks 4 and 5 (endpoints needed before frontend can call them)
- Task 6 is independent

Suggested order: **1 → 2 → 3 → 4 → 5 → 6**

### Known follow-ups (out of scope)

- **Tier 2 LLM reasoning** (optional enrichment): pass the top DB picks to LLM to generate richer `reason` text. Attach as a background fetch that replaces template text after it lands. This adds value but is not necessary for a working system.
- **Backfill `sun_preference`**: after shipping Task 1, run `python scripts/enrich_species_ecology.py` to re-enrich any species where `sun_preference IS NULL`. The script is idempotent if we reset `ecology_enriched_at` for those rows.
- **Empty DB fallback**: when `recommend_for_spot` returns < 3 results, automatically trigger the Tier 3 LLM call so the user always sees something useful. The GrowHere sheet's existing AI section already covers this.
