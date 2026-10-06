"""A heat-triggered one-shot `water` row must not hide the regular schedule."""
from datetime import date, timedelta

from services.warnings import compute_plant_warnings

TODAY = date(2026, 7, 20)
PLANT = {"id": 1, "map_type": "outdoor", "care_thresholds": None, "care_profile": None}


def _rows(order: str) -> list[dict]:
    regular = {
        "care_type": "water", "next_due": TODAY - timedelta(days=2),
        "last_done": None, "interval_days": 7, "is_ephemeral": 0,
    }
    heat_extra = {
        "care_type": "water", "next_due": TODAY + timedelta(days=1),
        "last_done": None, "interval_days": 1, "is_ephemeral": 1,
    }
    return [regular, heat_extra] if order == "regular_first" else [heat_extra, regular]


def test_overdue_watering_survives_a_later_heat_extra_in_any_row_order():
    for order in ("regular_first", "heat_first"):
        state = compute_plant_warnings(PLANT, _rows(order), weather=None, today=TODAY)
        water = [w for w in state.warnings if w.care_type == "water"]
        assert water and water[0].days_overdue == 2, order
        assert state.care_summary["water"].status == "overdue", order


def test_two_regular_rows_report_the_most_urgent_in_any_order():
    rows = [
        {"care_type": "water", "next_due": TODAY - timedelta(days=1), "last_done": None},
        {"care_type": "water", "next_due": TODAY + timedelta(days=3), "last_done": None},
    ]
    for ordered in (rows, rows[::-1]):
        state = compute_plant_warnings(PLANT, ordered, weather=None, today=TODAY)
        assert state.care_summary["water"].status == "overdue"


def test_overdue_copy_uses_proper_plurals():
    one = compute_plant_warnings(PLANT, [
        {"care_type": "water", "next_due": TODAY - timedelta(days=1), "last_done": None},
    ], weather=None, today=TODAY).warnings[0]
    assert "1 dag te laat" in one.message_nl
    assert "1 day overdue" in one.message_en
