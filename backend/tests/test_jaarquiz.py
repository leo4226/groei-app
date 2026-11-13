"""Jaarquiz: admin-only config, first-come names, private answers, aggregate results."""
import pytest
import pytest_asyncio

from routers.jaarquiz import QuizConfig, compute_results

SCHEMA = """
    CREATE TABLE jaarquiz (
        id INTEGER PRIMARY KEY,
        join_code TEXT NOT NULL UNIQUE,
        config TEXT NOT NULL,
        revealed BOOLEAN NOT NULL DEFAULT 0,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    );
    CREATE TABLE jaarquiz_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL,
        voter TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        answers TEXT NOT NULL DEFAULT '{}',
        done BOOLEAN NOT NULL DEFAULT 0,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        UNIQUE (quiz_id, voter)
    );
"""

PEOPLE = ["Ann", "Bob", "Cas"]
CONFIG = {
    "title": "Test",
    "people": [{"name": n} for n in PEOPLE],
    "questions": [
        {"id": "weird", "text": "Wie is het raarst?"},
        {"id": "others", "text": "Rank deze", "options": ["X", "Y"]},
    ],
    "liar": {"name": "Ann", "message": "Nee"},
}


@pytest_asyncio.fixture
async def db(seeded_db):
    await seeded_db.executescript(SCHEMA)
    await seeded_db.commit()
    return seeded_db


@pytest_asyncio.fixture
async def admin_header(db, auth_header):
    await db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await db.commit()
    return auth_header


async def _setup(client, admin_header, revealed=False):
    r = await client.put("/api/jaarquiz/admin", headers=admin_header,
                         json={"config": CONFIG, "revealed": revealed})
    assert r.status_code == 200, r.text
    return r.json()["join_code"]


async def _join(client, code, voter):
    r = await client.post(f"/api/jaarquiz/{code}/join", json={"voter": voter})
    assert r.status_code == 201, r.text
    return {"X-Quiz-Token": r.json()["token"]}


@pytest.mark.asyncio
async def test_admin_routes_need_admin(client, db, auth_header):
    assert (await client.get("/api/jaarquiz/admin")).status_code in (401, 403)
    r = await client.put("/api/jaarquiz/admin", headers=auth_header, json={"config": CONFIG})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_wrong_code_is_not_found(client, admin_header):
    await _setup(client, admin_header)
    assert (await client.get("/api/jaarquiz/nope")).status_code == 404


@pytest.mark.asyncio
async def test_join_is_first_come_and_stores_only_hash(client, db, admin_header):
    code = await _setup(client, admin_header)
    quiz = (await client.get(f"/api/jaarquiz/{code}")).json()
    assert [p["name"] for p in quiz["people"]] == PEOPLE and quiz["taken"] == []

    headers = await _join(client, code, "Ann")
    again = await client.post(f"/api/jaarquiz/{code}/join", json={"voter": "Ann"})
    assert again.status_code == 409 and again.json()["detail"] == "voter_taken"
    unknown = await client.post(f"/api/jaarquiz/{code}/join", json={"voter": "Zed"})
    assert unknown.status_code == 422

    rows = await db.execute_fetchall("SELECT token_hash FROM jaarquiz_responses")
    assert rows[0]["token_hash"] != headers["X-Quiz-Token"]
    assert (await client.get(f"/api/jaarquiz/{code}")).json()["taken"] == ["Ann"]


@pytest.mark.asyncio
async def test_answers_are_validated_and_private(client, admin_header):
    code = await _setup(client, admin_header)
    ann = await _join(client, code, "Ann")
    bob = await _join(client, code, "Bob")

    bad = await client.put(f"/api/jaarquiz/{code}/me", headers=ann,
                           json={"answers": {"weird": ["Ann", "Bob"]}})
    assert bad.status_code == 422
    assert (await client.put(f"/api/jaarquiz/{code}/me", json={"answers": {}})).status_code == 401

    ok = await client.put(f"/api/jaarquiz/{code}/me", headers=ann, json={
        "answers": {"weird": ["Bob", "Cas", "Ann"], "others": ["Y", "X"]}, "done": True})
    assert ok.status_code == 200 and ok.json()["done"] is True

    # Bob sees only his own (empty) answers, and no results before the reveal.
    me = (await client.get(f"/api/jaarquiz/{code}/me", headers=bob)).json()
    assert me == {"voter": "Bob", "answers": {}, "done": False}
    assert (await client.get(f"/api/jaarquiz/{code}/results")).status_code == 403


@pytest.mark.asyncio
async def test_done_needs_every_question(client, admin_header):
    code = await _setup(client, admin_header)
    ann = await _join(client, code, "Ann")
    r = await client.put(f"/api/jaarquiz/{code}/me", headers=ann,
                         json={"answers": {"weird": ["Bob", "Cas", "Ann"]}, "done": True})
    assert r.json()["done"] is False


@pytest.mark.asyncio
async def test_reveal_serves_aggregates_and_closes_editing(client, admin_header):
    code = await _setup(client, admin_header)
    ann = await _join(client, code, "Ann")
    bob = await _join(client, code, "Bob")
    await client.put(f"/api/jaarquiz/{code}/me", headers=ann,
                     json={"answers": {"weird": ["Bob", "Ann", "Cas"]}})
    await client.put(f"/api/jaarquiz/{code}/me", headers=bob,
                     json={"answers": {"weird": ["Bob", "Cas", "Ann"]}})

    await client.put("/api/jaarquiz/admin", headers=admin_header,
                     json={"config": CONFIG, "revealed": True})
    res = (await client.get(f"/api/jaarquiz/{code}/results")).json()
    weird = next(q for q in res["questions"] if q["id"] == "weird")
    assert [row["name"] for row in weird["rows"]] == ["Bob", "Ann", "Cas"]  # Ann and Cas tie on 2.5: name breaks it
    assert weird["rows"][0] == {"name": "Bob", "avg": 1.0, "min": 1, "max": 1}
    assert "answers" not in str(res)

    closed = await client.put(f"/api/jaarquiz/{code}/me", headers=ann,
                              json={"answers": {"weird": ["Ann", "Bob", "Cas"]}})
    assert closed.status_code == 409


@pytest.mark.asyncio
async def test_admin_can_free_a_name_and_rotate_the_code(client, admin_header):
    code = await _setup(client, admin_header)
    await _join(client, code, "Cas")
    state = (await client.delete("/api/jaarquiz/admin/responses/Cas", headers=admin_header)).json()
    assert state["responses"] == []
    await _join(client, code, "Cas")

    rotated = (await client.put("/api/jaarquiz/admin", headers=admin_header,
                                json={"config": CONFIG, "join_code": "new"})).json()
    assert rotated["join_code"] != code
    assert (await client.get(f"/api/jaarquiz/{code}")).status_code == 404


def test_config_rejects_remote_photos_and_duplicates():
    with pytest.raises(ValueError):
        QuizConfig.model_validate({**CONFIG, "people": [{"name": "A", "photo": "https://x/y.jpg"}, {"name": "B"}]})
    with pytest.raises(ValueError):
        QuizConfig.model_validate({**CONFIG, "people": [{"name": "A"}, {"name": "A"}]})


def test_self_knowledge_compares_own_place_with_the_others():
    config = QuizConfig.model_validate(CONFIG)
    responses = [
        {"voter": "Ann", "done": True, "answers": {"weird": ["Ann", "Bob", "Cas"]}},  # Ann puts herself 1st
        {"voter": "Bob", "done": True, "answers": {"weird": ["Cas", "Bob", "Ann"]}},  # others put Ann 3rd
        {"voter": "Cas", "done": True, "answers": {"weird": ["Cas", "Bob", "Ann"]}},
    ]
    sk = {row["name"]: row["off_by"] for row in compute_results(config, responses)["self_knowledge"]}
    assert sk["Ann"] == 2.0 and sk["Bob"] == 0.0
