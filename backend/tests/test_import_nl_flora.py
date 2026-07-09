"""Unit tests for the occurrence-scoped NL flora importer helpers."""
from collections import Counter

from scripts.import_nl_flora import (
    ExistingCatalogState,
    OccurrenceCandidate,
    aggregate_occurrence_facets,
    parse_countries,
    select_candidates,
    select_import_candidates,
)


def _gbif(key, name, genus):
    return {
        "key": key,
        "species": name,
        "canonicalName": name,
        "scientificName": f"{name} L.",
        "rank": "SPECIES",
        "taxonomicStatus": "ACCEPTED",
        "genus": genus,
        "family": "Testaceae",
    }


def _legacy_candidate(key, genus, count, name=None):
    return {"taxon_key": key, "genus": genus, "count": count, "name": name or f"sp{key}"}


def test_parse_countries_normalises_dedupes_and_validates():
    assert parse_countries(" nl,BE,nl ") == ["NL", "BE"]

    try:
        parse_countries("NLD")
    except ValueError as exc:
        assert "Invalid ISO-3166" in str(exc)
    else:  # pragma: no cover - defensive assertion
        raise AssertionError("Expected invalid country code to raise")


def test_aggregate_occurrence_facets_sums_filters_and_sorts():
    candidates = aggregate_occurrence_facets(
        {
            "NL": [
                {"name": "100", "count": 30},
                {"name": "200", "count": 10},
                {"name": "bad", "count": 999},
            ],
            "BE": [
                {"name": "100", "count": 25},
                {"name": "300", "count": 49},
            ],
        },
        min_occurrences=50,
    )

    assert [c.taxon_key for c in candidates] == [100]
    assert candidates[0].occurrence_count == 55
    assert candidates[0].country_counts == {"NL": 30, "BE": 25}


def test_select_candidates_drops_existing_and_below_threshold():
    cands = [
        _legacy_candidate(1, "Quercus", 100),
        _legacy_candidate(2, "Quercus", 10),
        _legacy_candidate(3, "Betula", 80),
    ]

    out = select_candidates(cands, existing_taxon_keys={1}, min_occurrences=50, cap=20)

    assert {c["taxon_key"] for c in out} == {3}


def test_select_candidates_per_genus_cap_keeps_highest_counts():
    cands = [_legacy_candidate(i, "Salix", count=1000 - i) for i in range(30)]

    out = select_candidates(cands, set(), min_occurrences=0, cap=20)

    assert len(out) == 20
    assert {c["taxon_key"] for c in out} == set(range(20))


def test_select_candidates_no_genus_is_not_capped():
    cands = [_legacy_candidate(i, None, count=100) for i in range(50)]

    out = select_candidates(cands, set(), min_occurrences=0, cap=20)

    assert len(out) == 50


def test_select_candidates_result_sorted_by_count_desc():
    cands = [
        _legacy_candidate(1, "Acer", 30),
        _legacy_candidate(2, "Betula", 90),
        _legacy_candidate(3, "Tilia", 60),
    ]

    out = select_candidates(cands, set(), min_occurrences=0, cap=20)

    assert [c["count"] for c in out] == [90, 60, 30]


def test_select_import_candidates_skips_existing_key_slug_and_genus_cap():
    existing = ExistingCatalogState(
        gbif_taxon_keys={10},
        slugs={"urtica-dioica"},
        enabled_by_genus=Counter({"Carex": 2}),
    )
    candidates = [
        OccurrenceCandidate(10, 100, gbif=_gbif(10, "Bellis perennis", "Bellis")),
        OccurrenceCandidate(20, 100, gbif=_gbif(20, "Urtica dioica", "Urtica")),
        OccurrenceCandidate(30, 100, gbif=_gbif(30, "Carex hirta", "Carex")),
        OccurrenceCandidate(40, 100, gbif=_gbif(40, "Holcus lanatus", "Holcus")),
    ]

    selected, stats = select_import_candidates(candidates, existing=existing, cap=2, limit=None)

    assert [c.taxon_key for c in selected] == [40]
    assert stats.existing_key == 1
    assert stats.existing_slug == 1
    assert stats.genus_cap == 1
    assert stats.selected == 1
    assert selected[0].species_data["slug"] == "holcus-lanatus"


def test_select_import_candidates_respects_limit_and_projects_genus_counts():
    existing = ExistingCatalogState(
        gbif_taxon_keys=set(),
        slugs=set(),
        enabled_by_genus=Counter({"Rosa": 1}),
    )
    candidates = [
        OccurrenceCandidate(1, 100, gbif=_gbif(1, "Rosa canina", "Rosa")),
        OccurrenceCandidate(2, 90, gbif=_gbif(2, "Rosa rubiginosa", "Rosa")),
        OccurrenceCandidate(3, 80, gbif=_gbif(3, "Taraxacum officinale", "Taraxacum")),
    ]

    selected, stats = select_import_candidates(candidates, existing=existing, cap=2, limit=2)

    # Existing Rosa count 1 leaves one slot. The second Rosa is skipped because
    # the projected count reaches cap before Taraxacum fills the requested limit.
    assert [c.taxon_key for c in selected] == [1, 3]
    assert stats.genus_cap == 1
    assert stats.selected == 2
