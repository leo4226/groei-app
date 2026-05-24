"""Unit tests for the confidence classifier."""
import pytest

from routers.plant_id import _classify_confidence


def test_high_when_top1_strong_and_margin_clear():
    """top1=0.35, margin to top2=0.05 -> high."""
    assert _classify_confidence(0.35, 0.30) == "high"


def test_medium_when_top1_strong_but_margin_thin():
    """top1=0.32 but top2=0.31 -> margin too small for high; still >=0.30 -> medium."""
    assert _classify_confidence(0.32, 0.31) == "medium"


def test_low_when_top1_just_below_medium_threshold():
    """top1=0.27, no top2 -> low (below 0.30 medium threshold)."""
    assert _classify_confidence(0.27, None) == "low"


def test_low_when_top1_above_floor_but_below_medium():
    """top1=0.20 -> low."""
    assert _classify_confidence(0.20, 0.15) == "low"


def test_no_match_when_top1_below_floor():
    """top1=0.08 -> no_match."""
    assert _classify_confidence(0.08, 0.05) == "no_match"


def test_no_match_when_top1_exactly_at_floor_lower_bound():
    """top1=0.099 (< 0.10) -> no_match. Boundary check."""
    assert _classify_confidence(0.099, 0.05) == "no_match"


def test_low_when_top1_exactly_at_floor():
    """top1=0.10 -> low (the floor is inclusive)."""
    assert _classify_confidence(0.10, 0.05) == "low"


def test_high_requires_both_top1_and_margin():
    """top1 above high threshold but margin below -> falls to medium."""
    # top1=0.35, margin=0.02 -> high_margin not met
    assert _classify_confidence(0.35, 0.33) == "medium"


def test_high_when_top1_exactly_at_high_threshold():
    """top1=0.28 (== _HIGH_TOP1) with sufficient margin → high (>= is inclusive)."""
    assert _classify_confidence(0.28, 0.20) == "high"


def test_medium_when_top1_exactly_at_medium_threshold():
    """top1=0.30 (== _MEDIUM_TOP1) → medium (>= is inclusive)."""
    assert _classify_confidence(0.30, 0.28) == "medium"
