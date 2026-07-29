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


def test_standard_single_member_summary_names_the_plant():
    single = _event(
        care_type="fertilize",
        plant_name="Strawberry",
        plant_names=["Strawberry"],
        map_name="Back garden",
        group_count=1,
    )
    _, event = _vevent(serialize_calendar(
        [single], language="en", privacy=False,
    ))

    assert str(event["SUMMARY"]) == "Fertilize · Strawberry"

    _, private = _vevent(serialize_calendar([single], language="en", privacy=True))
    assert str(private["SUMMARY"]) == "Fertilize · 1 plant"


def test_multi_member_summary_uses_map_or_private_count():
    grouped = _event(
        care_type="fertilize",
        plant_name=None,
        plant_names=["Strawberry", "Raspberry", "Blueberry"],
        map_name="Back garden",
        group_count=7,
    )

    _, standard = _vevent(serialize_calendar([grouped], language="en", privacy=False))
    _, private = _vevent(serialize_calendar([grouped], language="en", privacy=True))

    assert str(standard["SUMMARY"]) == "Fertilize · Back garden"
    assert str(private["SUMMARY"]) == "Fertilize · 7 plants"


def test_grouped_description_is_bounded_and_private_mode_keeps_safe_guidance():
    names = [f"Plant {number}" for number in range(1, 11)]
    grouped = _event(
        plant_name=None,
        plant_names=names,
        map_name="Back garden",
        group_count=10,
        reason_en="Warm and dry weather",
        action_en="Check the soil before watering.",
        weather_triggered=True,
    )

    _, standard = _vevent(serialize_calendar([grouped], language="en", privacy=False))
    _, private = _vevent(serialize_calendar([grouped], language="en", privacy=True))
    standard_description = str(standard["DESCRIPTION"])
    private_description = str(private["DESCRIPTION"])

    assert "10 plants" in standard_description
    assert "Plant 1" in standard_description
    assert "Plant 8" in standard_description
    assert "Plant 9" not in standard_description
    assert "+2 more" in standard_description
    assert "Space: Back garden" in standard_description

    assert "10 plants" in private_description
    assert "Warm and dry weather" in private_description
    assert "Check the soil before watering." in private_description
    assert "Plant 1" not in private_description
    assert "Back garden" not in private_description


def test_private_description_drops_non_weather_context_text():
    event = _event(
        plant_names=[],
        group_count=1,
        reason_en="Strawberry needs special attention",
        action_en="Move Strawberry beside the kitchen window",
        weather_triggered=False,
    )

    _, private = _vevent(serialize_calendar([event], language="en", privacy=True))

    assert "Strawberry needs special attention" not in str(private["DESCRIPTION"])
    assert "Move Strawberry" not in str(private["DESCRIPTION"])


def test_stable_uid_does_not_change_when_occurrence_is_rescheduled():
    first = _vevent(serialize_calendar([_event()], language="en"))[1]
    moved = _vevent(serialize_calendar(
        [_event(date="2026-07-17")],
        language="en",
    ))[1]

    assert str(first["UID"]) == str(moved["UID"])
    assert first.decoded("DTSTART") != moved.decoded("DTSTART")


def test_external_group_uid_ignores_member_order_and_membership_changes():
    first_event = _event(
        external_uid_key="2026-07-20|fertilize|map:4",
        group_member_event_ids=["schedule:1", "schedule:2"],
    )
    changed_members = _event(
        external_uid_key="2026-07-20|fertilize|map:4",
        group_member_event_ids=["schedule:3", "schedule:2", "schedule:1"],
    )

    first = _vevent(serialize_calendar([first_event], language="en"))[1]
    changed = _vevent(serialize_calendar([changed_members], language="en"))[1]

    assert str(first["UID"]) == str(changed["UID"])


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