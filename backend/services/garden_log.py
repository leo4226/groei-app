"""Garden-wide watering and fertilizing log + water status.

The garden log captures household-level "I watered the whole garden today" or
"I fertilized everything today" events, distinct from per-Plant Care logs.
Logging an event also marks every active matching Care schedule as done.

Public API:
    get_last_garden_watered() -> date | None
    get_last_garden_fertilized() -> date | None
    log_garden_water(db, watered_at, watered_by, water_amount) -> int   (schedules updated)
    log_garden_fertilize(db, fertilized_at, fertilized_by) -> int
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

async def get_last_garden_watered() -> date | None:
    """Return the most recent garden watering date, or None."""
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, watered_at FROM garden_water_log ORDER BY watered_at DESC LIMIT 1"
        )
    if not rows:
        return None
    return _as_date(rows[0]["watered_at"])


async def get_last_garden_fertilized() -> date | None:
    """Return the most recent garden fertilize date, or None."""
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, fertilized_at FROM garden_fertilize_log ORDER BY fertilized_at DESC LIMIT 1"
        )
    if not rows:
        return None
    return _as_date(rows[0]["fertilized_at"])


# ── event logging (mutates DB) ───────────────────────────────────────────────

async def log_garden_water(db, watered_at_iso: str, watered_by: int | None, water_amount: float | None) -> int:
    """Insert a new garden water log entry and mark all active water schedules as done.

    Returns the number of schedules updated. Caller is responsible for commit.
    """
    from services.scheduling import calculate_next_due

    await db.execute("DELETE FROM garden_water_log")
    await db.execute(
        "INSERT INTO garden_water_log (watered_at, watered_by, water_amount) VALUES (?, ?, ?)",
        (watered_at_iso, watered_by, water_amount),
    )

    schedules = await db.execute_fetchall(
        """SELECT cs.id, cs.interval_days, cs.season_adjust
           FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.care_type = 'water' AND cs.is_active = 1 AND p.is_active = 1"""
    )
    today = date.today()
    updated = 0
    for s in schedules:
        next_due = calculate_next_due(today, s["interval_days"], s["season_adjust"])
        await db.execute(
            "UPDATE care_schedules SET last_done = ?, next_due = ? WHERE id = ?",
            (today, next_due, s["id"]),
        )
        updated += 1
    return updated


async def log_garden_fertilize(db, fertilized_at_iso: str, fertilized_by: int | None) -> int:
    """Insert a new garden fertilize log entry and mark all active fertilize schedules as done.

    Returns the number of schedules updated. Caller is responsible for commit.
    """
    from services.scheduling import calculate_next_due

    await db.execute("DELETE FROM garden_fertilize_log")
    await db.execute(
        "INSERT INTO garden_fertilize_log (fertilized_at, fertilized_by) VALUES (?, ?)",
        (fertilized_at_iso, fertilized_by),
    )

    schedules = await db.execute_fetchall(
        """SELECT cs.id, cs.interval_days, cs.season_adjust
           FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.care_type = 'fertilize' AND cs.is_active = 1 AND p.is_active = 1"""
    )
    today = date.today()
    updated = 0
    for s in schedules:
        next_due = calculate_next_due(today, s["interval_days"], s["season_adjust"])
        await db.execute(
            "UPDATE care_schedules SET last_done = ?, next_due = ? WHERE id = ?",
            (today, next_due, s["id"]),
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
