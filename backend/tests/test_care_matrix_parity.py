"""The frontend's care-type matrix must agree with `care_types.py` (#886 §4.5).

`care_types.py` opens by claiming "Adding a new care type = adding one entry to
CARE_TYPES + WARNING_PRIORITY". That is not true today: the edit form carries
its own copy of the matrix in `frontend/src/pages/editPlantCareSchedules.ts`
(`EDITABLE_CARE_TYPES` + `DEFAULT_INTERVALS`), which decides which toggles the
form offers and what interval each starts at.

The two agreed when this was written, but nothing enforced it, and a drift is
invisible until a user hits it: the form would offer a toggle the backend 422s
on, or hide one the plant is allowed to have.

Reading the TypeScript is deliberate. The alternative — serving the matrix from
an endpoint — puts a network round trip in front of a form that otherwise needs
none, to solve a problem that is really about two files getting edited together.
A test that fails loudly makes the docstring's claim true for the price of a
regex.
"""
import re
from pathlib import Path

import pytest

from care_types import CARE_TYPES, is_care_type_valid_for_env

ENVIRONMENTS = ("indoor", "outdoor_container", "outdoor_ground")

_SOURCE = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "pages" / "editPlantCareSchedules.ts"
)


def _frontend_source() -> str:
    assert _SOURCE.exists(), (
        f"{_SOURCE} is missing. If the edit form's care matrix moved, point this "
        "test at its new home rather than deleting it."
    )
    return _SOURCE.read_text(encoding="utf-8")


def _frontend_editable_types() -> list[str]:
    """The care types the edit form offers, from EDITABLE_CARE_TYPES."""
    block = re.search(
        r"EDITABLE_CARE_TYPES\s*=\s*\[(.*?)\]", _frontend_source(), re.DOTALL
    )
    assert block, "could not find EDITABLE_CARE_TYPES in the edit form"
    return re.findall(r"'([a-z_]+)'", block.group(1))


def _frontend_intervals() -> dict[str, dict[str, int | None]]:
    """DEFAULT_INTERVALS as {care_type: {environment: interval or None}}."""
    block = re.search(
        r"DEFAULT_INTERVALS[^=]*=\s*\{(.*?)\n\}", _frontend_source(), re.DOTALL
    )
    assert block, "could not find DEFAULT_INTERVALS in the edit form"

    matrix: dict[str, dict[str, int | None]] = {}
    for care_type, body in re.findall(r"(\w+):\s*\{([^}]*)\}", block.group(1)):
        row: dict[str, int | None] = {}
        for env, value in re.findall(r"(\w+):\s*(null|\d+)", body):
            row[env] = None if value == "null" else int(value)
        matrix[care_type] = row
    return matrix


@pytest.fixture(scope="module")
def frontend_matrix() -> dict[str, dict[str, int | None]]:
    return _frontend_intervals()


def test_the_form_offers_exactly_the_user_managed_care_types():
    # Weather-triggered types are automatic — sync_care_schedules 422s on them,
    # so a toggle for one would be a dead control.
    expected = {ct for ct, d in CARE_TYPES.items() if not d.get("is_weather_triggered")}
    assert set(_frontend_editable_types()) == expected


def test_every_editable_type_has_a_row_in_the_matrix(frontend_matrix):
    assert set(_frontend_editable_types()) == set(frontend_matrix)


@pytest.mark.parametrize("environment", ENVIRONMENTS)
def test_the_form_offers_a_type_exactly_when_the_backend_accepts_it(
    frontend_matrix, environment
):
    # editableCareTypesForEnvironment() filters on `!= null`, so a null here is
    # the frontend saying "not valid in this environment". That must match
    # is_care_type_valid_for_env, or the form offers a toggle the endpoint
    # rejects, or hides one the plant is entitled to.
    for care_type, row in frontend_matrix.items():
        frontend_valid = row.get(environment) is not None
        backend_valid = is_care_type_valid_for_env(care_type, environment)
        assert frontend_valid == backend_valid, (
            f"{care_type} in {environment}: form says "
            f"{'valid' if frontend_valid else 'invalid'}, backend says "
            f"{'valid' if backend_valid else 'invalid'}"
        )


@pytest.mark.parametrize("environment", ENVIRONMENTS)
def test_shared_default_intervals_are_identical(frontend_matrix, environment):
    # Where the backend states a default, the form must seed a new schedule with
    # the same number — otherwise the interval a plant gets depends on whether it
    # was created by the backend's seeding or by someone flipping the toggle.
    #
    # `mist` is valid indoors via valid_environments but carries no default
    # interval, so there is nothing to compare; its validity is covered above.
    for care_type, row in frontend_matrix.items():
        backend_default = CARE_TYPES[care_type]["default_intervals"].get(environment)
        if backend_default is None:
            continue
        assert row.get(environment) == backend_default, (
            f"{care_type} in {environment}: form seeds {row.get(environment)}d, "
            f"backend defaults to {backend_default}d"
        )
