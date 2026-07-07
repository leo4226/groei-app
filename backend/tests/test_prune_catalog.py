"""Unit tests for the pure prune-selection logic (no DB)."""
from scripts.prune_catalog import select_excluded


def _row(id, genus, images_count=0):
    return {"id": id, "genus": genus, "images_count": images_count}


def test_under_cap_excludes_nothing():
    rows = [_row(i, "Rosa") for i in range(6)]
    assert select_excluded(rows, protected_ids=set(), cap=20) == set()


def test_over_cap_excludes_excess():
    rows = [_row(i, "Vanda") for i in range(30)]
    assert len(select_excluded(rows, set(), cap=20)) == 10  # 30 - 20


def test_protected_are_never_excluded():
    rows = [_row(i, "Vanda") for i in range(30)]
    protected = set(range(25))  # more protected than the cap
    excluded = select_excluded(rows, protected, cap=20)
    assert excluded == set(range(25, 30))  # only the 5 non-protected drop
    assert not (excluded & protected)


def test_genusless_rows_never_capped():
    rows = [_row(i, "") for i in range(50)] + [_row(100 + i, None) for i in range(50)]
    assert select_excluded(rows, set(), cap=20) == set()


def test_image_having_species_kept_first():
    # 20 with images + 2 without, cap 20 → the 2 image-less ones are dropped.
    rows = [_row(i, "Acer", images_count=1) for i in range(20)] + [_row(100, "Acer", 0), _row(101, "Acer", 0)]
    assert select_excluded(rows, set(), cap=20) == {100, 101}
