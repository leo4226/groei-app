"""Integration tokens + what they unlock, for personal dashboards (LAveren).

Built for LAveren, Leon's local all-projects dashboard, but nothing here is
specific to it: any personal tool can hold a token.

    POST   /api/integrations/tokens                    make a token (raw value shown once)
    GET    /api/integrations/tokens                    list this account's active tokens
    DELETE /api/integrations/tokens/{id}               revoke one
    GET    /api/integrations/snapshot                  household snapshot     (any token)
    GET    /api/integrations/maps/{id}/thumbnail.svg   map thumbnail          (any token)
    POST   /api/integrations/care/done                 mark a care task done  ('care' token)

An integration token is accepted by these routes and nowhere else: it is not a
login token and `get_current_account` never sees it. A password change or reset
retires it (see migration 0082).

Scopes. 'read' tokens can only read. 'care' tokens can also mark a care task
done, acting as the account that made the token (the care log names that
person), and only while that account can still edit. Scopes are fixed when a
token is made: widening means a new token, so a read-only token handed to some
tool can never start writing.

Snapshot and thumbnails are cached in-process for 15 minutes per token and sent
with an ETag; see services/integration_snapshot.py for why (Neon compute).
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from auth import capabilities_for_role, get_current_account, require_editor
from database import db_dep
from models import CareAction
from services import integration_snapshot as snapshot_service
from services.local_time import local_today

router = APIRouter(prefix="/integrations", tags=["integrations"])

TOKEN_PREFIX = "flo_"
MAX_ACTIVE_TOKENS = 5
Scope = Literal["read", "care"]

_optional_bearer = HTTPBearer(auto_error=False)


def hash_token(raw: str) -> str:
    return sha256(raw.encode("utf-8")).hexdigest()


class IntegrationTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    scope: Scope = "read"

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name is empty")
        return value


class IntegrationTokenOut(BaseModel):
    id: int
    name: str
    token_hint: str
    scope: str
    created_at: datetime | None = None
    last_used_at: datetime | None = None


class IntegrationTokenCreated(IntegrationTokenOut):
    # The raw token. Returned only here; only its hash is stored.
    token: str
    snapshot_url: str


class IntegrationCareDone(BaseModel):
    # From a snapshot care item. The plant and care type follow from it.
    schedule_id: int
    notes: str | None = Field(default=None, max_length=500)


def _snapshot_url() -> str:
    # Behind Fly's proxy request.url_for() would say http://; use the public base.
    return f"{snapshot_service.api_base()}/integrations/snapshot"


async def _session_version(db, account_id: int) -> int:
    rows = await db.execute_fetchall(
        "SELECT session_version FROM accounts WHERE id = ?", (account_id,),
    )
    return int((rows[0]["session_version"] if rows else 0) or 0)


# ── token management (signed-in app user) ────────────────────────────────────


@router.get("/tokens", response_model=list[IntegrationTokenOut])
async def list_tokens(db=Depends(db_dep), account=Depends(get_current_account)):
    current = await _session_version(db, account["account_id"])
    rows = await db.execute_fetchall(
        """SELECT id, name, token_hint, scope, created_at, last_used_at
           FROM integration_tokens
           WHERE account_id = ? AND household_id = ?
             AND revoked_at IS NULL AND session_version = ?
           ORDER BY created_at DESC, id DESC""",
        (account["account_id"], account["household_id"], current),
    )
    return [IntegrationTokenOut(**dict(row)) for row in rows]


@router.post(
    "/tokens",
    response_model=IntegrationTokenCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_token(
    body: IntegrationTokenCreate,
    db=Depends(db_dep),
    # Same rule as the calendar feed link: handing out a standing credential
    # to household data is for owners and editors.
    account=Depends(require_editor),
):
    current = await _session_version(db, account["account_id"])
    active = await db.execute_fetchall(
        """SELECT COUNT(*) AS n FROM integration_tokens
           WHERE account_id = ? AND revoked_at IS NULL AND session_version = ?""",
        (account["account_id"], current),
    )
    if active and int(active[0]["n"]) >= MAX_ACTIVE_TOKENS:
        raise HTTPException(
            status_code=409, detail={"code": "integration_token_limit"},
        )

    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.execute(
        """INSERT INTO integration_tokens
           (account_id, household_id, name, token_hash, token_hint, scope,
            session_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            account["account_id"],
            account["household_id"],
            body.name,
            hash_token(raw),
            raw[-4:],
            body.scope,
            current,
            now,
        ),
    )
    await db.commit()
    rows = await db.execute_fetchall(
        """SELECT id, name, token_hint, scope, created_at, last_used_at
           FROM integration_tokens WHERE token_hash = ?""",
        (hash_token(raw),),
    )
    return IntegrationTokenCreated(**dict(rows[0]), token=raw, snapshot_url=_snapshot_url())


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: int,
    db=Depends(db_dep),
    account=Depends(require_editor),
):
    result = await db.execute(
        """UPDATE integration_tokens SET revoked_at = ?
           WHERE id = ? AND account_id = ? AND revoked_at IS NULL""",
        (datetime.now(timezone.utc).replace(tzinfo=None), token_id, account["account_id"]),
    )
    await db.commit()
    snapshot_service.forget_account(account["account_id"])
    if getattr(result, "rowcount", 1) == 0:
        raise HTTPException(status_code=404, detail={"code": "integration_token_not_found"})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── token-authenticated routes (the dashboard) ───────────────────────────────


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "integration_token_invalid"},
        headers={"WWW-Authenticate": "Bearer"},
    )


def _bearer_hash(credentials: HTTPAuthorizationCredentials | None) -> str:
    if credentials is None or not credentials.credentials.startswith(TOKEN_PREFIX):
        raise _unauthorized()
    return hash_token(credentials.credentials)


async def _resolve_token(db, token_hash: str) -> dict:
    """The live token row joined with its account, or 401."""
    rows = await db.execute_fetchall(
        """SELECT t.id, t.account_id, t.household_id, t.scope, a.language, a.role
           FROM integration_tokens t
           JOIN accounts a ON a.id = t.account_id AND a.household_id = t.household_id
           WHERE t.token_hash = ? AND t.revoked_at IS NULL
             AND t.session_version = COALESCE(a.session_version, 0)""",
        (token_hash,),
    )
    if not rows:
        raise _unauthorized()
    return dict(rows[0])


async def _touch(db, token_id: int, now_utc: datetime) -> None:
    await db.execute(
        "UPDATE integration_tokens SET last_used_at = ? WHERE id = ?",
        (now_utc.replace(tzinfo=None), token_id),
    )
    await db.commit()


def _cached_response(entry: snapshot_service.CachedSnapshot, request: Request) -> Response:
    headers = {
        "ETag": entry.etag,
        # The dashboard keeps its own copy; nothing in between should.
        "Cache-Control": "private, max-age=300",
    }
    if request.headers.get("if-none-match") == entry.etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(content=entry.body, media_type=entry.media_type, headers=headers)


@router.get("/snapshot")
async def integration_snapshot(
    request: Request,
    lang: str | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db=Depends(db_dep),
):
    token_hash = _bearer_hash(credentials)
    requested_lang = lang if lang in ("nl", "en") else None
    today = local_today()

    # A hit is served without a single query, so a dashboard's refresh does
    # not wake Neon. The variant "" means "the account's language".
    variant = requested_lang or ""
    cached = snapshot_service.get_cached(token_hash, variant, today=today)
    if cached is not None:
        return _cached_response(cached, request)

    generation = snapshot_service.cache_generation()
    row = await _resolve_token(db, token_hash)
    language = requested_lang or (row.get("language") if row.get("language") in ("nl", "en") else "nl")

    now_utc = datetime.now(timezone.utc)
    snapshot = await snapshot_service.build_snapshot(
        db,
        household_id=int(row["household_id"]),
        lang=language,
        today=today,
        now_utc=now_utc,
    )
    snapshot["token"] = {"scope": row["scope"], "can_log_care": _can_log_care(row)}
    # Written only on a cache miss, so at most once per TTL per token.
    await _touch(db, row["id"], now_utc)
    entry = snapshot_service.store(
        token_hash,
        variant,
        snapshot_service.encode(snapshot),
        account_id=int(row["account_id"]),
        household_id=int(row["household_id"]),
        today=today,
        generation=generation,
    )
    return _cached_response(entry, request)


@router.get("/maps/{map_id}/thumbnail.svg")
async def integration_map_thumbnail(
    map_id: int,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db=Depends(db_dep),
):
    token_hash = _bearer_hash(credentials)
    today = local_today()
    variant = f"map:{map_id}"
    cached = snapshot_service.get_cached(token_hash, variant, today=today)
    if cached is not None:
        return _cached_response(cached, request)

    generation = snapshot_service.cache_generation()
    row = await _resolve_token(db, token_hash)
    svg = await snapshot_service.build_map_thumbnail(
        db,
        household_id=int(row["household_id"]),
        map_id=map_id,
        today=today,
        now_utc=datetime.now(timezone.utc),
    )
    if svg is None:
        raise HTTPException(status_code=404, detail={"code": "map_not_found"})
    entry = snapshot_service.store(
        token_hash,
        variant,
        svg.encode("utf-8"),
        account_id=int(row["account_id"]),
        household_id=int(row["household_id"]),
        today=today,
        generation=generation,
        media_type="image/svg+xml",
    )
    return _cached_response(entry, request)


def _can_log_care(row: dict) -> bool:
    if row.get("scope") != "care":
        return False
    try:
        return bool(capabilities_for_role(row.get("role") or "")["can_edit"])
    except HTTPException:
        return False


@router.post("/care/done")
async def integration_care_done(
    body: IntegrationCareDone,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db=Depends(db_dep),
):
    """Mark one care task done from a dashboard, exactly as the app's own
    "done" button does (same log row, same next-due calculation)."""
    from routers.care import mark_care_done

    row = await _resolve_token(db, _bearer_hash(credentials))
    if row.get("scope") != "care":
        raise HTTPException(status_code=403, detail={"code": "integration_token_read_only"})
    if not _can_log_care(row):
        # The account was made a viewer after the token was made.
        raise HTTPException(status_code=403, detail={"code": "integration_account_read_only"})

    schedules = await db.execute_fetchall(
        """SELECT cs.id, cs.plant_id, cs.care_type
           FROM care_schedules cs JOIN plants p ON p.id = cs.plant_id
           WHERE cs.id = ? AND p.household_id = ? AND cs.is_active = 1 AND p.is_active = 1""",
        (body.schedule_id, row["household_id"]),
    )
    if not schedules:
        raise HTTPException(status_code=404, detail={"code": "care_schedule_not_found"})
    schedule = dict(schedules[0])

    account = {
        "account_id": row["account_id"],
        "household_id": row["household_id"],
        "role": row["role"],
        "capabilities": capabilities_for_role(row["role"]),
    }
    result = await mark_care_done(
        CareAction(
            plant_id=schedule["plant_id"],
            care_type=schedule["care_type"],
            schedule_id=schedule["id"],
            notes=body.notes,
        ),
        db=db,
        account=account,
    )
    await _touch(db, row["id"], datetime.now(timezone.utc))
    # Every member's dashboard should see it done on its next pull.
    snapshot_service.forget_household(int(row["household_id"]))
    return {
        "ok": True,
        "schedule_id": schedule["id"],
        "plant_id": schedule["plant_id"],
        "care_type": schedule["care_type"],
        "next_due": result.get("next_due"),
        "care_log_id": result.get("care_log_id"),
    }
