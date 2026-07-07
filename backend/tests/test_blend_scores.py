"""Unit tests for the pure score-blending helper.

Behaviour under test (see routers/plant_id._blend_scores):
  - a STRONG image-to-image match (best ref cosine >= _IMAGE_MATCH_MIN) can
    rescue a species missing from the text top-K (union), or boost one present;
  - a single confirmed ref is enough;
  - a WEAK image match (< _IMAGE_MATCH_MIN) is ignored, so output never drops
    below pure-text behaviour.
"""
import math

import numpy as np
import pytest

from routers.plant_id import _blend_scores, _IMAGE_MATCH_MIN

# Cosines chosen relative to the floor so these tests survive floor tuning.
_STRONG = min(_IMAGE_MATCH_MIN + 0.1, 0.999)
_WEAK = _IMAGE_MATCH_MIN - 0.2

_QUERY = np.array([1.0, 0.0], dtype=np.float32)


def _refs_at_cosines(*cosines: float) -> np.ndarray:
    """Stack unit rows whose cosine with _QUERY = [1, 0] is exactly each value."""
    rows = [np.array([c, math.sqrt(max(0.0, 1.0 - c * c))], dtype=np.float32) for c in cosines]
    return np.stack(rows)


def test_no_refs_returns_text_matches_unchanged():
    """With empty refs dict, blend collapses to identity on text_matches."""
    text = [(1, 0.30), (2, 0.25), (3, 0.20)]
    out = _blend_scores(text, _QUERY, refs_by_species={})
    assert out == text


def test_strong_ref_boosts_text_species_to_top():
    """A text species with a strong confirmed-photo match jumps to the top."""
    text = [(1, 0.30), (2, 0.25), (3, 0.20)]
    refs = {3: _refs_at_cosines(_STRONG, 0.0)}  # species 3 has a strong ref
    out = _blend_scores(text, _QUERY, refs_by_species=refs)
    assert out[0][0] == 3
    assert out[0][1] == pytest.approx(_STRONG, abs=1e-5)  # image cosine, not text 0.20


def test_single_strong_ref_is_used():
    """One confirmed ref is enough (was ≥2 before the un-gating)."""
    text = [(1, 0.30), (3, 0.20)]
    refs = {3: _refs_at_cosines(_STRONG)}  # single ref, strong
    out = _blend_scores(text, _QUERY, refs_by_species=refs)
    assert out[0][0] == 3
    assert out[0][1] == pytest.approx(_STRONG, abs=1e-5)


def test_strong_image_only_species_is_rescued():
    """A species absent from the text top-K is surfaced when its confirmed-photo
    match is strong — the rescue path the feature exists for."""
    text = [(1, 0.30), (2, 0.25)]
    refs = {99: _refs_at_cosines(_STRONG)}  # 99 has no text match at all
    out = _blend_scores(text, _QUERY, refs_by_species=refs)
    assert out[0] == (99, pytest.approx(_STRONG, abs=1e-5))
    assert {s for s, _ in out} == {1, 2, 99}


def test_multiple_refs_use_best():
    """With several refs for a species, the strongest cosine wins."""
    text = [(1, 0.30)]
    refs = {1: _refs_at_cosines(_WEAK, _STRONG)}  # one weak, one strong
    out = _blend_scores(text, _QUERY, refs_by_species=refs)
    assert out[0] == (1, pytest.approx(_STRONG, abs=1e-5))


def test_weak_image_match_is_ignored():
    """A sub-floor image match neither boosts a text species nor rescues an
    image-only one — output stays pure-text."""
    text = [(1, 0.30), (2, 0.25)]
    refs = {
        1: _refs_at_cosines(_WEAK),   # weak match on a text species → no boost
        99: _refs_at_cosines(_WEAK),  # weak match on an absent species → no rescue
    }
    out = _blend_scores(text, _QUERY, refs_by_species=refs)
    assert out == text  # unchanged


def test_distant_refs_ignored_text_wins():
    """Refs pointing away from the query (negative cosine) are well below the
    floor and ignored; the text score stands."""
    text = [(1, 0.30)]
    refs = {1: _refs_at_cosines(-1.0, -0.9)}
    out = _blend_scores(text, _QUERY, refs_by_species=refs)
    assert out[0] == (1, pytest.approx(0.30, abs=1e-5))


def test_returns_at_most_top_k():
    """Output length is capped at top_k (default 5)."""
    text = [(i, 0.30 - i * 0.01) for i in range(1, 11)]  # 10 text matches
    out = _blend_scores(text, _QUERY, refs_by_species={}, top_k=5)
    assert len(out) == 5
