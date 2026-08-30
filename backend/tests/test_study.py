"""Learning plant names by spaced repetition.

The quiz that already exists asks good questions and forgets you instantly. The
thing being tested here is the memory: which card comes back, and when.
"""
import pytest

import routers.study as study


SCHEMA = """
    CREATE TABLE plant_discoveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        household_id INTEGER NOT NULL,
        species_id INTEGER,
        common_name TEXT NOT NULL,
        latin_name TEXT,
        thumbnail_url TEXT,
        notes TEXT,
        discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE plant_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        url TEXT,
        taken_at TIMESTAMP
    );
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        common_name_nl TEXT,
        common_name_en TEXT,
        latin_name TEXT
    );
    CREATE TABLE study_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        ref_id INTEGER NOT NULL,
        box INTEGER NOT NULL DEFAULT 0,
        due_at TIMESTAMP NOT NULL,
        seen INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        last_answered_at TIMESTAMP,
        UNIQUE (account_id, source, ref_id)
    );
"""


@pytest.fixture
async def study_db(seeded_db):
    await seeded_db.executescript(SCHEMA)
    await seeded_db.executescript("""
        INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name)
        VALUES (7, 'Gatenplant', 'Swiss cheese plant', 'Monstera deliciosa');
        INSERT INTO plants (id, name, species_id, is_active, household_id)
        VALUES (1, 'Grote monstera', 7, 1, 1);
        INSERT INTO plant_photos (plant_id, url) VALUES (1, 'https://cdn/1.jpg');
        INSERT INTO plant_discoveries
            (id, account_id, household_id, common_name, latin_name, thumbnail_url)
        VALUES
            (1, 1, 1, 'Grote weegbree', 'Plantago major', 'https://cdn/w.jpg'),
            (2, 1, 1, 'Paardenbloem', 'Taraxacum officinale', 'https://cdn/p.jpg'),
            (3, 1, 1, 'Madeliefje', 'Bellis perennis', 'https://cdn/m.jpg');
    """)
    await seeded_db.commit()
    return seeded_db


async def _next(client, auth_header):
    resp = await client.get("/api/study/next", headers=auth_header)
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_it_asks_about_the_field_guide_and_your_own_plants(
    client, study_db, auth_header
):
    body = await _next(client, auth_header)

    assert body["card"] is not None
    assert body["stats"]["total"] == 4, "three discoveries plus one photographed plant"
    assert body["stats"]["new"] == 4


@pytest.mark.asyncio
async def test_a_plant_with_no_photo_is_not_a_card_yet(client, study_db, auth_header):
    """A card without a picture has nothing to ask. It is also the honest nudge
    towards photographing more."""
    await study_db.execute(
        "INSERT INTO plants (id, name, species_id, is_active, household_id) "
        "VALUES (2, 'Naamloos', NULL, 1, 1)")
    await study_db.commit()

    body = await _next(client, auth_header)

    assert body["stats"]["total"] == 4, "the photoless plant is not counted"


@pytest.mark.asyncio
async def test_a_new_card_offers_choices_and_a_practised_one_asks_you_to_type(
    client, study_db, auth_header
):
    """Recognition first, recall second: picking one of four is achievable on
    day one, typing the name is the harder and more durable thing."""
    body = await _next(client, auth_header)
    assert body["card"]["mode"] == "choose"
    assert body["card"]["options"] and len(body["card"]["options"]) >= 2

    # Promote one card past the typing threshold.
    await study_db.execute(
        "UPDATE study_cards SET box = ?, seen = 3 WHERE id = 1",
        (study.TYPING_FROM_BOX,))
    await study_db.execute("DELETE FROM study_cards WHERE id != 1")
    await study_db.commit()

    body = await _next(client, auth_header)
    assert body["card"]["mode"] == "type"
    assert body["card"]["options"] is None, (
        "sending options in type mode would put the answer in the page")


@pytest.mark.asyncio
async def test_a_wrong_answer_comes_back_today_and_a_right_one_waits(
    client, study_db, auth_header
):
    """This is the whole feature: the schedule, not the question."""
    card_id = (await _next(client, auth_header))["card"]["card_id"]

    wrong = await client.post("/api/study/answer", headers=auth_header,
                              json={"card_id": card_id, "answer": "Onzin"})
    assert wrong.json()["correct"] is False
    assert wrong.json()["box"] == 0

    right = await client.post("/api/study/answer", headers=auth_header,
                              json={"card_id": card_id, "answer": "Grote weegbree"})
    body = right.json()
    assert body["correct"] is True
    assert body["box"] == 1
    assert body["next_due_at"] > wrong.json()["next_due_at"], "a right answer waits"


@pytest.mark.asyncio
async def test_the_answer_is_revealed_either_way(client, study_db, auth_header):
    """The moment right after answering is when the name is worth reading, and
    "wrong" on its own teaches nothing."""
    card_id = (await _next(client, auth_header))["card"]["card_id"]

    resp = await client.post("/api/study/answer", headers=auth_header,
                             json={"card_id": card_id, "answer": ""})

    assert resp.json()["correct"] is False
    assert resp.json()["answer"]["name_nl"] == "Grote weegbree"
    assert resp.json()["answer"]["latin"] == "Plantago major"


@pytest.mark.asyncio
async def test_spelling_is_forgiven_but_the_wrong_plant_is_not(
    client, study_db, auth_header
):
    """Graded by the quiz's own matcher, so a name that counts there counts
    here — a learner told 'right' on one screen and 'wrong' on the other would
    reasonably call that a bug."""
    card_id = (await _next(client, auth_header))["card"]["card_id"]

    close = await client.post("/api/study/answer", headers=auth_header,
                              json={"card_id": card_id, "answer": "grote weegbre"})
    assert close.json()["correct"] is True

    await study_db.execute("UPDATE study_cards SET box = 0, seen = 0 WHERE id = ?",
                           (card_id,))
    await study_db.commit()
    other = await client.post("/api/study/answer", headers=auth_header,
                              json={"card_id": card_id, "answer": "Paardenbloem"})
    assert other.json()["correct"] is False, "a different plant is not a typo"


@pytest.mark.asyncio
async def test_due_cards_come_before_new_ones(client, study_db, auth_header):
    """Otherwise a growing collection becomes a growing backlog: new material
    would keep arriving in front of the names that are slipping."""
    from datetime import timedelta

    first = (await _next(client, auth_header))["card"]["card_id"]
    await client.post("/api/study/answer", headers=auth_header,
                      json={"card_id": first, "answer": "Grote weegbree"})
    # Make it overdue.
    await study_db.execute(
        "UPDATE study_cards SET due_at = ? WHERE id = ?",
        (study._now() - timedelta(days=2), first))
    await study_db.commit()

    body = await _next(client, auth_header)

    assert body["card"]["card_id"] == first, "the overdue card jumps the queue"
    assert body["stats"]["due"] == 1


@pytest.mark.asyncio
async def test_nothing_due_is_an_answer_not_an_empty_screen(
    client, study_db, auth_header
):
    # Work the real loop until nothing is left: a card answered WRONG is due
    # again immediately (that is the point), so getting to "caught up" means
    # actually getting each one right. Two calls per card — one to be told the
    # name, one to give it back — which is what learning a new name looks like.
    for _ in range(20):
        body = await _next(client, auth_header)
        if body["card"] is None:
            break
        card_id = body["card"]["card_id"]
        reveal = await client.post("/api/study/answer", headers=auth_header,
                                   json={"card_id": card_id, "answer": ""})
        await client.post(
            "/api/study/answer", headers=auth_header,
            json={"card_id": card_id, "answer": reveal.json()["answer"]["name_nl"]})

    body = await _next(client, auth_header)

    assert body["card"] is None
    assert body["reason"] == "all_caught_up"
    assert body["next_due_at"] is not None, "tell them when to come back"


@pytest.mark.asyncio
async def test_learning_is_personal_not_shared(client, study_db, auth_header):
    """Leon's progress is not Lisbeth's, even though they share every plant and
    every discovery."""
    card_id = (await _next(client, auth_header))["card"]["card_id"]
    await client.post("/api/study/answer", headers=auth_header,
                      json={"card_id": card_id, "answer": "Grote weegbree"})

    rows = await study_db.execute_fetchall(
        "SELECT account_id, box FROM study_cards WHERE id = ?", (card_id,))

    assert dict(rows[0])["account_id"] == 1
    assert dict(rows[0])["box"] == 1
