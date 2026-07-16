from datetime import date

from icalendar import Calendar

from models import CalendarEventOut
from services.calendar_ics import serialize_calendar


def _event(**overrides):
    event = {
        "id": "schedule:12:water:0",
        "date": "2026-07-18",
        "care_type": "water",
        "plant_name": "Tomaat, Moneymaker",
        "plant_names": ["Tomaat, Moneymaker", "Basilicum; Genovese"],
        "map_name": "Achtertuin",
        "child_ids": [],
        "weather_triggered": False,
        "reason_nl": None,
        "reason_en": None,
        "action_nl": None,
        "action_en": None,
    }
    event.update(overrides)
    return event


def _vevent(payload: bytes):
    parsed = Calendar.from_ical(payload)
    events = [component for component in parsed.walk() if component.name == "VEVENT"]
    assert len(events) == 1
    return parsed, events[0]


def test_serialize_calendar_is_parser_valid_localized_and_all_day():
    payload = serialize_calendar(
        [_event()],
        language="nl",
        privacy=False,
        calendar_name="Floreren verzorging",
        generated_at=date(2026, 7, 16),
    )

    parsed, event = _vevent(payload)

    assert str(parsed["X-WR-CALNAME"]) == "Floreren verzorging"
    assert event.decoded("DTSTART") == date(2026, 7, 18)
    assert event.decoded("DTEND") == date(2026, 7, 19)
    assert "Water geven" in str(event["SUMMARY"])
    assert "Tomaat, Moneymaker" in str(event["DESCRIPTION"])
    assert "Basilicum; Genovese" in str(event["DESCRIPTION"])
    assert "Achtertuin" in str(event["DESCRIPTION"])
    assert str(event["URL"]) == "https://floreren.app/calendar?date=2026-07-18"


def test_stable_uid_does_not_change_when_occurrence_is_rescheduled():
    first = _vevent(serialize_calendar([_event()], language="en"))[1]
    moved = _vevent(serialize_calendar(
        [_event(date="2026-07-17")],
        language="en",
    ))[1]

    assert str(first["UID"]) == str(moved["UID"])
    assert first.decoded("DTSTART") != moved.decoded("DTSTART")


def test_privacy_mode_hides_plant_and_map_names():
    _, event = _vevent(serialize_calendar(
        [_event()],
        language="en",
        privacy=True,
    ))

    serialized = event.to_ical().decode("utf-8")
    assert "Tomaat" not in serialized
    assert "Basilicum" not in serialized
    assert "Achtertuin" not in serialized
    assert "Open Floreren to view this care session." in str(event["DESCRIPTION"])


def test_serializer_uses_the_real_calendar_event_contract():
    actual = CalendarEventOut(
        id="schedule:12:water:0",
        date="2026-07-18",
        type="water",
        plant_id=7,
        plant_name="Tomato",
        plant_icon_variant=None,
        schedule_id=12,
        map_id=4,
        map_name="Garden",
        overdue=False,
    )

    _, event = _vevent(serialize_calendar([actual], language="en"))

    assert "Water" in str(event["SUMMARY"])
    assert "Tomato" in str(event["DESCRIPTION"])


def test_text_with_carriage_returns_cannot_inject_calendar_components():
    malicious = {
        **_event(event_id="schedule:88:water:0"),
        "map_name": "Garden\rBEGIN:VEVENT\rUID:injected",
    }

    payload = serialize_calendar([malicious], language="en")
    calendar = Calendar.from_ical(payload)

    assert sum(component.name == "VEVENT" for component in calendar.walk()) == 1
    assert b"\rBEGIN:VEVENT" not in payload