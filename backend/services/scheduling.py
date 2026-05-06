import json
from datetime import date, timedelta


def get_current_season(d: date | None = None) -> str:
    """Get the current season based on Amsterdam calendar dates."""
    d = d or date.today()
    month, day = d.month, d.day

    if (month == 3 and day >= 21) or (month in (4, 5)) or (month == 6 and day <= 20):
        return "spring"
    elif (month == 6 and day >= 21) or (month in (7, 8)) or (month == 9 and day <= 22):
        return "summer"
    elif (month == 9 and day >= 23) or (month in (10, 11)) or (month == 12 and day <= 20):
        return "autumn"
    else:
        return "winter"


def get_season_multiplier(season_adjust: str | None, d: date | None = None) -> float:
    """Get the multiplier for the current season from a JSON season_adjust string."""
    if not season_adjust:
        return 1.0

    try:
        adjustments = json.loads(season_adjust)
    except (json.JSONDecodeError, TypeError):
        return 1.0

    season = get_current_season(d)
    return adjustments.get(season, 1.0)


def calculate_effective_interval(base_days: int, season_adjust: str | None = None, d: date | None = None) -> int:
    """Calculate the effective interval in days, adjusted for season."""
    multiplier = get_season_multiplier(season_adjust, d)
    return max(1, round(base_days * multiplier))


def calculate_next_due(
    last_done: date | None,
    base_days: int,
    season_adjust: str | None = None,
) -> date:
    """Calculate the next due date from last_done (or today if never done)."""
    start = last_done or date.today()
    effective = calculate_effective_interval(base_days, season_adjust, start)
    return start + timedelta(days=effective)
