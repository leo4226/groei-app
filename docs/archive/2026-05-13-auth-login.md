# Auth & Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email + password authentication with Household-scoped multi-tenancy — login/register page, JWT sessions, and per-household data isolation.

**Architecture:** New `households` + `accounts` tables handle auth; JWT issued on login carries `account_id` + `household_id`; existing routers add `Depends(get_current_account)` and filter queries by `household_id`. Frontend gets a `/login` page (login ↔ register toggle) that stores the JWT in localStorage and injects it into every API call.

**Tech Stack:** FastAPI + python-jose[cryptography] + passlib[bcrypt] (backend); React + localStorage JWT (frontend). No external auth service — fully self-hosted.

---

## File Map

### New backend files
- `groei/backend/auth.py` — JWT encode/decode, password hashing, `get_current_account` FastAPI dependency
- `groei/backend/routers/auth.py` — `/auth/register`, `/auth/login`, `/auth/me`
- `groei/backend/migrate_auth.py` — one-time script: seed Leon+Lisbeth household, assign existing data

### Modified backend files
- `groei/backend/requirements.txt` — add python-jose[cryptography], passlib[bcrypt]
- `groei/backend/database/schema.py` — add `households` + `accounts` tables
- `groei/backend/database/migrations.py` — add `household_id` column to maps, plants, locations, users
- `groei/backend/database/tests/test_db_seam.py` — update in-memory fixture + override auth dep
- `groei/backend/main.py` — include auth router
- `groei/backend/routers/plants.py` — require auth, filter by household_id
- `groei/backend/routers/maps.py` — require auth, filter by household_id
- `groei/backend/routers/locations.py` — require auth, filter by household_id
- `groei/backend/routers/users.py` — require auth, filter by household_id
- `groei/backend/routers/dashboard.py` — require auth, filter by household_id
- `groei/backend/.env` — add JWT_SECRET

### New frontend files
- `groei/frontend/src/api/auth.ts` — `login()`, `register()`, `getToken()`, `clearToken()`
- `groei/frontend/src/pages/LoginPage.tsx` — login ↔ register form with botanical decor

### Modified frontend files
- `groei/frontend/src/api/client.ts` — inject Bearer token, redirect to `/login` on 401
- `groei/frontend/src/App.tsx` — add `/login` route, `RequireAuth` wrapper, hide BottomNav on login

---

## Task 1: Install backend auth dependencies

**Files:**
- Modify: `groei/backend/requirements.txt`

- [ ] **Step 1: Add packages to requirements.txt**

Replace the contents of `groei/backend/requirements.txt` with:

```
fastapi>=0.135
uvicorn[standard]>=0.44
aiosqlite>=0.22
python-multipart>=0.0.24
httpx>=0.27
python-dotenv>=1.0
python-jose[cryptography]>=3.3
passlib[bcrypt]>=1.7
```

- [ ] **Step 2: Install into the virtualenv**

Run from `groei/backend/`:
```
.venv\Scripts\pip install python-jose[cryptography] passlib[bcrypt]
```
Expected: both packages install without error.

- [ ] **Step 3: Add JWT_SECRET to .env**

Add this line to `groei/backend/.env` (keep existing lines):
```
JWT_SECRET=change-me-to-a-long-random-string-before-production
```

- [ ] **Step 4: Commit**

```bash
git add groei/backend/requirements.txt groei/backend/.env
git commit -m "chore: add python-jose and passlib for JWT auth"
```

---

## Task 2: Create `auth.py` — JWT and password helpers

**Files:**
- Create: `groei/backend/auth.py`

- [ ] **Step 1: Write failing test**

Add to `groei/backend/tests/test_db_seam.py` at the bottom:

```python
# ── Auth helpers ──

def test_password_hash_and_verify():
    from auth import hash_password, verify_password
    hashed = hash_password("secret123")
    assert hashed != "secret123"
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)


def test_create_and_decode_token():
    from auth import create_token, decode_token
    token = create_token(account_id=1, household_id=7)
    payload = decode_token(token)
    assert payload["account_id"] == 1
    assert payload["household_id"] == 7
```

- [ ] **Step 2: Run to confirm failure**

```
cd groei/backend && .venv\Scripts\pytest tests/test_db_seam.py::test_password_hash_and_verify tests/test_db_seam.py::test_create_and_decode_token -v
```
Expected: `ImportError` — `auth` module not found.

- [ ] **Step 3: Create `groei/backend/auth.py`**

```python
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext

SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"
EXPIRE_DAYS = 30

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = HTTPBearer()


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_token(account_id: int, household_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(account_id), "household_id": household_id, "exp": exp},
        SECRET,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    """Returns {"account_id": int, "household_id": int} or raises JWTError."""
    payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    return {"account_id": int(payload["sub"]), "household_id": int(payload["household_id"])}


async def get_current_account(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """FastAPI dependency — injects {"account_id": int, "household_id": int}."""
    try:
        return decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
```

- [ ] **Step 4: Run tests — expect pass**

```
cd groei/backend && .venv\Scripts\pytest tests/test_db_seam.py::test_password_hash_and_verify tests/test_db_seam.py::test_create_and_decode_token -v
```
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/auth.py groei/backend/tests/test_db_seam.py
git commit -m "feat: add JWT and bcrypt auth helpers"
```

---

## Task 3: Add `households` and `accounts` tables to DB schema

**Files:**
- Modify: `groei/backend/database/schema.py`

- [ ] **Step 1: Add tables to the end of the `executescript` in `schema.py`**

Insert these two CREATE TABLE statements inside the `executescript("""...""")` block, before the closing `""")`:

```sql
        CREATE TABLE IF NOT EXISTS households (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            household_id    INTEGER NOT NULL REFERENCES households(id),
            email           TEXT NOT NULL UNIQUE,
            name            TEXT NOT NULL,
            password_hash   TEXT NOT NULL,
            avatar          TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
```

- [ ] **Step 2: Verify schema applies cleanly**

```
cd groei/backend && .venv\Scripts\python -c "import asyncio; from database import init_db; asyncio.run(init_db()); print('OK')"
```
Expected: prints `OK` without error.

- [ ] **Step 3: Commit**

```bash
git add groei/backend/database/schema.py
git commit -m "feat: add households and accounts tables to schema"
```

---

## Task 4: Add `household_id` migration to existing tables

**Files:**
- Modify: `groei/backend/database/migrations.py`

- [ ] **Step 1: Append to end of `apply()` in `migrations.py`**

Add these blocks at the very end of the `apply` function (after the existing `plant_care_cache` block):

```python
    # ── auth: household_id on maps, plants, locations, users ──
    for table in ("maps", "plants", "locations", "users"):
        cols = {row[1] for row in await db.execute_fetchall(f"PRAGMA table_info({table})")}
        if "household_id" not in cols:
            await db.execute(
                f"ALTER TABLE {table} ADD COLUMN household_id INTEGER REFERENCES households(id)"
            )

    await db.commit()
```

- [ ] **Step 2: Run init_db to apply migration**

```
cd groei/backend && .venv\Scripts\python -c "import asyncio; from database import init_db; asyncio.run(init_db()); print('OK')"
```
Expected: `OK`. No error.

- [ ] **Step 3: Verify column was added**

```
cd groei/backend && .venv\Scripts\python -c "import asyncio, aiosqlite; async def run(): db = await aiosqlite.connect('groei.db'); rows = await db.execute_fetchall('PRAGMA table_info(plants)'); print([r[1] for r in rows]); await db.close(); asyncio.run(run())"
```
Expected: output includes `household_id`.

- [ ] **Step 4: Commit**

```bash
git add groei/backend/database/migrations.py
git commit -m "feat: add household_id column to maps, plants, locations, users"
```

---

## Task 5: Create auth router — register, login, me

**Files:**
- Create: `groei/backend/routers/auth.py`
- Modify: `groei/backend/models.py`

- [ ] **Step 1: Add Pydantic models to `models.py`**

Append to the end of `groei/backend/models.py`:

```python
# --- Auth ---

class RegisterInput(BaseModel):
    email: str
    password: str
    name: str
    household_name: str = ""


class LoginInput(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    account_id: int
    household_id: int
    name: str


class AccountOut(BaseModel):
    id: int
    household_id: int
    email: str
    name: str
    avatar: str | None = None
```

- [ ] **Step 2: Write failing test for register endpoint**

Add to `groei/backend/tests/test_db_seam.py`:

```python
# ── Auth endpoints ──

def test_register_creates_account_and_household(client):
    resp = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User",
        "household_name": "Test Garden",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["name"] == "Test User"
    assert data["account_id"] >= 1
    assert data["household_id"] >= 1


def test_register_duplicate_email_returns_409(client):
    client.post("/api/auth/register", json={
        "email": "dup@example.com", "password": "password123",
        "name": "A", "household_name": "AH",
    })
    resp = client.post("/api/auth/register", json={
        "email": "dup@example.com", "password": "other123",
        "name": "B", "household_name": "BH",
    })
    assert resp.status_code == 409


def test_login_returns_token(client):
    client.post("/api/auth/register", json={
        "email": "login@example.com", "password": "password123",
        "name": "Login User", "household_name": "Login Garden",
    })
    resp = client.post("/api/auth/login", json={
        "email": "login@example.com", "password": "password123",
    })
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_login_wrong_password_returns_401(client):
    client.post("/api/auth/register", json={
        "email": "wrong@example.com", "password": "correct123",
        "name": "W", "household_name": "WH",
    })
    resp = client.post("/api/auth/login", json={
        "email": "wrong@example.com", "password": "incorrect",
    })
    assert resp.status_code == 401
```

- [ ] **Step 3: Run tests — expect failure**

```
cd groei/backend && .venv\Scripts\pytest tests/test_db_seam.py::test_register_creates_account_and_household -v
```
Expected: `404` or `ImportError` — auth router not registered yet.

- [ ] **Step 4: Update the in-memory DB fixture to include auth tables**

In `test_db_seam.py`, find the `_init()` function inside `_db_cache` fixture and append these tables to its `executescript`:

```python
            CREATE TABLE households (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                household_id INTEGER NOT NULL,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                avatar TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
```

Also add `household_id INTEGER` column to the existing `users`, `maps`, `plants`, `locations` CREATE TABLE statements in the fixture.

- [ ] **Step 5: Create `groei/backend/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from database import db_dep
from models import RegisterInput, LoginInput, AuthResponse, AccountOut
from auth import hash_password, verify_password, create_token, get_current_account

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterInput, db=Depends(db_dep)):
    existing = await db.execute_fetchall(
        "SELECT id FROM accounts WHERE email = ?", (body.email.lower(),)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    household_name = body.household_name.strip() or f"{body.name.strip()}'s Garden"
    cur = await db.execute(
        "INSERT INTO households (name) VALUES (?)", (household_name,)
    )
    household_id = cur.lastrowid

    pw_hash = hash_password(body.password)
    cur2 = await db.execute(
        "INSERT INTO accounts (household_id, email, name, password_hash) VALUES (?, ?, ?, ?)",
        (household_id, body.email.lower(), body.name.strip(), pw_hash),
    )
    account_id = cur2.lastrowid
    await db.commit()

    token = create_token(account_id=account_id, household_id=household_id)
    return AuthResponse(token=token, account_id=account_id, household_id=household_id, name=body.name.strip())


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginInput, db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, household_id, name, password_hash FROM accounts WHERE email = ?",
        (body.email.lower(),),
    )
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    account = dict(rows[0])
    if not verify_password(body.password, account["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(account_id=account["id"], household_id=account["household_id"])
    return AuthResponse(
        token=token,
        account_id=account["id"],
        household_id=account["household_id"],
        name=account["name"],
    )


@router.get("/me", response_model=AccountOut)
async def me(current=Depends(get_current_account), db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, household_id, email, name, avatar FROM accounts WHERE id = ?",
        (current["account_id"],),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    return dict(rows[0])
```

- [ ] **Step 6: Run auth tests — expect pass**

```
cd groei/backend && .venv\Scripts\pytest tests/test_db_seam.py::test_register_creates_account_and_household tests/test_db_seam.py::test_register_duplicate_email_returns_409 tests/test_db_seam.py::test_login_returns_token tests/test_db_seam.py::test_login_wrong_password_returns_401 -v
```
Expected: all 4 PASS.

- [ ] **Step 7: Commit**

```bash
git add groei/backend/routers/auth.py groei/backend/models.py groei/backend/tests/test_db_seam.py
git commit -m "feat: add auth register/login/me endpoints"
```

---

## Task 6: Wire auth router into `main.py`

**Files:**
- Modify: `groei/backend/main.py`

- [ ] **Step 1: Import and register the auth router**

In `groei/backend/main.py`, add to the imports:

```python
from routers import auth
```

Then add this line alongside the other `app.include_router` calls (put it first, before `users`):

```python
app.include_router(auth.router, prefix="/api")
```

- [ ] **Step 2: Verify server starts**

```
cd groei/backend && .venv\Scripts\uvicorn main:app --port 8000 --reload
```
Expected: server starts, `GET http://localhost:8000/api/auth/me` returns `403` (no token).

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add groei/backend/main.py
git commit -m "feat: register auth router in main.py"
```

---

## Task 7: Migration script — seed Leon's household

**Files:**
- Create: `groei/backend/migrate_auth.py`

- [ ] **Step 1: Create the migration script**

```python
"""One-time migration: create a Household for existing data and one Account for the owner.

Usage:
    python migrate_auth.py --email you@example.com --password yourpass --name "Leon" --household "Korbee Garden"
"""
import asyncio
import argparse
import sys

sys.path.insert(0, ".")
from database import get_db
from auth import hash_password


async def run(email: str, password: str, name: str, household: str):
    async with get_db() as db:
        # Check if household_id 1 already exists (idempotent)
        existing_hh = await db.execute_fetchall("SELECT id FROM households WHERE id = 1")
        if not existing_hh:
            await db.execute(
                "INSERT INTO households (id, name) VALUES (1, ?)", (household,)
            )
            print(f"Created household: {household}")
        else:
            print("Household 1 already exists — skipping household creation")

        # Assign all unowned data to household 1
        for table in ("maps", "plants", "locations", "users"):
            result = await db.execute(
                f"UPDATE {table} SET household_id = 1 WHERE household_id IS NULL"
            )
            print(f"  {table}: updated {result.rowcount} rows")

        # Create owner account (skip if email already exists)
        existing_acc = await db.execute_fetchall(
            "SELECT id FROM accounts WHERE email = ?", (email.lower(),)
        )
        if not existing_acc:
            pw_hash = hash_password(password)
            await db.execute(
                "INSERT INTO accounts (household_id, email, name, password_hash) VALUES (1, ?, ?, ?)",
                (email.lower(), name, pw_hash),
            )
            print(f"Created account: {email}")
        else:
            print(f"Account {email} already exists — skipping")

        await db.commit()
        print("Migration complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Leon")
    parser.add_argument("--household", default="Korbee Garden")
    args = parser.parse_args()
    asyncio.run(run(args.email, args.password, args.name, args.household))
```

- [ ] **Step 2: Run the migration**

```
cd groei/backend && .venv\Scripts\python migrate_auth.py --email leon_korbee@hotmail.com --password "choose-a-real-password" --name "Leon" --household "Korbee Garden"
```
Expected output:
```
Created household: Korbee Garden
  maps: updated N rows
  plants: updated N rows
  locations: updated N rows
  users: updated N rows
Created account: leon_korbee@hotmail.com
Migration complete.
```

- [ ] **Step 3: Commit**

```bash
git add groei/backend/migrate_auth.py
git commit -m "feat: add auth migration script for existing household data"
```

---

## Task 8: Protect plants router with household scoping

**Files:**
- Modify: `groei/backend/routers/plants.py`

- [ ] **Step 1: Write failing test**

Add to `groei/backend/tests/test_db_seam.py`:

```python
def test_plants_require_auth(client):
    """GET /api/plants without token returns 403."""
    resp = client.get("/api/plants")
    assert resp.status_code == 403
```

- [ ] **Step 2: Run to confirm failure (currently returns 200)**

```
cd groei/backend && .venv\Scripts\pytest tests/test_db_seam.py::test_plants_require_auth -v
```
Expected: FAIL (gets 200 instead of 403).

- [ ] **Step 3: Add `get_current_account` dependency and household filtering to `list_plants`**

In `groei/backend/routers/plants.py`, update the import line:

```python
from auth import get_current_account
```

Change the `list_plants` signature and WHERE clause:

```python
@router.get("/plants", response_model=list[PlantOut])
async def list_plants(db=Depends(db_dep), account=Depends(get_current_account)):
    rows = await db.execute_fetchall("""
        SELECT p.*, l.name as location_name, l.icon as location_icon,
               s.phenology_json
        FROM plants p
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN plant_species s ON p.species_id = s.id
        WHERE p.is_active = 1 AND p.household_id = ?
        ORDER BY p.name
    """, (account["household_id"],))
```

Change `create_plant` to inject `household_id`:

```python
@router.post("/plants", response_model=PlantOut)
async def create_plant(plant: PlantCreate, db=Depends(db_dep), account=Depends(get_current_account)):
```

In the `create_plant` body, find the INSERT statement and add `household_id` to it. The insert currently does not include `household_id`. Change it to include `household_id = ?` and pass `account["household_id"]` as the corresponding value.

Find this line pattern in the INSERT:
```python
    await db.execute(
        """INSERT INTO plants (name, species, location_id, ...)
           VALUES (?, ?, ?, ...)""",
        (plant.name, plant.species, plant.location_id, ...),
    )
```
Add `, household_id` to the column list and `, ?` to the VALUES, then append `account["household_id"]` to the tuple.

Also add `account=Depends(get_current_account)` to `get_plant`, `update_plant`, `archive_plant`, `restore_plant`, and all other endpoints in `plants.py`.

- [ ] **Step 4: Override `get_current_account` in the test fixture**

In `test_db_seam.py`, add a test-time auth override. Add after the `override_db` fixture:

```python
@pytest.fixture(autouse=True)
def override_auth():
    """Inject a fake account (household_id=1) for all tests."""
    from auth import get_current_account
    from main import app

    async def _fake_account():
        return {"account_id": 1, "household_id": 1}

    app.dependency_overrides[get_current_account] = _fake_account
    yield
    # override_db already clears all overrides — no need to clear again here
```

- [ ] **Step 5: Run all tests**

```
cd groei/backend && .venv\Scripts\pytest tests/test_db_seam.py -v
```
Expected: all tests PASS (including `test_plants_require_auth` once auth override is wired).

Note: `test_plants_require_auth` tests the *unauthenticated* path, so it must temporarily NOT have the override. Move it to a separate test that clears the override:

```python
def test_plants_require_auth(client):
    """GET /api/plants without token returns 403 (tested without override)."""
    from auth import get_current_account
    from main import app
    # Remove the auth override for this test
    saved = app.dependency_overrides.pop(get_current_account, None)
    resp = client.get("/api/plants")
    if saved:
        app.dependency_overrides[get_current_account] = saved
    assert resp.status_code == 403
```

- [ ] **Step 6: Commit**

```bash
git add groei/backend/routers/plants.py groei/backend/tests/test_db_seam.py
git commit -m "feat: protect plants router with household-scoped auth"
```

---

## Task 9: Protect maps router with household scoping

**Files:**
- Modify: `groei/backend/routers/maps.py`

- [ ] **Step 1: Add import and auth dependency**

In `groei/backend/routers/maps.py`, add:

```python
from auth import get_current_account
```

- [ ] **Step 2: Update `list_maps`**

```python
@router.get("/maps", response_model=list[MapOut])
async def list_maps(db=Depends(db_dep), account=Depends(get_current_account)):
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing FROM maps WHERE household_id = ? ORDER BY sort_order",
        (account["household_id"],),
    )
    return [dict(r) for r in rows]
```

- [ ] **Step 3: Update `create_map`**

Find the `create_map` endpoint (POST /maps). Add `account=Depends(get_current_account)` to its signature. In the INSERT statement, add `household_id` column and pass `account["household_id"]`.

- [ ] **Step 4: Add auth dep to all remaining map endpoints**

Add `account=Depends(get_current_account)` to: `get_map`, `get_map_plants`, `get_map_objects`, `get_map_items`, `update_map`, `delete_map`, and any other endpoints in `maps.py`. These endpoints already filter by `slug` or `map_id` so no additional household check is needed (the map itself is household-scoped via `list_maps` and `create_map`).

- [ ] **Step 5: Run all tests**

```
cd groei/backend && .venv\Scripts\pytest tests/test_db_seam.py -v
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add groei/backend/routers/maps.py
git commit -m "feat: protect maps router with household-scoped auth"
```

---

## Task 10: Protect locations, users, and dashboard routers

**Files:**
- Modify: `groei/backend/routers/locations.py`
- Modify: `groei/backend/routers/users.py`
- Modify: `groei/backend/routers/dashboard.py`

- [ ] **Step 1: Update `locations.py`**

Add `from auth import get_current_account` to imports.

Find `list_locations` (GET /locations). Add `account=Depends(get_current_account)` and filter:
```python
@router.get("/locations", response_model=list[LocationOut])
async def list_locations(db=Depends(db_dep), account=Depends(get_current_account)):
    rows = await db.execute_fetchall(
        "SELECT id, name, icon, sort_order FROM locations WHERE household_id = ? ORDER BY sort_order",
        (account["household_id"],),
    )
    return [dict(r) for r in rows]
```

If there are any write endpoints (POST/PUT/DELETE) in `locations.py`, add `account=Depends(get_current_account)` to those too and include `household_id = account["household_id"]` in any INSERT.

- [ ] **Step 2: Update `users.py`**

Add `from auth import get_current_account` to imports.

Update `list_users`:
```python
@router.get("/users", response_model=list[UserOut])
async def list_users(db=Depends(db_dep), account=Depends(get_current_account)):
    cursor = await db.execute(
        "SELECT id, name, avatar FROM users WHERE household_id = ? ORDER BY id",
        (account["household_id"],),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]
```

- [ ] **Step 3: Update `dashboard.py`**

Add `from auth import get_current_account` to imports.

Add `account=Depends(get_current_account)` to both `get_dashboard` and `get_dashboard_v2` (and any other endpoints). Add `AND p.household_id = ?` to the WHERE clause of the care_schedules query:

```python
@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(db=Depends(db_dep), account=Depends(get_current_account)):
    today = str(date.today())
    cursor = await db.execute("""
        SELECT
            cs.id as schedule_id,
            cs.plant_id,
            p.name as plant_name,
            p.photo_path as plant_photo,
            l.name as location,
            cs.care_type,
            cs.next_due,
            cs.last_done_by,
            u.name as last_done_by_name,
            cs.last_done as last_done_at
        FROM care_schedules cs
        JOIN plants p ON cs.plant_id = p.id
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN users u ON cs.last_done_by = u.id
        WHERE cs.is_active = 1 AND p.is_active = 1 AND p.household_id = ?
        ORDER BY cs.next_due ASC
    """, (account["household_id"],))
```

Apply the same `AND p.household_id = ?` pattern to any other queries in `dashboard.py` that JOIN on plants.

- [ ] **Step 4: Run all tests**

```
cd groei/backend && .venv\Scripts\pytest tests/ -v
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/routers/locations.py groei/backend/routers/users.py groei/backend/routers/dashboard.py
git commit -m "feat: protect locations, users, and dashboard with household auth"
```

---

## Task 11: Create frontend auth API module

**Files:**
- Create: `groei/frontend/src/api/auth.ts`

- [ ] **Step 1: Create `auth.ts`**

```typescript
const BASE = '/api'

export interface AuthResponse {
  token: string
  account_id: number
  household_id: number
  name: string
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Login failed')
  }
  return res.json()
}

export async function register(
  email: string,
  password: string,
  name: string,
  householdName: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, household_name: householdName }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Registration failed')
  }
  return res.json()
}

export function getToken(): string | null {
  return localStorage.getItem('groei-token')
}

export function saveToken(token: string): void {
  localStorage.setItem('groei-token', token)
}

export function clearToken(): void {
  localStorage.removeItem('groei-token')
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/api/auth.ts
git commit -m "feat: add frontend auth API module"
```

---

## Task 12: Update `api/client.ts` to inject JWT and handle 401

**Files:**
- Modify: `groei/frontend/src/api/client.ts`

- [ ] **Step 1: Update the `api<T>` function**

In `groei/frontend/src/api/client.ts`, replace the existing `api<T>` function with:

```typescript
async function api<T>(method: string, path: string, options: ApiOptions = {}): Promise<T> {
  const url = BASE + path + (options.params ? '?' + new URLSearchParams(options.params) : '')
  const token = localStorage.getItem('groei-token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const init: RequestInit = { method, headers }
  if (options.form) {
    init.body = options.form
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  const res = await fetch(url, init)

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('groei-token')
    window.location.href = '/login'
    throw new Error('Session expired — redirecting to login')
  }

  await ensureOk(res, `Failed: ${method} ${path}`)
  if (res.status === 204) return undefined as T
  return res.json()
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/api/client.ts
git commit -m "feat: inject JWT Bearer token and handle 401 in API client"
```

---

## Task 13: Create `LoginPage.tsx`

**Files:**
- Create: `groei/frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, saveToken } from '../api/auth'

const DECOR = [
  { name: 'oak',      left: '68%', top: '60px',  size: 200, rotate: -8,  opacity: 0.07 },
  { name: 'foxglove', left: '-3%', top: '180px', size: 90,  rotate: 12,  opacity: 0.07 },
  { name: 'daisy',    left: '80%', top: '320px', size: 50,  rotate: -20, opacity: 0.06 },
  { name: 'peony',    left: '5%',  top: '480px', size: 80,  rotate: -8,  opacity: 0.07 },
  { name: 'lavender_bare', left: '75%', top: '520px', size: 70, rotate: 15, opacity: 0.08 },
]

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await login(email, password)
        saveToken(res.token)
      } else {
        const hName = householdName.trim() || `${name.trim()}'s Garden`
        const res = await register(email, password, name, hName)
        saveToken(res.token)
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    fontSize: '0.95rem',
    color: 'var(--color-text)',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--color-text-soft)',
    marginBottom: '6px',
  }

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      {/* Botanical decor */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        {DECOR.map((d) => (
          <img
            key={d.name}
            src={`/api/icons/${d.name}.svg`}
            alt=""
            style={{ position: 'absolute', left: d.left, top: d.top, width: d.size, height: d.size, transform: `rotate(${d.rotate}deg)`, opacity: d.opacity, userSelect: 'none' }}
          />
        ))}
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '360px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '2.8rem', color: 'var(--color-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Groei
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: '6px 0 0' }}>
            Track your plants, grow your garden
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '24px' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: '8px', padding: '3px', marginBottom: '22px' }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null) }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: mode === m ? 'var(--color-surface)' : 'transparent',
                  color: mode === m ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontWeight: mode === m ? 600 : 400,
                  fontSize: '0.875rem',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit',
                }}
              >
                {m === 'login' ? 'Log in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {mode === 'register' && (
              <>
                <div>
                  <label style={labelStyle}>Your name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Leon"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    Household name{' '}
                    <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    placeholder={name ? `${name}'s Garden` : "Korbee Garden"}
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={inputStyle}
              />
            </div>

            {error && (
              <p style={{ color: 'var(--color-overdue)', fontSize: '0.85rem', margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--color-primary)',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                fontFamily: 'inherit',
                marginTop: '4px',
              }}
            >
              {loading ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/LoginPage.tsx
git commit -m "feat: add login/register page with botanical decor"
```

---

## Task 14: Update `App.tsx` — route protection and login route

**Files:**
- Modify: `groei/frontend/src/App.tsx`

- [ ] **Step 1: Add imports and `RequireAuth` component**

At the top of `groei/frontend/src/App.tsx`, add to imports:

```tsx
import LoginPage from './pages/LoginPage'
import { getToken } from './api/auth'
```

Add this component definition before `App`:

```tsx
function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 2: Update the route tree**

Replace the `<Routes>` block in `App` with:

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/" element={<Navigate to={getToken() ? '/dashboard' : '/login'} replace />} />

  <Route path="/maps" element={<RequireAuth><MapsListPage /></RequireAuth>} />
  <Route path="/maps/:id/edit-layout" element={<RequireAuth><LayoutEditorPage /></RequireAuth>} />
  <Route path="/maps/:id/settings" element={<RequireAuth><MapSettingsPage /></RequireAuth>} />
  <Route path="/map/:slug" element={<RequireAuth><MapPage /></RequireAuth>} />
  <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
  <Route path="/plants" element={<RequireAuth><Plants /></RequireAuth>} />
  <Route path="/plants/add" element={<RequireAuth><AddPlant /></RequireAuth>} />
  <Route path="/plants/:id" element={<RequireAuth><PlantDetail /></RequireAuth>} />
  <Route path="/plants/:id/edit" element={<RequireAuth><EditPlant /></RequireAuth>} />
  <Route path="/plants/:id/care" element={<RequireAuth><PlantCareDetail /></RequireAuth>} />
  <Route path="/calendar" element={<RequireAuth><PlanningCalendar /></RequireAuth>} />
  <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
</Routes>
```

- [ ] **Step 3: Hide BottomNav on the login route**

Import `useLocation` from `react-router-dom`:

```tsx
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
```

In `App`, add:
```tsx
const location = useLocation()
const isLoginPage = location.pathname === '/login'
```

Change the `<BottomNav />` render to:
```tsx
{!isLoginPage && <BottomNav />}
```

- [ ] **Step 4: TypeScript check**

```
cd groei/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add groei/frontend/src/App.tsx
git commit -m "feat: add route protection and login page routing"
```

---

## Task 15: Smoke test end-to-end

- [ ] **Step 1: Start the dev server**

```
cd groei && npm run dev
```

- [ ] **Step 2: Test login flow**

Open `http://localhost:5173` in a browser.

Verify:
- Redirects to `/login`
- BottomNav is NOT shown on `/login`
- Register tab: fill in name, email, password → creates account, redirects to `/dashboard`
- Log out by clearing localStorage in DevTools → refresh → back to `/login`
- Login tab: enter same email + password → redirects to `/dashboard`, plants and maps load

- [ ] **Step 3: Test Leon's migrated data**

Log in with `leon_korbee@hotmail.com` and the password you chose in Task 7.
Verify that existing plants and maps appear on the dashboard and maps page.

- [ ] **Step 4: Test isolation**

Register a second account with a different email. Verify it has empty plants and maps (does not see Leon's data).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete auth implementation with household-scoped multi-tenancy"
```
