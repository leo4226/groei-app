"""Admin jobs run one at a time, in the order they were asked for.

Jobs used to go straight into `asyncio.create_task` with only a per-kind guard,
so different tools ran concurrently and unbounded — four LLM-driven backfills
at once on a 256 MB machine sharing a pool of 10 connections. Pressing a second
tool did not wait; it piled on, and the extra pressure is what made runs die
mid-flight.
"""
import asyncio

import pytest

from services import job_runner


@pytest.fixture(autouse=True)
def _clean_queue():
    """Each test gets a fresh worker; the module holds process-wide state."""
    job_runner._pending.clear()
    job_runner._current = None
    job_runner._queue = None
    if job_runner._worker is not None:
        job_runner._worker.cancel()
    job_runner._worker = None
    yield
    if job_runner._worker is not None:
        job_runner._worker.cancel()
    job_runner._worker = None
    job_runner._queue = None
    job_runner._pending.clear()


class _FakeDb:
    """Enough of the adapter for start_job, plus a log of what _run_job wrote."""

    def __init__(self):
        self.next_id = 1
        self.statuses: list[tuple[int, str]] = []

    async def execute_fetchall(self, sql, params=()):
        job_id = self.next_id
        self.next_id += 1
        return [{"id": job_id}]

    async def execute(self, sql, params=()):
        return None

    async def commit(self):
        return None


@pytest.mark.asyncio
async def test_second_job_waits_for_the_first(monkeypatch):
    db = _FakeDb()
    monkeypatch.setattr(job_runner, "get_db", lambda: _null_ctx(db))

    order: list[str] = []
    release_first = asyncio.Event()

    async def slow(_db, params, _on_progress):
        order.append(f"start:{params['tag']}")
        if params["tag"] == "a":
            await release_first.wait()
        order.append(f"end:{params['tag']}")
        return {}

    first = await job_runner.start_job(db, {"account_id": 1}, "kind_a", {"tag": "a"}, slow)
    second = await job_runner.start_job(db, {"account_id": 1}, "kind_b", {"tag": "b"}, slow)

    assert first["queue_position"] == 0, "nothing ahead of it"
    assert second["queue_position"] == 1, "it is behind the first"

    await asyncio.sleep(0.05)
    # The second job must not have begun while the first is still going.
    assert order == ["start:a"], f"jobs ran concurrently: {order}"

    release_first.set()
    await asyncio.sleep(0.05)
    assert order == ["start:a", "end:a", "start:b", "end:b"]


@pytest.mark.asyncio
async def test_the_same_kind_twice_is_refused_not_queued(monkeypatch):
    db = _FakeDb()
    monkeypatch.setattr(job_runner, "get_db", lambda: _null_ctx(db))

    hold = asyncio.Event()

    async def blocking(_db, _params, _on_progress):
        await hold.wait()
        return {}

    await job_runner.start_job(db, {"account_id": 1}, "kind_a", {}, blocking)
    # Queueing a duplicate would just do identical work twice in a row.
    assert job_runner.is_kind_running("kind_a") is True
    assert job_runner.is_kind_running("kind_b") is False

    hold.set()
    await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_a_failing_job_does_not_kill_the_worker(monkeypatch):
    db = _FakeDb()
    monkeypatch.setattr(job_runner, "get_db", lambda: _null_ctx(db))

    ran: list[str] = []

    async def boom(_db, _params, _on_progress):
        ran.append("boom")
        raise RuntimeError("job exploded")

    async def fine(_db, _params, _on_progress):
        ran.append("fine")
        return {}

    await job_runner.start_job(db, {"account_id": 1}, "kind_a", {}, boom)
    await job_runner.start_job(db, {"account_id": 1}, "kind_b", {}, fine)
    await asyncio.sleep(0.05)

    assert ran == ["boom", "fine"], "the queue must keep draining after a failure"
    assert job_runner.queue_depth() == 0


@pytest.mark.asyncio
async def test_queue_drains_to_empty(monkeypatch):
    db = _FakeDb()
    monkeypatch.setattr(job_runner, "get_db", lambda: _null_ctx(db))

    async def quick(_db, _params, _on_progress):
        return {}

    for kind in ("a", "b", "c"):
        await job_runner.start_job(db, {"account_id": 1}, kind, {}, quick)
    assert job_runner.queue_depth() == 3

    await asyncio.sleep(0.05)
    assert job_runner.queue_depth() == 0
    assert job_runner.current_job() is None


class _null_ctx:
    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        return self._db

    async def __aexit__(self, *exc):
        return False
