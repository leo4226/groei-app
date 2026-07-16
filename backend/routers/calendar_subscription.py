"""Private, read-only personal-calendar subscription lifecycle."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from hashlib import sha256
import json
import os
import secrets
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator

from auth import get_current_account
from care_types import CARE_TYPES
from database import db_dep
from routers.calendar import list_calendar_events
from services.calendar_ics import serialize_calendar

router = APIRouter(prefix="/calendar", tags=["calendar-subscription"])


class CalendarSubscriptionConfig(BaseModel):
    environment: Literal["all", "outdoor", "indoor"] = "all"
    map_ids: list[int] = Field(default_factory=list, max_length=100)
    care_types: list[str] = Field(default_factory=list, max_length=32)
    include_context: bool = False
    privacy: bool = True

    @field_validator("map_ids")
    @classmethod
    def unique_map_ids(cls, values: list[int]) -> list[int]:
        return sorted(set(values))

    @field_validator("care_types")
    @classmethod
    def known_care_types(cls, values: list[str]) -> list[str]:
        canonical = sorted(set(values))
        if any(value not in CARE_TYPES for value in canonical):
            raise ValueError("unknown care type")
        return canonical


class CalendarSubscriptionStatus(BaseModel):
    active: bool
    config: CalendarSubscriptionConfig | None = None
    created_at: datetime | None = None


class CalendarSubscriptionCreated(BaseModel):
    feed_url: str
    webcal_url: str
    config: CalendarSubscriptionConfig


def _hash_token(raw: str) -> str:
    return sha256(raw.encode("utf-8")).hexdigest()


def _feed_url(raw: str) -> str:
    base = os.environ.get("PUBLIC_API_BASE_URL", "https://api.floreren.app/api").rstrip("/")
    return f"{base}/calendar/feed/{raw}.ics"


def _event_value(event, key: str, default=None):
    if isinstance(event, dict):
        return event.get(key, default)
    return getattr(event, key, default)


def _amsterdam_today() -> date:
    return datetime.now(ZoneInfo("Europe/Amsterdam")).date()


def _filter_events(events: list, config: CalendarSubscriptionConfig) -> list:
    filtered = []
    for event in events:
        weather_triggered = bool(_event_value(event, "weather_triggered", False))
        if weather_triggered and not config.include_context:
            continue
        map_id = _event_value(event, "map_id")
        if config.map_ids and map_id not in config.map_ids:
            continue
        care_type = str(_event_value(event, "type", _event_value(event, "care_type", "")))
        if not weather_triggered and config.care_types and care_type not in config.care_types:
            continue
        filtered.append(event)
    return filtered


async def _project_events(db, household_id: int, config: CalendarSubscriptionConfig):
    environment = {"all": None, "outdoor": "tuin", "indoor": "huis"}[config.environment]
    today = _amsterdam_today()
    events = await list_calendar_events(
        from_=today.isoformat(),
        to=(today + timedelta(days=366)).isoformat(),
        env=environment,
        group_outdoor=True,
        pin_overdue=True,
        account={"household_id": household_id},
        db=db,
    )
    return _filter_events(events, config)


def _calendar_response(
    payload: bytes,
    *,
    disposition: str,
    cache_control: str,
    request: Request | None = None,
) -> Response:
    etag = f'"{sha256(payload).hexdigest()}"'
    headers = {
        "Cache-Control": cache_control,
        "Content-Disposition": disposition,
        "ETag": etag,
        "X-Content-Type-Options": "nosniff",
    }
    if request is not None and request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(
        content=payload,
        media_type="text/calendar; charset=utf-8",
        headers=headers,
    )


async def _validate_maps(db, household_id: int, map_ids: list[int]) -> None:
    if not map_ids:
        return
    placeholders = ",".join("?" for _ in map_ids)
    rows = await db.execute_fetchall(
        f"SELECT id FROM maps WHERE household_id = ? AND id IN ({placeholders})",
        (household_id, *map_ids),
    )
    if {int(row["id"]) for row in rows} != set(map_ids):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_calendar_subscription_map"},
        )


@router.get("/subscription", response_model=CalendarSubscriptionStatus)
async def get_subscription_status(
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    rows = await db.execute_fetchall(
        """SELECT config_json, created_at
           FROM calendar_subscriptions
           WHERE account_id = ? AND household_id = ? AND revoked_at IS NULL""",
        (account["account_id"], account["household_id"]),
    )
    if not rows:
        return CalendarSubscriptionStatus(active=False)
    row = rows[0]
    raw_config = row["config_json"]
    config = json.loads(raw_config) if isinstance(raw_config, str) else raw_config
    return CalendarSubscriptionStatus(
        active=True,
        config=CalendarSubscriptionConfig.model_validate(config),
        created_at=row["created_at"],
    )


@router.post(
    "/subscription",
    response_model=CalendarSubscriptionCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_or_regenerate_subscription(
    config: CalendarSubscriptionConfig,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    await _validate_maps(db, account["household_id"], config.map_ids)
    raw = secrets.token_urlsafe(32)
    await db.execute(
        """INSERT INTO calendar_subscriptions
           (account_id, household_id, token_hash, config_json, created_at, updated_at, revoked_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
           ON CONFLICT (account_id) DO UPDATE SET
             household_id = excluded.household_id,
             token_hash = excluded.token_hash,
             config_json = excluded.config_json,
             created_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             revoked_at = NULL""",
        (
            account["account_id"],
            account["household_id"],
            _hash_token(raw),
            config.model_dump_json(),
        ),
    )
    await db.commit()
    url = _feed_url(raw)
    return CalendarSubscriptionCreated(
        feed_url=url,
        webcal_url=url.replace("https://", "webcal://", 1),
        config=config,
    )


@router.delete("/subscription", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_subscription(
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    await db.execute(
        """UPDATE calendar_subscriptions
           SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE account_id = ? AND revoked_at IS NULL""",
        (account["account_id"],),
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/feed/{token}.ics")
async def public_calendar_feed(
    token: str,
    request: Request,
    db=Depends(db_dep),
):
    rows = await db.execute_fetchall(
        """SELECT s.household_id, s.config_json, a.language
           FROM calendar_subscriptions s
           JOIN accounts a ON a.id = s.account_id AND a.household_id = s.household_id
           WHERE s.token_hash = ? AND s.revoked_at IS NULL""",
        (_hash_token(token),),
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"code": "calendar_feed_not_found"})
    row = rows[0]
    raw_config = row["config_json"]
    config = CalendarSubscriptionConfig.model_validate(
        json.loads(raw_config) if isinstance(raw_config, str) else raw_config
    )
    language = row.get("language") if isinstance(row, dict) else row["language"]
    language = language if language in ("nl", "en") else "nl"
    events = await _project_events(db, row["household_id"], config)
    payload = serialize_calendar(
        events,
        language=language,
        privacy=config.privacy,
        generated_at=_amsterdam_today(),
    )
    return _calendar_response(
        payload,
        disposition="inline",
        cache_control="private, max-age=300",
        request=request,
    )


@router.post("/export.ics")
async def download_calendar_snapshot(
    config: CalendarSubscriptionConfig,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    await _validate_maps(db, account["household_id"], config.map_ids)
    language_rows = await db.execute_fetchall(
        "SELECT language FROM accounts WHERE id = ?",
        (account["account_id"],),
    )
    language = language_rows[0].get("language") if language_rows else "nl"
    language = language if language in ("nl", "en") else "nl"
    events = await _project_events(db, account["household_id"], config)
    payload = serialize_calendar(
        events,
        language=language,
        privacy=config.privacy,
        generated_at=_amsterdam_today(),
    )
    return _calendar_response(
        payload,
        disposition='attachment; filename="floreren-care.ics"',
        cache_control="private, no-store",
    )
