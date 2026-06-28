import json

import pytest


@pytest.fixture
async def admin_facts_db(seeded_db):
    await seeded_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await seeded_db.execute("INSERT INTO households (id, name) VALUES (2, 'Other Garden')")
    await seeded_db.execute(
        """
        CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY,
            common_name_nl TEXT,
            latin_name TEXT,
            phenology_json TEXT,
            updated_at TEXT
        )
        """
    )
    await seeded_db.executemany(
        """
        INSERT INTO plant_species (id, common_name_nl, latin_name, phenology_json)
        VALUES (?, ?, ?, ?)
        """,
        [
            (1, "Basilicum", "Ocimum basilicum", "{}"),
            (2, "Lavendel", "Lavandula angustifolia", "{}"),
            (3, "Venkel", "Foeniculum vulgare", "{}"),
            (4, "Munt", "Mentha spicata", json.dumps({"interesting_facts_nl": "NL", "interesting_facts_en": "EN"})),
            (5, "Andere tuinplant", "Alia hortensis", "{}"),
        ],
    )
    await seeded_db.executemany(
        """
        INSERT INTO plants (id, name, species_id, is_active, map_id, household_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (101, "Basil", 1, 1, 10, 1),        # active and on this household's garden map
            (102, "Lavender", 2, 1, None, 1),   # active, but not placed on a map
            (103, "Old fennel", 3, 0, 10, 1),   # archived, should not count for in_use
            (104, "Munt", 4, 1, 10, 1),         # already has facts
            (201, "Other plant", 5, 1, 20, 2),  # other household, should not count as "my plants"
        ],
    )
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_backfill_facts_preview_supports_current_household_active_garden_scope(client, admin_facts_db, auth_header):
    all_preview = await client.get("/api/admin-panel/backfill-facts/preview?scope=all", headers=auth_header)
    assert all_preview.status_code == 200, all_preview.text
    assert all_preview.json()["missing_facts"] == 4

    active_preview = await client.get("/api/admin-panel/backfill-facts/preview?scope=in_use", headers=auth_header)
    assert active_preview.status_code == 200, active_preview.text
    assert active_preview.json()["scope"] == "in_use"
    assert active_preview.json()["map_only"] is False
    assert active_preview.json()["missing_facts"] == 2

    garden_preview = await client.get(
        "/api/admin-panel/backfill-facts/preview?scope=in_use&map_only=true",
        headers=auth_header,
    )
    assert garden_preview.status_code == 200, garden_preview.text
    assert garden_preview.json()["scope"] == "in_use"
    assert garden_preview.json()["map_only"] is True
    assert garden_preview.json()["missing_facts"] == 1


@pytest.mark.asyncio
async def test_backfill_facts_run_only_updates_current_household_active_garden_species(
    client,
    admin_facts_db,
    auth_header,
    monkeypatch,
):
    async def fake_generate(plant_name, latin_name=None):
        return {"fact_nl": f"NL {plant_name}", "fact_en": f"EN {latin_name}"}

    monkeypatch.setattr("species_service.generate_fact_for_species", fake_generate)

    res = await client.post(
        "/api/admin-panel/backfill-facts?scope=in_use&map_only=true&limit=25",
        headers=auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["scope"] == "in_use"
    assert body["map_only"] is True
    assert body["processed"] == 1
    assert body["updated"] == 1

    rows = await admin_facts_db.execute_fetchall(
        "SELECT id, phenology_json FROM plant_species ORDER BY id"
    )
    phenology = {row["id"]: json.loads(row["phenology_json"] or "{}") for row in rows}
    assert phenology[1]["interesting_facts_nl"] == "NL Basilicum"
    assert phenology[1]["interesting_facts_en"] == "EN Ocimum basilicum"
    assert "interesting_facts_nl" not in phenology[2]
    assert "interesting_facts_nl" not in phenology[3]
    assert phenology[4] == {"interesting_facts_nl": "NL", "interesting_facts_en": "EN"}
    assert "interesting_facts_nl" not in phenology[5]


@pytest.mark.asyncio
async def test_backfill_facts_job_runner_respects_current_household_scope(
    admin_facts_db,
    monkeypatch,
):
    from routers.admin_panel import _run_backfill_facts

    async def fake_generate(plant_name, latin_name=None):
        return {"fact_nl": f"NL {plant_name}", "fact_en": f"EN {latin_name}"}

    progress = []

    async def on_progress(done, total):
        progress.append((done, total))

    monkeypatch.setattr("species_service.generate_fact_for_species", fake_generate)

    result = await _run_backfill_facts(
        admin_facts_db,
        {"scope": "in_use", "map_only": True, "limit": 25, "household_id": 1},
        on_progress,
    )

    assert progress == [(0, 1), (1, 1)]
    assert result["scope"] == "in_use"
    assert result["map_only"] is True
    assert result["processed"] == 1
    assert result["updated"] == 1

    rows = await admin_facts_db.execute_fetchall(
        "SELECT id, phenology_json FROM plant_species ORDER BY id"
    )
    phenology = {row["id"]: json.loads(row["phenology_json"] or "{}") for row in rows}
    assert phenology[1]["interesting_facts_nl"] == "NL Basilicum"
    assert "interesting_facts_nl" not in phenology[5]
