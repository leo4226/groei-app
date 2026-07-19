import pytest

from routers import chat as chat_router


async def _prepare_biodiversity_db(seeded_db):
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN sort_order INTEGER DEFAULT 0")
    await seeded_db.execute(
        """CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY,
            common_name_nl TEXT,
            common_name_en TEXT,
            latin_name TEXT,
            sun_preference TEXT,
            native_to_nl INTEGER,
            invasive_nl INTEGER,
            pollinator_value INTEGER,
            flowering_months TEXT,
            ecology_enriched_at TEXT
        )"""
    )
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id, language) VALUES (1, 'Leon', 1, 'nl')"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, name, slug, map_type, household_id, sort_order) VALUES (10, 'Achtertuin', 'garden', 'outdoor', 1, 1)"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, name, slug, map_type, household_id, sort_order) VALUES (11, 'Keuken', 'kitchen', 'indoor', 1, 2)"
    )
    await seeded_db.executemany(
        """INSERT INTO plant_species
           (id, common_name_nl, common_name_en, latin_name, sun_preference,
            native_to_nl, invasive_nl, pollinator_value, flowering_months, ecology_enriched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (1, 'Lavendel', 'Lavender', 'Lavandula angustifolia', 'full_sun', 0, 0, 3, '[1,2]', '2026-06-30'),
            (2, 'Wilde marjolein', 'Wild marjoram', 'Origanum vulgare', 'full_sun', 1, 0, 3, '[9]', '2026-06-30'),
            (3, 'Kruipend zenegroen', 'Bugle', 'Ajuga reptans', 'partial_sun', 1, 0, 2, '[4,5]', '2026-06-30'),
        ],
    )
    await seeded_db.execute(
        """INSERT INTO plants
           (id, name, species_id, map_id, is_active, household_id, quantity, care_profile)
           VALUES (101, 'Lavendel', 1, 10, 1, 1, 1, '{}')"""
    )
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_biodiversity_context_includes_outdoor_score_gaps_and_full_suggestion_shape(seeded_db):
    await _prepare_biodiversity_db(seeded_db)

    packet, prose = await chat_router._fetch_biodiversity_packet(seeded_db, 1, map_slug='garden')

    assert len(packet['maps']) == 1
    garden = packet['maps'][0]
    assert garden['id'] == 10
    assert garden['name'] == 'Achtertuin'
    assert garden['score'] > 0
    assert garden['species_count'] == 1
    assert garden['native_count'] == 0
    assert garden['invasive_count'] == 0
    assert garden['score_components']['pollinator'] == 7
    assert garden['pollinator_covered_months'] == [1, 2]
    assert garden['pollinator_gap_months'] == [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

    suggestion = next(s for s in garden['suggestions'] if s['species_id'] == 2)
    assert suggestion == {
        'species_id': 2,
        'dutch_name': 'Wilde marjolein',
        'english_name': 'Wild marjoram',
        'latin_name': 'Origanum vulgare',
        'sun_preference': 'full_sun',
        'sun_fit': 'acceptable',
        'is_native': True,
        'pollinator_value': 3,
        'flowering_months': [9],
        'gap_months_covered': [9],
        'reason': 'Inheems in Nederland · top bestuiversplant · bloeit in sep (vult je tuinkalender in)',
    }
    assert 'Plantaanbevelingen' in prose
    assert 'Wilde marjolein' in prose


@pytest.mark.asyncio
async def test_biodiversity_context_keeps_map_context_when_no_recommendations(seeded_db):
    await _prepare_biodiversity_db(seeded_db)
    await seeded_db.execute("DELETE FROM plant_species WHERE id IN (2, 3)")
    await seeded_db.commit()

    packet, prose = await chat_router._fetch_biodiversity_packet(seeded_db, 1, map_slug='garden')

    garden = packet['maps'][0]
    assert garden['suggestions'] == []
    assert garden['pollinator_gap_months'] == [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    assert garden['score_components']['pollinator'] == 7
    assert 'Achtertuin: score' in prose


@pytest.mark.asyncio
async def test_biodiversity_context_marks_current_indoor_map_as_not_applicable(seeded_db):
    await _prepare_biodiversity_db(seeded_db)

    packet, prose = await chat_router._fetch_biodiversity_packet(seeded_db, 1, map_slug='kitchen')

    assert packet['maps'] == []
    assert packet['applies_to_current_map'] is False
    assert packet['reason'] == 'current_map_is_indoor'
    assert prose == ''


@pytest.mark.asyncio
async def test_build_garden_context_guides_stekkie_to_use_deterministic_biodiversity_suggestions(
    seeded_db,
    monkeypatch,
):
    await _prepare_biodiversity_db(seeded_db)

    async def fake_temp_data(db):
        return {'days': [], 'avg_max_7day': 22.0, 'assessment': 'warm'}

    async def fake_rain_data(db):
        return {'days': [], 'total_7day_mm': 8.0, 'total_14day_mm': 12.0, 'assessment': 'normal'}

    monkeypatch.setattr(chat_router, 'get_temp_data', fake_temp_data)
    monkeypatch.setattr(chat_router, 'get_rain_data', fake_rain_data)

    garden_context, _, _, _ = await chat_router._build_garden_context(
        seeded_db,
        1,
        page_context=chat_router.PageContext(route='/map/garden', map_slug='garden'),
        active_user_id=1,
        requested_language='nl',
    )

    guidance = garden_context['response_guidance']
    assert 'garden_context.biodiversity.maps[].suggestions' in guidance
    assert 'Kies één kandidaat uit de lijst' in guidance
    assert 'Verzin geen soorten buiten deze lijst' in guidance
