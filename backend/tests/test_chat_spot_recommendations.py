import pytest

from routers import chat as chat_router


async def _prepare_spot_db(seeded_db):
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
            ecology_enriched_at TEXT,
            is_drachtplant INTEGER DEFAULT 0
        )"""
    )
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id, language) VALUES (1, 'Leon', 1, 'nl')"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, name, slug, map_type, household_id, sort_order) VALUES (10, 'Achtertuin', 'garden', 'outdoor', 1, 1)"
    )
    await seeded_db.executemany(
        """INSERT INTO plant_species
           (id, common_name_nl, common_name_en, latin_name, sun_preference,
            native_to_nl, invasive_nl, pollinator_value, flowering_months, ecology_enriched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (1, 'Lavendel', 'Lavender', 'Lavandula angustifolia', 'full_sun', 0, 0, 3, '[6,7,8]', '2026-06-30'),
            (2, 'Wilde marjolein', 'Wild marjoram', 'Origanum vulgare', 'full_sun', 1, 0, 3, '[8,9]', '2026-06-30'),
            (3, 'Muurleeuwenbek', 'Ivy-leaved toadflax', 'Cymbalaria muralis', 'shade', 1, 0, 2, '[4,5,6]', '2026-06-30'),
            (4, 'Kruipend zenegroen', 'Bugle', 'Ajuga reptans', 'partial_sun', 1, 0, 2, '[4,5]', '2026-06-30'),
        ],
    )
    await seeded_db.execute(
        """INSERT INTO plants
           (id, name, species_id, map_id, is_active, household_id, quantity,
            sun_requirement, care_profile)
           VALUES (101, 'Lavendel', 1, 10, 1, 1, 1, 'full_sun', '{}')"""
    )
    await seeded_db.commit()


async def _fake_temp_data(db):
    return {'days': [], 'avg_max_7day': 22.0, 'assessment': 'warm'}


async def _fake_rain_data(db):
    return {'days': [], 'total_7day_mm': 8.0, 'total_14day_mm': 12.0, 'assessment': 'normal'}


@pytest.mark.asyncio
async def test_build_garden_context_includes_full_sun_spot_recommendations(seeded_db, monkeypatch):
    await _prepare_spot_db(seeded_db)
    monkeypatch.setattr(chat_router, 'get_temp_data', _fake_temp_data)
    monkeypatch.setattr(chat_router, 'get_rain_data', _fake_rain_data)

    garden_context, _, _, _ = await chat_router._build_garden_context(
        seeded_db,
        1,
        page_context=chat_router.PageContext(
            route='/map/garden',
            map_slug='garden',
            clicked_map_x=42.1,
            clicked_map_y=71.2,
            ground_zone_id='zone-sunny',
            ground_zone_name='Zonnige border',
            ground_zone_type='border',
            direct_sun_hours=5.8,
            sky_view_factor=0.82,
            light_bucket='full',
        ),
        active_user_id=1,
        requested_language='nl',
    )

    selected_spot = garden_context['selected_spot']
    assert selected_spot == {
        'map_id': 10,
        'map_slug': 'garden',
        'map_name': 'Achtertuin',
        'map_x': 42.1,
        'map_y': 71.2,
        'ground_zone_id': 'zone-sunny',
        'ground_zone_name': 'Zonnige border',
        'ground_zone_type': 'border',
        'direct_sun_hours': 5.8,
        'sky_view_factor': 0.82,
        'light_bucket': 'full',
    }
    spot_recs = garden_context['spot_recommendations']
    assert spot_recs['map_id'] == 10
    assert spot_recs['month'] >= 1
    assert spot_recs['light_bucket'] == 'full'
    assert spot_recs['gap_months']
    assert spot_recs['recommendations'][0]['dutch_name'] == 'Wilde marjolein'
    assert spot_recs['recommendations'][0]['sun_fit'] == 'perfect'
    assert all(r['sun_preference'] != 'shade' for r in spot_recs['recommendations'])
    assert 'garden_context.spot_recommendations.recommendations' in garden_context['response_guidance']
    assert 'Verzin geen soorten buiten deze lijst' in garden_context['response_guidance']


@pytest.mark.asyncio
async def test_build_garden_context_marks_full_sun_focused_plant_as_poor_fit_in_deep_shade(
    seeded_db,
    monkeypatch,
):
    await _prepare_spot_db(seeded_db)
    monkeypatch.setattr(chat_router, 'get_temp_data', _fake_temp_data)
    monkeypatch.setattr(chat_router, 'get_rain_data', _fake_rain_data)

    garden_context, _, _, _ = await chat_router._build_garden_context(
        seeded_db,
        1,
        page_context=chat_router.PageContext(
            route='/map/garden',
            map_slug='garden',
            selected_plant_id=101,
            clicked_map_x=12,
            clicked_map_y=20,
            direct_sun_hours=0.5,
            sky_view_factor=0.25,
            light_bucket='deep_shade',
        ),
        active_user_id=1,
        requested_language='nl',
    )

    spot_recs = garden_context['spot_recommendations']
    assert spot_recs['light_bucket'] == 'deep_shade'
    assert all(r['dutch_name'] != 'Lavendel' for r in spot_recs['recommendations'])
    assert spot_recs['recommendations'][0]['sun_preference'] == 'shade'

    fit = garden_context['focused_plant_fit']
    assert fit == {
        'plant_id': 101,
        'plant_name': 'Lavendel',
        'sun_requirement': 'full_sun',
        'current_light_bucket': 'deep_shade',
        'fit': 'poor',
        'reason': 'Lavendel heeft volle zon nodig, maar deze plek is diepe schaduw.',
    }
    assert 'garden_context.focused_plant_fit' in garden_context['response_guidance']
