"""Which wild bees does a garden support? (Bloeibogen / Naturalis)

A bee needs bee-forage (drachtplant) blooming *during its flight period*. So we
overlap the garden's drachtplant bloom months against each bee's flight months:

  - supported bee   — at least one flight month has a drachtplant blooming;
  - forage gap      — a month where bees are on the wing (some bee flies) but the
                      garden has no drachtplant in bloom → an actionable
                      "plant something for <month>" nudge.

Bees are reference data from data/bloeibogen_bees.json (148 species, Red-List
flags). This is *informational* — a "who you'll attract / where the gaps are"
insight, not a score component (bees are attracted by the flora we already
score). See issue #709.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

_BEES = Path(__file__).parent.parent / "data" / "bloeibogen_bees.json"


@lru_cache(maxsize=1)
def _all_bees() -> list[dict]:
    return json.loads(_BEES.read_text(encoding="utf-8")).get("bees", [])


@dataclass
class BeeSupport:
    forage_months: list[bool]        # 12 bools — months a drachtplant blooms
    supported_count: int             # bees whose flight overlaps garden forage
    supported_redlist_count: int
    total_bees: int
    total_redlist: int
    forage_gap_months: list[int]     # months bees fly but no forage (1..12)
    example_supported: list[str] = field(default_factory=list)  # a few Dutch names


def _coerce_months(value) -> list[int]:
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


async def _forage_months(db, map_id: int) -> set[int]:
    """Months in which at least one drachtplant in this garden is flowering.

    Guarded: reduced test schemas may lack is_drachtplant → no forage."""
    try:
        rows = await db.execute_fetchall(
            """SELECT ps.flowering_months
               FROM plants p JOIN plant_species ps ON p.species_id = ps.id
               WHERE p.map_id = ? AND p.is_active = TRUE AND ps.is_drachtplant = TRUE""",
            (map_id,),
        )
    except Exception:
        return set()
    months: set[int] = set()
    for r in rows:
        months.update(_coerce_months(r["flowering_months"]))
    return months


async def bee_support_for_map(db, map_id: int) -> BeeSupport:
    bees = _all_bees()
    total = len(bees)
    total_redlist = sum(1 for b in bees if b.get("is_red_list"))

    forage = await _forage_months(db, map_id)
    coverage = [(m + 1) in forage for m in range(12)]

    # "Supported" = the bee can forage across its *whole* flight period (every
    # flight month has a drachtplant blooming). A looser "any overlap" rule
    # saturates — with summer forage nearly every bee overlaps somewhere — so it
    # carries no signal. Full-coverage makes the count respond to real gaps.
    supported: list[dict] = []
    for b in bees:
        flight = set(b.get("flight_months") or [])
        if flight and flight <= forage:
            supported.append(b)

    supported_redlist = sum(1 for b in supported if b.get("is_red_list"))

    # Forage gap: months some bee is on the wing but nothing is blooming for it.
    bee_season: set[int] = set()
    for b in bees:
        bee_season.update(b.get("flight_months") or [])
    gap = sorted(m for m in bee_season if m not in forage)

    # A few showcase names (Red-List first — they're the conservation story).
    supported_sorted = sorted(supported, key=lambda b: (not b.get("is_red_list"), b.get("dutch_name") or ""))
    examples = [b["dutch_name"] for b in supported_sorted[:3] if b.get("dutch_name")]

    return BeeSupport(
        forage_months=coverage,
        supported_count=len(supported),
        supported_redlist_count=supported_redlist,
        total_bees=total,
        total_redlist=total_redlist,
        forage_gap_months=gap,
        example_supported=examples,
    )
