"""Unit tests for eval_bioclip helpers."""
import pytest

from scripts.eval_bioclip import (
    score_distribution,
    suggest_thresholds,
    classify_prediction,
)


def test_classify_prediction_correct_top1():
    """correct_id is the first of the predictions → top-1 hit."""
    predictions = [(123, 0.31), (456, 0.27), (789, 0.20)]
    out = classify_prediction(predictions, correct_id=123)
    assert out["correct_top1"] is True
    assert out["correct_top5"] is True
    assert out["top1_score"] == pytest.approx(0.31)
    assert out["margin"] == pytest.approx(0.04, abs=1e-6)


def test_classify_prediction_correct_in_top5_not_top1():
    """correct_id is in the list but not first → top-5 hit, not top-1."""
    predictions = [(456, 0.28), (123, 0.27), (789, 0.20)]
    out = classify_prediction(predictions, correct_id=123)
    assert out["correct_top1"] is False
    assert out["correct_top5"] is True


def test_classify_prediction_empty_predictions():
    """No predictions returned → not correct, no scores."""
    out = classify_prediction([], correct_id=123)
    assert out["correct_top1"] is False
    assert out["correct_top5"] is False
    assert out["top1_score"] is None
    assert out["margin"] is None


def test_score_distribution_basic_stats():
    """Returns mean/median/min/max for a list of floats."""
    stats = score_distribution([0.10, 0.20, 0.30, 0.40, 0.50])
    assert stats["mean"] == pytest.approx(0.30)
    assert stats["median"] == pytest.approx(0.30)
    assert stats["min"] == pytest.approx(0.10)
    assert stats["max"] == pytest.approx(0.50)


def test_score_distribution_empty_returns_zeros():
    """Empty list returns zeros, never errors."""
    stats = score_distribution([])
    assert stats["mean"] == 0.0
    assert stats["median"] == 0.0


def test_suggest_thresholds_returns_4_buckets():
    """Output has high/medium/low/no_match keys with float thresholds."""
    correct_top1 = [0.30, 0.32, 0.28, 0.35, 0.31]
    wrong_top1 = [0.22, 0.24, 0.20, 0.26, 0.23]
    correct_margins = [0.05, 0.04, 0.06, 0.05, 0.04]

    out = suggest_thresholds(correct_top1, wrong_top1, correct_margins)
    assert set(out.keys()) >= {"high_top1", "high_margin", "medium_top1", "low_top1"}
    # high_top1 floor is 0.28 (the _HIGH_TOP1_FLOOR constant); fixture's CORRECT p25 is 0.30
    # so the max(floor, p25) result must be at least 0.28.
    assert out["high_top1"] >= 0.28
    # Low matches the existing _MIN_CONFIDENCE_FOR_RESULT floor
    assert out["low_top1"] == 0.10


def test_classify_prediction_single_prediction_margin_equals_top1():
    """With only one prediction, margin defaults to top1_score (top2 treated as 0.0).
    Documents that single-prediction inputs produce a misleadingly large margin —
    callers should be aware when interpreting downstream statistics."""
    out = classify_prediction([(123, 0.31)], correct_id=123)
    assert out["correct_top1"] is True
    assert out["top1_score"] == pytest.approx(0.31)
    assert out["margin"] == pytest.approx(0.31)
