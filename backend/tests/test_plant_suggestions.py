"""Tests for the DB-first plant recommendations service."""
import pytest
from services.plant_suggestions import (
    bucket_for,
    compatible_sun_preferences,
    sun_fit_label,
    template_reason,
    _score_candidate,
)

MONTH_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"]


# ── bucket_for ────────────────────────────────────────────────────────────────

def test_bucket_for_full_sun():
    assert bucket_for(5.0, 0.8) == "full"

def test_bucket_for_part():
    assert bucket_for(3.0, 0.8) == "part"

def test_bucket_for_bright_shade():
    assert bucket_for(1.0, 0.6) == "bright_shade"

def test_bucket_for_deep_shade():
    assert bucket_for(1.0, 0.3) == "deep_shade"

def test_bucket_for_boundary_full():
    assert bucket_for(4.0, 0.9) == "full"   # exactly 4 → full

def test_bucket_for_boundary_part():
    assert bucket_for(2.0, 0.9) == "part"   # exactly 2 → part


# ── compatible_sun_preferences ───────────────────────────────────────────────

def test_full_spot_accepts_full_sun_and_any():
    prefs = compatible_sun_preferences("full")
    assert "full_sun" in prefs
    assert "any" in prefs
    assert "shade" not in prefs

def test_part_spot_accepts_partial_and_full_and_any():
    prefs = compatible_sun_preferences("part")
    assert "partial_sun" in prefs
    assert "full_sun" in prefs   # full-sun plants tolerate part sun
    assert "shade" not in prefs

def test_bright_shade_accepts_partial_shade_any():
    prefs = compatible_sun_preferences("bright_shade")
    assert "partial_sun" in prefs
    assert "shade" in prefs
    assert "full_sun" not in prefs

def test_deep_shade_accepts_shade_any():
    prefs = compatible_sun_preferences("deep_shade")
    assert "shade" in prefs
    assert "any" in prefs
    assert "partial_sun" not in prefs


# ── sun_fit_label ─────────────────────────────────────────────────────────────

def test_perfect_fit_partial_in_part():
    assert sun_fit_label("partial_sun", "part") == "perfect"

def test_acceptable_full_sun_in_part():
    assert sun_fit_label("full_sun", "part") == "acceptable"

def test_perfect_fit_shade_in_deep():
    assert sun_fit_label("shade", "deep_shade") == "perfect"


# ── template_reason ──────────────────────────────────────────────────────────

def test_template_native_pollinator_gap():
    r = template_reason(
        is_native=True,
        pollinator_value=3,
        gap_months_covered=[3, 4],
        month_names=MONTH_NL,
    )
    assert "Inheems" in r
    assert "bestuiver" in r
    assert "mrt" in r

def test_template_empty_when_no_data():
    r = template_reason(is_native=None, pollinator_value=None,
                        gap_months_covered=[], month_names=MONTH_NL)
    assert r == ""


# ── _score_candidate ─────────────────────────────────────────────────────────

def test_higher_gap_coverage_scores_higher():
    a = _score_candidate(gap_months_covered=[3, 4, 5], pollinator_value=1, is_native=False, sun_fit="acceptable")
    b = _score_candidate(gap_months_covered=[3], pollinator_value=1, is_native=False, sun_fit="acceptable")
    assert a > b

def test_native_beats_non_native_same_rest():
    native = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=True, sun_fit="perfect")
    non = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=False, sun_fit="perfect")
    assert native > non

def test_perfect_fit_beats_acceptable():
    perfect = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=True, sun_fit="perfect")
    acceptable = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=True, sun_fit="acceptable")
    assert perfect > acceptable
