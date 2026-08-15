"""Admin background jobs: one at a time, in the order they were asked for.

Jobs used to be launched straight into `asyncio.create_task`, with the only
guard being "not another job of this same kind". Different kinds ran
concurrently and unbounded, so nothing stopped four LLM-driven backfills
running at once on a 256 MB shared-cpu-1x machine, each holding a connection
from a pool of 10. Pressing a second tool did not wait — it piled on.

Now there is a single worker draining a FIFO queue. Pressing several tools
queues them; `status = 'queued'` is a real state the panel can show, with the
position in line. One job runs at a time, which is what a machine this size can
actually do, and it makes a run's duration predictable instead of a function of
what else you happened to press.
"""
import asyncio
import json
import logging
from typing import Callable

from database import get_db

_log = logging.getLogger(__name__)

#: job_id → kind, for everything accepted and not yet finished (queued or running).
_pending: dict[int, str] = {}
#: The job the worker is executing right now, if any.
_current: tuple[int, str] | None = None

_queue: asyncio.Queue | None = None
_worker: asyncio.Task | None = None


def _ensure_worker() -> asyncio.Queue:
    """Create the queue and its single worker on first use.

    Lazily, rather than at import: the event loop does not exist yet at import
    time, and tests import this module without one.
    """
    global _queue, _worker
    if _queue is None:
        _queue = asyncio.Queue()
    if _worker is None or _worker.done():
        _worker = asyncio.create_task(_drain(_queue))
    return _queue


async def _drain(queue: asyncio.Queue) -> None:
    global _current
    while True:
        job_id, kind, runner_fn, params = await queue.get()
        _current = (job_id, kind)
        try:
            await _run_job(job_id, kind, runner_fn, params)
        except Exception:  # noqa: BLE001 — the worker must outlive one bad job
            _log.exception("Job worker caught an error running %s/%d", kind, job_id)
        finally:
            _current = None
            _pending.pop(job_id, None)
            queue.task_done()


async def start_job(db, account: dict, kind: str, params: dict | None, runner_fn: Callable) -> dict:
    """Queue a job. Returns its id and its position in the queue (0 = starting now)."""
    account_id = account.get("account_id") or account.get("id")
    params_json = json.dumps(params, ensure_ascii=False) if params else None

    queue = _ensure_worker()
    # Everything already accepted and unfinished is ahead of this one.
    position = len(_pending)

    rows = await db.execute_fetchall(
        "INSERT INTO admin_jobs (account_id, kind, params, status) VALUES (?, ?, ?, ?) RETURNING id",
        (account_id, kind, params_json, "queued" if position else "pending"),
    )
    job_id = int(rows[0]["id"])

    _pending[job_id] = kind
    queue.put_nowait((job_id, kind, runner_fn, params or {}))
    return {"job_id": job_id, "queue_position": position}


async def _run_job(job_id: int, kind: str, runner_fn: Callable, params: dict) -> None:
    async with get_db() as db:
        await db.execute(
            "UPDATE admin_jobs SET status = 'running', updated_at = NOW() WHERE id = ?",
            (job_id,),
        )

        async def on_progress(done: int, total: int) -> None:
            await db.execute(
                "UPDATE admin_jobs SET progress_done = ?, progress_total = ?, updated_at = NOW() WHERE id = ?",
                (done, total, job_id),
            )

        try:
            result = await runner_fn(db, params, on_progress)
            result_json = json.dumps(result, ensure_ascii=False) if result is not None else None
            await db.execute(
                "UPDATE admin_jobs SET status = 'completed', result = ?, updated_at = NOW() WHERE id = ?",
                (result_json, job_id),
            )
        except Exception as exc:
            _log.exception("Job %s/%d failed: %s", kind, job_id, exc)
            await db.execute(
                "UPDATE admin_jobs SET status = 'failed', error = ?, updated_at = NOW() WHERE id = ?",
                (str(exc)[:2000], job_id),
            )


def is_kind_running(kind: str) -> bool:
    """True if this kind is already queued or running.

    Still per-kind: running the same backfill twice at once is always a mistake,
    and queueing a duplicate would just do the same work twice in a row.
    """
    return kind in _pending.values()


def queue_depth() -> int:
    """Jobs accepted and not yet finished, including the one running."""
    return len(_pending)


def current_job() -> tuple[int, str] | None:
    return _current


async def mark_stale_jobs_interrupted(db) -> None:
    """On startup: mark any jobs left mid-flight as interrupted.

    Includes 'queued' — a queue that lived in this process's memory does not
    survive a restart, so a queued job is as gone as a running one.
    """
    await db.execute(
        "UPDATE admin_jobs SET status = 'interrupted', updated_at = NOW() "
        "WHERE status IN ('running', 'pending', 'queued')"
    )
