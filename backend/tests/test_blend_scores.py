"""Unit tests for the pure score-blending helper."""
import numpy as np
import pytest

from routers.plant_id import _blend_scores


def _make_unit(*vals: float) -> np.ndarray:
    """Helper: build a normalised 1D vector from raw floats."""
    arr = np.array(vals, dtype=np.float32)
    return arr / np.linalg.norm(arr)


def test_no_refs_returns_text_matches_unchanged():
    """With empty refs dict, blend collapses to identity on text_matches."""
    text = [(1, 0.30), (2, 0.25), (3, 0.20)]
    query = _make_unit(1.0, 0.0)
    out = _blend_scores(text, query, refs_by_species={})
    assert out == text


def test_user_ref_match_beats_text_score():
    """A species with a strongly-matching image ref outranks text-only competitors."""
    text = [(1, 0.30), (2, 0.25), (3, 0.20)]
    query = _make_unit(1.0, 0.0)
    # Species 3 has a ref pointing in the same direction as the query (cos = 1.0)
    refs = {3: np.array([[1.0, 0.0]], dtype=np.float32)}
    out = _blend_scores(text, query, refs_by_species=refs)
    assert out[0][0] == 3  # species 3 should now be first
    # combined score uses 1.1x boost on image-to-image: 1.0 * 1.1 = 1.1
    assert out[0][1] == pytest.approx(1.1, abs=1e-5)


def test_multiple_refs_per_species_uses_max():
    """If a species has multiple refs, the best (highest cosine) wins."""
    text = [(1, 0.30)]
    query = _make_unit(1.0, 0.0)
    # Two refs for species 1: one weak (cos 0.2), one strong (cos 1.0)
    refs = {1: np.array([[0.2, 0.98], [1.0, 0.0]], dtype=np.float32)}
    # Normalize for cosine
    refs[1] = refs[1] / np.linalg.norm(refs[1], axis=1, keepdims=True)
    out = _blend_scores(text, query, refs_by_species=refs)
    # Image score = max(cos with [0.2,0.98], cos with [1.0,0.0]) = ~1.0
    # combined = max(0.30 text, 1.0 * 1.1 image) = 1.1
    assert out[0] == (1, pytest.approx(1.1, abs=1e-5))


def test_species_in_refs_but_not_text_gets_ranked():
    """A species present only in user-refs (not in text top-K) still appears in result."""
    text = [(1, 0.30), (2, 0.25)]
    query = _make_unit(1.0, 0.0)
    # Species 99 only has user refs, no text match
    refs = {99: np.array([[1.0, 0.0]], dtype=np.float32)}
    out = _blend_scores(text, query, refs_by_species=refs)
    # Species 99: text=0, image=1.0*1.1=1.1 → wins
    assert out[0][0] == 99
    assert {s for s, _ in out} >= {1, 2, 99}


def test_returns_at_most_top_k():
    """Output length is capped at top_k (default 5)."""
    text = [(i, 0.30 - i * 0.01) for i in range(1, 11)]  # 10 text matches
    query = _make_unit(1.0, 0.0)
    out = _blend_scores(text, query, refs_by_species={}, top_k=5)
    assert len(out) == 5


def test_text_wins_when_image_ref_is_distant():
    """Image ref pointing in opposite direction → image score is low; text wins."""
    text = [(1, 0.30)]
    query = _make_unit(1.0, 0.0)
    # Ref pointing opposite to query (cos = -1)
    refs = {1: np.array([[-1.0, 0.0]], dtype=np.float32)}
    out = _blend_scores(text, query, refs_by_species=refs)
    # combined = max(0.30, -1.0 * 1.1) = 0.30 (text wins)
    assert out[0] == (1, pytest.approx(0.30, abs=1e-5))
