"""Fire-and-forget background jobs.

Used to move slow enrichment (LLM phenology, care thresholds, embedding
capture, reverse geocoding) OUT of user-facing request handlers: the request
returns immediately and the job runs on the same event loop with its own DB
connection (the request's connection is gone once the response is sent).

Deliberately no-ops under pytest: a scheduled job would outlive the test's
monkeypatches and in-memory DB and hit the real database / LLM instead.
Tests that care about scheduling monkeypatch the caller's schedule function.
"""
import asyncio
import logging
import os
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


def fire_and_forget(job: Callable[[], Awaitable[object]], label: str) -> None:
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return

    async def _run() -> None:
        try:
            await job()
        except Exception:
            logger.warning("Deferred job %r failed", label, exc_info=True)

    try:
        asyncio.get_running_loop().create_task(_run())
    except RuntimeError:
        # No running loop (sync script context) — run nothing rather than block.
        logger.warning("No event loop for deferred job %r — skipped", label)
