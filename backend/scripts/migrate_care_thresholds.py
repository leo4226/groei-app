"""Migrate plants.care_thresholds (old format) → plants.care_profile (new format).

For each plant:
1. Start with species defaults (if available)
2. Overlay plant-specific care_thresholds
3. Determine environment from container_id/ground_zone_id
4. Write final profile_json to plants.care_profile

Usage:
    python backend/scripts/migrate_care_thresholds.py
"""
import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "floreren.db"

WATER_SEASON_ADJUST = {"spring": 1.0, "summer": 0.7, "autumn": 1.0, "winter": 1.5}
FERTILIZE_SEASON_ADJUST = {"spring": 1.0, "summer": 1.0, "autumn": 1.0, "winter": None}
INDOR_ONLY_TYPES = {"mist", "rotate", "dust"}


def detect_environment(plant: dict) -> str:
    """Determine plant environment from container/ground references."""
    if plant.get("ground_zone_id"):
        return "outdoor_ground"
    if plant.get("container_id"):
        return "outdoor_container"
    # Plants with map placement but no zone → outdoor
    if plant.get("map_id") and plant.get("map_x") is not None:
        return "outdoor_ground"
    # Fallback: check plant_type
    pt = (plant.get("plant_type") or "").lower()
    if pt == "ground":
        return "outdoor_ground"
    elif pt == "container":
        return "outdoor_container"
    return "indoor"


def new_profile_template(env: str) -> dict:
    """Return an empty profile for the given environment with sensible defaults."""
    from_ground = env == "outdoor_ground"
    is_indoor = env == "indoor"

    return {
        "water": {
            "active": True,
            "interval_days": 7,
            "season_adjust": WATER_SEASON_ADJUST,
            "drought_mm_per_week": None,
        },
        "fertilize": {
            "active": True,
            "interval_days": 30,
            "season_adjust": FERTILIZE_SEASON_ADJUST,
            "months": [],
            "tip": None,
        },
        "frost_protect": {
            "active": not is_indoor,
            "thresholds": {"min_temp_c": None, "bring_inside_below_c": None},
        },
        "heat_protect": {
            "active": not is_indoor,
            "thresholds": {"max_temp_c": None},
        },
        "prune": {
            "active": False,
            "interval_days": 180,
        },
        "repot": {
            "active": not from_ground,
            "interval_days": 540,
        },
        "mist": {
            "active": is_indoor,
            "interval_days": 3,
            "season_adjust": {"spring": 1.0, "summer": 0.7, "autumn": 1.0, "winter": 2.0},
        },
        "rotate": {
            "active": is_indoor,
            "interval_days": 7,
        },
        "pest_check": {
            "active": True,
            "interval_days": 30,
        },
        "dust": {
            "active": is_indoor,
            "interval_days": 30,
        },
    }


def find_species_default(db, plant: dict) -> dict | None:
    """Try to find a matching species default for the plant.

    Strategy:
    1. species_id → plant_species.latin_name → species_care_defaults
    2. plants.species (direct match) → species_care_defaults
    3. plants.species (fuzzy — starts with / contains) → species_care_defaults
    """
    species_id = plant.get("species_id")
    species_name = (plant.get("species") or "").strip()

    if not species_name and not species_id:
        return None

    # Strategy 1: via species_id → plant_species → defaults
    if species_id:
        row = db.execute(
            "SELECT latin_name FROM plant_species WHERE id = ?", (species_id,)
        ).fetchone()
        if row and row[0]:
            default = db.execute(
                "SELECT profile_json FROM species_care_defaults WHERE scientific_name = ?",
                (row[0],),
            ).fetchone()
            if default:
                return json.loads(default[0])

    if not species_name:
        return None

    # Strategy 2: direct match on species_name
    default = db.execute(
        "SELECT profile_json FROM species_care_defaults WHERE scientific_name = ?",
        (species_name,),
    ).fetchone()
    if default:
        return json.loads(default[0])

    # Strategy 3: fuzzy — strip cross/hybrid markers
    clean_name = species_name.replace("×", "").replace("'", "").strip()
    if clean_name != species_name:
        default = db.execute(
            "SELECT profile_json FROM species_care_defaults WHERE scientific_name LIKE ?",
            (f"%{clean_name}%",),
        ).fetchone()
        if default:
            return json.loads(default[0])

    # Strategy 4: starts-with match (handle "Epimedium × perralchicum" → "Epimedium")
    genus = species_name.split()[0] if species_name.split() else ""
    if genus and len(genus) >= 4:
        default = db.execute(
            "SELECT profile_json FROM species_care_defaults WHERE scientific_name LIKE ?",
            (f"{genus}%",),
        ).fetchone()
        if default:
            return json.loads(default[0])

    return None


def overlay_old_thresholds(profile: dict, old_json: str | None, env: str):
    """Overlay old care_thresholds onto a profile."""
    if not old_json or old_json == "None":
        return

    try:
        old = json.loads(old_json)
    except (json.JSONDecodeError, TypeError):
        return

    # ── Water ──
    drought = old.get("drought_mm_per_week")
    waterlog = old.get("waterlog_mm_per_week")
    if drought is not None or waterlog is not None:
        profile["water"]["active"] = True
        profile["water"]["drought_mm_per_week"] = drought
        if waterlog is not None:
            profile["water"]["waterlog_mm_per_week"] = waterlog

    # ── Fertilize ──
    months = old.get("fertilise_months")
    if months:
        profile["fertilize"]["active"] = True
        profile["fertilize"]["months"] = months
    tip = old.get("fertilise_tip")
    if tip:
        profile["fertilize"]["tip"] = tip

    # ── Frost protect ──
    min_temp = old.get("min_temp_c")
    bring_inside = old.get("bring_inside_below_c")
    if min_temp is not None or bring_inside is not None:
        profile["frost_protect"]["active"] = True
        if min_temp is not None:
            profile["frost_protect"]["thresholds"]["min_temp_c"] = min_temp
        if bring_inside is not None:
            profile["frost_protect"]["thresholds"]["bring_inside_below_c"] = bring_inside

    # ── Heat protect ──
    max_temp = old.get("max_temp_c")
    if max_temp is not None:
        profile["heat_protect"]["active"] = True
        profile["heat_protect"]["thresholds"]["max_temp_c"] = max_temp

    # ── Water interval override ──
    water_interval = old.get("water_interval_days")
    if water_interval is not None:
        profile["water"]["interval_days"] = water_interval


def main():
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row

    # Load all plants
    plants = db.execute(
        "SELECT id, name, species, species_id, care_thresholds, "
        "container_id, ground_zone_id, map_id, map_x, map_y, plant_type "
        "FROM plants"
    ).fetchall()

    updated = 0
    from_species_default = 0
    from_fallback = 0
    errors = []

    for p in plants:
        plant_id = p["id"]
        env = detect_environment(dict(p))

        # Step 1: Try species defaults
        species_profile = find_species_default(db, dict(p))

        if species_profile:
            profile = species_profile
            from_species_default += 1
            # Ensure environment-appropriate types are set
            is_indoor = env == "indoor"
            is_ground = env == "outdoor_ground"

            # Override env-dependent types that species defaults can't know
            profile["mist"]["active"] = is_indoor
            profile["rotate"]["active"] = is_indoor
            profile["dust"]["active"] = is_indoor
            profile["repot"]["active"] = not is_ground
            profile["frost_protect"]["active"] = not is_indoor
            profile["heat_protect"]["active"] = not is_indoor

            # Water default interval by env if species didn't have one
            if not profile["water"].get("interval_days"):
                profile["water"]["interval_days"] = 7
        else:
            profile = new_profile_template(env)
            from_fallback += 1

        # Step 2: Overlay plant-specific care_thresholds
        overlay_old_thresholds(profile, p["care_thresholds"], env)

        # Step 3: Write
        profile_json = json.dumps(profile, ensure_ascii=False)
        db.execute(
            "UPDATE plants SET care_profile = ? WHERE id = ?",
            (profile_json, plant_id),
        )
        updated += 1

    db.commit()

    # Stats
    c = db.execute("SELECT id, name, care_profile FROM plants")
    with_profile = sum(1 for r in c.fetchall() if r[2])
    
    print(f"Plants processed:      {updated}")
    print(f"  From species default: {from_species_default}")
    print(f"  From template:        {from_fallback}")
    print(f"Plants with profile:   {with_profile}")
    if errors:
        print(f"Errors: {errors}")

    # Sample
    print("\nSample profiles:")
    samples = db.execute(
        "SELECT id, name, substr(care_profile, 1, 150) as preview FROM plants WHERE care_profile IS NOT NULL LIMIT 5"
    ).fetchall()
    for s in samples:
        print(f"  #{s['id']} {s['name']}: {s['preview']}...")

    db.close()


if __name__ == "__main__":
    main()
