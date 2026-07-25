"""Physical garden features (insect hotel, nestkast, water, …) — advice-only.

Biodiversity is more than plants. Flowers bring fauna in; **shelter, nesting
sites and water** decide whether they can stay. This service turns the
self-reported feature counts for a garden into two machine-readable signals:

  - which fauna groups the garden currently supports (bees / birds / hedgehogs
    / insects / amphibians / bats), and
  - which high-value features are still missing (gap codes the UI turns into
    tips: "nog geen water — een ondiep schaaltje helpt vogels en insecten").

Backend stays language-neutral (codes only); the frontend and Stekkie localize.
Never folded into the 0-100 score — a companion signal like soil, carbon and
kringloop (see the biodiversity research doc, Deel 3).
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Canonical feature vocabulary. Order is the display order; extend deliberately
# (each addition changes what "missing" means for every existing garden).
FEATURE_TYPES: tuple[str, ...] = (
    "insect_hotel",     # insectenhotel / bijenhotel
    "bird_house",       # nestkast
    "water",            # vijver, vogelbad of drinkschaaltje
    "log_pile",         # takkenril / dood hout
    "stone_pile",       # steenhoop / stapelmuurtje
    "hedgehog_house",   # egelhuisje
    "bat_box",          # vleermuiskast
)

# Which fauna groups each feature supports. Used to show "je ondersteunt: …"
# and to decide which gaps are worth nudging about.
_SUPPORTS: dict[str, tuple[str, ...]] = {
    "insect_hotel":   ("solitary_bees", "insects"),
    "bird_house":     ("birds",),
    "water":          ("birds", "insects", "amphibians"),
    "log_pile":       ("insects", "hedgehogs", "amphibians"),
    "stone_pile":     ("insects", "amphibians"),
    "hedgehog_house": ("hedgehogs",),
    "bat_box":        ("bats",),
}

# The features worth actively suggesting when absent, cheapest/highest-value
# first. Not every feature earns a nudge — a bat box is niche, a water dish
# is a saucer of water that helps almost everything.
_GAP_PRIORITY: tuple[str, ...] = ("water", "insect_hotel", "log_pile", "bird_house")


@dataclass
class GardenFeatures:
    counts: dict[str, int] = field(default_factory=dict)   # feature_type -> count (>0 only)
    total: int = 0                                          # total specimens
    distinct: int = 0                                       # distinct feature types present
    supported_groups: list[str] = field(default_factory=list)   # fauna group codes
    missing: list[str] = field(default_factory=list)        # gap codes, priority order


def summarize(counts: dict[str, int]) -> GardenFeatures:
    """Pure summary of a garden's feature counts — no DB, easy to test."""
    clean = {k: int(v) for k, v in counts.items() if k in FEATURE_TYPES and int(v or 0) > 0}
    groups: list[str] = []
    for key in FEATURE_TYPES:
        if key in clean:
            for g in _SUPPORTS.get(key, ()):
                if g not in groups:
                    groups.append(g)
    missing = [k for k in _GAP_PRIORITY if k not in clean]
    return GardenFeatures(
        counts=clean,
        total=sum(clean.values()),
        distinct=len(clean),
        supported_groups=groups,
        missing=missing,
    )


async def features_for_map(db, map_id: int) -> GardenFeatures:
    """Self-reported features for a garden, summarized.

    Guarded: the reduced test schemas have no garden_features table, in which
    case the garden simply reports no features (never raises)."""
    try:
        rows = await db.execute_fetchall(
            "SELECT feature_type, count FROM garden_features WHERE map_id = ? AND count > 0",
            (map_id,),
        )
    except Exception:
        return summarize({})
    return summarize({r["feature_type"]: r["count"] for r in rows})
