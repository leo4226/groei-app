"""Weather lookups must not hold a page up (speed audit, item 4).

Rain and temperature: anything known is served at once, an old reading is
renewed by one background request, concurrent callers share one fetch, and a
failed fetch is not retried by every request while Open-Meteo is down.

The forecast: renewed in the background before it expires, with the same
single fetch and failure backoff. An expired forecast is still never served
as fresh — warnings may only lean on a current one.
"""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from services import environment, weather_forecast


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class FakeClient:
    calls: list = []
    fail = False
    delay = 0.0

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, url, params=None):
        FakeClient.calls.append(url)
        if FakeClient.delay:
            await asyncio.sleep(FakeClient.delay)
        if FakeClient.fail:
            raise RuntimeError("offline")
        return FakeResponse({
            "current": {"temperature_2m": 20.0, "relative_humidity_2m": 50, "weather_code": 1},
            "daily": {
                "time": ["2026-11-01", "2026-11-02"],
                "precipitation_sum": [1.0, 2.0],
                "temperature_2m_max": [12.0, 14.0],
                "temperature_2m_min": [5.0, 6.0],
            },
        })


@pytest.fixture(autouse=True)
def fake_open_meteo(monkeypatch):
    FakeClient.calls = []
    FakeClient.fail = False
    FakeClient.delay = 0.0
    environment.clear_environment_cache()
    weather_forecast.clear_forecast_cache()
    monkeypatch.setattr(environment.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(weather_forecast.httpx, "AsyncClient", FakeClient)
    yield
    environment.clear_environment_cache()
    weather_forecast.clear_forecast_cache()


async def _settle():
    for task in list(environment._background) + list(weather_forecast._background):
        await task


@pytest.mark.asyncio
async def test_concurrent_cold_callers_share_one_fetch():
    FakeClient.delay = 0.05
    results = await asyncio.gather(*(environment.get_rain_data() for _ in range(5)))

    assert len(FakeClient.calls) == 1
    assert all(result["total_14day_mm"] == 3.0 for result in results)


@pytest.mark.asyncio
async def test_old_reading_is_served_at_once_and_renewed_behind_the_scenes():
    first = await environment.get_rain_data()
    environment._rain_cache["fetched_at"] -= environment.CACHE_TTL + timedelta(minutes=30)
    FakeClient.delay = 0.5

    started = asyncio.get_running_loop().time()
    served = await environment.get_rain_data()
    waited = asyncio.get_running_loop().time() - started

    assert served == first
    assert waited < 0.1
    await _settle()
    assert len(FakeClient.calls) == 2
    assert datetime.now(timezone.utc) - environment._rain_cache["fetched_at"] < timedelta(seconds=5)


@pytest.mark.asyncio
async def test_a_failed_fetch_is_not_retried_by_every_request():
    FakeClient.fail = True

    first = await environment.get_rain_data()
    second = await environment.get_rain_data()

    assert first["assessment"] == "unknown"
    assert second["assessment"] == "unknown"
    assert len(FakeClient.calls) == 1

    # After the backoff the next request tries again.
    environment._last_failure["rain"] -= environment.FAILURE_BACKOFF
    FakeClient.fail = False
    recovered = await environment.get_rain_data()
    assert recovered["total_14day_mm"] == 3.0
    assert len(FakeClient.calls) == 2


@pytest.mark.asyncio
async def test_forecast_is_renewed_before_it_expires_without_waiting():
    now = datetime.now(timezone.utc)
    first = await weather_forecast.get_map_forecast(52.3715, 4.8499, now=now)
    FakeClient.delay = 0.5

    later = now + weather_forecast.REFRESH_AHEAD + timedelta(minutes=1)
    started = asyncio.get_running_loop().time()
    served = await weather_forecast.get_map_forecast(52.3715, 4.8499, now=later)
    waited = asyncio.get_running_loop().time() - started

    assert served is first
    assert waited < 0.1
    await _settle()
    assert len(FakeClient.calls) == 2


@pytest.mark.asyncio
async def test_expired_forecast_is_not_served_as_fresh():
    now = datetime.now(timezone.utc)
    await weather_forecast.get_map_forecast(52.3715, 4.8499, now=now)
    FakeClient.fail = True

    expired = now + weather_forecast.CACHE_TTL + timedelta(seconds=1)
    result = await weather_forecast.get_map_forecast(52.3715, 4.8499, now=expired)

    # get_usable_forecast_days turns a stale forecast into "no evidence".
    assert result["stale"] is True
    assert result["days"]
