"""Pure-ish tests for identify-router candidate shaping helpers."""

import pytest

from routers.plant_id import _local_catalog_candidate_details, _plantnet_candidate_common_names


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
