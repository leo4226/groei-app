import pytest

from routers import maps as maps_router


class FakeDb:
    def __init__(self, *, with_object: bool = False):
        self.with_object = with_object

    async def execute_fetchall(self, query, params=()):
        if 'SELECT id, map_type, lat, lon FROM maps WHERE slug' in query:
            # lat/lon are selected so the map can ask whether a plant is still
            # wet enough to skip a due watering.
            return [{'id': 1, 'map_type': 'outdoor', 'lat': 52.37, 'lon': 4.85}]
        if 'FROM plants p' in query:
            assert 'p.care_profile' in query
            # Both feed the still-moist assessment: mulch slows evaporation and
            # measured sun hours say how exposed the plant is.
            assert 'p.mulch' in query
            assert 'p.measured_sun_hours' in query
            assert 's.common_name_nl AS species_common_name_nl' in query
            assert 's.common_name_en AS species_common_name_en' in query
            return []
        if 'SELECT * FROM objects' in query:
            return [{'id': 99, 'name': 'Terracotta pot'}] if self.with_object else []
        if 'FROM plant_placements pp' in query:
            assert 'p.household_id = ?' in query
            assert params == (1, 1)
            return []
        return []


async def _empty_weather(*args, **kwargs):
    return {}


async def _no_last_log(*args, **kwargs):
    return None


async def _no_forecast(*args, **kwargs):
    return []


@pytest.mark.asyncio
async def test_map_plants_selects_care_profile_for_warning_pipeline(monkeypatch):
    monkeypatch.setattr(maps_router, 'get_temp_data', _empty_weather)
    monkeypatch.setattr(maps_router, 'get_rain_data', _empty_weather)
    monkeypatch.setattr(maps_router, 'get_last_garden_watered', _no_last_log)
    monkeypatch.setattr(maps_router, 'get_last_garden_fertilized', _no_last_log)
    monkeypatch.setattr(maps_router, 'get_usable_forecast_days', _no_forecast)

    async def fake_enrich(*args, **kwargs):
        return []

    monkeypatch.setattr(maps_router, 'enrich_plants', fake_enrich)

    assert await maps_router.get_map_plants('garden', account={'household_id': 1}, db=FakeDb()) == []


@pytest.mark.asyncio
async def test_map_items_selects_care_profile_for_free_and_contained_plants(monkeypatch):
    monkeypatch.setattr(maps_router, 'get_temp_data', _empty_weather)
    monkeypatch.setattr(maps_router, 'get_rain_data', _empty_weather)
    monkeypatch.setattr(maps_router, 'get_last_garden_watered', _no_last_log)
    monkeypatch.setattr(maps_router, 'get_last_garden_fertilized', _no_last_log)
    monkeypatch.setattr(maps_router, 'get_usable_forecast_days', _no_forecast)

    async def fake_enrich(*args, **kwargs):
        return []

    monkeypatch.setattr(maps_router, 'enrich_plants', fake_enrich)

    assert await maps_router.get_map_items('garden', account={'household_id': 1}, db=FakeDb(with_object=True)) == {
        'plants': [],
        'objects': [{'id': 99, 'name': 'Terracotta pot', 'contained_plants': []}],
        'secondary_markers': [],
    }
