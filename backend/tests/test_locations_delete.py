"""Deleting a location that still holds plants.

The block is a 409 and its message is localized. Both halves matter: the
settings page branches on the status (never on the text — see the language
rules in CLAUDE.md), and the text has to follow the caller's UI language
rather than being a hardcoded Dutch sentence.
"""
import pytest


async def _seed_location_with_plant(db, *, with_plant: bool) -> int:
    await db.execute(
        "INSERT INTO locations (id, name, icon, sort_order, household_id) "
        "VALUES (5, 'Vensterbank', '🪟', 0, 1)"
    )
    if with_plant:
        await db.execute(
            "INSERT INTO plants (id, name, location_id, household_id, is_active) "
            "VALUES (900, 'Monstera', 5, 1, 1)"
        )
    await db.commit()
    return 5


@pytest.mark.asyncio
async def test_delete_blocked_by_plants_is_a_409(client, seeded_db, auth_header):
    await _seed_location_with_plant(seeded_db, with_plant=True)

    response = await client.delete("/api/locations/5", headers=auth_header)

    assert response.status_code == 409
    # The location survives — this is a block, not a cascade.
    rows = await seeded_db.execute_fetchall("SELECT id FROM locations WHERE id = 5")
    assert len(rows) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "lang,expected",
    [
        ("en", "Move your plants to another location first"),
        ("nl", "Verplaats eerst je planten naar een andere locatie"),
    ],
)
async def test_block_message_follows_the_requested_language(
    client, seeded_db, auth_header, lang, expected
):
    await _seed_location_with_plant(seeded_db, with_plant=True)

    response = await client.delete(
        f"/api/locations/5?lang={lang}", headers=auth_header
    )

    assert response.status_code == 409
    assert response.json()["detail"] == expected


@pytest.mark.asyncio
async def test_empty_location_deletes(client, seeded_db, auth_header):
    await _seed_location_with_plant(seeded_db, with_plant=False)

    response = await client.delete("/api/locations/5", headers=auth_header)

    assert response.status_code == 200
    rows = await seeded_db.execute_fetchall("SELECT id FROM locations WHERE id = 5")
    assert rows == []
