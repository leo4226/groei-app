"""The garden's local clock — the single answer to "what day is it?".

Floreren runs on Fly in UTC, but it is a calendar for a garden in Amsterdam.
For two hours every night (00:00–02:00 CEST, 01:00–02:00 CET) those disagree
about the date, and every date computed with `date.today()` was a day behind
what the person holding the phone saw:

- weather-driven watering moments were stamped with UTC's yesterday, so they
  fell outside the ICS feed window (which already used Amsterdam) and vanished
  from subscribed calendars until 02:00
- "I watered this just now" at 00:30 was logged against the previous day
- due/overdue comparisons ran against the wrong day boundary

The rule: **a date that means "which day in the garden" uses `local_today()`.**
A value that is a true instant (created_at, quota windows, telemetry) stays UTC
— those are timestamps, not calendar days.

`local_now()` exists so tests can freeze the clock at a chosen moment by
patching one function rather than every caller.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

#: Where the garden is. Floreren is single-region today; when households get
#: their own coordinates this becomes a per-household lookup and every caller
#: below already routes through the one function that would change.
GARDEN_TZ = ZoneInfo("Europe/Amsterdam")

# Kept as an alias so the pre-existing imports of this name keep reading
# naturally where they already say AMSTERDAM.
AMSTERDAM = GARDEN_TZ


def local_now() -> datetime:
    """Current time in the garden's timezone (tz-aware)."""
    return datetime.now(GARDEN_TZ)


def local_today() -> date:
    """The calendar day the gardener is currently living in."""
    return local_now().date()


def to_local_date(moment: datetime) -> date:
    """The garden-local calendar day a timestamp falls on.

    Naive datetimes are assumed to be UTC, which is how they are stored.
    """
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo("UTC"))
    return moment.astimezone(GARDEN_TZ).date()
