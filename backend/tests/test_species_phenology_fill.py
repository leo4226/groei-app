"""Phenology is generated once and cached for species that lack it (e.g. GBIF
imports), and ecology retries a previously-failed enrichment instead of staying
blank forever."""
import aiosqlite
import pytest

PS_SCHEMA = """
CREATE TABLE plant_species (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE, common_name_nl TEXT, common_name_en TEXT, latin_name TEXT,
    phenology_json TEXT, climate_zone TEXT, care_thresholds TEXT,
    gbif_taxon_key BIGINT,
    native_to_nl INTEGER, invasive_nl INTEGER, flowering_months TEXT,
    pollinator_value INTEGER, host_plant_for TEXT, sun_preference TEXT,
    ecology_data_source TEXT, ecology_enriched_at TEXT,
    created_at TEXT, updated_at TEXT
);
"""


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(PS_SCHEMA)
    return db


@pytest.mark.asyncio
async def test_get_or_create_schedules_missing_phenology_in_background(monkeypatch):
    """Missing phenology no longer blocks the user flow: get_or_create schedules
    a deferred enrichment instead of generating the full calendar inline."""
    import species_service
    db = await _db()
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name) "
        "VALUES (1,'Passiebloem','Passionflower','Passiflora caerulea')")
    await db.commit()

    scheduled = []
    monkeypatch.setattr(
        species_service, "schedule_phenology_enrichment",
        lambda sid, name: scheduled.append((sid, name)),
    )

    async def boom(name):
        raise AssertionError("full species generation must not run inline")

    monkeypatch.setattr(species_service, "_generate_species", boom)
    monkeypatch.setattr(species_service, "_generate_names", boom)

    sid = await species_service.get_or_create_species(db, "Passiebloem")
    assert sid == 1
    assert scheduled == [(1, "Passiflora caerulea")]
    await db.close()


@pytest.mark.asyncio
async def test_ensure_phenology_fills_and_caches(monkeypatch):
    """The deferred job itself (ensure_phenology) fills phenology once."""
    import species_service
    db = await _db()
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) "
        "VALUES (1,'Passiebloem','Passiflora caerulea')")
    await db.commit()

    calls = {"n": 0}

    async def fake_generate(name):
        calls["n"] += 1
        return {"common_name_nl": "Passiebloem", "latin_name": "Passiflora caerulea",
                "phenology": {"months": [{"month": 1, "phase": "dormant"}]}}

    monkeypatch.setattr(species_service, "_generate_species", fake_generate)

    await species_service.ensure_phenology(db, 1, "Passiflora caerulea")
    row = (await db.execute_fetchall("SELECT phenology_json FROM plant_species WHERE id=1"))[0]
    assert row["phenology_json"] and "months" in row["phenology_json"]
    assert calls["n"] == 1
    await db.close()


@pytest.mark.asyncio
async def test_get_or_create_new_species_uses_fast_names_call(monkeypatch):
    """Creating an unknown species uses the small names-only LLM call and
    schedules the heavy phenology generation for later."""
    import species_service
    db = await _db()

    scheduled = []
    monkeypatch.setattr(
        species_service, "schedule_phenology_enrichment",
        lambda sid, name: scheduled.append((sid, name)),
    )

    async def fake_names(name):
        return {
            "slug": "mahonia-aquifolium",
            "latin_name": "Mahonia aquifolium",
            "common_name_nl": "Mahonie",
            "common_name_en": "Oregon grape",
        }

    async def boom(name):
        raise AssertionError("full species generation must not run inline")

    monkeypatch.setattr(species_service, "_generate_names", fake_names)
    monkeypatch.setattr(species_service, "_generate_species", boom)

    sid = await species_service.get_or_create_species(db, "Mahonia aquifolium")
    row = (await db.execute_fetchall(
        "SELECT common_name_nl, common_name_en, phenology_json FROM plant_species WHERE id = ?",
        (sid,)))[0]
    assert row["common_name_nl"] == "Mahonie"
    assert row["common_name_en"] == "Oregon grape"
    assert row["phenology_json"] is None  # filled by the deferred job
    assert scheduled == [(sid, "Mahonia aquifolium")]
    await db.close()


@pytest.mark.asyncio
async def test_get_or_create_fills_missing_english_common_name(monkeypatch):
    import species_service
    db = await _db()
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name, phenology_json) "
        "VALUES (1,'Blauwe bes','Vaccinium corymbosum','{\"months\":[]}')")
    await db.commit()

    async def fake_names(name):
        return {
            "common_name_nl": "Blauwe bes",
            "common_name_en": "Blueberry",
            "latin_name": "Vaccinium corymbosum",
        }

    monkeypatch.setattr(species_service, "_generate_names", fake_names)

    sid = await species_service.get_or_create_species(db, "Blauwe bes")
    assert sid == 1
    row = (await db.execute_fetchall(
        "SELECT common_name_en FROM plant_species WHERE id=1"))[0]
    assert row["common_name_en"] == "Blueberry"
    await db.close()


@pytest.mark.asyncio
async def test_get_or_create_matches_existing_english_common_name(monkeypatch):
    import species_service
    db = await _db()
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name, phenology_json) "
        "VALUES (1,'Blauwe bes','Blueberry','Vaccinium corymbosum','{\"months\":[]}')")
    await db.commit()

    async def boom(name):
        raise AssertionError("LLM must not run when English name already matches")

    monkeypatch.setattr(species_service, "_generate_species", boom)
    monkeypatch.setattr(species_service, "_generate_names", boom)

    sid = await species_service.get_or_create_species(db, "Blueberry")
    assert sid == 1
    await db.close()


@pytest.mark.asyncio
async def test_get_or_create_existing_with_phenology_skips_llm(monkeypatch):
    import species_service
    db = await _db()
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name, phenology_json) "
        "VALUES (1,'Roos','Rose','Rosa','{\"months\":[]}')")
    await db.commit()

    async def boom(name):
        raise AssertionError("LLM must not be called when phenology is already cached")

    monkeypatch.setattr(species_service, "_generate_species", boom)
    sid = await species_service.get_or_create_species(db, "Roos")
    assert sid == 1
    await db.close()


@pytest.mark.asyncio
async def test_ensure_ecology_retries_after_failed(monkeypatch):
    from services import ecology_enrichment
    db = await _db()
    await db.execute(
        "INSERT INTO plant_species (id, latin_name, ecology_data_source, ecology_enriched_at) "
        "VALUES (1,'Melissa officinalis','failed','2026-06-01T00:00:00+00:00')")
    await db.commit()

    async def fake_enrich(latin, taxon):
        return ecology_enrichment.EcologyProfile(
            native_to_nl=True, invasive_nl=False, flowering_months=[6, 7, 8],
            pollinator_value=3, host_plant_for=None, sun_preference="full_sun",
            data_source="llm")

    monkeypatch.setattr(ecology_enrichment, "enrich", fake_enrich)

    result = await ecology_enrichment.ensure_ecology(db, 1)
    assert result["data_source"] == "llm"
    assert result["pollinator_value"] == 3
    row = (await db.execute_fetchall(
        "SELECT ecology_data_source, pollinator_value FROM plant_species WHERE id=1"))[0]
    assert row["ecology_data_source"] == "llm"
    assert row["pollinator_value"] == 3
    await db.close()
