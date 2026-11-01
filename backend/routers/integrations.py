"""Read-only integration tokens + the household snapshot they unlock.

Built for LAveren, Leon's local all-projects dashboard, but nothing here is
specific to it: any personal tool can hold a token.

    POST   /api/integrations/tokens          make a token (raw value shown once)
    GET    /api/integrations/tokens          list this account's active tokens
    DELETE /api/integrations/tokens/{id}     revoke one
    GET    /api/integrations/snapshot        the snapshot (Bearer flo_… token)

An integration token is accepted by the snapshot route and nowhere else: it is
not a login token, `get_current_account` never sees it, and it can only read.
A password change or reset retires it (see migration 0082).

The snapshot is cached in-process for 15 minutes per token and sent with an
ETag; see services/integration_snapshot.py for why (Neon compute).
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from auth import get_current_account, require_editor
from database import db_dep
from services import integration_snapshot as snapshot_service
from services.local_time import local_today

router = APIRouter(prefix="/integrations", tags=["integrations"])

TOKEN_PREFIX = "flo_"
MAX_ACTIVE_TOKENS = 5

_optional_bearer = HTTPBearer(auto_error=False)


def hash_token(raw: str) -> str:
    return sha256(raw.encode("utf-8")).hexdigest()


class IntegrationTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)

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


def _snapshot_url() -> str:
    # Behind Fly's proxy request.url_for() would say http://; use the public base.
    base = os.environ.get("PUBLIC_API_BASE_URL", "https://api.floreren.app/api").rstrip("/")
    return f"{base}/integrations/snapshot"


async def _session_version(db, account_id: int) -> int:
    rows = await db.execute_fetchall(
        "SELECT session_version FROM accounts WHERE id = ?", (account_id,),
    )
    return int((rows[0]["session_version"] if rows else 0) or 0)


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
           VALUES (?, ?, ?, ?, ?, 'read', ?, ?)""",
        (
            account["account_id"],
            account["household_id"],
            body.name,
            hash_token(raw),
            raw[-4:],
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
    return IntegrationTokenCreated(
        **dict(rows[0]), token=raw, snapshot_url=_snapshot_url(),
    )


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


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "integration_token_invalid"},
        headers={"WWW-Authenticate": "Bearer"},
    )


def _snapshot_response(entry: snapshot_service.CachedSnapshot, request: Request) -> Response:
    headers = {
        "ETag": entry.etag,
        # The dashboard keeps its own copy; nothing in between should.
        "Cache-Control": "private, max-age=300",
    }
    if request.headers.get("if-none-match") == entry.etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(content=entry.body, media_type="application/json", headers=headers)


@router.get("/snapshot")
async def integration_snapshot(
    request: Request,
    lang: str | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db=Depends(db_dep),
):
    if credentials is None or not credentials.credentials.startswith(TOKEN_PREFIX):
        raise _unauthorized()
    token_hash = hash_token(credentials.credentials)
    requested_lang = lang if lang in ("nl", "en") else None
    today = local_today()

    # A hit is served without a single query, so a dashboard's refresh does
    # not wake Neon. The language key "" means "the account's language".
    cache_lang = requested_lang or ""
    cached = snapshot_service.get_cached(token_hash, cache_lang, today=today)
    if cached is not None:
        return _snapshot_response(cached, request)

    generation = snapshot_service.cache_generation()
    rows = await db.execute_fetchall(
        """SELECT t.id, t.account_id, t.household_id, a.language
           FROM integration_tokens t
           JOIN accounts a ON a.id = t.account_id AND a.household_id = t.household_id
           WHERE t.token_hash = ? AND t.revoked_at IS NULL
             AND t.session_version = COALESCE(a.session_version, 0)""",
        (token_hash,),
    )
    if not rows:
        raise _unauthorized()
    row = dict(rows[0])
    language = requested_lang or (row.get("language") if row.get("language") in ("nl", "en") else "nl")

    now_utc = datetime.now(timezone.utc)
    snapshot = await snapshot_service.build_snapshot(
        db,
        household_id=int(row["household_id"]),
        lang=language,
        today=today,
        now_utc=now_utc,
    )
    # Written only on a cache miss, so at most once per TTL per token.
    await db.execute(
        "UPDATE integration_tokens SET last_used_at = ? WHERE id = ?",
        (now_utc.replace(tzinfo=None), row["id"]),
    )
    await db.commit()
    entry = snapshot_service.store(
        token_hash,
        cache_lang,
        snapshot_service.encode(snapshot),
        account_id=int(row["account_id"]),
        today=today,
        generation=generation,
    )
    return _snapshot_response(entry, request)
