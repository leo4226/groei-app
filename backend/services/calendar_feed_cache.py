"""In-process cache for the personal-calendar ICS feed.

Calendar apps poll the feed on their own schedule. Without a cache every poll
woke Neon (compute is billed per wake-up, not per query) and rebuilt the whole
calendar, including the weather-sync write transaction. A hit here is served
without touching the database at all, which is why the cache is keyed by the
link's token hash rather than looked up after a token check.

Revoking, regenerating, editing a subscription or deleting its account clears
that account's entries in this process at once. Another Fly machine keeps its
own copy until the TTL runs out, so a revoked link can keep serving the old
feed there for at most FEED_CACHE_TTL_S.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import time

FEED_CACHE_TTL_S = 3600
FEED_CACHE_MAX_ENTRIES = 256


@dataclass(frozen=True)
class CachedFeed:
    payload: bytes
    account_id: int
    day: date
    expires_at: float


_entries: dict[str, CachedFeed] = {}
# Bumped by every forget, so a feed that was being built while its link was
# revoked cannot be stored afterwards and outlive the revocation.
_generation = 0


def cache_generation() -> int:
    """Take before reading the subscription; pass to store_feed."""
    return _generation


def get_cached_feed(token_hash: str, *, today: date) -> bytes | None:
    """The cached payload, unless it expired or was built on an earlier day
    (overdue work is pinned to "today", so a feed never outlives its date)."""
    entry = _entries.get(token_hash)
    if entry is None:
        return None
    if entry.day != today or entry.expires_at <= time.monotonic():
        _entries.pop(token_hash, None)
        return None
    return entry.payload


def store_feed(
    token_hash: str,
    payload: bytes,
    *,
    account_id: int,
    today: date,
    generation: int,
) -> None:
    if generation != _generation:
        return
    if token_hash not in _entries and len(_entries) >= FEED_CACHE_MAX_ENTRIES:
        oldest = min(_entries, key=lambda key: _entries[key].expires_at)
        _entries.pop(oldest, None)
    _entries[token_hash] = CachedFeed(
        payload=payload,
        account_id=account_id,
        day=today,
        expires_at=time.monotonic() + FEED_CACHE_TTL_S,
    )


def forget_account_feeds(account_id: int) -> None:
    """Drop every cached feed of one account (revoke, regenerate, edit, delete)."""
    global _generation
    _generation += 1
    for token_hash in [key for key, entry in _entries.items() if entry.account_id == account_id]:
        _entries.pop(token_hash, None)


def clear_feed_cache() -> None:
    global _generation
    _generation += 1
    _entries.clear()
