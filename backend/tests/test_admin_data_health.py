import json

import pytest


@pytest.mark.asyncio
async def test_backfill_plant_types_uses_active_scope_and_explains_stale_icons(
    client, seeded_db, auth_header, monkeypatch
):
    await seeded_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await seeded_db.executemany(
        """
        INSERT INTO plants (id, name, household_id, is_active, icon_key, plant_type)
        VALUES (?, ?, 1, ?, ?, NULL)
        """,
        [
            (101, "Basil", 1, "basil"),
            (102, "Mystery active", 1, "ghost_icon"),
            (103, "Archived stale", 0, "archived_icon"),
        ],
    )
    await seeded_db.commit()

    monkeypatch.setattr(
        "routers.admin.load_manifest",
        lambda: [{"id": "basil", "cat": "herb"}],
    )

    preview = await client.get("/api/admin/backfill-plant-types/preview", headers=auth_header)
    assert preview.status_code == 200, preview.text
    assert preview.json()["missing_plant_type"] == 2

    res = await client.post("/api/admin/backfill-plant-types", headers=auth_header)
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["found"] == 2
    assert body["updated"] == 1
    assert body["skipped"] == 1
    assert body["details"] == [
        {"id": 101, "name": "Basil", "icon_key": "basil", "plant_type": "herb"}
    ]
    assert body["skipped_details"] == [
        {
            "id": 102,
            "name": "Mystery active",
            "icon_key": "ghost_icon",
            "reason": "icon_key_not_in_manifest",
            "message": "Icon key is not present in the icon manifest",
        }
    ]

    rows = await seeded_db.execute_fetchall(
        "SELECT id, plant_type FROM plants ORDER BY id"
    )
    assert rows == [
        {"id": 101, "plant_type": "herb"},
        {"id": 102, "plant_type": None},
        {"id": 103, "plant_type": None},
    ]


@pytest.mark.asyncio
async def test_backfill_missing_facts_updates_rows_missing_either_language(
    seeded_db, monkeypatch
):
    await seeded_db.execute(
        """
        CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY,
            common_name_nl TEXT,
            common_name_en TEXT,
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
            (201, "Sterjasmijn", "Trachelospermum jasminoides", "{}"),
            (
                202,
                "Venkel",
                "Foeniculum vulgare",
                json.dumps({"interesting_facts_nl": "Bestaand NL"}),
            ),
            (
                203,
                "Lavendel",
                "Lavandula angustifolia",
                json.dumps(
                    {
                        "interesting_facts_nl": "Bestaand NL",
                        "interesting_facts_en": "Existing EN",
                    }
                ),
            ),
        ],
    )
    await seeded_db.commit()

    async def fake_generate(plant_name, latin_name=None):
        return {
            "fact_nl": f"NL feit voor {plant_name}",
            "fact_en": f"EN fact for {latin_name}",
        }

    monkeypatch.setattr("species_service.generate_fact_for_species", fake_generate)

    from species_service import backfill_missing_facts

    result = await backfill_missing_facts(seeded_db, limit=50)

    assert result == {"processed": 2, "updated": 2, "skipped": 0, "errors": [], "skipped_details": []}

    rows = await seeded_db.execute_fetchall(
        "SELECT id, phenology_json FROM plant_species ORDER BY id"
    )
    phenology = {row["id"]: json.loads(row["phenology_json"]) for row in rows}
    assert phenology[201]["interesting_facts_nl"] == "NL feit voor Sterjasmijn"
    assert phenology[201]["interesting_facts_en"] == "EN fact for Trachelospermum jasminoides"
    assert phenology[202]["interesting_facts_nl"] == "Bestaand NL"
    assert phenology[202]["interesting_facts_en"] == "EN fact for Foeniculum vulgare"
    assert phenology[203] == {
        "interesting_facts_nl": "Bestaand NL",
        "interesting_facts_en": "Existing EN",
    }


@pytest.mark.asyncio
async def test_admin_coverage_reports_garden_species_icon_and_bioclip_gaps(
    client, seeded_db, auth_header, monkeypatch
):
    await seeded_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await seeded_db.execute(
        """
        CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY,
            common_name_nl TEXT,
            common_name_en TEXT,
            latin_name TEXT,
            phenology_json TEXT,
            care_thresholds TEXT
        )
        """
    )
    await seeded_db.executemany(
        """
        INSERT INTO plant_species (
            id, common_name_nl, common_name_en, latin_name, phenology_json, care_thresholds
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                1,
                "Basilicum",
                "Basil",
                "Ocimum basilicum",
                json.dumps({"interesting_facts_nl": "NL", "interesting_facts_en": "EN"}),
                json.dumps({"water": 3}),
            ),
            (
                2,
                "Lavendel",
                "Lavender",
                "Lavandula angustifolia",
                json.dumps({"interesting_facts_nl": "NL only"}),
                None,
            ),
            (3, "Naamloos", None, None, None, None),
        ],
    )
    await seeded_db.executemany(
        """
        INSERT INTO plants (
            id, name, species, household_id, is_active, species_id, icon_key, plant_type
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        """,
        [
            (101, "Basil", "Ocimum basilicum", 1, 1, "basil", "herb"),
            (102, "Mystery", "Unknown", 1, None, "ghost_icon", None),
            (103, "Lavender", "Lavandula angustifolia", 1, 2, "lavender", None),
            (104, "Archived", "Old", 0, 3, "archived_icon", None),
        ],
    )
    await seeded_db.commit()

    monkeypatch.setattr(
        "routers.admin_panel.icons_router.load_manifest",
        lambda: [{"id": "basil", "cat": "herb"}, {"id": "lavender", "cat": "flower"}],
    )

    async def fake_bioclip_coverage():
        return {"status": "ok", "detail": "worker ready", "embedded_species": 1, "species_ids": [1]}

    monkeypatch.setattr("routers.admin_panel._fetch_bioclip_coverage", fake_bioclip_coverage)

    res = await client.get("/api/admin-panel/coverage", headers=auth_header)
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["plants"]["active_total"] == 3
    assert body["plants"]["missing_species_link"] == 1
    assert body["plants"]["missing_species_link_rows"][0]["name"] == "Mystery"

    assert body["species"]["total"] == 3
    assert body["species"]["missing_latin_name"] == 1
    assert body["species"]["missing_facts_en"] == 2
    assert body["species"]["missing_thresholds"] == 2

    assert body["icons"]["active_stale_icon_key"] == 1
    assert body["icons"]["archived_stale_icon_key"] == 1
    assert body["icons"]["missing_plant_type"] == 2

    assert body["bioclip"]["status"] == "ok"
    assert body["bioclip"]["embedded_species"] == 1
    assert body["bioclip"]["db_species_missing_from_bioclip"] == 1
    assert body["bioclip"]["active_plants_missing_from_bioclip"] == 1
    assert body["bioclip"]["missing_species_rows"] == [
        {"id": 2, "common_name_nl": "Lavendel", "latin_name": "Lavandula angustifolia"}
    ]

    # species 2 (missing thresholds + EN facts) and 3 (missing latin/EN name/
    # facts/phenology/thresholds) are incomplete; species 1 is fully populated.
    assert body["species"]["incomplete"] == 2
    gaps = {g["id"]: g for g in body["species_gaps"]}
    assert set(gaps) == {2, 3}
    assert gaps[3]["missing_name_en"] is True
    assert gaps[3]["missing_latin"] is True
    assert gaps[3]["missing_phenology"] is True
    assert gaps[2]["missing_thresholds"] is True
    assert gaps[2]["missing_facts_en"] is True
    # both species are linked to active plants, so they're flagged in-use
    assert gaps[2]["in_use"] is True
