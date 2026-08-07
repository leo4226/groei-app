"""Guess-the-plant quiz (solo): rounds sampling, fuzzy name matching,
MC fallback shape, and household isolation.

Endpoints under test (routers/quiz.py):
- POST /api/quiz/rounds   → sample of {round_id, photo_url}, no names leaked
- POST /api/quiz/guess    → free-text fuzzy match (100 pts) or MC options
- POST /api/quiz/mc       → half-points MC pick, always reveals
"""
import pytest

from routers import quiz as quiz_router

# plant_species is NOT in conftest's base schema — quiz.py LEFT JOINs it, so
# tests seed it exactly like the game tests seed their game tables.
SPECIES_SCHEMA = """
    CREATE TABLE IF NOT EXISTS plant_species (
        id INTEGER PRIMARY KEY,
        common_name_nl TEXT,
        common_name_en TEXT,
        latin_name TEXT
    );
"""


async def _seed_quiz_world(db, plant_count: int = 6, household_id: int = 1) -> list[int]:
    """An outdoor + indoor map, plant_count photo-bearing plants across both,
    and matching species rows. Returns plant ids."""
    await db.executescript(SPECIES_SCHEMA)
    await db.executescript(
        """
        INSERT INTO maps (id, name, map_type, household_id) VALUES (10, 'Garden', 'outdoor', 1);
        INSERT INTO maps (id, name, map_type, household_id) VALUES (11, 'Studio', 'indoor', 1);
        """
    )
    ids = []
    for i in range(plant_count):
        pid = 200 + i
        map_id = 10 if i % 2 == 0 else 11
        await db.execute(
            "INSERT INTO plants (id, name, species, map_id, photo_path, is_active, species_id) VALUES (?, ?, ?, ?, ?, 1, NULL)",
            (pid, f"Plant {pid}", None, map_id, f"https://r2.test/photo-{pid}.jpg"),
        )
        ids.append(pid)
    await db.commit()
    return ids


async def _seed_species(db, plant_id: int, nl: str, en: str | None = None, latin: str | None = None) -> int:
    sid = plant_id * 10
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name) VALUES (?, ?, ?, ?)",
        (sid, nl, en, latin),
    )
    await db.execute("UPDATE plants SET species_id = ? WHERE id = ?", (sid, plant_id))
    await db.commit()
    return sid


# ── Rounds ───────────────────────────────────────────────────────────────────

async def test_rounds_returns_photos_without_names(client, seeded_db, auth_header):
    await _seed_quiz_world(seeded_db, plant_count=6)
    resp = await client.post("/api/quiz/rounds", headers=auth_header, json={"count": 4})
    assert resp.status_code == 201, resp.text
    rounds = resp.json()
    assert len(rounds) == 4
    for r in rounds:
        assert set(r.keys()) == {"round_id", "photo_url"}
        assert r["photo_url"].startswith("https://r2.test/")


async def test_rounds_default_count_and_cap(client, seeded_db, auth_header):
    ids = await _seed_quiz_world(seeded_db, plant_count=6)
    # Default count = 10 but only 6 plants → all 6, unique.
    resp = await client.post("/api/quiz/rounds", headers=auth_header, json={})
    assert resp.status_code == 201, resp.text
    rounds = resp.json()
    assert len(rounds) == 6
    assert len({r["round_id"] for r in rounds}) == 6
    assert {r["round_id"] for r in rounds} <= set(ids)


async def test_rounds_too_few_photos_rejected(client, seeded_db, auth_header):
    await _seed_quiz_world(seeded_db, plant_count=3)
    resp = await client.post("/api/quiz/rounds", headers=auth_header, json={"count": 4})
    assert resp.status_code == 400


# ── Guess (free-text fuzzy match) ───────────────────────────────────────────

async def test_guess_exact_common_name(client, seeded_db, auth_header):
    ids = await _seed_quiz_world(seeded_db, plant_count=4)
    await _seed_species(seeded_db, ids[0], "Gatenplant", "Monstera", "Monstera deliciosa")
    resp = await client.post("/api/quiz/guess", headers=auth_header,
                             json={"plant_id": ids[0], "guess": "Gatenplant"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_correct"] is True
    assert body["points"] == quiz_router.FREE_TEXT_POINTS
    assert body["reveal"]["latin_name"] == "Monstera deliciosa"


async def test_guess_fuzzy_prefix_and_case(client, seeded_db, auth_header):
    ids = await _seed_quiz_world(seeded_db, plant_count=4)
    await _seed_species(seeded_db, ids[0], "Gatenplant", "Monstera", "Monstera deliciosa")
    # 'monstera' must match the latin name case-insensitively via token prefix.
    resp = await client.post("/api/quiz/guess", headers=auth_header,
                             json={"plant_id": ids[0], "guess": "  MONSTERA  "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_correct"] is True


async def test_guess_diacritics_stripped(client, seeded_db, auth_header):
    ids = await _seed_quiz_world(seeded_db, plant_count=4)
    await _seed_species(seeded_db, ids[0], "Olijfboom", None, "Olea europaea")
    # Typo'd diacritic 'é' vs stored 'e' must still match.
    resp = await client.post("/api/quiz/guess", headers=auth_header,
                             json={"plant_id": ids[0], "guess": "Oléa europæa"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_correct"] is True


async def test_guess_typo_within_levenshtein(client, seeded_db, auth_header):
    ids = await _seed_quiz_world(seeded_db, plant_count=4)
    await _seed_species(seeded_db, ids[0], "Vijgenboom", None, "Ficus carica")
    # 'ficuss' is 1 edit away from 'ficus' → accepted.
    resp = await client.post("/api/quiz/guess", headers=auth_header,
                             json={"plant_id": ids[0], "guess": "ficuss"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_correct"] is True


async def test_guess_wrong_returns_mc_options(client, seeded_db, auth_header):
    ids = await _seed_quiz_world(seeded_db, plant_count=6)
    await _seed_species(seeded_db, ids[0], "Gatenplant", "Monstera", "Monstera deliciosa")
    resp = await client.post("/api/quiz/guess", headers=auth_header,
                             json={"plant_id": ids[0], "guess": "complete garbage"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_correct"] is False
    assert body["points"] == 0
    assert body["reveal"] is None
    options = body["options"]
    assert len(options) == 4
    # Target present, all ids unique, names rendered in NL.
    assert any(o["plant_id"] == ids[0] and o["name_nl"] == "Gatenplant" for o in options)
    assert len({o["plant_id"] for o in options}) == 4


async def test_guess_unknown_plant_404(client, seeded_db, auth_header):
    await _seed_quiz_world(seeded_db, plant_count=4)
    resp = await client.post("/api/quiz/guess", headers=auth_header,
                             json={"plant_id": 99999, "guess": "whatever"})
    assert resp.status_code == 404


# ── MC pick ─────────────────────────────────────────────────────────────────

async def test_mc_correct_half_points(client, seeded_db, auth_header):
    ids = await _seed_quiz_world(seeded_db, plant_count=4)
    await _seed_species(seeded_db, ids[0], "Gatenplant", "Monstera", "Monstera deliciosa")
    resp = await client.post("/api/quiz/mc", headers=auth_header,
                             json={"plant_id": ids[0], "picked_id": ids[0]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_correct"] is True
    assert body["points"] == quiz_router.MC_POINTS
    assert body["reveal"]["name_nl"] == "Gatenplant"


async def test_mc_wrong_reveals_anyway(client, seeded_db, auth_header):
    ids = await _seed_quiz_world(seeded_db, plant_count=4)
    await _seed_species(seeded_db, ids[0], "Gatenplant", "Monstera", "Monstera deliciosa")
    resp = await client.post("/api/quiz/mc", headers=auth_header,
                             json={"plant_id": ids[0], "picked_id": ids[1]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_correct"] is False
    assert body["points"] == 0
    assert body["reveal"]["plant_id"] == ids[0]


# ── Isolation / guards ───────────────────────────────────────────────────────

async def test_other_household_plant_not_visible(client, seeded_db, auth_header):
    # Two households: the second one's maps/plants must not appear in rounds
    # nor be answerable from household 1's token.
    await _seed_quiz_world(seeded_db, plant_count=6, household_id=1)
    await db_execute_foreign(seeded_db)
    resp = await client.post("/api/quiz/rounds", headers=auth_header, json={"count": 10})
    assert resp.status_code == 201, resp.text
    round_ids = {r["round_id"] for r in resp.json()}
    assert all(pid < 300 for pid in round_ids)  # household 1 plants are 200-205

    # Foreign plant 301 must 404 on guess.
    resp = await client.post("/api/quiz/guess", headers=auth_header,
                             json={"plant_id": 301, "guess": "x"})
    assert resp.status_code == 404


async def db_execute_foreign(db):
    """Insert household 2 map + plant (ids 300+) — plant 301 is 'foreign'."""
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (20, 'Other', 'outdoor', 2)"
    )
    await db.execute(
        "INSERT INTO plants (id, name, map_id, photo_path, is_active) VALUES (301, 'Foreign', 20, 'https://r2.test/foreign.jpg', 1)"
    )
    await db.commit()
