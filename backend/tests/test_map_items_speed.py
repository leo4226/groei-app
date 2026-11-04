"""The map's items request: weather lookups run together, and the plants in
every pot come from one query instead of one per pot (speed audit, item 4)."""
import asyncio

import pytest

from routers import maps as maps_router


class CountingDb:
    """The test database, counting the queries for plants inside a container."""

    def __init__(self, db):
        self._db = db
        self.container_queries = 0

    async def execute_fetchall(self, query, params=()):
        if "p.container_id" in query and "WHERE p.container_id" in query:
            self.container_queries += 1
        return await self._db.execute_fetchall(query, params)

    def __getattr__(self, name):
        return getattr(self._db, name)


@pytest.fixture
def no_weather(monkeypatch):
    async def weather(*args, **kwargs):
        return {}

    async def nothing(*args, **kwargs):
        return None

    async def no_days(*args, **kwargs):
        return []

    monkeypatch.setattr(maps_router, "get_temp_data", weather)
    monkeypatch.setattr(maps_router, "get_rain_data", weather)
    monkeypatch.setattr(maps_router, "get_usable_forecast_days", no_days)
    monkeypatch.setattr(maps_router, "get_last_garden_watered", nothing)
    monkeypatch.setattr(maps_router, "get_last_garden_fertilized", nothing)


@pytest.mark.asyncio
async def test_pot_plants_come_from_one_query_and_land_in_their_own_pot(seeded_db, no_weather):
    db = seeded_db
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS plant_species (
            id INTEGER PRIMARY KEY, phenology_json TEXT,
            common_name_nl TEXT, common_name_en TEXT
        );
        CREATE TABLE IF NOT EXISTS objects (
            id INTEGER PRIMARY KEY, name TEXT, map_id INTEGER, is_active INTEGER DEFAULT 1
        );
        ALTER TABLE maps ADD COLUMN slug TEXT;
        ALTER TABLE maps ADD COLUMN lat REAL;
        ALTER TABLE maps ADD COLUMN lon REAL;
        INSERT INTO maps (id, name, slug, map_type, household_id) VALUES (5, 'Balkon', 'balkon', 'outdoor', 1);
        INSERT INTO objects (id, name, map_id) VALUES (51, 'Pot A', 5), (52, 'Pot B', 5), (53, 'Empty pot', 5);
        INSERT INTO plants (id, name, household_id, map_id, map_x, map_y, is_active) VALUES
            (1, 'Free', 1, 5, 10, 10, 1);
        INSERT INTO plants (id, name, household_id, map_id, container_id, is_active) VALUES
            (2, 'Basil', 1, 5, 51, 1), (3, 'Thyme', 1, 5, 51, 1), (4, 'Mint', 1, 5, 52, 1),
            (5, 'Archived', 1, 5, 52, 0);
    """)
    await db.commit()
    counting = CountingDb(db)

    items = await maps_router.get_map_items("balkon", account={"household_id": 1}, db=counting)

    assert counting.container_queries == 1
    by_pot = {o["name"]: sorted(p["name"] for p in o["contained_plants"]) for o in items["objects"]}
    assert by_pot == {"Pot A": ["Basil", "Thyme"], "Pot B": ["Mint"], "Empty pot": []}
    assert [p["name"] for p in items["plants"]] == ["Free"]
    # Contained plants without a position still get one the client can draw.
    assert all(p["map_x"] == 0 for o in items["objects"] for p in o["contained_plants"])


@pytest.mark.asyncio
async def test_the_three_weather_lookups_run_together(monkeypatch):
    async def slow(*args, **kwargs):
        await asyncio.sleep(0.2)
        return {}

    async def slow_days(*args, **kwargs):
        await asyncio.sleep(0.2)
        return []

    async def nothing(*args, **kwargs):
        return None

    monkeypatch.setattr(maps_router, "get_temp_data", slow)
    monkeypatch.setattr(maps_router, "get_rain_data", slow)
    monkeypatch.setattr(maps_router, "get_usable_forecast_days", slow_days)
    monkeypatch.setattr(maps_router, "get_last_garden_watered", nothing)
    monkeypatch.setattr(maps_router, "get_last_garden_fertilized", nothing)

    started = asyncio.get_running_loop().time()
    context = await maps_router._care_context(db=None, household_id=1, lat=52.37, lon=4.85)
    elapsed = asyncio.get_running_loop().time() - started

    assert elapsed < 0.4
    assert set(context) == {"temp_data", "rain_data", "forecast_days", "last_watered", "last_fertilized"}
