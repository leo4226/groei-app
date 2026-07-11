"""Ephemeral care schedules derived from weather and canonical care profiles."""
from datetime import date

from database import get_db
from services.care_profile import environment_for_plant, load_care_profile


async def _get_cached_weather() -> dict:
    """Return today's cached min/max temperature values."""
    from services.environment import get_temp_data

    temp_data = await get_temp_data()
    days = temp_data.get("days", [])
    if not days:
        return {"temp_days": [], "min_24h": None, "max_24h": None}

    today = days[-1]
    return {
        "temp_days": days,
        "min_24h": today["min"],
        "max_24h": today["max"],
    }


async def sync_ephemeral_schedules(db=None) -> dict:
    """Synchronize weather-driven one-shot schedules.

    A supplied connection is reused by Calendar/digest callers. Without one, a
    short-lived connection is opened for the dashboard path.
    """
    if db is None:
        async with get_db() as own_db:
            return await _sync_ephemeral_schedules(own_db)
    return await _sync_ephemeral_schedules(db)


async def _sync_weather_type(
    db,
    *,
    plant_id: int,
    canonical_type: str,
    legacy_type: str,
    triggered: bool,
    today: date,
    notes: str | None,
) -> tuple[int, int]:
    """Create/update one canonical row or deactivate all stale aliases."""
    rows = await db.execute_fetchall(
        """SELECT id, care_type FROM care_schedules
           WHERE plant_id = ? AND care_type IN (?, ?)
             AND is_ephemeral = 1 AND is_active = 1
           ORDER BY id DESC""",
        (plant_id, canonical_type, legacy_type),
    )

    if not triggered:
        for row in rows:
            await db.execute(
                "UPDATE care_schedules SET is_active = FALSE WHERE id = ?",
                (row["id"],),
            )
        return 0, len(rows)

    if not rows:
        await db.execute(
            """INSERT INTO care_schedules
               (plant_id, care_type, interval_days, next_due, is_ephemeral, notes)
               VALUES (?, ?, 1, ?, 1, ?)""",
            (plant_id, canonical_type, today, notes),
        )
        return 1, 0

    keeper = rows[0]
    # Canonicalize rolling-deploy leftovers in place and keep the one-shot due
    # today so opening Calendar always reflects current conditions.
    await db.execute(
        """UPDATE care_schedules
           SET care_type = ?, next_due = ?, notes = ?
           WHERE id = ?""",
        (canonical_type, today, notes, keeper["id"]),
    )
    for duplicate in rows[1:]:
        await db.execute(
            "UPDATE care_schedules SET is_active = FALSE WHERE id = ?",
            (duplicate["id"],),
        )
    return 0, max(0, len(rows) - 1)


async def _sync_ephemeral_schedules(db) -> dict:
    created = 0
    deleted = 0
    today = date.today()

    weather = await _get_cached_weather()
    min_24h = weather["min_24h"]
    max_24h = weather["max_24h"]
    if min_24h is None and max_24h is None:
        return {"created": 0, "deleted": 0}

    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.container_id, p.ground_zone_id,
                  p.care_profile, p.care_thresholds, m.map_type
           FROM plants p
           JOIN maps m ON p.map_id = m.id
           WHERE p.is_active = 1 AND m.map_type = 'outdoor'"""
    )

    for raw_plant in plant_rows:
        plant = dict(raw_plant)
        profile = load_care_profile(
            plant.get("care_profile"),
            plant.get("care_thresholds"),
            environment_for_plant(plant),
        )
        plant_id = plant["id"]

        frost = profile.get("frost_protect") or {}
        frost_thresholds = frost.get("thresholds") or {}
        bring_inside = frost_thresholds.get("bring_inside_below_c")
        frost_triggered = bool(
            frost.get("active")
            and bring_inside is not None
            and min_24h is not None
            and min_24h < bring_inside
        )
        frost_notes = (
            f"Min {min_24h}°C (grens {bring_inside}°C)"
            if frost_triggered else None
        )
        new_count, removed_count = await _sync_weather_type(
            db,
            plant_id=plant_id,
            canonical_type="frost_protect",
            legacy_type="protect_cold",
            triggered=frost_triggered,
            today=today,
            notes=frost_notes,
        )
        created += new_count
        deleted += removed_count

        heat = profile.get("heat_protect") or {}
        heat_thresholds = heat.get("thresholds") or {}
        max_temp = heat_thresholds.get("max_temp_c")
        heat_triggered = bool(
            heat.get("active")
            and max_temp is not None
            and max_24h is not None
            and max_24h > max_temp
        )
        heat_notes = (
            f"Max {max_24h}°C (grens {max_temp}°C)"
            if heat_triggered else None
        )
        new_count, removed_count = await _sync_weather_type(
            db,
            plant_id=plant_id,
            canonical_type="heat_protect",
            legacy_type="protect_heat",
            triggered=heat_triggered,
            today=today,
            notes=heat_notes,
        )
        created += new_count
        deleted += removed_count

    # Weather tasks never belong to indoor or archived plants. Include legacy
    # keys so a migration/rolling deploy cannot strand an actionable row.
    stale_rows = await db.execute_fetchall(
        """SELECT cs.id FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE cs.is_ephemeral = 1 AND cs.is_active = 1
             AND cs.care_type IN (
                 'frost_protect', 'heat_protect', 'protect_cold', 'protect_heat'
             )
             AND (p.is_active = 0 OR COALESCE(m.map_type, 'outdoor') = 'indoor')"""
    )
    for row in stale_rows:
        await db.execute(
            "UPDATE care_schedules SET is_active = FALSE WHERE id = ?",
            (row["id"],),
        )
        deleted += 1

    await db.commit()
    return {"created": created, "deleted": deleted}
