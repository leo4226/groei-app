"""#886 — `plants.sun_requirement` may only ever hold a canonical value.

The Light row used to offer five tiles over a three-value model. Two of them
(`dark`, `bright`) had no mapping, so they reached the column verbatim; nothing
matched them, and the sun-fit card silently disappeared from the passport, the
quick sheet and the map marker instead of showing a poor fit.
"""
import pytest

from models import (
    SUN_REQUIREMENTS,
    PlantCreate,
    PlantUpdate,
    normalize_sun_requirement,
)


@pytest.mark.parametrize("value", SUN_REQUIREMENTS)
def test_canonical_values_pass_through(value):
    assert normalize_sun_requirement(value) == value


@pytest.mark.parametrize(
    "legacy,canonical",
    [
        ("dark", "shade"),
        ("bright", "partial_sun"),
        ("indirect", "partial_sun"),
        ("full-sun", "full_sun"),
    ],
)
def test_retired_tile_spellings_are_coerced(legacy, canonical):
    assert normalize_sun_requirement(legacy) == canonical


def test_unset_and_unknown_become_none():
    assert normalize_sun_requirement(None) is None
    assert normalize_sun_requirement("") is None
    assert normalize_sun_requirement("twilight") is None


def test_create_and_update_models_coerce():
    # A client running an older bundle must not be able to reintroduce a value
    # the sun engine cannot read.
    assert PlantCreate(name="Hosta", sun_requirement="dark").sun_requirement == "shade"
    assert PlantUpdate(sun_requirement="bright").sun_requirement == "partial_sun"


def test_update_distinguishes_unset_from_explicit_null():
    # `exclude_unset` drives the PATCH: omitting the field must leave the column
    # alone, while sending null must clear it.
    assert "sun_requirement" not in PlantUpdate().model_dump(exclude_unset=True)
    assert PlantUpdate(sun_requirement=None).model_dump(exclude_unset=True) == {
        "sun_requirement": None
    }


def test_every_coerced_value_is_a_real_profile():
    # The point of the fix: whatever a client sends, what lands in the column is
    # something PLANT_SUN_PROFILES / the species vocabulary can resolve.
    for raw in ("dark", "bright", "indirect", "full-sun", *SUN_REQUIREMENTS):
        assert normalize_sun_requirement(raw) in SUN_REQUIREMENTS
