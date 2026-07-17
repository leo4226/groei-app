"""Lightweight in-memory rate limiting for abuse-prone auth endpoints.

A per-process sliding window keyed by client IP. This is intentionally simple
and dependency-free: it's sufficient for the current single-machine Fly
deployment (`shared-cpu-1x`). If we ever scale horizontally the counters would
be per-machine, so this should then move to a shared store (Redis / a DB
counter). See issue #695.

Primary purpose: stop `POST /auth/forgot-password` from being used as an
email-bomb / Resend-cost vector, and slow brute-force on login/register.
"""
from __future__ import annotations

import time

from fastapi import HTTPException, Request, status

# key ("bucket:ip") -> ascending list of request timestamps inside the window
_hits: dict[str, list[float]] = {}
_last_gc = 0.0
_GC_INTERVAL_S = 300.0


def _client_ip(request: Request) -> str:
    """The real client IP behind Fly's proxy.

    Fly sets ``Fly-Client-IP`` to the true peer; ``X-Forwarded-For``'s first
    hop is the fallback. The socket peer (``request.client.host``) is only the
    proxy behind Fly, so it must never be the primary key.
    """
    fly = request.headers.get("fly-client-ip")
    if fly and fly.strip():
        return fly.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _gc(now: float) -> None:
    """Drop keys whose newest hit is older than the GC interval — keeps the
    store from growing unbounded across many unique IPs."""
    global _last_gc
    if now - _last_gc < _GC_INTERVAL_S:
        return
    _last_gc = now
    dead = [k for k, ts in _hits.items() if not ts or now - ts[-1] > _GC_INTERVAL_S]
    for k in dead:
        _hits.pop(k, None)


def rate_limit(bucket: str, limit: int, window_s: int):
    """FastAPI dependency factory: allow at most ``limit`` requests per client
    IP per ``window_s`` seconds for ``bucket``; raise 429 beyond that."""

    async def _dependency(request: Request) -> None:
        now = time.time()
        _gc(now)
        key = f"{bucket}:{_client_ip(request)}"
        window = [t for t in _hits.get(key, ()) if now - t < window_s]
        if len(window) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "rate_limited"},
                headers={"Retry-After": str(window_s)},
            )
        window.append(now)
        _hits[key] = window

    return _dependency


def reset() -> None:
    """Clear all counters. Test-only — call between tests so limits from one
    test don't bleed into the next."""
    global _last_gc
    _hits.clear()
    _last_gc = 0.0
