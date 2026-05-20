# Phase 1: Postgres Migration & Cloud Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the existing Floreren app running on the public internet at `floreren.app`, with one user (Leon), backed by Postgres + R2 + Fly.io + Vercel. No new features. No multi-tenant work yet.

**Architecture:** Replace the SQLite-on-disk + local-filesystem-uploads model with cloud-native equivalents — Postgres via asyncpg (wrapped in a small adapter to minimise router churn), Cloudflare R2 for uploads, Fly.io for the FastAPI container, Vercel for the React build, Cloudflare DNS for the apex domain.

**Tech Stack:** Python 3.11 / FastAPI / asyncpg / Alembic / Docker / Cloudflare R2 (boto3) / Fly.io / Vercel / Cloudflare Registrar

## Context

This is the first of three phases (see `docs/plans/roadmap-floreren-cloud-migration.md`). Phase 1 produces a single-tenant cloud deployment that **only Leon uses** for at least a week. Phase 2 adds tenant isolation, invites, and proper auth UI. Phase 3 onboards the parents.

The user has confirmed: **fresh data in production** — no data-migration script needed. The local SQLite DB can be discarded.

## File Structure

**New files:**
- `groei/docker-compose.yml` — local Postgres
- `groei/backend/.dockerignore` — exclude dev artefacts from image
- `groei/backend/Dockerfile` — production image for Fly.io
- `groei/backend/fly.toml` — Fly.io app config
- `groei/backend/alembic.ini` — Alembic config
- `groei/backend/alembic/env.py` — Alembic env loader
- `groei/backend/alembic/versions/0001_initial_schema.py` — first migration (mirrors current `database/schema.py`)
- `groei/backend/services/storage.py` — R2 upload abstraction
- `groei/backend/services/db_adapter.py` — asyncpg adapter preserving existing `execute_fetchall`/`execute(...).lastrowid` API
- `groei/backend/tests/test_db_adapter.py` — adapter unit tests
- `groei/backend/tests/test_storage.py` — storage abstraction tests
- `groei/frontend/public/icons/` — destination for `groei/icons/` move
- `groei/frontend/.env.production` — `VITE_API_BASE_URL=https://api.floreren.app`

**Modified files:**
- `groei/backend/requirements.txt` — add asyncpg, alembic, boto3; remove aiosqlite
- `groei/backend/database/__init__.py` — switch to asyncpg pool + adapter
- `groei/backend/database/seeds.py` — small tweaks for Postgres syntax
- `groei/backend/main.py` — pool lifecycle in `lifespan`, drop local static mounts that move to R2/CDN
- `groei/backend/routers/icons.py` — read icons from frontend public dir (dev) / serve nothing (prod)
- `groei/backend/routers/plants.py` — photo upload → R2; SQLite-specific SQL → Postgres
- `groei/backend/routers/objects.py` — same shape as plants
- `groei/backend/routers/maps.py` — map SVG upload → R2; SQLite-specific SQL → Postgres
- `groei/backend/routers/dashboard.py` — SQLite-specific SQL → Postgres
- `groei/backend/routers/plant_care.py` — SQLite-specific SQL → Postgres
- `groei/frontend/src/api/client.ts` — read `VITE_API_BASE_URL` instead of relative `/api`
- `groei/.gitignore` — ensure `.env`, `*.db`, `groei/backend/photos/`, `alembic/__pycache__` are excluded

**Removed files:**
- `groei/backend/groei.db` / `floreren.db` (local SQLite) — manually delete after migration verified
- `groei/icons/` (moved into frontend bundle)

---

## Section A — Local Postgres

### Task A1: Add local Postgres via Docker Compose

**Files:**
- Create: `groei/docker-compose.yml`
- Create: `groei/backend/.env.example`
- Modify: `groei/.gitignore`

- [ ] **Step 1: Write the docker-compose.yml**

```yaml
# groei/docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: floreren
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: floreren
    ports:
      - "5432:5432"
    volumes:
      - floreren_pgdata:/var/lib/postgresql/data
volumes:
  floreren_pgdata:
```

- [ ] **Step 2: Add example env file**

```
# groei/backend/.env.example
DATABASE_URL=postgresql://floreren:dev@localhost:5432/floreren
JWT_SECRET=dev-secret-change-me
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=floreren-uploads
R2_PUBLIC_BASE_URL=
RESEND_API_KEY=
PLANTNET_API_KEY=
TREFLE_TOKEN=
ANTHROPIC_API_KEY=
```

Then copy: `cp groei/backend/.env.example groei/backend/.env`

- [ ] **Step 3: Ensure .env and SQLite files are gitignored**

Add to `groei/.gitignore` (or root `.gitignore` — check which exists):
```
.env
*.db
backend/photos/
alembic/__pycache__/
```

- [ ] **Step 4: Start Postgres and verify**

Run: `docker compose -f groei/docker-compose.yml up -d`
Then: `docker exec -it $(docker ps -qf "ancestor=postgres:16") psql -U floreren -d floreren -c "SELECT 1;"`
Expected: `?column?` row with value `1`.

- [ ] **Step 5: Commit**

```bash
git add groei/docker-compose.yml groei/backend/.env.example groei/.gitignore
git commit -m "chore: local postgres via docker compose"
```

---

### Task A2: Swap aiosqlite → asyncpg + Alembic

**Files:**
- Modify: `groei/backend/requirements.txt`

- [ ] **Step 1: Update requirements.txt**

Final contents:
```
fastapi>=0.135
uvicorn[standard]>=0.44
asyncpg>=0.29
alembic>=1.13
sqlalchemy>=2.0
python-multipart>=0.0.24
httpx>=0.27
python-dotenv>=1.0
python-jose[cryptography]>=3.3
passlib[bcrypt]>=1.7
bcrypt<5
boto3>=1.34
pytest>=8.0
pytest-asyncio>=0.23
```

Note: SQLAlchemy is added only because Alembic uses it for autogeneration/typing — runtime queries stay raw SQL via asyncpg.

- [ ] **Step 2: Install**

Run: `cd groei/backend && pip install -r requirements.txt`
Expected: clean install, no errors.

- [ ] **Step 3: Commit**

```bash
git add groei/backend/requirements.txt
git commit -m "chore: swap aiosqlite for asyncpg + alembic"
```

---

### Task A3: Build the asyncpg adapter (TDD)

**Files:**
- Create: `groei/backend/services/db_adapter.py`
- Create: `groei/backend/tests/__init__.py` (if missing)
- Create: `groei/backend/tests/test_db_adapter.py`

The adapter preserves the existing call surface used by routers (`db.execute_fetchall(sql, params)`, `cur = await db.execute(sql, params); cur.lastrowid`, `await db.commit()`) so we don't need to touch 17 routers. It translates `?` placeholders to `$N` and auto-adds `RETURNING id` to bare `INSERT`s.

- [ ] **Step 1: Write the failing tests**

```python
# groei/backend/tests/test_db_adapter.py
import os
import pytest
import asyncpg
from services.db_adapter import DbAdapter, qm_to_pg


def test_qm_to_pg_basic():
    assert qm_to_pg("SELECT * FROM x WHERE a = ? AND b = ?") == \
        "SELECT * FROM x WHERE a = $1 AND b = $2"


def test_qm_to_pg_no_placeholders():
    assert qm_to_pg("SELECT 1") == "SELECT 1"


def test_qm_to_pg_preserves_literal_question_marks_in_strings():
    # Pragmatic: we don't try to be clever. Document the limitation.
    # Tests below assert real query behaviour, not this edge case.
    pass


@pytest.fixture
async def conn():
    dsn = os.environ["DATABASE_URL"]
    c = await asyncpg.connect(dsn)
    await c.execute("CREATE TEMP TABLE t (id SERIAL PRIMARY KEY, name TEXT)")
    yield c
    await c.close()


@pytest.mark.asyncio
async def test_execute_fetchall_returns_dicts(conn):
    await conn.execute("INSERT INTO t (name) VALUES ('a'), ('b')")
    db = DbAdapter(conn)
    rows = await db.execute_fetchall("SELECT id, name FROM t ORDER BY id")
    assert rows == [{"id": 1, "name": "a"}, {"id": 2, "name": "b"}]


@pytest.mark.asyncio
async def test_execute_insert_sets_lastrowid(conn):
    db = DbAdapter(conn)
    cur = await db.execute("INSERT INTO t (name) VALUES (?)", ("hello",))
    assert cur.lastrowid is not None
    rows = await db.execute_fetchall("SELECT name FROM t WHERE id = ?", (cur.lastrowid,))
    assert rows == [{"name": "hello"}]


@pytest.mark.asyncio
async def test_execute_update_no_lastrowid(conn):
    await conn.execute("INSERT INTO t (id, name) VALUES (1, 'a')")
    db = DbAdapter(conn)
    cur = await db.execute("UPDATE t SET name = ? WHERE id = ?", ("b", 1))
    assert cur.lastrowid is None
    rows = await db.execute_fetchall("SELECT name FROM t")
    assert rows == [{"name": "b"}]


@pytest.mark.asyncio
async def test_explicit_returning_passthrough(conn):
    db = DbAdapter(conn)
    cur = await db.execute("INSERT INTO t (name) VALUES (?) RETURNING id", ("x",))
    assert cur.lastrowid is not None
```

Create `groei/backend/tests/conftest.py`:

```python
import asyncio
import os
import pytest

# Ensure tests use a real Postgres connection.
os.environ.setdefault("DATABASE_URL", "postgresql://floreren:dev@localhost:5432/floreren")
```

Also create `groei/backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

- [ ] **Step 2: Run the tests; verify they fail**

Run: `cd groei/backend && pytest tests/test_db_adapter.py -v`
Expected: ImportError — `services.db_adapter` doesn't exist yet.

- [ ] **Step 3: Implement the adapter**

```python
# groei/backend/services/db_adapter.py
"""asyncpg adapter preserving the legacy aiosqlite call surface used by routers."""

import asyncpg


def qm_to_pg(sql: str) -> str:
    """Convert `?` placeholders to `$N` (Postgres style). Pragmatic — does not
    parse out `?` inside string literals. Don't put literal `?` in SQL strings."""
    out = []
    i = 0
    for ch in sql:
        if ch == "?":
            i += 1
            out.append(f"${i}")
        else:
            out.append(ch)
    return "".join(out)


class DbAdapter:
    """Wraps an asyncpg.Connection (or pool-acquired connection)."""

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self.lastrowid: int | None = None

    async def execute_fetchall(
        self, sql: str, params: tuple | list = ()
    ) -> list[dict]:
        rows = await self._conn.fetch(qm_to_pg(sql), *params)
        return [dict(r) for r in rows]

    async def execute(self, sql: str, params: tuple | list = ()) -> "DbAdapter":
        pg_sql = qm_to_pg(sql)
        head = pg_sql.lstrip().upper()
        if head.startswith("INSERT") and "RETURNING" not in head:
            pg_sql_returning = pg_sql.rstrip(" ;") + " RETURNING id"
            row = await self._conn.fetchrow(pg_sql_returning, *params)
            self.lastrowid = row["id"] if row else None
        elif head.startswith("INSERT") and "RETURNING ID" in head:
            row = await self._conn.fetchrow(pg_sql, *params)
            self.lastrowid = row["id"] if row else None
        else:
            await self._conn.execute(pg_sql, *params)
            self.lastrowid = None
        return self

    async def commit(self) -> None:
        # asyncpg auto-commits outside an explicit transaction. No-op here.
        return
```

- [ ] **Step 4: Run the tests; verify they pass**

Run: `cd groei/backend && pytest tests/test_db_adapter.py -v`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/db_adapter.py groei/backend/tests/__init__.py \
        groei/backend/tests/test_db_adapter.py groei/backend/tests/conftest.py \
        groei/backend/pytest.ini
git commit -m "feat(db): asyncpg adapter preserving legacy call surface"
```

---

### Task A4: Switch `db_dep` and lifespan to asyncpg pool

**Files:**
- Modify: `groei/backend/database/__init__.py`
- Modify: `groei/backend/main.py`

- [ ] **Step 1: Rewrite `database/__init__.py`**

```python
# groei/backend/database/__init__.py
"""Database module — asyncpg connection pool, FastAPI dependency, schema bootstrap."""
import os
from contextlib import asynccontextmanager

import asyncpg

from services.db_adapter import DbAdapter

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global _pool
    if _pool is not None:
        return
    dsn = os.environ["DATABASE_URL"]
    _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_db():
    """For scripts (seed, migrate). Routers should use db_dep instead."""
    assert _pool is not None, "Pool not initialised — call init_pool() first"
    async with _pool.acquire() as conn:
        yield DbAdapter(conn)


async def db_dep():
    """FastAPI dependency. Yields a DbAdapter."""
    assert _pool is not None, "Pool not initialised — check lifespan"
    async with _pool.acquire() as conn:
        yield DbAdapter(conn)
```

Note: the old `init_db()` (which ran schema.py / migrations.py / seeds.py) is gone. Alembic replaces schema/migrations (Task A5); seeds.py runs as a separate script (Task A7).

- [ ] **Step 2: Update main.py lifespan**

Replace lines 21–25 of `groei/backend/main.py`:

```python
from database import init_pool, close_pool

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()
```

- [ ] **Step 3: Boot the app and verify it starts**

Run (in another terminal, with Docker Postgres still up): `cd groei/backend && uvicorn main:app --port 8000`
Then: `curl http://localhost:8000/docs`
Expected: 200 OK (FastAPI Swagger UI HTML). Routes will 500 on real queries until A5/A6 — that's fine.
Stop the server.

- [ ] **Step 4: Commit**

```bash
git add groei/backend/database/__init__.py groei/backend/main.py
git commit -m "feat(db): asyncpg pool lifecycle in fastapi lifespan"
```

---

### Task A5: Alembic — initialise and write first migration

**Files:**
- Create: `groei/backend/alembic.ini`
- Create: `groei/backend/alembic/env.py`
- Create: `groei/backend/alembic/script.py.mako` (Alembic standard template)
- Create: `groei/backend/alembic/versions/0001_initial_schema.py`

- [ ] **Step 1: Initialise Alembic**

Run: `cd groei/backend && alembic init alembic`
This creates `alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`, and an empty `versions/` dir.

- [ ] **Step 2: Point Alembic at our DATABASE_URL**

Edit `groei/backend/alembic.ini`:
- Replace the `sqlalchemy.url = ...` line with: `sqlalchemy.url =`  (intentionally empty — env.py reads it from env)

Edit `groei/backend/alembic/env.py` — replace the entire `run_migrations_online` function and add a config-url override at the top of the module:

```python
import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

config = context.config

# Override sqlalchemy.url from environment.
db_url = os.environ.get("DATABASE_URL")
if not db_url:
    raise RuntimeError("DATABASE_URL not set — cannot run migrations")
# Alembic uses sync SQLAlchemy; psycopg2 driver, not asyncpg.
sync_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
config.set_main_option("sqlalchemy.url", sync_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None  # raw SQL migrations only


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

Add the psycopg2 dependency for Alembic only (asyncpg is for runtime):

Edit `groei/backend/requirements.txt` — append:
```
psycopg2-binary>=2.9
```
Run: `pip install psycopg2-binary`

- [ ] **Step 3: Translate the existing schema into the first migration**

Read `groei/backend/database/schema.py` to see every `CREATE TABLE` statement and translate them to Postgres syntax. The main translations:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY` (or `GENERATED ALWAYS AS IDENTITY`)
- `INTEGER` → `INTEGER`
- `TEXT` → `TEXT`
- `REAL` → `DOUBLE PRECISION`
- `BLOB` → `BYTEA`
- `DEFAULT CURRENT_TIMESTAMP` — same syntax in both
- Type affinity (SQLite is permissive; Postgres is strict) — verify each column

Create `groei/backend/alembic/versions/0001_initial_schema.py`:

```python
"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-16
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Translate every CREATE TABLE from groei/backend/database/schema.py here.
    # For each table, write `op.execute("""CREATE TABLE ...""")` with Postgres-valid SQL.
    # Example shape:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS households (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id SERIAL PRIMARY KEY,
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # ... continue for every table in schema.py.
    # Implementer note: open groei/backend/database/schema.py and translate each
    # CREATE TABLE one-by-one. Do NOT use SQLite's INTEGER PRIMARY KEY AUTOINCREMENT —
    # use SERIAL PRIMARY KEY. Do NOT use REAL — use DOUBLE PRECISION. Do NOT use
    # BLOB — use BYTEA. Keep table & column names identical.


def downgrade() -> None:
    # We don't support downgrade in Phase 1 — fresh-data approach.
    raise NotImplementedError("Drop the database and re-run upgrade instead.")
```

**Implementer note:** This task is the largest in the plan because the schema has many tables. The current schema is defined by **two files together** — `schema.py` (base CREATE TABLE statements) and `migrations.py` (ALTER TABLE additions). You must translate both to produce a migration that matches the live DB.

Open `groei/backend/database/schema.py` and copy each `CREATE TABLE` block. Then open `groei/backend/database/migrations.py` and merge every `ALTER TABLE ADD COLUMN` into the relevant CREATE TABLE in your migration — do not run them as separate ALTER TABLE statements. The columns that only exist in migrations.py and must be folded in are:

| Column(s) | Table |
|---|---|
| `care_thresholds`, `phase`, `sown_date`, `care_profile` | `plants` |
| `care_thresholds`, `water_interval_days` | `plant_species` |
| `household_id` | all user-scoped tables (plants, maps, locations, etc.) |
| `language` | `users` |
| `water_amount` | `garden_water_log` |
| `is_ephemeral` | `care_schedules` |

Apply the Postgres type translations listed above. Keep all `CREATE INDEX` statements. **Do not invent columns** — translate exactly what schema.py + migrations.py together define.

- [ ] **Step 4: Run the migration**

Run: `cd groei/backend && alembic upgrade head`
Expected: `INFO  [alembic.runtime.migration] Running upgrade  -> 0001, initial schema`

Verify the tables exist:
```bash
docker exec -i $(docker ps -qf "ancestor=postgres:16") psql -U floreren -d floreren -c "\dt"
```
Expected: lists every table from `schema.py` plus `alembic_version`.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/alembic.ini groei/backend/alembic/ groei/backend/requirements.txt
git commit -m "feat(db): initial alembic migration mirroring schema.py"
```

---

### Task A6: Replace SQLite-specific SQL across the codebase

The shim handles `?` placeholders, but it can't translate function calls. From the grep, 11 files reference SQLite-only functions (`date('now')`, `datetime('now')`, `INSERT OR REPLACE`, `INSERT OR IGNORE`, `julianday`, `strftime`). Each needs a Postgres equivalent.

**Translation table:**
| SQLite | Postgres |
|---|---|
| `date('now')` | `CURRENT_DATE` |
| `datetime('now')` | `CURRENT_TIMESTAMP` |
| `INSERT OR REPLACE INTO t (...) VALUES (...)` | `INSERT INTO t (...) VALUES (...) ON CONFLICT (<unique_col>) DO UPDATE SET ...` |
| `INSERT OR IGNORE INTO t (...) VALUES (...)` | `INSERT INTO t (...) VALUES (...) ON CONFLICT DO NOTHING` |
| `julianday(x)` | `EXTRACT(epoch FROM x::timestamp) / 86400.0` |
| `strftime('%Y-%m-%d', x)` | `to_char(x, 'YYYY-MM-DD')` |

**Files (from initial grep — verify with another grep before starting):**
- `groei/backend/database/schema.py` (now obsolete after A5 — can be deleted) (1)
- `groei/backend/database/seeds.py` (8)
- `groei/backend/migrate_consolidate_locations.py` (2)
- `groei/backend/migrate_landscape_coords.py` (1)
- `groei/backend/seed_common_plants.py` (2)
- `groei/backend/seed_missing_from_manifest.py` (3)
- `groei/backend/seed_weed_catalog.py` (2)
- `groei/backend/scripts/backfill_species_defaults.py` (1 — `INSERT OR REPLACE`)
- `groei/backend/routers/dashboard.py` (1)
- `groei/backend/routers/plants.py` (1)
- `groei/backend/routers/objects.py` (1 — `julianday`)
- `groei/backend/routers/plant_care.py` (2 — `INSERT OR REPLACE` + `date('now')`)

- [ ] **Step 1: Re-grep to confirm the full set**

Run: `cd groei/backend && grep -rn "date('now')\|datetime('now')\|INSERT OR REPLACE\|INSERT OR IGNORE\|julianday\|strftime" --include="*.py"`
Expected: ~24 hits across ~11 files. Each becomes a fix below.

- [ ] **Step 2: Delete obsolete schema/migrations infrastructure**

`database/schema.py`, `database/migrations.py`, and the standalone `migrate_*.py` scripts are now superseded by Alembic. Delete them:

```bash
git rm groei/backend/database/schema.py
git rm groei/backend/database/migrations.py
git rm groei/backend/migrate_consolidate_locations.py
git rm groei/backend/migrate_landscape_coords.py
git rm groei/backend/migrate_place_tuin_plants.py
```

(Verify `database/__init__.py` no longer references them — Task A4 already removed the import.)

- [ ] **Step 3: Convert each remaining file's SQLite-specific SQL**

Walk through each file in the grep output and apply the translation table. For example, in `groei/backend/routers/plants.py:39`:

Before:
```python
"INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due) VALUES (?, 'water', ?, date('now'))"
```
After:
```python
"INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due) VALUES (?, 'water', ?, CURRENT_DATE)"
```

For `INSERT OR REPLACE`, you need to know the unique constraint. Read each call site, identify the natural key, and write the `ON CONFLICT` clause explicitly.

- [ ] **Step 4: Write a smoke test that exercises one fixed query per file**

Create `groei/backend/tests/test_sql_smoke.py`:

```python
import pytest
from database import init_pool, close_pool, get_db
from services.scheduling import calculate_next_due  # example import — adjust per actual fix


@pytest.fixture(scope="module", autouse=True)
async def pool():
    await init_pool()
    yield
    await close_pool()


@pytest.mark.asyncio
async def test_current_date_query_runs():
    async with get_db() as db:
        rows = await db.execute_fetchall("SELECT CURRENT_DATE AS d")
        assert rows and "d" in rows[0]


@pytest.mark.asyncio
async def test_on_conflict_do_nothing_runs():
    async with get_db() as db:
        await db.execute("CREATE TEMP TABLE conflict_test (id INT UNIQUE, v TEXT)")
        await db.execute("INSERT INTO conflict_test (id, v) VALUES (?, ?) ON CONFLICT DO NOTHING", (1, "a"))
        await db.execute("INSERT INTO conflict_test (id, v) VALUES (?, ?) ON CONFLICT DO NOTHING", (1, "b"))
        rows = await db.execute_fetchall("SELECT v FROM conflict_test")
        assert rows == [{"v": "a"}]
```

- [ ] **Step 5: Run the tests**

Run: `cd groei/backend && pytest tests/ -v`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(db): translate sqlite-specific sql to postgres equivalents"
```

---

### Task A7: Re-seed reference data into Postgres

The existing `seeds.py` + `seed_common_plants.py` + `seed_weed_catalog.py` + `seed_missing_from_manifest.py` populate species, common plants, and the weed catalog. These should run once after `alembic upgrade head` to populate Postgres with the same reference data.

**Files:**
- Modify: `groei/backend/database/seeds.py` (now standalone, not called by init_db)
- Modify: `groei/backend/seed_common_plants.py`
- Modify: `groei/backend/seed_weed_catalog.py`
- Modify: `groei/backend/seed_missing_from_manifest.py`

- [ ] **Step 1: Convert seed scripts to use the new pool**

Each seed script currently opens its own `aiosqlite.connect(...)`. Change them to use the asyncpg pool via `database.init_pool()` + `get_db()`. Example pattern at the bottom of each `seed_*.py`:

```python
import asyncio
from database import init_pool, close_pool, get_db

async def main():
    await init_pool()
    try:
        async with get_db() as db:
            await seed(db)   # whatever the existing function is named
    finally:
        await close_pool()

if __name__ == "__main__":
    asyncio.run(main())
```

For each seed script, the inner logic (SQL strings) was already updated in Task A6 for SQLite-only functions. Now just adapt the connection bootstrap.

- [ ] **Step 2: Run all the seeds**

Run in order:
```bash
cd groei/backend
python -m database.seeds                # if it has a __main__, else import & run
python seed_common_plants.py
python seed_weed_catalog.py
python seed_missing_from_manifest.py
```
Expected: no errors. Counts of inserted rows logged to stdout.

- [ ] **Step 3: Verify with a sanity SELECT**

```bash
docker exec -i $(docker ps -qf "ancestor=postgres:16") psql -U floreren -d floreren -c "SELECT COUNT(*) FROM species; SELECT COUNT(*) FROM weed_catalog;"
```
Expected: non-zero counts matching the seed contents.

- [ ] **Step 4: Commit**

```bash
git add groei/backend/database/seeds.py groei/backend/seed_common_plants.py \
        groei/backend/seed_weed_catalog.py groei/backend/seed_missing_from_manifest.py
git commit -m "feat(db): seed scripts run against asyncpg pool"
```

---

### Task A8: Smoke-test the app against Postgres locally

- [ ] **Step 1: Start the backend against local Postgres**

Run (in `groei/`): `npm run dev:backend`
Expected: uvicorn boots without errors. Logs show pool initialisation.

- [ ] **Step 2: Start the frontend**

Run (in another terminal, in `groei/`): `npm run dev:frontend`
Then open `http://localhost:5173`.

- [ ] **Step 3: Register a new account and exercise every page**

In the UI:
1. Register a new account → expect token saved, redirect to home.
2. Visit `/dashboard` → expect empty state (no plants yet).
3. Visit `/maps` → expect empty list. Create a new garden map with dimensions + GPS.
4. Open the editor, draw a zone, add a plant, save.
5. Visit `/plants` → expect the plant in the list.
6. Log a watering action from the dashboard.
7. Visit `/calendar` → expect the upcoming water due date.

If any page 500s, capture the SQL error, find the offending file, fix the SQL (this catches any SQLite-only syntax missed in Task A6), commit, and retry.

- [ ] **Step 4: Commit any spot-fixes**

```bash
git add -A
git commit -m "fix(db): postgres compat fixes found during local smoke test"
```

---

## Section B — Cloud storage for uploads

### Task B1: Create the storage abstraction (TDD)

**Files:**
- Create: `groei/backend/services/storage.py`
- Create: `groei/backend/tests/test_storage.py`

- [ ] **Step 1: Write the failing tests**

```python
# groei/backend/tests/test_storage.py
import io
import os
import pytest
from services.storage import Storage, build_storage_from_env


def test_build_from_env_returns_storage(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "x")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "y")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "z")
    monkeypatch.setenv("R2_BUCKET", "b")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://cdn.example.com")
    s = build_storage_from_env()
    assert isinstance(s, Storage)
    assert s.public_base_url == "https://cdn.example.com"


def test_public_url_combines_base_and_key():
    s = Storage(client=None, bucket="b", public_base_url="https://cdn.example.com")
    assert s.public_url("photos/1.png") == "https://cdn.example.com/photos/1.png"


def test_public_url_strips_trailing_slash_from_base():
    s = Storage(client=None, bucket="b", public_base_url="https://cdn.example.com/")
    assert s.public_url("photos/1.png") == "https://cdn.example.com/photos/1.png"
```

- [ ] **Step 2: Run; verify failure**

Run: `cd groei/backend && pytest tests/test_storage.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement**

```python
# groei/backend/services/storage.py
"""Object storage abstraction (Cloudflare R2 via S3-compatible boto3)."""

import os
import boto3
from botocore.client import Config


class Storage:
    def __init__(self, client, bucket: str, public_base_url: str) -> None:
        self._client = client
        self.bucket = bucket
        self.public_base_url = public_base_url.rstrip("/")

    def public_url(self, key: str) -> str:
        return f"{self.public_base_url}/{key.lstrip('/')}"

    def put(self, key: str, data: bytes, content_type: str) -> str:
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return self.public_url(key)


def build_storage_from_env() -> Storage:
    account_id = os.environ["R2_ACCOUNT_ID"]
    access_key = os.environ["R2_ACCESS_KEY_ID"]
    secret_key = os.environ["R2_SECRET_ACCESS_KEY"]
    bucket = os.environ["R2_BUCKET"]
    public_base = os.environ["R2_PUBLIC_BASE_URL"]

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    return Storage(client=client, bucket=bucket, public_base_url=public_base)
```

- [ ] **Step 4: Run; verify pass**

Run: `cd groei/backend && pytest tests/test_storage.py -v`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/storage.py groei/backend/tests/test_storage.py
git commit -m "feat(storage): R2 abstraction (boto3 S3-compatible client)"
```

---

### Task B2: Provision Cloudflare R2 bucket and get credentials

(Manual setup. Not code.)

- [ ] **Step 1: Create Cloudflare account if needed**

Sign up at https://dash.cloudflare.com — free.

- [ ] **Step 2: Create R2 bucket**

Dashboard → R2 → Create bucket → name: `floreren-uploads`. Default settings.

- [ ] **Step 3: Enable public access**

In the bucket → Settings → Public access → "R2.dev subdomain" → Enable. Copy the public URL (something like `https://pub-xxxxx.r2.dev`).

Later (Phase 1, Task D2 or after) you'll put this behind `uploads.floreren.app` via a custom domain; for now the r2.dev URL works fine.

- [ ] **Step 4: Generate API token**

Dashboard → R2 → Manage R2 API Tokens → Create API Token. Permissions: Object Read & Write. Bucket: `floreren-uploads`. Save the Access Key ID and Secret Access Key (shown once).

- [ ] **Step 5: Get the account ID**

Dashboard → R2 overview page shows "Account ID" — copy it.

- [ ] **Step 6: Fill `.env`**

In `groei/backend/.env`:
```
R2_ACCOUNT_ID=<your account id>
R2_ACCESS_KEY_ID=<from token>
R2_SECRET_ACCESS_KEY=<from token>
R2_BUCKET=floreren-uploads
R2_PUBLIC_BASE_URL=<the pub-xxxxx.r2.dev URL>
```

- [ ] **Step 7: Verify with a one-off upload**

Run: `cd groei/backend && python -c "from services.storage import build_storage_from_env; s = build_storage_from_env(); url = s.put('test.txt', b'hello', 'text/plain'); print(url)"`
Expected: a URL is printed. Open it in a browser; expect `hello`.

Clean up: in the R2 dashboard, delete `test.txt`.

(No commit — this was env setup, not code.)

---

### Task B3: Refactor plant photo upload to R2

**Files:**
- Modify: `groei/backend/routers/plants.py` — the `POST /plants/{id}/photo` route (search for `UploadFile` or `photos`)
- Modify: `groei/backend/routers/plant_id.py` — `_save_identify_photo()` function saves identify photos to local disk; Fly.io containers are ephemeral so these are lost on every restart
- Modify: `groei/backend/main.py` — remove the `/api/photos` static mount

- [ ] **Step 1: Find the current upload route**

Run: `cd groei/backend && grep -n "UploadFile\|PHOTOS_DIR\|photo" routers/plants.py | head -40`
Locate the function that handles photo uploads — it currently saves to `backend/photos/`. Note the exact path saved to the DB (likely something like `/api/photos/{plant_id}_{ts}.png`).

- [ ] **Step 2: Replace the file-write with R2 put**

Replace the file-write block. Example shape (adapt to the actual function in the file):

```python
from services.storage import build_storage_from_env

# Inside the upload handler, instead of writing to disk:
file_bytes = await file.read()
key = f"photos/{plant_id}_{int(time.time())}.{ext}"
storage = build_storage_from_env()
public_url = storage.put(key, file_bytes, content_type=file.content_type or "image/png")

# Store the public URL in the DB instead of a relative path:
await db.execute("UPDATE plants SET photo_path = ? WHERE id = ?", (public_url, plant_id))
await db.commit()
```

Then `photo_path` rows already contain full URLs — no `/api/photos/` prefix needed on the frontend. Verify by reading any frontend code that prefixes paths and remove the prefix if needed.

- [ ] **Step 3: Drop the `/api/photos` static mount**

In `groei/backend/main.py`, remove lines 37–39:

```python
photos_dir = os.path.join(os.path.dirname(__file__), "photos")
app.mount("/api/photos", StaticFiles(directory=photos_dir), name="photos")
```

- [ ] **Step 4: Frontend check — does anything still build `/api/photos/...`?**

Run: `cd groei/frontend && grep -rn "api/photos" src/`
Each hit: replace with a direct read of `plant.photo_path` (since that's now the full URL).

- [ ] **Step 5: Smoke-test photo upload**

Restart backend + frontend. In the UI, upload a photo for a plant. Verify:
1. UI shows the photo (loaded from `pub-xxxxx.r2.dev/photos/...`)
2. DB row has the full R2 URL: `psql ... -c "SELECT photo_path FROM plants WHERE photo_path IS NOT NULL LIMIT 5;"`
3. R2 dashboard shows the new object.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(storage): plant photo uploads go to R2"
```

---

### Task B4: Refactor map SVG upload to R2

Same shape as B3. Map SVGs are uploaded via `routers/maps.py` and currently saved to `groei/backend/static/maps/` and/or `groei/frontend/public/maps/`.

- [ ] **Step 1: Find the upload route in `routers/maps.py`**

Run: `cd groei/backend && grep -n "UploadFile\|MAPS_DIR\|svg_file" routers/maps.py`

- [ ] **Step 2: Replace file-write with `storage.put(...)`**

Pattern identical to B3. Key shape: `maps/{map_id}_{slug}.svg`. Content-type: `image/svg+xml`. Store the full R2 URL in `maps.svg_file`.

- [ ] **Step 3: Remove the `/api/maps-static` mount from main.py**

Lines 41–43 in `main.py`:
```python
maps_dir = os.path.join(os.path.dirname(__file__), "static", "maps")
app.mount("/api/maps-static", StaticFiles(directory=maps_dir), name="maps-static")
```
Delete.

- [ ] **Step 4: Frontend cleanup**

Run: `cd groei/frontend && grep -rn "api/maps-static\|/maps-static\|public/maps" src/`
Each hit: ensure it reads `map.svg_file` directly (now a full URL).

- [ ] **Step 5: Smoke-test**

Upload a new map SVG. Verify it renders. Verify the DB stores the R2 URL.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(storage): map svg uploads go to R2"
```

---

### Task B5: Move icons into the frontend bundle

Icons are shipped app assets (~100+ SVGs in `groei/icons/`). They belong in the frontend, served by Vercel's CDN — not by the backend.

**Files:**
- Move: `groei/icons/` → `groei/frontend/public/icons/`
- Modify: `groei/backend/main.py` — remove icons mount
- Modify: `groei/backend/routers/icons.py` — read from new location for dev, or remove if frontend-only
- Modify: `groei/frontend/src/...` — wherever icon URLs are built

- [ ] **Step 1: Move the directory**

```bash
mv groei/icons groei/frontend/public/icons
```

- [ ] **Step 2: Remove the backend icons mount**

In `main.py`, remove:
```python
icons_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
app.mount("/api/icons", StaticFiles(directory=icons_dir), name="icons")
```

- [ ] **Step 3: Decide on the icons router**

Read `groei/backend/routers/icons.py`. If it only resolves URLs (returns paths), update it to return frontend-relative paths like `/icons/rose.svg`. If it actually serves bytes, the frontend should read directly from `/icons/{name}.svg` and you can shrink/delete the router.

Run: `cd groei/backend && grep -n "FileResponse\|StreamingResponse" routers/icons.py`
- If results: the router serves bytes — replace it with a small endpoint that returns the variant name, frontend builds the URL.
- If no results: it just resolves names — update the returned path strings from `/api/icons/{x}` to `/icons/{x}`.

- [ ] **Step 4: Frontend update**

Run: `cd groei/frontend && grep -rn "/api/icons\|api/icons" src/`
Replace each with `/icons/...` (Vite/Vercel serves `public/` at the root).

- [ ] **Step 5: Smoke-test**

Restart frontend. Verify icons render on `/plants`, `/map/:slug`, dashboard.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(icons): move into frontend public bundle"
```

---

## Section C — Containerise, deploy, wire DNS

### Task C1: Dockerfile for the backend

**Files:**
- Create: `groei/backend/Dockerfile`
- Create: `groei/backend/.dockerignore`

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# groei/backend/Dockerfile
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for psycopg2 build
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

# Run migrations before starting the server.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
```

- [ ] **Step 2: Write the .dockerignore**

```
__pycache__
*.pyc
*.pyo
.env
.env.*
photos/
static/maps/
*.db
tests/
.pytest_cache/
alembic/__pycache__/
```

- [ ] **Step 3: Build the image locally**

Run: `cd groei/backend && docker build -t floreren-api:dev .`
Expected: build completes with "Successfully tagged floreren-api:dev".

- [ ] **Step 4: Run the container against local Postgres**

Run:
```bash
docker run --rm -p 8001:8000 \
  -e DATABASE_URL="postgresql://floreren:dev@host.docker.internal:5432/floreren" \
  -e JWT_SECRET="dev-secret" \
  -e R2_ACCOUNT_ID="$R2_ACCOUNT_ID" \
  -e R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e R2_BUCKET="floreren-uploads" \
  -e R2_PUBLIC_BASE_URL="$R2_PUBLIC_BASE_URL" \
  floreren-api:dev
```

In another terminal: `curl http://localhost:8001/docs`
Expected: 200 OK with Swagger UI HTML.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/Dockerfile groei/backend/.dockerignore
git commit -m "feat(deploy): backend dockerfile + migrations on boot"
```

---

### Task C2: Provision Neon Postgres

(Manual setup.)

- [ ] **Step 1: Sign up at https://neon.tech (free tier).**

- [ ] **Step 2: Create a project named `floreren`. Region: `EU Central (Frankfurt)` (closest to Amsterdam users).**

- [ ] **Step 3: Copy the connection string.**

Format: `postgresql://<user>:<password>@<endpoint>.neon.tech/<dbname>?sslmode=require`

Save it — you'll paste it into Fly.io secrets in Task C4.

- [ ] **Step 4: Run migrations against Neon to verify**

Run:
```bash
cd groei/backend
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" alembic upgrade head
```
Expected: same success output as Task A5 step 4. Now the production DB has the schema.

- [ ] **Step 5: Run seeds against Neon**

```bash
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" python seed_common_plants.py
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" python seed_weed_catalog.py
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" python seed_missing_from_manifest.py
```

(No commit — manual setup.)

---

### Task C3: Buy the domain on Cloudflare

(Manual setup.)

- [ ] **Step 1: Cloudflare dashboard → Domain Registration → Register Domains.**

- [ ] **Step 2: Search `floreren.app` (or alternative; `.app` = ~€14/yr, requires HTTPS).**

- [ ] **Step 3: Complete purchase.**

- [ ] **Step 4: Wait for DNS to provision (a few minutes).**

DNS records will be wired in Task C7.

(No commit.)

---

### Task C4: Deploy backend to Fly.io

**Files:**
- Create: `groei/backend/fly.toml`

- [ ] **Step 1: Install flyctl**

Mac/Linux: `curl -L https://fly.io/install.sh | sh`
Windows: `iwr https://fly.io/install.ps1 -useb | iex`

- [ ] **Step 2: Sign in**

Run: `fly auth signup` (or `fly auth login` if you already have an account).

- [ ] **Step 3: Launch the app**

Run: `cd groei/backend && fly launch --no-deploy`
- App name: `floreren-api`
- Region: `ams` (Amsterdam)
- Postgres: **No** (we use Neon)
- Upstash Redis: **No**
- Deploy now: **No**

This creates `fly.toml` in the current dir.

- [ ] **Step 4: Edit `fly.toml`**

Replace the generated file with:

```toml
# groei/backend/fly.toml
app = "floreren-api"
primary_region = "ams"

[build]

[env]
  PORT = "8000"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

- [ ] **Step 5: Set secrets**

Run:
```bash
fly secrets set \
  DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" \
  JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" \
  R2_ACCOUNT_ID="..." \
  R2_ACCESS_KEY_ID="..." \
  R2_SECRET_ACCESS_KEY="..." \
  R2_BUCKET="floreren-uploads" \
  R2_PUBLIC_BASE_URL="https://pub-xxxxx.r2.dev"
```

- [ ] **Step 6: Deploy**

Run: `fly deploy`
Expected: build + push + deploy. Logs end with "Machine [id] is now started." and a Fly URL like `https://floreren-api.fly.dev`.

- [ ] **Step 7: Verify**

Run: `curl https://floreren-api.fly.dev/docs`
Expected: 200 OK Swagger UI.

- [ ] **Step 8: Update CORS for the production frontend origin**

The current `main.py` line 31 hardcodes `localhost:5173`. Update to:

```python
import os

_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Then: `fly secrets set CORS_ORIGINS="http://localhost:5173,https://floreren.app"` (we'll add the prod origin once Vercel is wired; for now include both).

Redeploy: `fly deploy`

- [ ] **Step 9: Commit**

```bash
git add groei/backend/fly.toml groei/backend/main.py
git commit -m "feat(deploy): fly.io config, env-driven CORS origins"
```

---

### Task C5: Deploy frontend to Vercel

**Files:**
- Create: `groei/frontend/.env.production`
- Modify: `groei/frontend/src/api/client.ts` (and any other place that hardcodes `/api`)

- [ ] **Step 1: Read current API base config**

Run: `cd groei/frontend && cat src/api/client.ts | head -20`

The frontend almost certainly assumes `/api/...` relative paths (which worked because the dev proxy + backend-served-static-frontend kept everything same-origin). Now the frontend lives at `floreren.app` and the API at `api.floreren.app` — different origins.

- [ ] **Step 2: Switch to env-driven base URL**

In `groei/frontend/src/api/client.ts`, change the `BASE` constant:

```ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
```

Do the same in `groei/frontend/src/api/auth.ts` (it has its own hardcoded `const BASE = '/api'`).

Run: `cd groei/frontend && grep -rn "'/api'" src/ | head -20`
Each hit: convert to the same env-driven pattern.

- [ ] **Step 3: Add production env file**

```
# groei/frontend/.env.production
VITE_API_BASE_URL=https://api.floreren.app/api
```

(Keep `/api` suffix because all your existing routes mount under `/api/...`.)

- [ ] **Step 4: Add local dev env file**

```
# groei/frontend/.env.development
VITE_API_BASE_URL=http://localhost:8000/api
```

- [ ] **Step 5: Verify local dev still works**

Run `npm run dev` in `groei/`. Visit `localhost:5173`. Confirm pages load.

- [ ] **Step 6: Push to GitHub (if not already)**

Make sure the repo is on GitHub. If not:
```bash
gh repo create floreren --private --source=. --remote=origin --push
```

- [ ] **Step 7: Import into Vercel**

Vercel dashboard → Add New → Project → Import the GitHub repo.
- Framework Preset: Vite
- Root Directory: `groei/frontend`
- Build Command: `npm run build` (default)
- Output Directory: `dist` (default)
- Environment Variables: `VITE_API_BASE_URL=https://api.floreren.app/api`

Click Deploy. Wait ~2 minutes. Visit the `.vercel.app` URL.

- [ ] **Step 8: Commit**

```bash
git add groei/frontend/.env.production groei/frontend/.env.development \
        groei/frontend/src/api/client.ts groei/frontend/src/api/auth.ts
git commit -m "feat(deploy): vercel env-driven api base url"
git push
```

(The push triggers a fresh Vercel deploy.)

---

### Task C6: Configure custom domain on Vercel + Fly

- [ ] **Step 1: Add domain in Vercel**

Vercel project → Settings → Domains → Add `floreren.app`. Vercel will show the DNS records to set.

- [ ] **Step 2: Add custom hostname in Fly.io**

Run: `fly certs create api.floreren.app -a floreren-api`
This shows the DNS records you need (typically an A and an AAAA).

- [ ] **Step 3: Wire DNS in Cloudflare**

Cloudflare dashboard → `floreren.app` → DNS:
- `floreren.app` (apex): CNAME (or A) to Vercel's target. Vercel's UI shows the exact value. Proxy: **off** for the apex (Vercel needs direct connection for SSL).
- `www.floreren.app`: CNAME to `cname.vercel-dns.com`. Proxy: off.
- `api.floreren.app`: A record to the IPv4 Fly gave you; AAAA to the IPv6. Proxy: off (Fly handles SSL).

- [ ] **Step 4: Wait for SSL certs to issue (~5 min each)**

Verify:
- `curl -I https://floreren.app` → 200 OK
- `curl -I https://api.floreren.app/docs` → 200 OK

- [ ] **Step 5: Update CORS to include the production origin**

Run: `fly secrets set CORS_ORIGINS="http://localhost:5173,https://floreren.app" -a floreren-api`
(Removes the redeploy prompt by setting secrets directly. If Fly prompts, accept.)

- [ ] **Step 6: Verify end-to-end**

Open `https://floreren.app` in a private browser window. Register a new account. Create a map. Add a plant. Upload a photo. Log a watering action. Visit on your phone.

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit --allow-empty -m "chore: phase 1 complete"
git push
```

---

## Section D — Live with it for a week

Phase 1 is now **done from the code perspective**. The "soak" step:

- [ ] **Live test for at least 7 days.** Use Floreren on `floreren.app` from your phone for all your real plant care. Watch the Fly.io logs (`fly logs -a floreren-api`) for any errors. File each gotcha as a fixable bug — most will be small SQL-syntax differences you missed, or CORS configs, or photo uploads on a flaky 4G connection.

- [ ] **Confirm Neon free tier usage stays within limits.** Neon dashboard → Usage. If the DB is sleeping more than waking, Fly's cold-start delay may be noticeable — that's known, and Phase 2 won't fix it; staying on free tier is fine for now.

- [ ] **When the week is up and you've had no bugs for 3 days straight, write the Phase 2 plan** (tenant isolation + invites + auth UI).

---

## Self-review checklist

This section is for the implementer to run through before declaring Phase 1 done.

- [ ] `floreren.app` loads in an incognito tab.
- [ ] `api.floreren.app/docs` shows Swagger UI.
- [ ] You can register a new account on `floreren.app`.
- [ ] Photos uploaded show up on `pub-xxxxx.r2.dev` (or your custom upload domain).
- [ ] `git log` shows ~15+ small commits, not 2 megacommits.
- [ ] `fly logs` shows no 500s during a 30-minute exercise of the app.
- [ ] `docker compose down` then `docker compose up -d` then `npm run dev` — local dev still works.
- [ ] `pytest` in `groei/backend` — all tests pass.
- [ ] No SQLite-specific SQL remains: `cd groei/backend && grep -rn "date('now')\|datetime('now')\|INSERT OR REPLACE\|INSERT OR IGNORE" --include="*.py"` → 0 results.
- [ ] No more `aiosqlite` imports: `cd groei/backend && grep -rn "aiosqlite" --include="*.py"` → 0 results.
- [ ] No `/api/photos` or `/api/maps-static` mounts in `main.py`.
- [ ] No `/api/photos`, `/api/maps-static`, `/api/icons` URLs in `groei/frontend/src/`.
- [ ] At least one plant has a photo whose `photo_path` is a full `https://...r2...` URL.
