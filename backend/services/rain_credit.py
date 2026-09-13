"""Let rain move a watering deadline, so the clock stops being wrong.

Suppressing a warning on a plant the schedule still calls overdue leaves two
answers on screen: a calm line saying the soil is wet, and a counter climbing
past "14 dagen te laat". Both are true and together they are nonsense, and every
surface has to learn the suppression separately — the plant page did, the map
badge did not.

So this moves the deadline instead. When `assess_moisture` says the root zone
still holds water, `next_due` goes forward by the days of water the model says
are left. Nothing downstream needs to know: the badge, the push, the dashboard
and the digest all read `next_due` and all go quiet at once, for the ordinary
reason that the plant is not due.

What it deliberately does not do:

- **Never writes `care_log`, never touches `last_done`.** Those are the record
  of what a person did. Rain is not a watering, and a log that says Leon
  watered on a day he did not is worse than any reminder.
- **Never pushes a plant further out than a real watering would.** The credit is
  capped at one interval from today, so a wet fortnight cannot quietly turn a
  5-day blueberry into a month-long one.
- **Never moves a deadline that has not arrived.** Only due or overdue schedules
  are credited; an early forecast does not get to reschedule anything.
- **Never touches indoor plants**, where there is no moisture signal at all, or
  ephemeral schedules, which belong to the moisture-check flow.

The still-moist warning stays as the explanation: `compute_plant_warnings`
recognises a credited schedule (its natural deadline has passed but `next_due`
has not) and says why the plant is not on the list.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from services.local_time import local_today
from services.scheduling import calculate_effective_interval
from services.water_pressure import (
    WeatherDay,
    assess_moisture,
    exposure_from_sun_hours,
)

logger = logging.getLogger(__name__)


def environment_for_row(row: dict) -> str:
    if row.get("map_type") == "indoor":
        return "indoor"
    return "outdoor_container" if row.get("container_id") is not None else "outdoor_ground"


def _as_date(value) -> date | None:
    if value is None:
        return None
    if hasattr(value, "date") and not isinstance(value, date):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def credited_next_due(
    *,
    row: dict,
    today: date,
    weather_days: list[WeatherDay],
) -> date | None:
    """The new deadline rain has earned this schedule, or None to leave it be.

    Pure: no DB, no clock. `None` is the answer for everything the credit is not
    allowed to touch, so the caller never has to repeat the rules.
    """
    next_due = _as_date(row.get("next_due"))
    if next_due is None or next_due > today:
        return None
    if environment_for_row(row) == "indoor":
        return None

    interval = row.get("interval_days")
    if not interval or int(interval) < 1:
        return None

    assessment = assess_moisture(
        environment=environment_for_row(row),
        today=today,
        last_watered=_as_date(row.get("last_done")),
        weather_days=weather_days,
        mulch=row.get("mulch"),
        exposure=exposure_from_sun_hours(row.get("measured_sun_hours")),
    )
    if assessment.verdict != "moist":
        return None

    # The model already answers "how long will this last"; a measured wet
    # topsoil has no such number, so it earns one day at a time.
    days_left = assessment.factors.get("days_of_water_left")
    granted = int(days_left) if isinstance(days_left, (int, float)) else 1
    granted = max(1, granted)

    # A credit can never buy more time than actually watering the plant would.
    ceiling = calculate_effective_interval(
        int(interval), row.get("season_adjust"), today,
    )
    granted = min(granted, max(1, ceiling))

    credited = today + timedelta(days=granted)
    return credited if credited > next_due else None


def weather_days_from_rows(rows: list[dict]) -> list[WeatherDay]:
    days: list[WeatherDay] = []
    for raw in rows or []:
        day = _as_date(raw.get("date"))
        if day is None:
            continue
        days.append(WeatherDay(
            date=day,
            max_temp_c=float(raw.get("max_temp_c") or 0.0),
            precipitation_mm=float(raw.get("precipitation_mm") or 0.0),
            et0_mm=float(raw.get("et0_mm") or 0.0),
            humidity_pct=raw.get("humidity_pct"),
            soil_moisture_pct=raw.get("soil_moisture_pct"),
        ))
    return days


async def apply_rain_credit(db, *, household_id: int, today: date | None = None) -> dict:
    """Move every due watering deadline that the rain has already covered."""
    from services.weather_forecast import get_usable_forecast_days

    today = today or local_today()

    due_rows = await db.execute_fetchall(
        """SELECT cs.id, cs.next_due, cs.last_done, cs.interval_days, cs.season_adjust,
                  p.container_id, p.ground_zone_id, p.mulch, p.measured_sun_hours,
                  m.map_type
           FROM care_schedules cs
           JOIN plants p ON p.id = cs.plant_id
           LEFT JOIN maps m ON m.id = p.map_id
           WHERE cs.care_type = 'water' AND cs.is_active = 1 AND cs.is_ephemeral = 0
             AND cs.next_due IS NOT NULL AND cs.next_due <= ?
             AND p.is_active = 1 AND p.household_id = ?""",
        (today, household_id),
    )
    outdoor = [dict(row) for row in due_rows
               if environment_for_row(dict(row)) != "indoor"]
    if not outdoor:
        return {"credited": 0, "considered": 0}

    coordinates = await db.execute_fetchall(
        """SELECT lat, lon FROM maps
           WHERE household_id = ? AND map_type = 'outdoor'
             AND lat IS NOT NULL AND lon IS NOT NULL
           ORDER BY id LIMIT 1""",
        (household_id,),
    )
    if not coordinates:
        return {"credited": 0, "considered": len(outdoor)}
    weather_days = weather_days_from_rows(
        await get_usable_forecast_days(coordinates[0]["lat"], coordinates[0]["lon"])
    )
    if not weather_days:
        return {"credited": 0, "considered": len(outdoor)}

    credited = 0
    for row in outdoor:
        new_due = credited_next_due(row=row, today=today, weather_days=weather_days)
        if new_due is None:
            continue
        await db.execute(
            # `notified_for_due` is cleared alongside: it records the deadline a
            # push already went out for, and this is a different deadline. Left
            # stale, the reminder for the new date would be swallowed as a
            # duplicate of the old one.
            "UPDATE care_schedules SET next_due = ?, notified_for_due = NULL WHERE id = ?",
            (new_due, row["id"]),
        )
        credited += 1
    if credited:
        await db.commit()
        logger.info(
            "Rain credited %d watering deadline(s) for household %s", credited, household_id,
        )
    return {"credited": credited, "considered": len(outdoor)}
