"""Tests for the DB-first plant recommendations service."""
import pytest
from services.plant_suggestions import (
    bucket_for,
    fit_grade,
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


# ── fit_grade ─────────────────────────────────────────────────────────────────
# Grades: perfect > acceptable > tolerated > marginal; None = exclude.

# full spot (level 3)
def test_full_spot_full_sun_perfect():
    assert fit_grade("full_sun", "full") == "perfect"

def test_full_spot_partial_sun_acceptable():
    assert fit_grade("partial_sun", "full") == "acceptable"

def test_full_spot_shade_excluded():
    assert fit_grade("shade", "full") is None        # scorch — never recommend

# part spot (level 2)
def test_part_spot_partial_sun_perfect():
    assert fit_grade("partial_sun", "part") == "perfect"

def test_part_spot_full_sun_acceptable():
    assert fit_grade("full_sun", "part") == "acceptable"

def test_part_spot_shade_marginal():
    assert fit_grade("shade", "part") == "marginal"

# bright_shade spot (level 1)
def test_bright_shade_shade_perfect():
    assert fit_grade("shade", "bright_shade") == "perfect"

def test_bright_shade_partial_sun_acceptable():
    assert fit_grade("partial_sun", "bright_shade") == "acceptable"

def test_bright_shade_full_sun_marginal():
    # included (not excluded) so shady gardens never get empty lists — but ranked low
    assert fit_grade("full_sun", "bright_shade") == "marginal"

# deep_shade spot (level 0)
def test_deep_shade_shade_perfect():
    assert fit_grade("shade", "deep_shade") == "perfect"

def test_deep_shade_partial_sun_marginal():
    assert fit_grade("partial_sun", "deep_shade") == "marginal"

def test_deep_shade_full_sun_excluded():
    assert fit_grade("full_sun", "deep_shade") is None   # won't flower — never recommend

# 'any' and NULL → tolerated everywhere (graceful degradation lane)
@pytest.mark.parametrize("bucket", ["full", "part", "bright_shade", "deep_shade"])
def test_any_is_tolerated_everywhere(bucket):
    assert fit_grade("any", bucket) == "tolerated"

@pytest.mark.parametrize("bucket", ["full", "part", "bright_shade", "deep_shade"])
def test_null_preference_is_tolerated_everywhere(bucket):
    assert fit_grade(None, bucket) == "tolerated"


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
    perfect = _score_candidate(gap_months_covered=[2], pollinator_value=2, is_native=True, sun_fit="perfect")
    acceptable = _score_candidate(gap_months_covered=[2], pollinator_value=2, is_native=True, sun_fit="acceptable")
    assert perfect > acceptable

def test_acceptable_beats_tolerated():
    acceptable = _score_candidate(gap_months_covered=[2], pollinator_value=2, is_native=True, sun_fit="acceptable")
    tolerated = _score_candidate(gap_months_covered=[2], pollinator_value=2, is_native=True, sun_fit="tolerated")
    assert acceptable > tolerated

def test_tolerated_beats_marginal():
    # a known-'any' plant should outrank a plant struggling in the wrong light
    tolerated = _score_candidate(gap_months_covered=[2], pollinator_value=2, is_native=True, sun_fit="tolerated")
    marginal = _score_candidate(gap_months_covered=[2], pollinator_value=2, is_native=True, sun_fit="marginal")
    assert tolerated > marginal

def test_light_reorders_same_plant_across_spots():
    # identical ecology, the spot where it thrives ranks it higher
    thrives = _score_candidate(gap_months_covered=[3], pollinator_value=3, is_native=True, sun_fit="perfect")
    struggles = _score_candidate(gap_months_covered=[3], pollinator_value=3, is_native=True, sun_fit="marginal")
    assert thrives > struggles

def test_strong_gapfiller_in_imperfect_light_beats_weak_perfect_plant():
    # ecology still drives: a big gap-filler in acceptable light beats a weak plant in perfect light
    strong = _score_candidate(gap_months_covered=[3, 4], pollinator_value=3, is_native=True, sun_fit="acceptable")
    weak = _score_candidate(gap_months_covered=[], pollinator_value=1, is_native=False, sun_fit="perfect")
    assert strong > weak

def test_flowers_now_breaks_tie():
    now = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=True, sun_fit="perfect", flowers_now=True)
    later = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=True, sun_fit="perfect", flowers_now=False)
    assert now > later

def test_sqlite_truthy_native_value_gets_native_reason_and_score():
    reason = template_reason(
        is_native=1,
        pollinator_value=3,
        gap_months_covered=[9],
        month_names=MONTH_NL,
    )
    assert reason.startswith("Inheems in Nederland · top bestuiversplant")

    sqlite_native = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=1, sun_fit="perfect")
    non_native = _score_candidate(gap_months_covered=[], pollinator_value=2, is_native=0, sun_fit="perfect")
    assert sqlite_native > non_native
