"""Parity test: new ``compute_plant_warnings()`` must agree with the legacy
``alert_service.compute_top_alert`` on the four legacy care types
(water / fertilize / cold / heat) for every plant in a representative
fixture set.

This guards against regressions during Phase B/C of the care-system migration.
Divergences for *new* care types (repot/mist/rotate/pest_check/dust/prune)
are expected — the test scope is the four legacy types only.

Notes on the legacy signature (verified by reading services/alert_service.py):

    compute_top_alert(
        care_status: str,                   # "good" | "due_today" | "overdue"
        care_thresholds_json: str | None,
        rain: dict | None,                  # {"total_7day_mm": float, ...}
        temp: dict | None,                  # {"days": [{"min": ..., "max": ...}, ...]}
        last_watered: date | None,
        last_fertilized: date | None = None,
        map_type: str = "outdoor",
        most_urgent_care_type: str | None = None,
        in_ground: bool = False,
    ) -> dict | None                        # {"alert_type", "severity", "icon"} | None

The legacy pipeline operates on already-derived ``care_status``/``most_urgent``
(see plant_reader._compute_care_status), so this test derives those the same
way production does before calling the legacy function.
"""
from datetime import date

import pytest


# Maps legacy alert_type values onto new pipeline care_type values for the
# four legacy concerns. Anything not in this map is considered a "new" care
# type and is skipped by the parity assertion.
LEGACY_TO_NEW_CARE_TYPE = {
    "overdue_water": "water",
    "due_water": "water",
    "overdue_fertilize": "fertilize",
    "due_fertilize": "fertilize",
    "drought": "water",          # legacy weather-water alert ≈ new water (no direct frost/heat equivalent)
    "waterlog": "water",
    "cold": "frost_protect",
    "bring_inside": "frost_protect",
    "heat": "heat_protect",
    "fertilise": "fertilize",    # monthly seasonal fertilise tip (note Dutch spelling in legacy)
}

# Care types that exist only in the new pipeline — divergence is expected
# and not a regression.
NEW_ONLY_CARE_TYPES = {"repot", "mist", "rotate", "pest_check", "dust", "prune"}


def _derive_care_status(schedules: list[dict], today_iso: str):
    """Mirror plant_reader._compute_care_status so we feed compute_top_alert
    the same inputs production does.

    Returns (care_status, most_urgent_care_type | None).
    """
    care_status = "good"
    most_urgent_care_type: str | None = None
    today_d = date.fromisoformat(today_iso)
    for s in schedules:
        next_due = s["next_due"]
        if next_due < today_iso:
            care_status = "overdue"
            most_urgent_care_type = s["care_type"]
            break
        if next_due == today_iso:
            if care_status != "overdue":
                care_status = "due_today"
                most_urgent_care_type = s["care_type"]
    # touch today_d to keep linters happy — kept for future days-overdue use.
    _ = today_d
    return care_status, most_urgent_care_type


@pytest.mark.asyncio
async def test_parity_for_representative_plants(seeded_db):
    """For each representative plant: legacy top_alert ≈ new top_warning on
    water/fertilize/cold/heat.

    Fixtures cover:
      * Indoor plant with overdue water schedule + no thresholds.
      * Outdoor container plant with frost + heat thresholds + overdue water +
        weather data that triggers frost.
      * Outdoor in-ground plant with no schedule overdue and benign weather
        (expected: both pipelines silent).
    """
    from services.warnings import compute_plant_warnings
    from services.alert_service import compute_top_alert

    # Seed a minimal `maps` table — the production schema has it but conftest's
    # SCHEMA doesn't include it (warnings code joins on map_type).
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS maps ("
        "  id INTEGER PRIMARY KEY, type TEXT, household_id INTEGER"
        ")"
    )
    await seeded_db.execute(
        "INSERT OR IGNORE INTO maps (id, type, household_id) VALUES (1, 'indoor', 1)"
    )
    await seeded_db.execute(
        "INSERT OR IGNORE INTO maps (id, type, household_id) VALUES (2, 'outdoor', 1)"
    )

    # Plant 1 — indoor, overdue water, no thresholds.
    await seeded_db.execute(
        "INSERT INTO plants (id, name, map_id, container_id, care_thresholds, household_id, is_active) "
        "VALUES (1, 'Indoor Monstera', 1, 5, NULL, 1, 1)"
    )
    # Plant 2 — outdoor container, frost thresholds, overdue water.
    await seeded_db.execute(
        "INSERT INTO plants (id, name, map_id, container_id, care_thresholds, household_id, is_active) "
        "VALUES (2, 'Outdoor tomato', 2, 7, "
        "  '{\"min_temp_c\": 0, \"max_temp_c\": 30, \"bring_inside_below_c\": 5}', 1, 1)"
    )
    # Plant 3 — outdoor in-ground, no overdue schedule, benign weather.
    await seeded_db.execute(
        "INSERT INTO plants (id, name, map_id, ground_zone_id, care_thresholds, household_id, is_active) "
        "VALUES (3, 'Border perennial', 2, 'bed_1', NULL, 1, 1)"
    )

    await seeded_db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, next_due, is_active) "
        "VALUES (1, 'water', '2026-05-13', 1)"
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, next_due, is_active) "
        "VALUES (2, 'water', '2026-05-13', 1)"
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, next_due, is_active) "
        "VALUES (3, 'water', '2026-06-01', 1)"
    )
    await seeded_db.commit()

    today = date(2026, 5, 16)
    today_iso = today.isoformat()

    # Weather: cold week — frost-triggering for the outdoor container plant.
    weather = {
        "temp": {"days": [{"min": -2, "max": 8}, {"min": -1, "max": 9}]},
        "rain": {"total_7day_mm": 12.0, "total_14day_mm": 24.0},
    }

    plant_rows = await seeded_db.execute_fetchall(
        "SELECT p.id, p.map_id, p.container_id, p.ground_zone_id, p.care_thresholds, "
        "       m.type AS map_type "
        "FROM plants p LEFT JOIN maps m ON p.map_id = m.id "
        "WHERE p.is_active = 1"
    )

    divergences: list[str] = []
    for row in plant_rows:
        plant = dict(row)
        schedule_rows = await seeded_db.execute_fetchall(
            "SELECT care_type, next_due, last_done FROM care_schedules "
            "WHERE plant_id = ? AND is_active = 1",
            (plant["id"],),
        )
        schedules = [dict(s) for s in schedule_rows]

        care_status, most_urgent = _derive_care_status(schedules, today_iso)
        in_ground = plant.get("ground_zone_id") is not None
        map_type = plant.get("map_type") or "outdoor"

        # OLD pipeline.
        old_top = compute_top_alert(
            care_status=care_status,
            care_thresholds_json=plant.get("care_thresholds"),
            rain=weather["rain"],
            temp=weather["temp"],
            last_watered=None,
            last_fertilized=None,
            map_type=map_type,
            most_urgent_care_type=most_urgent,
            in_ground=in_ground,
        )

        # NEW pipeline.
        new_state = compute_plant_warnings(
            plant, schedules, weather=weather, today=today
        )

        # Both silent → trivially in agreement.
        if old_top is None and new_state.top_warning is None:
            continue

        # One silent, the other not — only count as divergence if the loud
        # side's care_type is a legacy concern. New-only care types firing
        # while the legacy pipeline is silent is *expected*.
        if old_top is None and new_state.top_warning is not None:
            if new_state.top_warning.care_type in NEW_ONLY_CARE_TYPES:
                continue
            divergences.append(
                f"plant {plant['id']}: legacy=None, "
                f"new={new_state.top_warning.care_type}/{new_state.top_warning.severity}"
            )
            continue
        if old_top is not None and new_state.top_warning is None:
            legacy_type = old_top.get("alert_type")
            divergences.append(
                f"plant {plant['id']}: legacy={legacy_type}/{old_top.get('severity')}, new=None"
            )
            continue

        # Both fire — compare normalised care types.
        legacy_alert_type = old_top.get("alert_type")
        legacy_normalised = LEGACY_TO_NEW_CARE_TYPE.get(legacy_alert_type, legacy_alert_type)
        new_care_type = new_state.top_warning.care_type

        # If the new pipeline surfaces a new-only care type as top, that's
        # an expected divergence (legacy didn't model it). The legacy alert
        # is still asserted indirectly by other plants in the loop.
        if new_care_type in NEW_ONLY_CARE_TYPES:
            continue

        if legacy_normalised != new_care_type:
            divergences.append(
                f"plant {plant['id']}: "
                f"legacy top_alert={legacy_alert_type} (→ {legacy_normalised}), "
                f"new top_warning.care_type={new_care_type}"
            )

    if divergences:
        msg = "Parity divergences detected:\n  " + "\n  ".join(divergences)
        pytest.fail(msg)
