"""Unit tests for the pure candidate-selection logic (no network / DB)."""
from scripts.import_nl_flora import select_candidates


def _c(key, genus, count, name=None):
    return {"taxon_key": key, "genus": genus, "count": count, "name": name or f"sp{key}"}


def test_drops_existing_and_below_threshold():
    cands = [_c(1, "Quercus", 100), _c(2, "Quercus", 10), _c(3, "Betula", 80)]
    out = select_candidates(cands, existing_taxon_keys={1}, min_occurrences=50, cap=20)
    keys = {c["taxon_key"] for c in out}
    assert keys == {3}  # 1 already exists, 2 below threshold


def test_per_genus_cap_keeps_highest_counts():
    cands = [_c(i, "Salix", count=1000 - i) for i in range(30)]  # 30 willows, descending count
    out = select_candidates(cands, set(), min_occurrences=0, cap=20)
    assert len(out) == 20
    # kept should be the 20 highest counts (keys 0..19)
    assert {c["taxon_key"] for c in out} == set(range(20))


def test_no_genus_is_not_capped():
    cands = [_c(i, None, count=100) for i in range(50)]
    out = select_candidates(cands, set(), min_occurrences=0, cap=20)
    assert len(out) == 50  # ungrouped kept in full


def test_result_sorted_by_count_desc():
    cands = [_c(1, "Acer", 30), _c(2, "Betula", 90), _c(3, "Tilia", 60)]
    out = select_candidates(cands, set(), min_occurrences=0, cap=20)
    assert [c["count"] for c in out] == [90, 60, 30]
