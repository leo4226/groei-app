"""Per-account state for canonical heat and frost warnings."""
from datetime import date


async def weather_warning_states_for_account(db, account_id: int) -> dict[str, dict]:
    rows = await db.execute_fetchall(
        """
        SELECT warning_id, acknowledged_at, push_sent_at
        FROM weather_warning_account_state
        WHERE account_id = ?
        """,
        (account_id,),
    )
    return {row["warning_id"]: dict(row) for row in rows}


async def weather_warning_push_is_suppressed(
    db,
    *,
    account_id: int,
    warning_id: str,
) -> bool:
    rows = await db.execute_fetchall(
        """
        SELECT acknowledged_at, push_sent_at
        FROM weather_warning_account_state
        WHERE account_id = ? AND warning_id = ?
        """,
        (account_id, warning_id),
    )
    if not rows:
        return False
    return bool(rows[0]["acknowledged_at"] or rows[0]["push_sent_at"])


async def mark_weather_warning_push_sent(
    db,
    *,
    account_id: int,
    warning_id: str,
    care_type: str,
    forecast_date: date,
    severity: str,
) -> None:
    await db.execute(
        """
        INSERT INTO weather_warning_account_state (
            account_id,
            warning_id,
            care_type,
            forecast_date,
            severity,
            push_sent_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (account_id, warning_id) DO UPDATE SET
            care_type = excluded.care_type,
            forecast_date = excluded.forecast_date,
            severity = excluded.severity,
            push_sent_at = CURRENT_TIMESTAMP
        """,
        (account_id, warning_id, care_type, forecast_date, severity),
    )


async def acknowledge_weather_warning(
    db,
    *,
    account_id: int,
    warning_id: str,
    care_type: str,
    forecast_date: date,
    severity: str,
) -> dict:
    await db.execute(
        """
        INSERT INTO weather_warning_account_state (
            account_id,
            warning_id,
            care_type,
            forecast_date,
            severity,
            acknowledged_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (account_id, warning_id) DO UPDATE SET
            care_type = excluded.care_type,
            forecast_date = excluded.forecast_date,
            severity = excluded.severity,
            acknowledged_at = CURRENT_TIMESTAMP
        """,
        (account_id, warning_id, care_type, forecast_date, severity),
    )
    await db.commit()
    rows = await db.execute_fetchall(
        """
        SELECT warning_id, care_type, forecast_date, severity, acknowledged_at
        FROM weather_warning_account_state
        WHERE account_id = ? AND warning_id = ?
        """,
        (account_id, warning_id),
    )
    return dict(rows[0])


async def restore_weather_warning(db, *, account_id: int, warning_id: str) -> None:
    await db.execute(
        """
        UPDATE weather_warning_account_state
        SET acknowledged_at = NULL
        WHERE account_id = ? AND warning_id = ?
        """,
        (account_id, warning_id),
    )
    await db.commit()
