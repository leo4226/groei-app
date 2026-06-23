import asyncio
import json
import logging
from typing import Any, Callable

from database import get_db

_log = logging.getLogger(__name__)

# job_id → (kind, asyncio.Task)
_running: dict[int, tuple[str, asyncio.Task]] = {}


async def start_job(db, account: dict, kind: str, params: dict | None, runner_fn: Callable) -> int:
    """Insert a job row and launch it as a background task. Returns job_id."""
    account_id = account.get("account_id") or account.get("id")
    params_json = json.dumps(params, ensure_ascii=False) if params else None

    rows = await db.execute_fetchall(
        "INSERT INTO admin_jobs (account_id, kind, params, status) VALUES (?, ?, ?, 'pending') RETURNING id",
        (account_id, kind, params_json),
    )
    job_id = int(rows[0]["id"])

    task = asyncio.create_task(_run_job(job_id, kind, runner_fn, params or {}))
    _running[job_id] = (kind, task)
    task.add_done_callback(lambda _: _running.pop(job_id, None))
    return job_id


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
    """True if a task of this kind is currently in-flight."""
    for _job_id, (job_kind, task) in list(_running.items()):
        if job_kind == kind and not task.done():
            return True
    return False


async def mark_stale_jobs_interrupted(db) -> None:
    """On startup: mark any jobs left in running/pending state as interrupted."""
    await db.execute(
        "UPDATE admin_jobs SET status = 'interrupted', updated_at = NOW() "
        "WHERE status IN ('running', 'pending')"
    )
