from datetime import datetime, timedelta, timezone

import pytest

from services import weather_forecast


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class FakeClient:
    calls: list[tuple[str, dict]] = []
    fail = False

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    omit_humidity_soil = False

    async def get(self, url, params):
        self.calls.append((url, params))
        if self.fail:
            raise RuntimeError("offline")
        daily = {
            "time": ["2026-07-15", "2026-07-16", "2026-07-17"],
            "weather_code": [1, 2, 61],
            "temperature_2m_max": [22.0, 26.0, 28.0],
            "temperature_2m_min": [14.0, 16.0, 17.0],
            "precipitation_sum": [2.0, 0.0, 5.0],
            "et0_fao_evapotranspiration": [2.1, 3.5, 4.0],
            "wind_speed_10m_max": [10.0, 12.0, 14.0],
            "sunrise": ["06:00", "06:01", "06:02"],
            "sunset": ["21:50", "21:49", "21:48"],
            "cloud_cover_mean": [85.0, 15.0, 90.0],
        }
        if not self.omit_humidity_soil:
            daily["relative_humidity_2m_max"] = [60.0, 55.0, 70.0]
            daily["soil_moisture_0_to_7cm_mean"] = [35.0, 32.0, 40.0]
        return FakeResponse({
            "current": {
                "temperature_2m": 24.0,
                "relative_humidity_2m": 55,
                "weather_code": 1,
            },
            "daily": daily,
        })


@pytest.fixture(autouse=True)
def reset_cache(monkeypatch):
    FakeClient.calls = []
    FakeClient.fail = False
    FakeClient.omit_humidity_soil = False
    weather_forecast.clear_forecast_cache()
    monkeypatch.setattr(weather_forecast.httpx, "AsyncClient", FakeClient)


def test_cache_key_rounds_coordinates_but_keeps_maps_independent():
    assert weather_forecast.forecast_cache_key(52.37154, 4.84994) == "52.3715:4.8499"
    assert weather_forecast.forecast_cache_key(52.4012, 4.9123) != weather_forecast.forecast_cache_key(52.3715, 4.8499)


@pytest.mark.asyncio
async def test_fetches_history_forecast_precipitation_temperature_and_et0_per_map():
    now = datetime(2026, 7, 16, 10, tzinfo=timezone.utc)

    first = await weather_forecast.get_map_forecast(52.3715, 4.8499, now=now)
    cached = await weather_forecast.get_map_forecast(52.37151, 4.84991, now=now + timedelta(minutes=20))
    second_map = await weather_forecast.get_map_forecast(52.4012, 4.9123, now=now)

    assert len(FakeClient.calls) == 2
    assert cached == first
    assert second_map["location"] != first["location"]
    _, params = FakeClient.calls[0]
    assert params["past_days"] == 7
    assert params["forecast_days"] == 7
    assert "precipitation_sum" in params["daily"]
    assert "temperature_2m_max" in params["daily"]
    assert "et0_fao_evapotranspiration" in params["daily"]
    assert "cloud_cover_mean" in params["daily"]
    assert "relative_humidity_2m_max" in params["daily"]
    assert "soil_moisture_0_to_7cm_mean" in params["daily"]
    assert first["days"][1] == {
        "date": "2026-07-16",
        "max_temp_c": 26.0,
        "min_temp_c": 16.0,
        "precipitation_mm": 0.0,
        "et0_mm": 3.5,
        "cloud_cover_mean_pct": 15.0,
        "humidity_pct": 55.0,
        "soil_moisture_pct": 32.0,
    }
    assert first["daily"]["time"][0] == "2026-07-16"
    assert first["daily"]["temperature_2m_max"] == [26.0, 28.0]
    assert first["stale"] is False


@pytest.mark.asyncio
async def test_expired_entry_is_returned_as_stale_when_open_meteo_fails():
    now = datetime(2026, 7, 16, 10, tzinfo=timezone.utc)
    fresh = await weather_forecast.get_map_forecast(52.3715, 4.8499, now=now)
    FakeClient.fail = True

    stale = await weather_forecast.get_map_forecast(
        52.3715,
        4.8499,
        now=now + weather_forecast.CACHE_TTL + timedelta(seconds=1),
    )

    assert stale["days"] == fresh["days"]
    assert stale["stale"] is True


@pytest.mark.asyncio
async def test_no_cache_and_network_failure_returns_unavailable_shape():
    FakeClient.fail = True

    result = await weather_forecast.get_map_forecast(52.3715, 4.8499)

    assert result["available"] is False
    assert result["days"] == []


@pytest.mark.asyncio
async def test_missing_humidity_and_soil_fields_normalize_to_none():
    now = datetime(2026, 7, 16, 10, tzinfo=timezone.utc)
    FakeClient.omit_humidity_soil = True

    result = await weather_forecast.get_map_forecast(52.3715, 4.8499, now=now)

    assert result["days"][1]["humidity_pct"] is None
    assert result["days"][1]["soil_moisture_pct"] is None
