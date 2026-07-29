"""PostgreSQL adapter contracts for weather-warning state writes."""
from datetime import date, datetime

import pytest

from services.weather_warning_state import (
    acknowledge_weather_warning,
    mark_weather_warning_push_sent,
)


class CompositeKeyStateDb:
    """Reject the DbAdapter path that auto-appends ``RETURNING id``."""

    def __init__(self) -> None:
        self.insert_sql: list[str] = []
        self.row: dict | None = None

    async def execute(self, sql: str, params=()):
        if "INSERT INTO weather_warning_account_state" in sql:
            raise AssertionError(
                "composite-key state INSERT must not use DbAdapter.execute()"
            )
        raise AssertionError(f"unexpected execute call: {sql}")

    async def execute_fetchall(self, sql: str, params=()):
        if "INSERT INTO weather_warning_account_state" in sql:
            assert "RETURNING warning_id" in sql
            self.insert_sql.append(sql)
            self.row = {
                "warning_id": params[1],
                "care_type": params[2],
                "forecast_date": params[3],
                "severity": params[4],
                "acknowledged_at": datetime(2026, 7, 28, 14, 0),
            }
            return [{"warning_id": params[1]}]
        if "SELECT warning_id" in sql:
            assert self.row is not None
            return [self.row]
        raise AssertionError(f"unexpected execute_fetchall call: {sql}")

    async def commit(self) -> None:
        return None


@pytest.mark.asyncio
async def test_acknowledgment_insert_uses_explicit_composite_key_returning():
    db = CompositeKeyStateDb()

    result = await acknowledge_weather_warning(
        db,
        account_id=7,
        warning_id="weather:heat",
        care_type="heat_protect",
        forecast_date=date(2026, 7, 30),
        severity="warning",
    )

    assert result["warning_id"] == "weather:heat"
    assert len(db.insert_sql) == 1


@pytest.mark.asyncio
async def test_push_state_insert_uses_explicit_composite_key_returning():
    db = CompositeKeyStateDb()

    await mark_weather_warning_push_sent(
        db,
        account_id=7,
        warning_id="weather:frost",
        care_type="frost_protect",
        forecast_date=date(2026, 7, 30),
        severity="urgent",
    )

    assert len(db.insert_sql) == 1
