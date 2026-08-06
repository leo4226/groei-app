"""Unit tests for the multi-angle embedding ensemble (audit §3.2 / #807)."""
import numpy as np
import pytest

from services.bioclip_id import average_embeddings


def _unit_vector(dim: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim)
    return v / np.linalg.norm(v)


def test_average_single_embedding_unchanged():
    """A lone embedding passes through untouched — single-photo behavior."""
    emb = _unit_vector(512, 1)
    result = average_embeddings([emb])
    assert result.shape == (512,)
    np.testing.assert_allclose(result, emb)


def test_average_two_embeddings_is_renormalized_unit_vector():
    """Mean of two unit vectors is re-normalized back to unit length."""
    a = _unit_vector(512, 2)
    b = _unit_vector(512, 3)
    result = average_embeddings([a, b])
    assert result.shape == (512,)
    assert abs(np.linalg.norm(result) - 1.0) < 1e-6


def test_average_two_embeddings_points_between_inputs():
    """The ensemble embedding has equal cosine to each input (they are
    symmetric around the mean direction)."""
    a = _unit_vector(512, 4)
    b = _unit_vector(512, 5)
    result = average_embeddings([a, b])
    cos_a = float(a @ result)
    cos_b = float(b @ result)
    assert abs(cos_a - cos_b) < 1e-6
    # For random 512-d unit vectors the mean direction sits at ~1/sqrt(2) ≈ 0.707
    # from each input. The important property is symmetry, not the absolute value.
    assert 0.5 < cos_a < 0.95


def test_average_three_embeddings_matches_componentwise_mean_direction():
    """Ensemble direction equals the normalized mean of the inputs (which is
    exactly what cosine matching sees)."""
    embs = [_unit_vector(512, s) for s in range(6, 9)]
    result = average_embeddings(embs)
    expected = np.mean(np.stack(embs), axis=0)
    expected = expected / np.linalg.norm(expected)
    np.testing.assert_allclose(result, expected, atol=1e-6)


def test_average_opposite_vectors_handles_zero_mean():
    """Perfectly canceling inputs produce a zero vector; the helper must not
    divide by zero (returns the zero vector rather than NaN)."""
    a = np.zeros(16)
    a[0] = 1.0
    result = average_embeddings([a, -a])
    assert np.all(np.isfinite(result))
    assert np.linalg.norm(result) == 0.0


def test_average_does_not_mutate_inputs():
    """The helper must not mutate the caller's embeddings in place."""
    embs = [_unit_vector(512, s) for s in range(10, 13)]
    copies = [e.copy() for e in embs]
    average_embeddings(embs)
    for orig, copy in zip(embs, copies):
        np.testing.assert_array_equal(orig, copy)
