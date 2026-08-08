"""Worker-side tests for the incremental catalog write path (#866).

`/embed-text` is what lets a species we only learned about through a PlantNet
correction enter BioCLIP's candidate set without a manual precompute run. It
must: append new species, replace existing ones in place, persist atomically so
a restart keeps them, and stay behind the shared-secret token.
"""
import json
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

import bioclip_worker as worker


_DIM = 8


def _unit_rows(n: int, dim: int = _DIM, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    rows = [rng.normal(size=dim) for _ in range(n)]
    return np.stack([r / np.linalg.norm(r) for r in rows]).astype(np.float32)


def _fake_encode(entries):
    """Deterministic stand-in for the GPU text encoder: one unit row per species,
    with the species_id baked in so replacement is observable."""
    rows = []
    for i, entry in enumerate(entries):
        vec = np.zeros(_DIM, dtype=np.float32)
        vec[entry.species_id % _DIM] = 1.0
        vec[(i + 3) % _DIM] += 0.001  # keep rows distinguishable
        rows.append(vec / np.linalg.norm(vec))
    return np.stack(rows).astype(np.float32)


def _patch_worker(tmp_path: Path, ids: list[int], names: list[str]):
    """Loaded catalog + stubbed encoder + embeddings dir pointed at tmp_path."""
    patches = [
        patch.object(worker, "_model", object()),
        patch.object(worker, "_text_embeddings", _unit_rows(len(ids))),
        patch.object(worker, "_species_ids", list(ids)),
        patch.object(worker, "_species_names", list(names)),
        patch.object(worker, "_WORKER_TOKEN", ""),
        patch.object(worker, "_encode_species", _fake_encode),
        patch.object(worker, "_EMBEDDINGS_DIR", tmp_path),
        patch.object(worker, "_EMBEDDINGS_PATH", tmp_path / "species_embeddings.npy"),
        patch.object(worker, "_SPECIES_IDS_PATH", tmp_path / "species_ids.npy"),
        patch.object(worker, "_META_PATH", tmp_path / "meta.json"),
    ]
    for p in patches:
        p.start()
    return patches


def _post(payload):
    return TestClient(worker.app).post("/embed-text", json=payload)


def test_new_species_is_appended_to_the_live_catalog(tmp_path):
    patches = _patch_worker(tmp_path, [1, 2], ["Rosa canina", "Bellis perennis"])
    try:
        resp = _post({"species": [
            {"species_id": 77, "latin_name": "Silene dioica", "common_name_en": "Red campion"}
        ]})
        assert resp.status_code == 200
        assert resp.json() == {"added": [77], "updated": [], "species_count": 3}
        # Live state, not just the response: the next identify must see it.
        assert worker._species_ids == [1, 2, 77]
        assert worker._species_names[-1] == "Silene dioica"
        assert worker._text_embeddings.shape == (3, _DIM)
    finally:
        for p in patches:
            p.stop()


def test_known_species_is_replaced_in_place(tmp_path):
    patches = _patch_worker(tmp_path, [1, 2], ["Rosa canina", "Bellis perennis"])
    try:
        before = worker._text_embeddings[0].copy()
        resp = _post({"species": [{"species_id": 1, "latin_name": "Rosa rugosa"}]})
        assert resp.status_code == 200
        assert resp.json() == {"added": [], "updated": [1], "species_count": 2}
        assert worker._species_ids == [1, 2]  # no duplicate row
        assert worker._species_names[0] == "Rosa rugosa"
        assert not np.allclose(worker._text_embeddings[0], before)
    finally:
        for p in patches:
            p.stop()


def test_update_is_persisted_and_survives_a_reload(tmp_path):
    patches = _patch_worker(tmp_path, [1], ["Rosa canina"])
    try:
        assert _post({"species": [{"species_id": 42, "latin_name": "Urtica dioica"}]}).status_code == 200

        # Simulate a restart: drop in-memory state, load from the files we wrote.
        with patch.object(worker, "_text_embeddings", None), \
             patch.object(worker, "_species_ids", None), \
             patch.object(worker, "_species_names", None):
            assert worker._load_embeddings() is True
            assert worker._species_ids == [1, 42]
            assert worker._species_names == ["Rosa canina", "Urtica dioica"]
            assert worker._text_embeddings.shape == (2, _DIM)

        meta = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))
        assert meta["species_count"] == 2
        assert meta["catalog_updated_at"]  # staleness signal for /coverage
    finally:
        for p in patches:
            p.stop()


def test_no_temp_files_are_left_behind(tmp_path):
    patches = _patch_worker(tmp_path, [1], ["Rosa canina"])
    try:
        _post({"species": [{"species_id": 9, "latin_name": "Urtica dioica"}]})
        assert not list(tmp_path.glob("*.tmp.npy"))
    finally:
        for p in patches:
            p.stop()


def test_torn_write_recovers_the_aligned_prefix(tmp_path):
    """Crash between the two os.replace calls: one file is a row ahead. The
    worker must come back on the common prefix — refusing to load would leave
    identification dead until someone rebuilds the catalog by hand. The dropped
    species is still queued backend-side, so the next sync re-adds it."""
    patches = _patch_worker(tmp_path, [1, 2], ["Rosa canina", "Bellis perennis"])
    try:
        assert _post({"species": [{"species_id": 9, "latin_name": "Urtica dioica"}]}).status_code == 200
        # Roll the id file back to its pre-update state, leaving embeddings ahead.
        np.save(
            str(tmp_path / "species_ids.npy"),
            np.array([(1, "Rosa canina"), (2, "Bellis perennis")], dtype=object),
        )

        with patch.object(worker, "_text_embeddings", None), \
             patch.object(worker, "_species_ids", None), \
             patch.object(worker, "_species_names", None):
            assert worker._load_embeddings() is True
            assert worker._species_ids == [1, 2]
            assert worker._text_embeddings.shape == (2, _DIM)
    finally:
        for p in patches:
            p.stop()


def test_wholesale_misalignment_still_refuses_to_load(tmp_path):
    """A gap larger than one batch is corruption, not a torn write."""
    patches = _patch_worker(tmp_path, [1], ["Rosa canina"])
    try:
        np.save(str(tmp_path / "species_embeddings.npy"), _unit_rows(400))
        np.save(str(tmp_path / "species_ids.npy"), np.array([(1, "Rosa canina")], dtype=object))

        with patch.object(worker, "_text_embeddings", None), \
             patch.object(worker, "_species_ids", None), \
             patch.object(worker, "_species_names", None):
            assert worker._load_embeddings() is False
    finally:
        for p in patches:
            p.stop()


def test_blank_latin_names_are_rejected(tmp_path):
    patches = _patch_worker(tmp_path, [1], ["Rosa canina"])
    try:
        resp = _post({"species": [{"species_id": 5, "latin_name": "   "}]})
        assert resp.status_code == 400
        assert worker._species_ids == [1]
    finally:
        for p in patches:
            p.stop()


def test_batch_over_the_cap_is_rejected(tmp_path):
    patches = _patch_worker(tmp_path, [1], ["Rosa canina"])
    try:
        oversized = [
            {"species_id": i, "latin_name": f"Genus species{i}"}
            for i in range(worker._MAX_EMBED_TEXT_BATCH + 1)
        ]
        assert _post({"species": oversized}).status_code == 400
    finally:
        for p in patches:
            p.stop()


def test_refuses_to_bootstrap_a_catalog_when_none_is_loaded(tmp_path):
    """A worker with no reference set must 503, not start serving identify
    against the two species someone happened to sync first."""
    patches = _patch_worker(tmp_path, [1], ["Rosa canina"])
    patches.append(patch.object(worker, "_text_embeddings", None))
    patches[-1].start()
    try:
        assert _post({"species": [{"species_id": 5, "latin_name": "Urtica dioica"}]}).status_code == 503
    finally:
        for p in patches:
            p.stop()


def test_token_is_enforced(tmp_path):
    patches = _patch_worker(tmp_path, [1], ["Rosa canina"])
    patches.append(patch.object(worker, "_WORKER_TOKEN", "s3cret"))
    patches[-1].start()
    try:
        client = TestClient(worker.app)
        payload = {"species": [{"species_id": 5, "latin_name": "Urtica dioica"}]}
        assert client.post("/embed-text", json=payload).status_code == 401
        ok = client.post("/embed-text", json=payload, headers={"X-Worker-Token": "s3cret"})
        assert ok.status_code == 200
    finally:
        for p in patches:
            p.stop()
