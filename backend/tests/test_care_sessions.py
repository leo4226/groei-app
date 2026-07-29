"""Tests for the pure Water-session planner.

Strict TDD: these tests start RED (module does not exist),
then go GREEN after implementing care_sessions.py.
"""

from datetime import date

import pytest

from services.care_sessions import (
    SessionProjection,
    maximum_routine_gap,
    project_water_session,
)


# ── maximum_routine_gap ──────────────────────────────────────────────


def test_maximum_gap_empty_returns_none():
    assert maximum_routine_gap([]) is None


def test_maximum_gap_single_day_is_seven():
    # Sunday only → gap from Sunday to next Sunday = 7
    assert maximum_routine_gap([7]) == 7
    # Monday only → gap = 7
    assert maximum_routine_gap([1]) == 7


def test_maximum_gap_two_days_is_smaller_gap():
    # Monday(1) + Thursday(4): Mon→Thu = 3, Thu→Mon(wrap) = 4 → max = 4
    assert maximum_routine_gap([1, 4]) == 4


def test_maximum_gap_normalizes_duplicates():
    # Duplicates should not change the result from a single day
    assert maximum_routine_gap([7, 7, 7]) == 7


def test_maximum_gap_normalizes_order():
    assert maximum_routine_gap([4, 1]) == 4  # same as [1,4]


def test_maximum_gap_invalid_weekday_raises():
    with pytest.raises(ValueError, match="invalid"):
        maximum_routine_gap([0])
    with pytest.raises(ValueError, match="invalid"):
        maximum_routine_gap([8])
    with pytest.raises(ValueError, match="invalid"):
        maximum_routine_gap([1, 9])


def test_maximum_gap_consecutive_days():
    # Monday(1) + Tuesday(2): Mon→Tue = 1, Tue→Mon(wrap) = 6 → max = 6
    assert maximum_routine_gap([1, 2]) == 6


def test_maximum_gap_weekend_days():
    # Saturday(6) + Sunday(7): Sat→Sun = 1, Sun→Sat(wrap) = 6 → max = 6
    assert maximum_routine_gap([6, 7]) == 6


def test_maximum_gap_friday_and_monday():
    # Friday(5) + Monday(1): Fri→Mon(wrap) = 3, Mon→Fri = 4 → max = 4
    assert maximum_routine_gap([5, 1]) == 4


# ── SessionProjection dataclass ─────────────────────────────────────


def test_session_projection_is_immutable():
    p = SessionProjection(
        session_date=date(2026, 7, 19),
        canonical_date=date(2026, 7, 22),
        is_routine=True,
        reason="routine",
    )
    with pytest.raises(AttributeError):
        p.session_date = date(2026, 7, 20)  # type: ignore[misc]
    with pytest.raises(AttributeError):
        p.is_routine = False  # type: ignore[misc]


# ── project_water_session: opted_out ────────────────────────────────


def test_opted_out_returns_non_routine():
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=7,
        preferred_weekdays=[7],
        opted_out=True,
    )
    assert result.session_date == date(2026, 7, 22)
    assert result.canonical_date == date(2026, 7, 22)
    assert result.is_routine is False
    assert result.reason == "opted_out"


# ── project_water_session: no routine (empty weekdays) ──────────────


def test_no_weekdays_returns_non_routine():
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=7,
        preferred_weekdays=[],
        opted_out=False,
    )
    assert result.session_date == date(2026, 7, 22)
    assert result.canonical_date == date(2026, 7, 22)
    assert result.is_routine is False
    assert result.reason == "no_routine"


# ── project_water_session: too_frequent ─────────────────────────────


def test_three_day_interval_too_frequent_for_sunday_routine():
    """A 3-day schedule cannot be represented by a 7-day routine."""
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=3,
        preferred_weekdays=[7],
        opted_out=False,
    )
    assert result.session_date == date(2026, 7, 22)
    assert result.canonical_date == date(2026, 7, 22)
    assert result.is_routine is False
    assert result.reason == "too_frequent"


def test_three_day_interval_too_frequent_for_two_day_routine():
    """A 3-day schedule is too frequent even for Mon+Thu (gap=4)."""
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=3,
        preferred_weekdays=[1, 4],
        opted_out=False,
    )
    assert result.is_routine is False
    assert result.reason == "too_frequent"


def test_nonpositive_interval_is_too_frequent():
    """interval=0 or negative should be too_frequent, not crash."""
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=0,
        preferred_weekdays=[7],
        opted_out=False,
    )
    assert result.is_routine is False
    assert result.reason == "too_frequent"

    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=-1,
        preferred_weekdays=[7],
        opted_out=False,
    )
    assert result.is_routine is False
    assert result.reason == "too_frequent"


# ── project_water_session: routine projections ──────────────────────


def test_sunday_routine_wednesday_canonical_projects_to_previous_sunday():
    """Canonical Wed 2026-07-22 + Sunday-only => Sun 2026-07-19."""
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=7,
        preferred_weekdays=[7],
        opted_out=False,
    )
    assert result.session_date == date(2026, 7, 19)
    assert result.canonical_date == date(2026, 7, 22)
    assert result.is_routine is True
    assert result.reason == "routine"


def test_sunday_routine_sunday_canonical_stays_sunday():
    """Canonical Sunday + Sunday-only => stays Sunday."""
    result = project_water_session(
        canonical_due=date(2026, 7, 19),
        effective_interval=7,
        preferred_weekdays=[7],
        opted_out=False,
    )
    assert result.session_date == date(2026, 7, 19)
    assert result.canonical_date == date(2026, 7, 19)
    assert result.is_routine is True
    assert result.reason == "routine"


def test_ten_day_interval_eligible_for_sunday_routine():
    """10-day interval >= 7-day gap → eligible."""
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=10,
        preferred_weekdays=[7],
        opted_out=False,
    )
    assert result.is_routine is True
    assert result.reason == "routine"
    assert result.session_date == date(2026, 7, 19)


def test_fourteen_day_interval_eligible_for_sunday_routine():
    """14-day interval >= 7-day gap → eligible."""
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=14,
        preferred_weekdays=[7],
        opted_out=False,
    )
    assert result.is_routine is True
    assert result.reason == "routine"
    assert result.session_date == date(2026, 7, 19)


def test_monday_and_thursday_routine_midweek_canonical():
    """Canonical Wed 2026-07-22 with Mon+Thu preference.
    Latest weekday on or before Wed 22nd is Thursday 23rd?
    No — on or before means <=. So Thu(23) > Wed(22), so it's Mon(20).
    """
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=10,
        preferred_weekdays=[1, 4],
        opted_out=False,
    )
    assert result.is_routine is True
    assert result.reason == "routine"
    # Latest weekday on or before Wed 22: Mon(1)=20th, Thu(4)=23rd (too late)
    # So session_date should be Monday July 20
    assert result.session_date == date(2026, 7, 20)


def test_monday_and_thursday_routine_thursday_canonical():
    """Canonical Thu + Mon+Thu → stays Thursday."""
    result = project_water_session(
        canonical_due=date(2026, 7, 23),
        effective_interval=10,
        preferred_weekdays=[1, 4],
        opted_out=False,
    )
    assert result.is_routine is True
    assert result.reason == "routine"
    # Latest on or before Thu 23: Thu=23
    assert result.session_date == date(2026, 7, 23)


def test_ten_day_eligible_for_mon_thu_routine():
    """10-day interval >= 4-day gap → eligible."""
    result = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=10,
        preferred_weekdays=[1, 4],
        opted_out=False,
    )
    assert result.is_routine is True
    assert result.reason == "routine"


# ── project_water_session: duplicate and order normalization ────────


def test_normalizes_duplicate_weekdays():
    """Duplicate weekdays should produce the same result as unique."""
    result1 = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=7,
        preferred_weekdays=[7, 7, 7],
        opted_out=False,
    )
    result2 = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=7,
        preferred_weekdays=[7],
        opted_out=False,
    )
    assert result1 == result2


def test_normalizes_unsorted_weekdays():
    """Unsorted weekdays produce the same result as sorted."""
    result1 = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=7,
        preferred_weekdays=[4, 1],
        opted_out=False,
    )
    result2 = project_water_session(
        canonical_due=date(2026, 7, 22),
        effective_interval=7,
        preferred_weekdays=[1, 4],
        opted_out=False,
    )
    assert result1 == result2


# ── project_water_session: invalid weekdays ─────────────────────────


def test_invalid_weekdays_raise_valueerror():
    with pytest.raises(ValueError, match="invalid"):
        project_water_session(
            canonical_due=date(2026, 7, 22),
            effective_interval=7,
            preferred_weekdays=[0],
            opted_out=False,
        )
    with pytest.raises(ValueError, match="invalid"):
        project_water_session(
            canonical_due=date(2026, 7, 22),
            effective_interval=7,
            preferred_weekdays=[1, 9],
            opted_out=False,
        )
