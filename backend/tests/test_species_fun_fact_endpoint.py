import json

import pytest


_PLANT_SPECIES_WITHOUT_FUN_FACT_COLUMNS = """
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        latin_name TEXT,
        common_name_nl TEXT,
        phenology_json TEXT
    )
"""


@pytest.mark.asyncio
async def test_fun_fact_endpoint_falls_back_to_phenology_when_cache_columns_absent(
    client, seeded_db, monkeypatch
):
    """Prod can lag/miss fun_fact_* columns; don't raw-500 when phenology has facts."""
    await seeded_db.execute(_PLANT_SPECIES_WITHOUT_FUN_FACT_COLUMNS)
    await seeded_db.execute(
        """
        INSERT INTO plant_species (id, latin_name, common_name_nl, phenology_json)
        VALUES (?, ?, ?, ?)
        """,
        (
            7,
            "Trachelospermum jasminoides",
            "Sterjasmijn",
            json.dumps(
                {
                    "interesting_facts_nl": "Sterjasmijn ruikt in de avond extra sterk.",
                    "interesting_facts_en": "Star jasmine smells strongest in the evening.",
                }
            ),
        ),
    )
    await seeded_db.commit()

    generate_called = False

    async def fake_generate(_latin_name, _common_name_nl):
        nonlocal generate_called
        generate_called = True
        return "", ""

    monkeypatch.setattr("routers.species._generate_fun_fact", fake_generate)

    res = await client.get("/api/species/7/fun-fact")

    assert res.status_code == 200, res.text
    assert generate_called is False
    assert res.json() == {
        "fun_fact_nl": "Sterjasmijn ruikt in de avond extra sterk.",
        "fun_fact_en": "Star jasmine smells strongest in the evening.",
    }


@pytest.mark.asyncio
async def test_fun_fact_endpoint_backfills_missing_language_from_available_fact(
    client, seeded_db, monkeypatch
):
    await seeded_db.execute(_PLANT_SPECIES_WITHOUT_FUN_FACT_COLUMNS)
    await seeded_db.execute(
        """
        INSERT INTO plant_species (id, latin_name, common_name_nl, phenology_json)
        VALUES (?, ?, ?, ?)
        """,
        (
            8,
            "Ocimum basilicum",
            "Basilicum",
            json.dumps({"interesting_facts_nl": "Basilicum trekt bestuivers aan als je het laat bloeien."}),
        ),
    )
    await seeded_db.commit()

    async def fake_generate(_latin_name, _common_name_nl):
        return "", ""

    monkeypatch.setattr("routers.species._generate_fun_fact", fake_generate)

    res = await client.get("/api/species/8/fun-fact")

    assert res.status_code == 200, res.text
    assert res.json() == {
        "fun_fact_nl": "Basilicum trekt bestuivers aan als je het laat bloeien.",
        "fun_fact_en": "Basilicum trekt bestuivers aan als je het laat bloeien.",
    }
