"""Unit tests for launch-focused catalog enrichment helpers."""

from scripts.enrich_catalog_launch import (
    choose_occurrence_image,
    latin_name_for_gbif_match,
    localized_name_updates,
    taxonomy_updates_from_match,
)


def test_latin_name_for_gbif_match_removes_cultivar_epithet():
    assert latin_name_for_gbif_match("Capsicum annuum 'Lombok'") == "Capsicum annuum"


def test_latin_name_for_gbif_match_rejects_genus_placeholder():
    assert latin_name_for_gbif_match("Rosa spp.") is None
    assert latin_name_for_gbif_match("Phalaenopsis") is None


def test_taxonomy_updates_from_match_fills_only_missing_fields():
    row = {
        "family": None,
        "genus": "ExistingGenus",
        "gbif_taxon_key": None,
    }
    match = {
        "matchType": "EXACT",
        "confidence": 99,
        "usageKey": 123,
        "family": "Lamiaceae",
        "genus": "Lavandula",
        "rank": "SPECIES",
    }

    assert taxonomy_updates_from_match(row, match) == {
        "family": "Lamiaceae",
        "gbif_taxon_key": 123,
    }


def test_taxonomy_updates_from_match_rejects_weak_match():
    row = {"family": None, "genus": None, "gbif_taxon_key": None}
    match = {
        "matchType": "FUZZY",
        "confidence": 72,
        "usageKey": 456,
        "family": "Rosaceae",
        "genus": "Rosa",
    }

    assert taxonomy_updates_from_match(row, match) == {}


def test_localized_name_updates_replaces_latin_echo_but_preserves_real_name():
    row = {
        "latin_name": "Chelidonium majus",
        "common_name_nl": "Chelidonium majus",
        "common_name_en": "Greater celandine",
    }

    assert localized_name_updates(row, nl_name="Stinkende gouwe", en_name="Celandine") == {
        "common_name_nl": "Stinkende gouwe",
    }


def test_choose_occurrence_image_prefers_still_image_with_http_url():
    record = {
        "media": [
            {"type": "Sound", "identifier": "https://example.test/sound.mp3"},
            {
                "type": "StillImage",
                "identifier": "//images.example.test/plant.jpg",
                "thumbnail": "//images.example.test/thumb.jpg",
                "license": "CC_BY_4_0",
            },
        ]
    }

    assert choose_occurrence_image(record, source="gbif_occurrence", primary=True) == {
        "url": "https://images.example.test/plant.jpg",
        "thumbnail_url": "https://images.example.test/thumb.jpg",
        "source": "gbif_occurrence",
        "license": "CC_BY_4_0",
        "is_primary": True,
    }
