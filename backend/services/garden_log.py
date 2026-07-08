"""Garden-wide watering and fertilizing log + water status.

The garden log captures household-level "I watered the whole garden today" or
"I fertilized everything today" events, distinct from per-Plant Care logs.
Logging an event also marks every active matching Care schedule as done.

Public API:
    get_last_garden_watered(household_id) -> date | None
    get_last_garden_fertilized(household_id) -> date | None
    log_garden_water(db, watered_at, watered_by, water_amount, household_id) -> int   (schedules updated)
    log_garden_fertilize(db, fertilized_at, fertilized_by, household_id) -> int
    compute_water_status(rain_14d, rain_7d, days_since_watered) -> dict
"""
from datetime import date


def _as_date(val):
    """Handle both date objects (asyncpg) and ISO strings (SQLite)."""
    if isinstance(val, date):
        return val
    return date.fromisoformat(val)


from database import get_db


# ── recent-event queries ─────────────────────────────────────────────────────

async def get_last_garden_watered(household_id: int, db=None) -> date | None:
    """Return the most recent garden watering date for *household_id*, or None."""
    if db is None:
        async with get_db() as conn:
            rows = await conn.execute_fetchall(
                "SELECT id, watered_at FROM garden_water_log WHERE household_id = ? ORDER BY watered_at DESC LIMIT 1",
                (household_id,),
            )
    else:
        rows = await db.execute_fetchall(
            "SELECT id, watered_at FROM garden_water_log WHERE household_id = ? ORDER BY watered_at DESC LIMIT 1",
            (household_id,),
        )
    if not rows:
        return None
    return _as_date(rows[0]["watered_at"])


async def get_last_garden_fertilized(household_id: int, db=None) -> date | None:
    """Return the most recent garden fertilize date for *household_id*, or None."""
    if db is None:
        async with get_db() as conn:
            rows = await conn.execute_fetchall(
                "SELECT id, fertilized_at FROM garden_fertilize_log WHERE household_id = ? ORDER BY fertilized_at DESC LIMIT 1",
                (household_id,),
            )
    else:
        rows = await db.execute_fetchall(
            "SELECT id, fertilized_at FROM garden_fertilize_log WHERE household_id = ? ORDER BY fertilized_at DESC LIMIT 1",
            (household_id,),
        )
    if not rows:
        return None
    return _as_date(rows[0]["fertilized_at"])


# ── event logging (mutates DB) ───────────────────────────────────────────────

async def log_garden_water(db, watered_at: date, watered_by: int | None, water_amount: float | None, household_id: int) -> int:
    """Insert a new garden water log entry and mark all active water schedules as done.

    Returns the number of schedules updated. Caller is responsible for commit.
    """
    from services.scheduling import calculate_next_due

    await db.execute("DELETE FROM garden_water_log WHERE household_id = ?", (household_id,))
    await db.execute(
        "INSERT INTO garden_water_log (watered_at, watered_by, water_amount, household_id) VALUES (?, ?, ?, ?)",
        (watered_at, watered_by, water_amount, household_id),
    )

    schedules = await db.execute_fetchall(
        """SELECT cs.id, cs.interval_days, cs.season_adjust
           FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.care_type = 'water' AND cs.is_active = 1 AND p.is_active = 1 AND p.household_id = ?""",
        (household_id,),
    )
    updated = 0
    for s in schedules:
        next_due = calculate_next_due(watered_at, s["interval_days"], s["season_adjust"])
        await db.execute(
            "UPDATE care_schedules SET last_done = ?, next_due = ? WHERE id = ?",
            (watered_at, next_due, s["id"]),
        )
        updated += 1
    return updated


async def log_garden_fertilize(db, fertilized_at: date, fertilized_by: int | None, household_id: int) -> int:
    """Insert a new garden fertilize log entry and mark all active fertilize schedules as done.

    Returns the number of schedules updated. Caller is responsible for commit.
    """
    from services.scheduling import calculate_next_due

    await db.execute("DELETE FROM garden_fertilize_log WHERE household_id = ?", (household_id,))
    await db.execute(
        "INSERT INTO garden_fertilize_log (fertilized_at, fertilized_by, household_id) VALUES (?, ?, ?)",
        (fertilized_at, fertilized_by, household_id),
    )

    schedules = await db.execute_fetchall(
        """SELECT cs.id, cs.interval_days, cs.season_adjust
           FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.care_type = 'fertilize' AND cs.is_active = 1 AND p.is_active = 1 AND p.household_id = ?""",
        (household_id,),
    )
    updated = 0
    for s in schedules:
        next_due = calculate_next_due(fertilized_at, s["interval_days"], s["season_adjust"])
        await db.execute(
            "UPDATE care_schedules SET last_done = ?, next_due = ? WHERE id = ?",
            (fertilized_at, next_due, s["id"]),
        )
        updated += 1
    return updated


# ── water status (read-only, derived from rain + last-watered) ──────────────

_WEEKLY_ET_BUDGET: dict[str, float] = {
    "winter":  5,
    "spring": 18,
    "summer": 25,
    "autumn": 10,
}


def compute_water_status(rain_14d: float, rain_7d: float, days_since_watered: int | None) -> dict:
    """Compute garden water status from 14-day rainfall against a biweekly ET budget."""
    from services.scheduling import get_current_season
    season = get_current_season()
    weekly_budget = _WEEKLY_ET_BUDGET[season]
    biweekly_budget = weekly_budget * 2
    covered = rain_14d / biweekly_budget if biweekly_budget else 1.0
    watered_recently = days_since_watered is not None and days_since_watered <= 3

    if covered >= 0.8 or (covered >= 0.5 and watered_recently):
        status = "hydrated"
    elif covered >= 0.4 or watered_recently:
        status = "thirsty"
    else:
        status = "dry"

    return {
        "status": status,
        "rain_7day_mm": round(rain_7d, 1),
        "rain_14day_mm": round(rain_14d, 1),
        "weekly_budget_mm": weekly_budget,
        "biweekly_budget_mm": biweekly_budget,
        "season": season,
    }
