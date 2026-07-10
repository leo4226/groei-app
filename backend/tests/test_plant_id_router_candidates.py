"""Pure-ish tests for identify-router candidate shaping helpers."""

import pytest

from unittest.mock import AsyncMock

from routers.plant_id import (
    _bioclip_identify,
    _local_catalog_candidate_details,
    _plantnet_candidate_common_names,
)


class FakeDb:
    def __init__(self, species_rows=None, image_rows=None):
        self.species_rows = species_rows or []
        self.image_rows = image_rows or []
        self.queries: list[str] = []

    async def execute_fetchall(self, sql, params=()):
        self.queries.append(sql)
        if "FROM plant_species" in sql:
            return self.species_rows
        if "FROM species_images" in sql:
            return self.image_rows
        return []


@pytest.mark.asyncio
async def test_local_catalog_candidate_details_returns_species_and_image():
    db = FakeDb(
        species_rows=[{"id": 42, "common_name_nl": "Paardenbloem", "common_name_en": "Dandelion"}],
        image_rows=[{"url": "https://cdn.test/dandelion.jpg"}],
    )

    details = await _local_catalog_candidate_details(db, "Taraxacum officinale")

    assert details == {
        "species_id": 42,
        "common_name_nl": "Paardenbloem",
        "common_name_en": "Dandelion",
        "thumbnail_url": "https://cdn.test/dandelion.jpg",
    }


@pytest.mark.asyncio
async def test_local_catalog_candidate_details_handles_missing_species():
    db = FakeDb()

    details = await _local_catalog_candidate_details(db, "Definitely not a plant")

    assert details == {
        "species_id": None,
        "common_name_nl": None,
        "common_name_en": None,
        "thumbnail_url": None,
    }


def test_plantnet_candidate_common_names_keeps_english_mode_english_only():
    details = {
        "species_id": 42,
        "common_name_nl": "Paardenbloem",
        "common_name_en": "Dandelion",
        "thumbnail_url": "https://cdn.test/dandelion.jpg",
    }

    nl_names, en_names = _plantnet_candidate_common_names(
        plantnet_names=[],
        lang="en",
        local_details=details,
    )

    assert nl_names == []
    assert en_names == ["Dandelion"]


def test_plantnet_candidate_common_names_prefers_plantnet_requested_language():
    details = {
        "species_id": 42,
        "common_name_nl": "Paardenbloem",
        "common_name_en": "Dandelion",
        "thumbnail_url": "https://cdn.test/dandelion.jpg",
    }

    nl_names, en_names = _plantnet_candidate_common_names(
        plantnet_names=["Common dandelion"],
        lang="en",
        local_details=details,
    )

    assert nl_names == []
    assert en_names == ["Common dandelion"]


def test_plantnet_candidate_common_names_keeps_dutch_mode_dutch():
    details = {
        "species_id": 42,
        "common_name_nl": "Paardenbloem",
        "common_name_en": "Dandelion",
        "thumbnail_url": "https://cdn.test/dandelion.jpg",
    }

    nl_names, en_names = _plantnet_candidate_common_names(
        plantnet_names=[],
        lang="nl",
        local_details=details,
    )

    assert nl_names == ["Paardenbloem"]
    assert en_names == []


class _FakeWorkerResponse:
    status_code = 200
    text = "OK"

    def json(self):
        return {
            "matches": [
                {"species_id": 7, "confidence": 0.34},
                {"species_id": 8, "confidence": 0.21},
            ]
        }


class _FakeWorkerClient:
    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        return _FakeWorkerResponse()


class FakeBioClipDb:
    def __init__(self):
        self.queries: list[tuple[str, tuple]] = []

    async def execute_fetchall(self, sql, params=()):
        self.queries.append((sql, params))
        if "FROM plant_species" in sql:
            species_id = params[0]
            if species_id == 7:
                return [{
                    "latin_name": "Vaccinium corymbosum",
                    "common_name_nl": "Blauwe bes",
                    "common_name_en": None,
                }]
            if species_id == 8:
                return [{
                    "latin_name": "Rubus idaeus",
                    "common_name_nl": "Framboos",
                    "common_name_en": "Raspberry",
                }]
        if "FROM species_images" in sql:
            return []
        return []


@pytest.mark.asyncio
async def test_bioclip_identify_does_not_await_lazy_species_enrichment(monkeypatch):
    """Initial BioCLIP identify must return candidates, not block on LLM metadata repair."""
    db = FakeBioClipDb()
    enrich = AsyncMock(return_value=7)
    monkeypatch.setattr("routers.plant_id._BIOCLIP_WORKER_URL", "https://worker.test")
    monkeypatch.setattr("routers.plant_id._enrich_species_if_missing", enrich)
    monkeypatch.setattr("httpx.AsyncClient", _FakeWorkerClient)

    result = await _bioclip_identify(b"fake-jpeg", db, lang="en")

    assert result is not None
    assert result.source == "bioclip"
    assert [c.species_id for c in result.candidates] == [7, 8]
    # Missing English metadata should fall back in the frontend / later commit flow.
    # Calling the enrichment pipeline here is the source of the multi-minute wait.
    assert result.candidates[0].common_names_en == []
    enrich.assert_not_awaited()
