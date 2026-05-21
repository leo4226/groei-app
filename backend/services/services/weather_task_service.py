"""Ephemeral care schedule generation from weather + plant thresholds.

Called before the dashboard query to ensure weather-driven tasks
(protect_cold, protect_heat) exist when conditions are met.
"""
import json
from datetime import date

from database import get_db


async def _get_cached_weather() -> dict:
    """Return {temp_days: [...], min_24h: float, max_24h: float}.
    Uses temp data from plant_care module's open-meteo cache.
    """
    from routers.plant_care import _get_temp_data
    temp_data = await _get_temp_data()
    days = temp_data.get("days", [])
    if not days:
        return {"temp_days": [], "min_24h": None, "max_24h": None}

    today = days[-1]
    return {
        "temp_days": days,
        "min_24h": today["min"],
        "max_24h": today["max"],
    }


async def sync_ephemeral_schedules() -> dict:
    """Create/delete ephemeral care_schedules based on weather + plant thresholds.

    Returns summary: {created: int, deleted: int}
    """
    created = 0
    deleted = 0
    today = date.today().isoformat()

    async with get_db() as db:
        weather = await _get_cached_weather()
        min_24h = weather["min_24h"]
        max_24h = weather["max_24h"]

        if min_24h is None and max_24h is None:
            return {"created": 0, "deleted": 0}

        # Fetch outdoor plants with care_thresholds
        threshold_rows = await db.execute_fetchall("""
            SELECT p.id, p.care_thresholds, p.map_id
            FROM plants p
            JOIN maps m ON p.map_id = m.id
            WHERE p.is_active = 1
              AND m.map_type = 'outdoor'
              AND p.care_thresholds IS NOT NULL
              AND p.care_thresholds != ''
        """)
        threshold_rows = [dict(r) for r in threshold_rows]

        for plant in threshold_rows:
            try:
                thresholds = json.loads(plant["care_thresholds"])
            except (json.JSONDecodeError, TypeError):
                continue

            plant_id = plant["id"]
            bring_inside = thresholds.get("bring_inside_below_c")
            min_temp = thresholds.get("min_temp_c")
            max_temp = thresholds.get("max_temp_c")

            # Only generate bring_inside ephemeral tasks (protect_cold removed —
            # the ❄️ cold weather alert already covers temperature awareness)
            if bring_inside is not None and min_24h is not None and min_24h < bring_inside:
                existing = await db.execute_fetchall(
                    """SELECT id FROM care_schedules
                       WHERE plant_id = ? AND care_type = 'protect_cold'
                       AND is_ephemeral = 1 AND is_active = 1
                       ORDER BY id DESC""",
                    (plant_id,),
                )
                if not existing:
                    label = f"Min {min_24h}°C (grens {bring_inside}°C)"
                    await db.execute(
                        """INSERT INTO care_schedules
                           (plant_id, care_type, interval_days, next_due, is_ephemeral, notes)
                           VALUES (?, 'protect_cold', 1, ?, 1, ?)""",
                        (plant_id, today, label),
                    )
                    created += 1
                else:
                    for dup in existing[1:]:
                        await db.execute("UPDATE care_schedules SET is_active = 0 WHERE id = ?", (dup["id"],))
                        deleted += 1
            else:
                # No bring_inside trigger — delete any stale ephemeral cold task
                stale = await db.execute_fetchall(
                    """SELECT id FROM care_schedules
                       WHERE plant_id = ? AND care_type = 'protect_cold'
                       AND is_ephemeral = 1 AND is_active = 1""",
                    (plant_id,),
                )
                for s in stale:
                    await db.execute(
                        "UPDATE care_schedules SET is_active = 0 WHERE id = ?",
                        (s["id"],),
                    )
                    deleted += 1

            # Check heat threshold
            heat_trigger = None
            heat_label = None
            if max_temp is not None and max_24h is not None and max_24h > max_temp:
                heat_trigger = True
                heat_label = f"Max {max_24h}°C (grens {max_temp}°C)"

            if heat_trigger:
                existing = await db.execute_fetchall(
                    """SELECT id FROM care_schedules
                       WHERE plant_id = ? AND care_type = 'protect_heat'
                       AND is_ephemeral = 1 AND is_active = 1
                       ORDER BY id DESC""",
                    (plant_id,),
                )
                if existing:
                    for dup in existing[1:]:
                        await db.execute("UPDATE care_schedules SET is_active = 0 WHERE id = ?", (dup["id"],))
                        deleted += 1
                else:
                    await db.execute(
                        """INSERT INTO care_schedules
                           (plant_id, care_type, interval_days, next_due, is_ephemeral, notes)
                           VALUES (?, 'protect_heat', 1, ?, 1, ?)""",
                        (plant_id, today, heat_label),
                    )
                    created += 1
            else:
                stale = await db.execute_fetchall(
                    """SELECT id FROM care_schedules
                       WHERE plant_id = ? AND care_type = 'protect_heat'
                       AND is_ephemeral = 1 AND is_active = 1""",
                    (plant_id,),
                )
                for s in stale:
                    await db.execute(
                        "UPDATE care_schedules SET is_active = 0 WHERE id = ?",
                        (s["id"],),
                    )
                    deleted += 1

        # Clean up ephemeral tasks for plants moved indoors
        indoor_ephemeral = await db.execute_fetchall("""
            SELECT cs.id FROM care_schedules cs
            JOIN plants p ON cs.plant_id = p.id
            JOIN maps m ON p.map_id = m.id
            WHERE cs.is_ephemeral = 1 AND cs.is_active = 1
              AND m.map_type = 'indoor'
        """)
        for s in indoor_ephemeral:
            await db.execute(
                "UPDATE care_schedules SET is_active = 0 WHERE id = ?",
                (s["id"],),
            )
            deleted += 1

        await db.commit()

    return {"created": created, "deleted": deleted}
