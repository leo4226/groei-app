"""Tests for the garden-fit endpoints' localization.

Both endpoints used to build their `reason` strings from a Dutch-only label
map (and one branch was literally `"..." if True else "No light preference
known"`), so English accounts read Dutch verdicts in the discovery card and
the field-guide chips. The reasons now follow `?lang=`.
"""
import pytest

BASE = "/api"

_PLANT_SPECIES_DDL = """
    CREATE TABLE IF NOT EXISTS plant_species (
        id INTEGER PRIMARY KEY,
        latin_name TEXT,
        common_name_nl TEXT,
        sun_preference TEXT
    )
"""


async def _seed(db, sun_preference):
    await db.execute(_PLANT_SPECIES_DDL)
    await db.execute(
        "INSERT INTO plant_species (id, latin_name, common_name_nl, sun_preference) "
        "VALUES (20, 'Cupressus sempervirens', 'Italiaanse cipres', ?)",
        (sun_preference,),
    )
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (1, 'Tuin', 'outdoor', 1)"
    )
    await db.commit()


@pytest.mark.asyncio
async def test_garden_fit_reason_follows_lang(client, seeded_db, auth_header):
    await _seed(seeded_db, "full_sun")

    nl = await client.get(f"{BASE}/species/20/garden-fit?lang=nl", headers=auth_header)
    en = await client.get(f"{BASE}/species/20/garden-fit?lang=en", headers=auth_header)
    assert nl.status_code == 200, nl.text
    assert en.status_code == 200, en.text

    assert nl.json()[0]["reason"] == "Ideaal licht"
    assert en.json()[0]["reason"] == "Ideal light"
    # The grade itself is language-independent — only the copy changes.
    assert nl.json()[0]["sun_fit"] == en.json()[0]["sun_fit"]


@pytest.mark.asyncio
async def test_garden_fit_unknown_preference_is_localized(client, seeded_db, auth_header):
    """The branch that used to carry the `if True else` dead conditional."""
    await _seed(seeded_db, None)

    en = await client.get(f"{BASE}/species/20/garden-fit?lang=en", headers=auth_header)
    assert en.status_code == 200, en.text
    assert en.json()[0]["reason"] == "No light preference known"
    assert en.json()[0]["sun_fit"] is None


@pytest.mark.asyncio
async def test_garden_fit_batch_reason_follows_lang(client, seeded_db, auth_header):
    await _seed(seeded_db, "full_sun")

    resp = await client.post(
        f"{BASE}/species/garden-fit/batch?lang=en",
        json={"species_ids": [20]},
        headers=auth_header,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["20"][0]["reason"] == "Ideal light"


@pytest.mark.asyncio
async def test_garden_fit_defaults_to_dutch(client, seeded_db, auth_header):
    """No ?lang= keeps the pre-existing Dutch response."""
    await _seed(seeded_db, "full_sun")

    resp = await client.get(f"{BASE}/species/20/garden-fit", headers=auth_header)
    assert resp.status_code == 200, resp.text
    assert resp.json()[0]["reason"] == "Ideaal licht"
