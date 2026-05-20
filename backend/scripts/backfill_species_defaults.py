"""Backfill species_care_defaults from plant_species.care_thresholds + plant_care_cache.

Reads existing species data and produces a full profile_json in the new care-profile shape.
Run after schema migration (species_care_defaults table must exist).

Usage:
    python backend/scripts/backfill_species_defaults.py
"""
import json
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "floreren.db"

# ── new shape template ──────────────────────────────────────────────────

# Season adjustments based on Amsterdam climate
WATER_SEASON_ADJUST = {"spring": 1.0, "summer": 0.7, "autumn": 1.0, "winter": 1.5}
FERTILIZE_SEASON_ADJUST = {"spring": 1.0, "summer": 1.0, "autumn": 1.0, "winter": None}

# Default interval from care_types.py
DEFAULT_INTERVALS = {
    "water": {"outdoor_ground": 7, "outdoor_container": 4, "indoor": 7},
    "fertilize": {"outdoor_ground": 30, "outdoor_container": 21, "indoor": 30},
    "prune": {"outdoor_ground": 180, "outdoor_container": 180, "indoor": 365},
    "repot": {"outdoor_ground": None, "outdoor_container": 540, "indoor": 540},
    "mist": {"outdoor_ground": None, "outdoor_container": None, "indoor": 3},
    "rotate": {"outdoor_ground": None, "outdoor_container": None, "indoor": 7},
    "pest_check": {"outdoor_ground": 30, "outdoor_container": 30, "indoor": 30},
    "dust": {"outdoor_ground": None, "outdoor_container": None, "indoor": 30},
}


def new_profile_template() -> dict:
    """Return an empty profile with all care types but no activation."""
    return {
        "water": {
            "active": False,
            "interval_days": 7,
            "season_adjust": WATER_SEASON_ADJUST,
            "drought_mm_per_week": None,
        },
        "fertilize": {
            "active": False,
            "interval_days": 30,
            "season_adjust": FERTILIZE_SEASON_ADJUST,
            "months": [],
            "tip": None,
        },
        "frost_protect": {
            "active": False,
            "thresholds": {"min_temp_c": None, "bring_inside_below_c": None},
        },
        "heat_protect": {
            "active": False,
            "thresholds": {"max_temp_c": None},
        },
        "prune": {
            "active": False,
            "interval_days": 180,
        },
        "repot": {
            "active": False,
            "interval_days": 540,
        },
        "mist": {
            "active": False,
            "interval_days": 3,
            "season_adjust": {"spring": 1.0, "summer": 0.7, "autumn": 1.0, "winter": 2.0},
        },
        "rotate": {
            "active": False,
            "interval_days": 7,
        },
        "pest_check": {
            "active": True,
            "interval_days": 30,
        },
        "dust": {
            "active": False,
            "interval_days": 30,
        },
    }


def convert_species_care_thresholds(
    thresholds_json: str | None,
    cache_row: dict | None,
    scientific_name: str | None,
) -> tuple[dict, str]:
    """Convert old-format species thresholds + optional cache data → new profile_json.

    Returns (profile_dict, source_label).
    """
    profile = new_profile_template()
    source = "manual"

    if thresholds_json:
        try:
            old = json.loads(thresholds_json)
        except json.JSONDecodeError:
            old = {}
    else:
        old = {}

    # ── Water ──
    drought_mm = old.get("drought_mm_per_week")
    waterlog_mm = old.get("waterlog_mm_per_week")

    if cache_row and scientific_name:
        sp_name = scientific_name.lower()
        cache_name = (cache_row.get("scientific_name") or "").lower()
        if sp_name == cache_name:
            source = "trefle"
    elif old:
        source = "claude_ai"

    if drought_mm is not None or waterlog_mm is not None:
        profile["water"]["active"] = True
        profile["water"]["drought_mm_per_week"] = drought_mm
        if waterlog_mm is not None:
            profile["water"]["waterlog_mm_per_week"] = waterlog_mm

    # Use cache data if available for water defaults
    if source == "trefle" and cache_row:
        precip_min = cache_row.get("precip_min_mm")
        precip_max = cache_row.get("precip_max_mm")
        humidity = cache_row.get("humidity_raw")
        # Higher humidity / precip → less need to water manually
        if humidity is not None and humidity >= 7:
            profile["water"]["interval_days"] = 14  # very humid = longer intervals
        elif humidity is not None and humidity <= 3:
            profile["water"]["interval_days"] = 3  # very dry air = shorter

        if precip_min is not None and precip_max is not None:
            avg_precip = (precip_min + precip_max) / 2
            if avg_precip >= 1000:
                profile["water"]["interval_days"] = max(
                    profile["water"].get("interval_days", 7), 14
                )

    # ── Fertilize ──
    fertilise_months = old.get("fertilise_months")
    fertilise_tip = old.get("fertilise_tip")
    if fertilise_months:
        profile["fertilize"]["active"] = True
        profile["fertilize"]["months"] = fertilise_months
        profile["fertilize"]["tip"] = fertilise_tip
        source = source if source != "manual" else "claude_ai"

    # ── Frost protect ──
    min_temp = old.get("min_temp_c")
    bring_inside = old.get("bring_inside_below_c")
    if min_temp is not None or bring_inside is not None:
        profile["frost_protect"]["active"] = True
        profile["frost_protect"]["thresholds"]["min_temp_c"] = min_temp
        profile["frost_protect"]["thresholds"]["bring_inside_below_c"] = bring_inside
        source = source if source != "manual" else "claude_ai"

    # ── Heat protect ──
    max_temp = old.get("max_temp_c")
    if max_temp is not None:
        profile["heat_protect"]["active"] = True
        profile["heat_protect"]["thresholds"]["max_temp_c"] = max_temp
        source = source if source != "manual" else "claude_ai"

    # ── Always-active types (pest_check stays on, others context-dependent) ──
    # For species defaults, we can't know the environment, so keep most inactive
    # except water, fertilize, frost/heat protect if thresholds exist.
    # pest_check is always active per design spec.
    profile["pest_check"]["active"] = True

    # ── Water interval from species table ──
    # (unlikely to be set but check)
    water_interval = old.get("water_interval_days")
    if water_interval is not None:
        profile["water"]["interval_days"] = water_interval

    return profile, source


def load_cache_dict(db) -> dict[str, dict]:
    """Load plant_care_cache into {scientific_name_lower: row_dict}."""
    c = db.execute("SELECT * FROM plant_care_cache")
    cols = [d[0] for d in c.description]
    cache_by_keys: dict[str, dict] = {}
    for row in c.fetchall():
        d = dict(zip(cols, row))
        key = (d.get("scientific_name") or "").strip().lower()
        if key:
            cache_by_keys[key] = d
    return cache_by_keys


def main():
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row

    cache_by_name = load_cache_dict(db)

    # Read all species
    species_rows = db.execute(
        "SELECT id, latin_name, common_name_nl, care_thresholds, water_interval_days "
        "FROM plant_species"
    ).fetchall()

    # Also check if any species already have defaults
    existing = {
        r[0]
        for r in db.execute("SELECT scientific_name FROM species_care_defaults").fetchall()
    }

    inserted = 0
    skipped_existing = 0
    empty_skipped = 0

    for sp in species_rows:
        latin = (sp["latin_name"] or "").strip()
        if not latin:
            latin = ((sp["common_name_nl"] or "").strip()).lower().replace(" ", "_")

        if latin in existing:
            skipped_existing += 1
            continue

        thresholds = sp["care_thresholds"]
        if not thresholds:
            # Check if we can derive from cache
            name_variants = [(sp["latin_name"] or "").strip().lower()]
            if sp["common_name_nl"]:
                # No reliable way to match by common name
                pass

            cache_row = None
            for variant in name_variants:
                if variant in cache_by_name:
                    cache_row = cache_by_name[variant]
                    break
        else:
            cache_row = None
            # Try to match cache by latin name
            latin_lower = latin.lower()
            if latin_lower in cache_by_name:
                cache_row = cache_by_name[latin_lower]

        profile, source = convert_species_care_thresholds(
            thresholds, cache_row, sp["latin_name"]
        )

        # Check if we have no real data — skip empty defaults
        active_count = sum(
            1 for t in profile.values()
            if isinstance(t, dict) and t.get("active")
        )
        if active_count <= 1:  # only pest_check is always active
            empty_skipped += 1
            continue

        db.execute(
            "INSERT OR REPLACE INTO species_care_defaults "
            "(scientific_name, profile_json, source) VALUES (?, ?, ?)",
            (latin, json.dumps(profile, ensure_ascii=False), source),
        )
        inserted += 1

    db.commit()
    total_species = len(species_rows)
    print(f"Species processed: {total_species}")
    print(f"Inserted/updated:  {inserted}")
    print(f"Skipped (exists):  {skipped_existing}")
    print(f"Skipped (no data): {empty_skipped}")
    print(f"Remaining empty:   {total_species - inserted - skipped_existing - empty_skipped}")

    db.close()
    print("Done.")


if __name__ == "__main__":
    main()
