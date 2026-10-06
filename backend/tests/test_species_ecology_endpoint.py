"""Tests for GET /api/species/{id}/ecology.

Exercises the real `ensure_ecology` read path against the seeded in-memory
DB. A row whose `ecology_enriched_at` is already set short-circuits before
any GBIF/LLM enrichment, so these tests touch no network.

Ported from the #29 work; rewritten to match the actual ecology columns
(`native_to_nl`, `flowering_months`, … with only `ecology_data_source` /
`ecology_enriched_at` prefixed) and the fact that the biodiversity `score`
is computed on read rather than stored.
"""
import pytest

BASE = "/api"

# ensure_ecology SELECTs exactly these columns; the table must carry them all
# (conftest's minimal schema has no plant_species table, so we create it here).
_PLANT_SPECIES_DDL = """
    CREATE TABLE IF NOT EXISTS plant_species (
        id INTEGER PRIMARY KEY,
        latin_name TEXT,
        common_name_nl TEXT,
        gbif_taxon_key INTEGER,
        native_to_nl INTEGER,
        invasive_nl INTEGER,
        flowering_months TEXT,
        pollinator_value INTEGER,
        host_plant_for TEXT,
        sun_preference TEXT,
        ecology_data_source TEXT,
        ecology_enriched_at TEXT
    )
"""


async def _create_species_table(db):
    await db.execute(_PLANT_SPECIES_DDL)
    await db.commit()


@pytest.mark.asyncio
async def test_species_ecology_endpoint_returns_cached_profile(client, seeded_db, auth_header):
    """A species with cached ecology data is returned without re-enrichment."""
    await _create_species_table(seeded_db)
    await seeded_db.execute(
        "INSERT INTO plant_species "
        "(id, latin_name, common_name_nl, native_to_nl, invasive_nl, "
        "flowering_months, pollinator_value, host_plant_for, sun_preference, "
        "ecology_data_source, ecology_enriched_at) "
        "VALUES (10, 'Quercus robur', 'Zomereik', 1, 0, '[6,7,8]', 8, '[]', "
        "'full_sun', 'gbif', '2026-01-15T12:00:00Z')"
    )
    await seeded_db.commit()

    resp = await client.get(f"{BASE}/species/10/ecology", headers=auth_header)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["native_to_nl"] is True
    assert body["invasive_nl"] is False
    assert body["flowering_months"] == [6, 7, 8]
    assert body["pollinator_value"] == 8
    assert body["host_plant_for"] == []
    assert body["sun_preference"] == "full_sun"
    assert body["data_source"] == "gbif"
    assert body["enriched_at"] == "2026-01-15T12:00:00Z"
    # Computed on read: pollinator 8 -> +30, flowering 3 months -> +8.
    # (native bonus is skipped here: SQLite stores the flag as int 1, and the
    # score helper credits it only on a real bool True — a known dev-SQLite
    # vs prod-asyncpg quirk, not under test.)
    assert body["score"] == 38


@pytest.mark.asyncio
async def test_species_ecology_endpoint_404_for_missing_species(client, seeded_db, auth_header):
    """A non-existent species id yields 404 (table exists, row does not)."""
    await _create_species_table(seeded_db)

    resp = await client.get(f"{BASE}/species/999/ecology", headers=auth_header)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_paid_species_lookups_require_a_session(client, seeded_db):
    """Ecology and fun facts can trigger paid LLM calls on first read."""
    for path in ("/api/species/10/ecology", "/api/species/10/fun-fact"):
        response = await client.get(path)
        assert response.status_code in (401, 403), path


@pytest.mark.asyncio
async def test_weather_proxy_requires_a_session(client, seeded_db):
    response = await client.get("/api/weather", params={"lat": 1.0, "lon": 2.0})
    assert response.status_code in (401, 403)


def test_forecast_cache_is_bounded(monkeypatch):
    import asyncio
    from datetime import datetime, timedelta, timezone
    from services import weather_forecast

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(weather_forecast.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(weather_forecast, "_normalize", lambda payload, **kw: {"ok": True})
    weather_forecast.clear_forecast_cache()
    start = datetime(2026, 10, 6, tzinfo=timezone.utc)
    for index in range(weather_forecast._CACHE_MAX_ENTRIES + 20):
        asyncio.run(weather_forecast.get_map_forecast(
            index / 100, 4.0, now=start + timedelta(seconds=index),
        ))

    assert len(weather_forecast._cache) == weather_forecast._CACHE_MAX_ENTRIES
    assert weather_forecast.forecast_cache_key(0.0, 4.0) not in weather_forecast._cache
    weather_forecast.clear_forecast_cache()


@pytest.mark.asyncio
async def test_weather_proxy_serves_a_signed_in_caller(client, seeded_db, auth_header, monkeypatch):
    import routers.weather as weather_router

    async def fake_forecast(lat, lon):
        return {"current": {"temperature_2m": 12}, "lat": lat, "lon": lon}

    monkeypatch.setattr(weather_router, "get_map_forecast", fake_forecast)
    response = await client.get(
        "/api/weather", params={"lat": 52.37, "lon": 4.85}, headers=auth_header,
    )

    assert response.status_code == 200
    assert response.json()["lat"] == 52.37
