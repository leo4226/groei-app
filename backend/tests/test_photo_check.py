"""BioCLIP photo sanity-check: identify journal photos, flag species mismatches.

The worker is mocked at the httpx layer — these tests never touch the GPU.
Response shapes verified against bioclip_worker.py: /identify returns
{"matches": [{"species_id", "confidence"}], "source", "embedding": <b64>}
— the embedding rides along, so ONE worker call suffices (the plan doc's
separate /embed-image call is unnecessary).
"""
import base64

import pytest

import services.photo_check as pc


class FakeResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json = json_data or {}

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


def _patch_worker(monkeypatch, matches, embedding=b"emb"):
    payload = {
        "matches": matches,
        "source": "bioclip",
        "embedding": base64.b64encode(embedding).decode(),
    }

    class FakeClient:
        def __init__(self, *a, **kw): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **kw):
            assert url.endswith("/identify")
            assert "image" in kw.get("files", {})
            return FakeResponse(json_data=payload)

    monkeypatch.setattr(pc.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(pc, "_WORKER_URL", "http://worker.test")


@pytest.mark.asyncio
async def test_match_stores_result_without_flag(monkeypatch):
    _patch_worker(monkeypatch, [{"species_id": 7, "confidence": 0.9}])
    out = await pc.check_photo(b"jpeg", plant_species_id=7)
    assert out == {"bioclip_species_id": 7, "bioclip_confidence": 0.9,
                   "species_mismatch": False, "embedding": b"emb"}


@pytest.mark.asyncio
async def test_confident_mismatch_sets_flag(monkeypatch):
    _patch_worker(monkeypatch, [{"species_id": 3, "confidence": 0.8}])
    out = await pc.check_photo(b"jpeg", plant_species_id=7)
    assert out["species_mismatch"] is True


@pytest.mark.asyncio
async def test_low_confidence_mismatch_not_flagged(monkeypatch):
    _patch_worker(monkeypatch, [{"species_id": 3, "confidence": 0.2}])
    out = await pc.check_photo(b"jpeg", plant_species_id=7)
    assert out["species_mismatch"] is False


@pytest.mark.asyncio
async def test_unknown_plant_species_never_flags(monkeypatch):
    _patch_worker(monkeypatch, [{"species_id": 3, "confidence": 0.9}])
    out = await pc.check_photo(b"jpeg", plant_species_id=None)
    assert out["species_mismatch"] is False
    assert out["bioclip_species_id"] == 3


@pytest.mark.asyncio
async def test_empty_matches_returns_result_without_flag(monkeypatch):
    _patch_worker(monkeypatch, [])
    out = await pc.check_photo(b"jpeg", plant_species_id=7)
    assert out["bioclip_species_id"] is None
    assert out["species_mismatch"] is False


@pytest.mark.asyncio
async def test_worker_not_configured_returns_none(monkeypatch):
    monkeypatch.setattr(pc, "_WORKER_URL", "")
    assert await pc.check_photo(b"jpeg", plant_species_id=7) is None


@pytest.mark.asyncio
async def test_worker_error_returns_none(monkeypatch):
    class FailingClient:
        def __init__(self, *a, **kw): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **kw):
            raise OSError("connection refused")

    monkeypatch.setattr(pc.httpx, "AsyncClient", FailingClient)
    monkeypatch.setattr(pc, "_WORKER_URL", "http://worker.test")
    assert await pc.check_photo(b"jpeg", plant_species_id=7) is None
