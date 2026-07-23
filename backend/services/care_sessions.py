"""Pure Water-session planner.

Derives routine session dates from canonical care_schedules.next_due,
preferred weekday configuration, and effective interval.  Operates on
pure date math only — no database or clock.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Literal


ISO_WEEKDAYS = frozenset(range(1, 8))


@dataclass(frozen=True)
class SessionProjection:
    """Immutable result of projecting a Water schedule onto a session date."""

    session_date: date
    canonical_date: date
    is_routine: bool
    reason: Literal["routine", "no_routine", "too_frequent", "opted_out"]


def _normalized_weekdays(values: Iterable[int]) -> tuple[int, ...]:
    """Normalize weekdays: sort, deduplicate, validate ISO 1–7."""
    weekdays = tuple(sorted(set(values)))
    if any(d not in ISO_WEEKDAYS for d in weekdays):
        raise ValueError("invalid weekday value; use ISO 1 (Mon) … 7 (Sun)")
    return weekdays


def maximum_routine_gap(weekdays: Iterable[int]) -> int | None:
    """Return the maximum gap in days between consecutive routine days.

    The gap includes the wrap around the week boundary.
    Returns None when *weekdays* is empty.
    """
    norm = _normalized_weekdays(weekdays)
    if not norm:
        return None

    extended = norm + (norm[0] + 7,)  # wrap around
    max_gap = 0
    for i in range(len(norm)):
        gap = extended[i + 1] - extended[i]
        if gap > max_gap:
            max_gap = gap
    return max_gap


def _latest_weekday_on_or_before(
    target: date,
    weekdays: tuple[int, ...],
) -> date:
    """Return the latest *weekdays* ISO weekday on or before *target*."""
    target_dow = target.isoweekday()
    # Find the latest candidate weekday <= target_dow
    candidates = [d for d in weekdays if d <= target_dow]
    if candidates:
        best_dow = max(candidates)
        return target - timedelta(days=target_dow - best_dow)

    # No weekday on or before — wrap back to the latest weekday of the
    # previous week (the largest weekday value across the week boundary).
    best_dow = max(weekdays)
    return target - timedelta(days=target_dow + 7 - best_dow)


def project_water_session(
    *,
    canonical_due: date,
    effective_interval: int,
    preferred_weekdays: Iterable[int],
    opted_out: bool,
) -> SessionProjection:
    """Project a Water schedule onto a routine or non-routine session.

    Parameters
    ----------
    canonical_due:
        The schedule's ``next_due`` date (the authoritative deadline).
    effective_interval:
        The schedule's effective interval in days (positive int).
    preferred_weekdays:
        One or two ISO weekdays (1=Mon … 7=Sun) defining the routine.
    opted_out:
        Whether the schedule has been explicitly opted out of rhythm.

    Returns
    -------
    SessionProjection with:
    - ``session_date``: the date the session is displayed on.
    - ``canonical_date``: always the input *canonical_due*.
    - ``is_routine``: whether the schedule participates in a routine.
    - ``reason``: one of ``routine``, ``no_routine``, ``too_frequent``,
      ``opted_out``.
    """
    weekdays = _normalized_weekdays(preferred_weekdays)

    if opted_out:
        return SessionProjection(
            session_date=canonical_due,
            canonical_date=canonical_due,
            is_routine=False,
            reason="opted_out",
        )

    if not weekdays:
        return SessionProjection(
            session_date=canonical_due,
            canonical_date=canonical_due,
            is_routine=False,
            reason="no_routine",
        )

    max_gap = maximum_routine_gap(weekdays)

    if effective_interval <= 0 or effective_interval < max_gap:
        return SessionProjection(
            session_date=canonical_due,
            canonical_date=canonical_due,
            is_routine=False,
            reason="too_frequent",
        )

    session_date = _latest_weekday_on_or_before(canonical_due, weekdays)
    return SessionProjection(
        session_date=session_date,
        canonical_date=canonical_due,
        is_routine=True,
        reason="routine",
    )
