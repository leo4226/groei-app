import pytest

from scripts.backfill_plant_types import should_backfill_plant_type


@pytest.mark.parametrize(
    ("plant_type", "category", "expected"),
    [
        (None, "grass", True),
        ("pot", "grass", True),
        ("ground", "shrub", True),
        ("seedling", "herb", True),
        ("tree", "shrub", True),
        ("tree", "tree", False),
        ("grass", "grass", False),
        ("grass", "shrub", False),
        (None, None, False),
    ],
)
def test_should_backfill_plant_type_only_repairs_missing_or_provably_corrupted_values(
    plant_type, category, expected
):
    assert should_backfill_plant_type(plant_type, category) is expected
