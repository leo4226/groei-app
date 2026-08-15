"""Ephemeral care schedules derived from weather and canonical care profiles."""
from datetime import date, datetime
import json

from database import get_db
from services.care_profile import environment_for_plant, load_care_profile
from services.warnings import canonical_weather_warning_id_for_fields
from services.local_time import local_today


def _as_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def weather_task_metadata(notes: str | None) -> dict | None:
    if not notes:
        return None
    try:
        metadata = json.loads(notes)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(metadata, dict) or not metadata.get("weather_warning_id"):
        return None
    return metadata


def _weather_task_notes(
    *,
    household_id: int,
    care_type: str,
    forecast_date: date,
    severity: str,
    metric: str,
    value: float,
    threshold: float,
) -> str:
    return json.dumps({
        "weather_warning_id": canonical_weather_warning_id_for_fields(
            household_id,
            care_type,
            forecast_date,
            severity,
        ),
        "care_type": care_type,
        "forecast_date": forecast_date.isoformat(),
        "severity": severity,
        "metric": metric,
        "value": value,
        "threshold": threshold,
    })


# Heat-triggered extra watering moments (#785). The bar is the Dutch heatwave
# level; indoor plants use the outdoor forecast as a proxy because there is no
# indoor sensor (same convention as the Water pressure model).
HEAT_WATER_MAX_TEMP_C = 30.0
HEAT_WATER_KIND = "heat_water"


def heat_water_notes(
    *,
    forecast_date: date,
    max_temp_c: float,
) -> str:
    return json.dumps({
        "kind": HEAT_WATER_KIND,
        "care_type": "water",
        "forecast_date": forecast_date.isoformat(),
        "max_temp_c": max_temp_c,
        "threshold_c": HEAT_WATER_MAX_TEMP_C,
    })


def heat_water_metadata(notes: str | None) -> dict | None:
    """Return parsed heat-water metadata, or None when notes are not ours."""
    if not notes:
        return None
    try:
        metadata = json.loads(notes)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(metadata, dict) or metadata.get("kind") != HEAT_WATER_KIND:
        return None
    return metadata


async def _get_cached_weather() -> dict:
    """Return today's cached min/max temperature values."""
    from services.environment import get_temp_data

    temp_data = await get_temp_data()
    days = temp_data.get("days", [])
    if not days:
        return {
            "temp_days": [],
            "min_24h": None,
            "max_24h": None,
            "forecast_date": None,
        }

    # The cached forecast is ordered chronologically (index 0 = today, from
    # Open-Meteo with past_days=0). The heat/frost task for "today" must use
    # today's values; picking the last day used to anchor tasks to the far end
    # of the 7-day window (#785).
    forecast = days[0]
    raw_date = forecast.get("date")
    forecast_date = date.fromisoformat(raw_date) if raw_date else local_today()
    return {
        "temp_days": days,
        "min_24h": forecast["min"],
        "max_24h": forecast["max"],
        "forecast_date": forecast_date,
    }


async def sync_ephemeral_schedules(db=None) -> dict:
    """Synchronize weather-driven one-shot schedules.

    A supplied connection is reused by Calendar/digest callers. Without one, a
    short-lived connection is opened for the dashboard path.
    """
    if db is None:
        async with get_db() as own_db:
            return await _sync_transactionally(own_db)
    return await _sync_transactionally(db)


async def _sync_transactionally(db) -> dict:
    """Use one transaction in production; SQLite-style test doubles stay valid."""
    transaction = getattr(db, "transaction", None)
    if transaction is None:
        return await _sync_ephemeral_schedules(db)
    async with transaction():
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
        if rows:
            await db.execute(
                """UPDATE care_schedules SET is_active = FALSE
                   WHERE plant_id = ? AND care_type IN (?, ?)
                     AND is_ephemeral = 1 AND is_active = 1""",
                (plant_id, canonical_type, legacy_type),
            )
        return 0, len(rows)

    # Always establish the canonical winner before touching a legacy alias.
    # A concurrent sync can insert the same winner after our read; the partial
    # unique index and ON CONFLICT turn that race into an idempotent no-op.
    inserted = await db.execute_fetchall(
        """INSERT INTO care_schedules
           (plant_id, care_type, interval_days, next_due, is_ephemeral, notes)
           VALUES (?, ?, 1, ?, 1, ?)
           ON CONFLICT DO NOTHING
           RETURNING id""",
        (plant_id, canonical_type, today, notes),
    )
    if not inserted:
        await db.execute(
            """UPDATE care_schedules
               SET next_due = ?, notes = ?
               WHERE plant_id = ? AND care_type = ?
                 AND is_ephemeral = 1 AND is_active = 1""",
            (today, notes, plant_id, canonical_type),
        )

    canonical_rows = [row for row in rows if row["care_type"] == canonical_type]
    legacy_rows = [row for row in rows if row["care_type"] == legacy_type]
    if legacy_rows:
        if canonical_rows:
            await db.execute(
                """UPDATE care_schedules SET is_active = FALSE
                   WHERE plant_id = ? AND care_type = ?
                     AND is_ephemeral = 1 AND is_active = 1""",
                (plant_id, legacy_type),
            )
        else:
            # The canonical insert replaces a lone legacy task. Removing the
            # superseded ephemeral row preserves the one-row canonical shape.
            await db.execute(
                """DELETE FROM care_schedules
                   WHERE plant_id = ? AND care_type = ?
                     AND is_ephemeral = 1 AND is_active = 1""",
                (plant_id, legacy_type),
            )

    created = int(bool(inserted) and not rows)
    return created, len(legacy_rows)


async def _sync_ephemeral_schedules(db) -> dict:
    created = 0
    deleted = 0
    today = local_today()

    weather = await _get_cached_weather()
    min_24h = weather["min_24h"]
    max_24h = weather["max_24h"]
    if min_24h is None and max_24h is None:
        return {"created": 0, "deleted": 0, "warning_weather": None}

    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.household_id, p.container_id, p.ground_zone_id,
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
        household_id = plant["household_id"]
        forecast_date = weather["forecast_date"] or today

        frost = profile.get("frost_protect") or {}
        frost_thresholds = frost.get("thresholds") or {}
        bring_inside = frost_thresholds.get("bring_inside_below_c")
        min_temp = frost_thresholds.get("min_temp_c")
        frost_triggered = bool(
            frost.get("active")
            and bring_inside is not None
            and min_24h is not None
            and min_24h < bring_inside
        )
        frost_severity = (
            "urgent"
            if min_temp is not None and min_24h is not None and min_24h <= min_temp
            else "warning"
        )
        frost_notes = _weather_task_notes(
            household_id=household_id,
            care_type="frost_protect",
            forecast_date=forecast_date,
            severity=frost_severity,
            metric="min_temp_c",
            value=min_24h,
            threshold=bring_inside,
        ) if frost_triggered else None
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
        heat_notes = _weather_task_notes(
            household_id=household_id,
            care_type="heat_protect",
            forecast_date=forecast_date,
            severity="urgent",
            metric="max_temp_c",
            value=max_24h,
            threshold=max_temp,
        ) if heat_triggered else None
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

    # ── Heat-triggered extra watering moments (#785) ────────────────────
    # One active ephemeral `water` row per plant (partial unique index in
    # migration 0061). The row is an informational extra watering moment in
    # the Calendar and the synced agenda: it never alters the regular water
    # interval or deadline, and completing the plant's regular water advances
    # the canonical schedule from the actual date as usual.
    eligible_water = await db.execute_fetchall(
        """SELECT p.id AS plant_id,
                  reg.next_due AS water_next_due,
                  reg.last_done AS water_last_done
           FROM plants p
           JOIN maps m ON p.map_id = m.id
           JOIN care_schedules reg
             ON reg.plant_id = p.id AND reg.care_type = 'water'
            AND reg.is_active = 1 AND reg.is_ephemeral = 0
           WHERE p.is_active = 1
             AND m.map_type IN ('outdoor', 'indoor')
           ORDER BY p.id"""
    )

    temp_days = weather.get("temp_days") or []
    qualifying = [
        day for day in temp_days
        if day.get("date") is not None
        and _as_date(day["date"]) >= today
        and day["max"] >= HEAT_WATER_MAX_TEMP_C
    ]
    nearest = min(qualifying, key=lambda day: day["date"]) if qualifying else None
    target_date = _as_date(nearest["date"]) if nearest else None

    existing_water = await db.execute_fetchall(
        """SELECT id, plant_id FROM care_schedules
           WHERE is_ephemeral = 1 AND is_active = 1 AND care_type = 'water'"""
    )
    existing_by_plant = {row["plant_id"]: row for row in existing_water}

    for row in eligible_water:
        plant_id = row["plant_id"]
        target = target_date
        if target is not None:
            # No extra moment on the plant's own regular watering day, and none
            # once the plant has already been watered on/after the hot day.
            if row["water_next_due"] is not None and _as_date(row["water_next_due"]) == target:
                target = None
            elif row["water_last_done"] is not None and _as_date(row["water_last_done"]) >= target:
                target = None
        active = existing_by_plant.get(plant_id)
        if target is None:
            if active is not None:
                await db.execute(
                    "UPDATE care_schedules SET is_active = FALSE WHERE id = ?",
                    (active["id"],),
                )
                deleted += 1
            continue
        notes = heat_water_notes(
            forecast_date=target,
            max_temp_c=float(nearest["max"]),
        )
        if active is not None:
            await db.execute(
                """UPDATE care_schedules
                   SET next_due = ?, notes = ?
                   WHERE id = ?""",
                (target, notes, active["id"]),
            )
            continue
        inserted = await db.execute_fetchall(
            """INSERT INTO care_schedules
               (plant_id, care_type, interval_days, next_due, is_ephemeral,
                rhythm_opt_out, notes)
               VALUES (?, 'water', 1, ?, 1, 1, ?)
               ON CONFLICT DO NOTHING
               RETURNING id""",
            (plant_id, target, notes),
        )
        if inserted:
            created += 1

    # Clean up heat-water rows for plants that lost their regular water
    # schedule or moved to an unsupported map.
    stale_water = await db.execute_fetchall(
        """SELECT cs.id FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE cs.is_ephemeral = 1 AND cs.is_active = 1
             AND cs.care_type = 'water'
             AND (
               p.is_active = 0
               OR COALESCE(m.map_type, 'outdoor') NOT IN ('outdoor', 'indoor')
               OR NOT EXISTS (
                   SELECT 1 FROM care_schedules reg
                   WHERE reg.plant_id = p.id AND reg.care_type = 'water'
                     AND reg.is_active = 1 AND reg.is_ephemeral = 0
               )
             )"""
    )
    for row in stale_water:
        await db.execute(
            "UPDATE care_schedules SET is_active = FALSE WHERE id = ?",
            (row["id"],),
        )
        deleted += 1

    await db.commit()
    return {
        "created": created,
        "deleted": deleted,
        "warning_weather": {"temp": {"days": weather["temp_days"]}},
    }
