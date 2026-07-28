"""Ephemeral care schedules derived from weather and canonical care profiles."""
from datetime import date
import json

from database import get_db
from services.care_profile import environment_for_plant, load_care_profile
from services.warnings import canonical_weather_warning_id_for_fields


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

    forecast = days[-1]
    raw_date = forecast.get("date")
    forecast_date = date.fromisoformat(raw_date) if raw_date else date.today()
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
    today = date.today()

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

    await db.commit()
    return {
        "created": created,
        "deleted": deleted,
        "warning_weather": {"temp": {"days": weather["temp_days"]}},
    }
