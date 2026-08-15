"""The garden clock — and the midnight window that used to break everything.

Floreren runs in UTC but is a calendar for a garden in Amsterdam. Between
22:00 UTC and midnight (00:00–02:00 local) the two disagree about the date.
Everything that decides "which day is it in the garden" used `date.today()`,
so for those two hours every night it was a day behind the person holding the
phone: weather-driven watering moments fell out of the ICS feed, and "I watered
this just now" was logged against yesterday.

These tests pin the boundary by freezing `local_now`, so they assert the same
thing at any hour of the day the suite happens to run.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from services import local_time


UTC = ZoneInfo("UTC")

#: 23:30 UTC on 14 Aug 2019 is 01:30 on the 15th in Amsterdam (CEST, UTC+2) —
#: squarely inside the window where the two calendars disagree.
#:
#: Deliberately in the past: an instant the real clock can never coincide with.
#: Pinned to "today" these assertions would pass whether or not the code reads
#: the garden clock, and would quietly stop testing anything.
MIDNIGHT_WINDOW_UTC = datetime(2019, 8, 14, 23, 30, tzinfo=UTC)
#: The same instant, as the gardener experiences it.
LOCAL_DATE_IN_WINDOW = date(2019, 8, 15)
UTC_DATE_IN_WINDOW = date(2019, 8, 14)


@pytest.fixture
def in_midnight_window(monkeypatch):
    """Freeze the garden clock inside the 22:00-24:00 UTC divergence."""
    frozen = MIDNIGHT_WINDOW_UTC.astimezone(local_time.GARDEN_TZ)
    monkeypatch.setattr(local_time, "local_now", lambda: frozen)
    return frozen


def test_the_window_this_suite_guards_really_does_diverge():
    """Guard the guard: if these two ever agree, the tests below prove nothing."""
    assert MIDNIGHT_WINDOW_UTC.date() == UTC_DATE_IN_WINDOW
    assert MIDNIGHT_WINDOW_UTC.astimezone(local_time.GARDEN_TZ).date() == LOCAL_DATE_IN_WINDOW
    assert UTC_DATE_IN_WINDOW != LOCAL_DATE_IN_WINDOW


def test_local_today_follows_the_garden_not_the_server(in_midnight_window):
    assert local_time.local_today() == LOCAL_DATE_IN_WINDOW
    # …which is precisely the day UTC would have got wrong.
    assert local_time.local_today() != UTC_DATE_IN_WINDOW


def test_winter_uses_the_one_hour_offset():
    """CET is UTC+1, so the divergence window is 23:00-24:00 UTC in winter."""
    midwinter = datetime(2026, 1, 15, 23, 30, tzinfo=UTC)
    assert midwinter.astimezone(local_time.GARDEN_TZ).date() == date(2026, 1, 16)
    # An hour earlier is still the same day in both zones.
    assert datetime(2026, 1, 15, 22, 30, tzinfo=UTC).astimezone(
        local_time.GARDEN_TZ
    ).date() == date(2026, 1, 15)


def test_to_local_date_treats_naive_timestamps_as_utc():
    """Stored TIMESTAMPs are naive UTC; reading them back must not shift a day."""
    naive = datetime(2019, 8, 14, 23, 30)
    assert local_time.to_local_date(naive) == LOCAL_DATE_IN_WINDOW
    aware = naive.replace(tzinfo=UTC)
    assert local_time.to_local_date(aware) == local_time.to_local_date(naive)


class TestSchedulingUsesTheGardenDay:
    """The scheduling chain must agree with the calendar the user reads."""

    def test_next_due_is_counted_from_the_garden_day(self, in_midnight_window):
        from services.scheduling import calculate_next_due

        # No last_done, so it counts from "today" — which must be the 15th.
        due = calculate_next_due(None, base_days=7)
        assert due == date(2019, 8, 22)
        # Counting from UTC's yesterday would have produced the 21st.
        assert due != date(2019, 8, 21)

    def test_season_is_read_from_the_garden_day(self, in_midnight_window):
        from services.scheduling import get_current_season

        # Explicit dates are untouched; only the default changes.
        assert get_current_season(date(2019, 1, 5)) == "winter"
        assert get_current_season() == get_current_season(LOCAL_DATE_IN_WINDOW)

    def test_due_today_means_the_gardeners_today(self, in_midnight_window):
        from services.care_task_service import classify_care_tasks

        rows = [{
            "schedule_id": 1,
            "plant_id": 1,
            "plant_name": "Monstera",
            "plant_photo": None,
            "location": "Vensterbank",
            "map_name": "Woonkamer",
            "map_type": "indoor",
            "care_type": "water",
            "next_due": LOCAL_DATE_IN_WINDOW.isoformat(),
            "last_done_by_name": "Leon",
            "last_done_at": None,
            "is_ephemeral": 0,
        }]
        overdue, due_today, upcoming = classify_care_tasks(rows)

        # On UTC's clock this row was "tomorrow" and would have been filed under
        # upcoming, so the dashboard hid a task the calendar showed as due.
        assert [t.schedule_id for t in due_today] == [1]
        assert overdue == [] and upcoming == []


class TestCalendarFeedAndSchedulesAgree:
    """The bug that started this: the two sides used different clocks."""

    def test_feed_window_and_weather_tasks_share_one_definition(self, in_midnight_window):
        from routers.calendar_subscription import _amsterdam_today
        from routers.calendar import _water_pressure_today

        assert _amsterdam_today() == LOCAL_DATE_IN_WINDOW
        assert _water_pressure_today() == LOCAL_DATE_IN_WINDOW
        # Both read the same clock now, so they cannot drift apart again.
        assert _amsterdam_today() == _water_pressure_today()

    @pytest.mark.asyncio
    async def test_heat_water_task_lands_on_a_day_the_feed_shows(
        self, in_midnight_window
    ):
        """A heat-water moment created now must not be stamped with yesterday.

        This is the concrete failure: the schedule was written with UTC's date,
        the ICS feed windowed from Amsterdam's, and the task fell one day short
        of the window and disappeared from subscribed calendars until 02:00.
        """
        from routers.calendar_subscription import _amsterdam_today
        from services import weather_task_service

        stamped = weather_task_service.local_today()
        assert stamped >= _amsterdam_today(), (
            "a task stamped before the feed window starts is invisible in the feed"
        )
        assert stamped == LOCAL_DATE_IN_WINDOW
