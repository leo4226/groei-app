"""HTTP-level tests for the BioCLIP worker's multi-angle identify endpoint."""
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

torch = pytest.importorskip("torch")  # noqa: F401 — worker requires torch (GPU box only)

import bioclip_worker as worker


def _make_client():
    return TestClient(worker.app)


def _fake_embeddings(n_species: int = 4, dim: int = 512) -> tuple[np.ndarray, np.ndarray]:
    """Orthogonal-ish unit species embeddings + ids, so matching is deterministic."""
    rng = np.random.default_rng(0)
    rows = []
    for i in range(n_species):
        v = rng.normal(size=dim)
        rows.append(v / np.linalg.norm(v))
    embeddings = np.stack(rows).astype(np.float32)
    ids = np.arange(n_species, dtype=np.int64)
    return embeddings, ids


def _patch_worker_state():
    """Stub model readiness + embeddings so the endpoint reaches inference."""
    emb, ids = _fake_embeddings()
    patches = [
        patch.object(worker, "_model", object()),
        patch.object(worker, "_text_embeddings", emb),
        patch.object(worker, "_species_ids", ids),
        patch.object(worker, "_WORKER_TOKEN", ""),  # disable auth in tests
        patch.object(worker, "_read_upload_to_pil", _fake_pil),
        patch.object(worker, "_embed_pil_to_float32", lambda img: emb[0].copy()),
    ]
    for p in patches:
        p.start()
    return patches


async def _fake_pil(upload):
    """Stand-in for the PIL decode step; only rejects files named bad.jpg."""
    if getattr(upload, "filename", "") == "bad.jpg":
        raise worker.HTTPException(status_code=400, detail="Could not decode image")
    return object()  # any PIL-ish object; embedding is stubbed


def test_identify_single_image_returns_matches():
    client = _make_client()
    patches = _patch_worker_state()
    try:
        resp = client.post(
            "/identify",
            files={"image": ("plant.jpg", b"fake-jpeg-bytes", "image/jpeg")},
        )
    finally:
        for p in patches:
            p.stop()
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "bioclip"
    assert len(body["matches"]) >= 1
    assert "embedding" in body  # used by the backend for user-ref blending


def test_identify_multi_image_averages_embeddings():
    """Two angles: the worker calls _identify_multi with both images (the
    embedding average happens in services.bioclip_id.average_embeddings)."""
    client = _make_client()
    patches = _patch_worker_state()
    called_with = []

    original = worker._identify_multi

    def spy(images, top_k=5):
        called_with.append(len(images))
        return original(images, top_k=top_k)

    patches.append(patch.object(worker, "_identify_multi", spy))
    patches[-1].start()
    try:
        resp = client.post(
            "/identify",
            files=[
                ("image", ("plant.jpg", b"fake-jpeg-bytes", "image/jpeg")),
                ("extra_images", ("angle-2.jpg", b"fake-jpeg-bytes-2", "image/jpeg")),
            ],
        )
    finally:
        for p in patches:
            p.stop()
    assert resp.status_code == 200
    assert called_with == [2]


def test_identify_rejects_more_than_three_images():
    client = _make_client()
    patches = _patch_worker_state()
    try:
        resp = client.post(
            "/identify",
            files=[
                ("image", ("plant.jpg", b"a", "image/jpeg")),
                ("extra_images", ("b.jpg", b"b", "image/jpeg")),
                ("extra_images", ("c.jpg", b"c", "image/jpeg")),
                ("extra_images", ("d.jpg", b"d", "image/jpeg")),
            ],
        )
    finally:
        for p in patches:
            p.stop()
    assert resp.status_code == 400
    assert "3 images" in resp.json()["detail"]


def test_identify_skips_undecodable_angle():
    """Mixed failure: one angle fails to decode, the worker still identifies
    with the good angle instead of failing the whole request."""
    client = _make_client()
    # _patch_worker_state already stubs _read_upload_to_pil with _fake_pil,
    # which rejects only bad.jpg — no extra patch needed.
    patches = _patch_worker_state()
    try:
        resp = client.post(
            "/identify",
            files=[
                ("image", ("good.jpg", b"good", "image/jpeg")),
                ("extra_images", ("bad.jpg", b"bad", "image/jpeg")),
            ],
        )
    finally:
        for p in patches:
            p.stop()
    assert resp.status_code == 200
    assert resp.json()["source"] == "bioclip"
