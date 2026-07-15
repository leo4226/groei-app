"""Retry-species: regenerate phenology for plants stuck on incomplete data (#181 follow-up).

A plant can be linked to a species whose `phenology_json` exists but has no
month calendar (incomplete LLM generation) — the UI shows "No species data
available". `regenerate_species_phenology` force-refreshes that, and the
`/plants/{id}/retry-species` endpoint wires it in. `_generate_species` (LLM) is
patched so tests never hit the network.
"""
import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest_asyncio

import species_service

EXTRA_SCHEMA = """
CREATE TABLE plant_species (
    id INTEGER PRIMARY KEY,
    slug TEXT,
    common_name_nl TEXT,
    common_name_en TEXT,
    latin_name TEXT,
    care_thresholds TEXT,
    phenology_json TEXT,
    updated_at TEXT
);
"""

GOOD_PHENOLOGY = {
    "months": [
        {"month": m, "phase": "growing", "phase_label_nl": "Groei"} for m in range(1, 13)
    ],
    "interesting_facts_nl": "Een mooie plant.",
}
INCOMPLETE_PHENOLOGY = {"interesting_facts_nl": "Alleen een feitje, geen kalender."}


@pytest_asyncio.fixture
async def db_ready(seeded_db):
    await seeded_db.executescript(EXTRA_SCHEMA)
    await seeded_db.commit()
    return seeded_db


# ── unit: helpers ──────────────────────────────────────────────────────────

def test_phenology_has_months():
    from species_service import _phenology_has_months
    assert _phenology_has_months(json.dumps(GOOD_PHENOLOGY)) is True
    assert _phenology_has_months(json.dumps(INCOMPLETE_PHENOLOGY)) is False
    assert _phenology_has_months("") is False
    assert _phenology_has_months(None) is False
    assert _phenology_has_months("not json") is False


async def test_regenerate_noop_when_calendar_present(db_ready):
    await db_ready.execute(
        "INSERT INTO plant_species (id, latin_name, phenology_json) VALUES (9, 'X', ?)",
        (json.dumps(GOOD_PHENOLOGY),),
    )
    await db_ready.commit()
    with patch.object(species_service, "_generate_species", new=AsyncMock()) as gen:
        changed = await species_service.regenerate_species_phenology(db_ready, 9, "X")
    assert changed is False
    gen.assert_not_called()  # didn't waste an LLM call


async def test_regenerate_fills_incomplete_calendar(db_ready):
    await db_ready.execute(
        "INSERT INTO plant_species (id, latin_name, phenology_json) VALUES (8, 'Y', ?)",
        (json.dumps(INCOMPLETE_PHENOLOGY),),
    )
    await db_ready.commit()
    with patch.object(
        species_service, "_generate_species",
        new=AsyncMock(return_value={"phenology": GOOD_PHENOLOGY}),
    ):
        changed = await species_service.regenerate_species_phenology(db_ready, 8, "Y")
    assert changed is True
    row = (await db_ready.execute_fetchall(
        "SELECT phenology_json FROM plant_species WHERE id = 8"))[0]
    assert len(json.loads(row["phenology_json"])["months"]) == 12


async def test_regenerate_retries_transient_llm_failure(db_ready):
    await db_ready.execute(
        "INSERT INTO plant_species (id, latin_name, phenology_json) VALUES (6, 'Retry plant', ?)",
        (json.dumps(INCOMPLETE_PHENOLOGY),),
    )
    await db_ready.commit()
    generate = AsyncMock(side_effect=[
        httpx.ReadTimeout("upstream timed out"),
        {"phenology": GOOD_PHENOLOGY},
    ])
    with patch.object(species_service, "_generate_species", new=generate), \
         patch.object(species_service.asyncio, "sleep", new=AsyncMock()) as sleep:
        changed = await species_service.regenerate_species_phenology(db_ready, 6, "Retry plant")

    assert changed is True
    assert generate.await_count == 2
    sleep.assert_awaited_once()


async def test_regenerate_leaves_row_when_generation_empty(db_ready):
    await db_ready.execute(
        "INSERT INTO plant_species (id, latin_name, phenology_json) VALUES (7, 'Z', ?)",
        (json.dumps(INCOMPLETE_PHENOLOGY),),
    )
    await db_ready.commit()
    with patch.object(
        species_service, "_generate_species",
        new=AsyncMock(return_value={"phenology": {}}),  # LLM came back empty
    ):
        changed = await species_service.regenerate_species_phenology(db_ready, 7, "Z")
    assert changed is False
    row = (await db_ready.execute_fetchall(
        "SELECT phenology_json FROM plant_species WHERE id = 7"))[0]
    assert "months" not in json.loads(row["phenology_json"])  # untouched, not clobbered


# ── endpoint: /plants/{id}/retry-species ───────────────────────────────────

async def _seed_plant_linked_to_incomplete_species(db):
    await db.execute(
        "INSERT INTO plant_species (id, latin_name, common_name_nl, phenology_json) "
        "VALUES (5, 'Agapanthus praecox', 'Afrikaanse lelie', ?)",
        (json.dumps(INCOMPLETE_PHENOLOGY),),
    )
    await db.execute(
        "INSERT INTO plants (id, name, species, species_id, is_active, household_id, care_thresholds) "
        "VALUES (20, 'Agapanthus', 'Agapanthus praecox', 5, 1, 1, '{}')"
    )
    await db.commit()


async def test_retry_species_recovers_incomplete_phenology(client, db_ready, auth_header):
    await _seed_plant_linked_to_incomplete_species(db_ready)

    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=5)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})), \
         patch.object(species_service, "_generate_species",
                      new=AsyncMock(return_value={"phenology": GOOD_PHENOLOGY})):
        resp = await client.post("/api/plants/20/retry-species", headers=auth_header)

    assert resp.status_code == 200, resp.text
    plant = resp.json()
    assert plant["phenology"] is not None
    assert len(plant["phenology"]["months"]) == 12

    # The shared species row was repaired, so every plant of this species benefits.
    row = (await db_ready.execute_fetchall(
        "SELECT phenology_json FROM plant_species WHERE id = 5"))[0]
    assert "months" in json.loads(row["phenology_json"])


async def test_retry_species_surfaces_exhausted_generation_failure(client, db_ready, auth_header):
    await _seed_plant_linked_to_incomplete_species(db_ready)

    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=5)), \
         patch.object(species_service, "_generate_species",
                      new=AsyncMock(side_effect=httpx.ReadTimeout("upstream timed out"))), \
         patch.object(species_service.asyncio, "sleep", new=AsyncMock()):
        resp = await client.post("/api/plants/20/retry-species", headers=auth_header)

    assert resp.status_code == 503, resp.text
    assert resp.json()["detail"] == "species_generation_unavailable"


async def test_retry_species_surfaces_species_lookup_failure(client, db_ready, auth_header):
    await _seed_plant_linked_to_incomplete_species(db_ready)

    with patch(
        "routers.plants.get_or_create_species",
        new=AsyncMock(side_effect=httpx.ReadTimeout("upstream timed out")),
    ):
        resp = await client.post("/api/plants/20/retry-species", headers=auth_header)

    assert resp.status_code == 503, resp.text
    assert resp.json()["detail"] == "species_generation_unavailable"
