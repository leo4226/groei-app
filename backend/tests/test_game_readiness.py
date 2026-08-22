"""Which plants can be graded by their own photographs.

The quick-game preset builds a hunt only from "ready" plants, so this endpoint
decides whether a guest's 60 seconds ends in a verdict the photos support or
one a species name guessed at. Name matching cannot tell two plants of a
species apart — that is how a red climber was graded as a Scindapsus — so a
plant with no stored embedding is a plant whose round can go wrong.
"""
import pytest

from tests.game_world import create_game_schema, seed_map, seed_plants


EMBEDDING = bytes(2048)


async def _world(db):
    await create_game_schema(db)
    await seed_map(db, 10, "Garden")
    await seed_map(db, 11, "Living room", "indoor")
    await seed_plants(db, 10, [101, 102, 103])
    await seed_plants(db, 11, [201, 202])
    return db


@pytest.mark.asyncio
async def test_a_plant_is_ready_from_an_anchor_or_an_embedded_photo(
    client, seeded_db, auth_header
):
    await _world(seeded_db)
    # 101: an owner-confirmed anchor. 102: a logbook photo that got embedded.
    await seeded_db.execute(
        "INSERT INTO user_confirmed_embeddings (species_id, embedding, source_plant_id) "
        "VALUES (7, ?, 101)", (EMBEDDING,),
    )
    await seeded_db.execute(
        "INSERT INTO plant_photos (plant_id, r2_key, embedding) VALUES (102, 'k', ?)",
        (EMBEDDING,),
    )
    # 103 has a photo row but no embedding — the upload happened while the
    # BioCLIP worker was asleep, which looks like success and is not.
    await seeded_db.execute(
        "INSERT INTO plant_photos (plant_id, r2_key, embedding) VALUES (103, 'k', NULL)"
    )
    await seeded_db.commit()

    resp = await client.get(
        "/api/games/plant-readiness?map_ids=10", headers=auth_header)

    assert resp.status_code == 200, resp.text
    assert sorted(resp.json()["ready_plant_ids"]) == [101, 102]


@pytest.mark.asyncio
async def test_a_profile_photo_alone_does_not_make_a_plant_ready(
    client, seeded_db, auth_header
):
    """`_gather_references` can fall back to a live embed of the profile photo,
    but that needs the BioCLIP worker awake — unavailable exactly when the
    Windows machine is asleep, which is when a party is most likely happening.
    Counting it here would promise a photo-graded hunt we cannot deliver."""
    await _world(seeded_db)  # every seeded plant has a photo_path
    await seeded_db.commit()

    resp = await client.get(
        "/api/games/plant-readiness?map_ids=10,11", headers=auth_header)

    assert resp.json()["ready_plant_ids"] == []


@pytest.mark.asyncio
async def test_readiness_spans_the_maps_asked_for_and_no_others(
    client, seeded_db, auth_header
):
    await _world(seeded_db)
    for plant_id in (101, 201):
        await seeded_db.execute(
            "INSERT INTO plant_photos (plant_id, r2_key, embedding) VALUES (?, 'k', ?)",
            (plant_id, EMBEDDING),
        )
    await seeded_db.commit()

    indoor = await client.get(
        "/api/games/plant-readiness?map_ids=11", headers=auth_header)
    assert indoor.json()["ready_plant_ids"] == [201]

    both = await client.get(
        "/api/games/plant-readiness?map_ids=10,11", headers=auth_header)
    assert sorted(both.json()["ready_plant_ids"]) == [101, 201]


@pytest.mark.asyncio
async def test_another_households_map_reveals_nothing(
    client, seeded_db, auth_header
):
    await _world(seeded_db)
    await seeded_db.execute("UPDATE maps SET household_id = 2 WHERE id = 10")
    await seeded_db.execute(
        "INSERT INTO plant_photos (plant_id, r2_key, embedding) VALUES (101, 'k', ?)",
        (EMBEDDING,),
    )
    await seeded_db.commit()

    resp = await client.get(
        "/api/games/plant-readiness?map_ids=10", headers=auth_header)

    assert resp.status_code == 200
    assert resp.json()["ready_plant_ids"] == []


@pytest.mark.asyncio
async def test_an_archived_plant_is_never_offered(client, seeded_db, auth_header):
    await _world(seeded_db)
    await seeded_db.execute(
        "INSERT INTO plant_photos (plant_id, r2_key, embedding) VALUES (101, 'k', ?)",
        (EMBEDDING,),
    )
    await seeded_db.execute("UPDATE plants SET is_active = 0 WHERE id = 101")
    await seeded_db.commit()

    resp = await client.get(
        "/api/games/plant-readiness?map_ids=10", headers=auth_header)

    assert resp.json()["ready_plant_ids"] == []


@pytest.mark.asyncio
async def test_the_lettered_path_is_not_swallowed_by_the_join_code_route(
    client, seeded_db, auth_header
):
    """`GET /games/{code}` sits on the same prefix. If this route is ever
    declared after it, FastAPI matches the parameter first and this returns
    "Game not found" — the trap that made bulk-archive answer 405."""
    await _world(seeded_db)
    await seeded_db.commit()

    resp = await client.get(
        "/api/games/plant-readiness?map_ids=10", headers=auth_header)

    assert resp.status_code == 200, resp.text
    assert "ready_plant_ids" in resp.json()
