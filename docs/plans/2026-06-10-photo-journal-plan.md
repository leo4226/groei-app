# Plant Photo Journal ("Groeidagboek") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-plant photo timeline with notes, photos attached to care events, an optional progress-photo reminder, and a free BioCLIP species sanity-check.

**Architecture:** New `plant_photos` table + `routers/plant_photos.py` on the existing FastAPI backend; photos stored in the existing R2 bucket via `services/storage.py` (compressed client-side to ~300 KB before upload); timeline UI as a new section in `PlantDetail.tsx`. The progress reminder reuses `care_schedules` with `care_type='photo'`. BioCLIP runs as a FastAPI background task against the existing GPU worker.

**Tech Stack:** FastAPI + aiosqlite/asyncpg seam, Alembic, boto3/R2, React 19 + TS + Tailwind, Zustand, canvas-based image compression (no new deps).

**Spec:** `docs/plans/2026-06-10-photo-journal-design.md`

**Delivered as 3 PRs:** Tasks 1–8 = PR 1 (core journal), Tasks 9–11 = PR 2 (care integration), Tasks 12–13 = PR 3 (BioCLIP). Branch per PR off master: `feat/photo-journal`, `feat/photo-journal-care`, `feat/photo-journal-bioclip`.

**Conventions used throughout (read first):**
- DB calls use the `?`-placeholder seam: `await db.execute(sql, params)`, `await db.execute_fetchall(...)`, `cursor.lastrowid` after INSERT, explicit `await db.commit()`.
- Auth: `account = Depends(get_current_account)` → `{"account_id", "household_id"}`. Ownership check = `WHERE id = ? AND household_id = ?`.
- Backend tests run from `backend/`: `python -m pytest tests/<file> -q`. Fixtures `client`, `seeded_db`, `auth_header` come from `tests/conftest.py` (in-memory SQLite, account 1 / household 1 seeded). Tests create extra tables they need via `executescript` (pattern: `tests/test_admin_account_delete.py`).
- Frontend verification is **`cd frontend && npm run build`** (not just tsc — CLAUDE.md).

---

## PR 1 — Core journal

### Task 1: Migration 0013 — `plant_photos` table

**Files:**
- Create: `backend/alembic/versions/0013_add_plant_photos.py`

- [ ] **Step 1: Write the migration**

```python
"""add plant_photos table

Photo journal per plant. Image bytes live in R2; this table holds metadata +
the R2 key/public url. BioCLIP columns are nullable — they are filled by a
background task (PR 3) and stay NULL when the worker is offline.

See docs/plans/2026-06-10-photo-journal-design.md.

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-10
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE plant_photos (
            id                  SERIAL PRIMARY KEY,
            plant_id            INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
            household_id        INTEGER NOT NULL,
            r2_key              TEXT NOT NULL,
            url                 TEXT NOT NULL,
            note                TEXT,
            taken_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            care_log_id         INTEGER REFERENCES care_log(id) ON DELETE SET NULL,
            bioclip_species_id  INTEGER,
            bioclip_confidence  REAL,
            species_mismatch    BOOLEAN DEFAULT FALSE,
            embedding           BYTEA,
            created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute(
        "CREATE INDEX idx_plant_photos_plant ON plant_photos(plant_id, taken_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS plant_photos")
```

- [ ] **Step 2: Sanity-check the migration chain**

Run: `cd backend && python -c "import alembic.config; alembic.config.main(argv=['history'])" | head -3`
Expected: `0012 -> 0013 (head), add plant_photos table` at the top. (Do NOT run `upgrade` locally — dev uses SQLite via the seam; Fly runs it on deploy.)

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/0013_add_plant_photos.py
git commit -m "feat(photos): add plant_photos table (migration 0013)"
```

### Task 2: `Storage.delete()`

**Files:**
- Modify: `backend/services/storage.py`
- Test: `backend/tests/test_storage.py` (append)

- [ ] **Step 1: Write the failing test** — append to `backend/tests/test_storage.py` (match the file's existing fake-client style; adapt the fake if it differs):

```python
def test_delete_calls_delete_object():
    class FakeClient:
        def __init__(self):
            self.deleted = []
        def delete_object(self, Bucket, Key):
            self.deleted.append((Bucket, Key))

    from services.storage import Storage
    client = FakeClient()
    storage = Storage(client=client, bucket="b", public_base_url="https://cdn.x")
    storage.delete("photos/1/2/3.jpg")
    assert client.deleted == [("b", "photos/1/2/3.jpg")]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_storage.py -q`
Expected: FAIL — `AttributeError: 'Storage' object has no attribute 'delete'`

- [ ] **Step 3: Implement** — add to the `Storage` class in `backend/services/storage.py`:

```python
    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket, Key=key.lstrip("/"))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_storage.py -q` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/storage.py backend/tests/test_storage.py
git commit -m "feat(storage): add Storage.delete for R2 object cleanup"
```

### Task 3: Photo router — upload + list

**Files:**
- Create: `backend/routers/plant_photos.py`
- Modify: `backend/main.py` (register router)
- Test: `backend/tests/test_plant_photos.py`

- [ ] **Step 1: Write the failing tests** — create `backend/tests/test_plant_photos.py`:

```python
"""Photo journal endpoints: upload, list, edit, delete (+ ownership)."""
import pytest
import pytest_asyncio

import routers.plant_photos as pp


EXTRA_SCHEMA = """
    CREATE TABLE plant_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        household_id INTEGER NOT NULL,
        r2_key TEXT NOT NULL,
        url TEXT NOT NULL,
        note TEXT,
        taken_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        care_log_id INTEGER,
        bioclip_species_id INTEGER,
        bioclip_confidence REAL,
        species_mismatch BOOLEAN DEFAULT FALSE,
        embedding BLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_by INTEGER, done_at TEXT, notes TEXT,
        skipped BOOLEAN DEFAULT FALSE
    );
"""


class FakeStorage:
    def __init__(self):
        self.puts = []
        self.deletes = []

    def put(self, key, data, content_type):
        self.puts.append((key, len(data), content_type))
        return f"https://cdn.test/{key}"

    def delete(self, key):
        self.deletes.append(key)


@pytest_asyncio.fixture
async def photo_db(seeded_db, monkeypatch):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    # plant 1 in caller's household, plant 2 in a foreign household
    await db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other');
        INSERT INTO plants (id, name, household_id) VALUES
            (1, 'Monstera', 1), (2, 'Foreign fern', 2);
    """)
    await db.commit()
    fake = FakeStorage()
    monkeypatch.setattr(pp, "build_storage_from_env", lambda: fake)
    return db, fake


JPEG = b"\xff\xd8\xff\xe0fakejpegbytes"


def _upload(client, plant_id, headers=None, **form):
    return client.post(
        f"/api/plants/{plant_id}/photos",
        files={"file": ("p.jpg", JPEG, "image/jpeg")},
        data=form, headers=headers or {},
    )


@pytest.mark.asyncio
async def test_upload_requires_auth(client, photo_db):
    res = await _upload(client, 1)
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_upload_rejects_foreign_plant(client, photo_db, auth_header):
    res = await _upload(client, 2, headers=auth_header)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_upload_creates_row_and_syncs_thumbnail(client, photo_db, auth_header):
    db, fake = photo_db
    res = await _upload(client, 1, headers=auth_header, note="new leaf!")
    assert res.status_code == 200
    body = res.json()
    assert body["plant_id"] == 1
    assert body["note"] == "new leaf!"
    assert body["url"].startswith("https://cdn.test/photos/1/1/")

    # exactly one R2 put, key carries household/plant prefix
    assert len(fake.puts) == 1
    assert fake.puts[0][0].startswith("photos/1/1/")

    # plants.photo_path now points at the newest journal photo
    rows = await db.execute_fetchall("SELECT photo_path FROM plants WHERE id = 1")
    assert rows[0]["photo_path"] == body["url"]


@pytest.mark.asyncio
async def test_upload_rejects_non_image(client, photo_db, auth_header):
    res = await client.post(
        "/api/plants/1/photos",
        files={"file": ("x.txt", b"hello", "text/plain")},
        headers=auth_header,
    )
    assert res.status_code == 415


@pytest.mark.asyncio
async def test_list_returns_newest_first(client, photo_db, auth_header):
    await _upload(client, 1, headers=auth_header, note="first",
                  taken_at="2026-01-01T10:00:00")
    await _upload(client, 1, headers=auth_header, note="second",
                  taken_at="2026-03-01T10:00:00")
    res = await client.get("/api/plants/1/photos", headers=auth_header)
    assert res.status_code == 200
    notes = [p["note"] for p in res.json()]
    assert notes == ["second", "first"]


@pytest.mark.asyncio
async def test_list_rejects_foreign_plant(client, photo_db, auth_header):
    res = await client.get("/api/plants/2/photos", headers=auth_header)
    assert res.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_plant_photos.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'routers.plant_photos'`

- [ ] **Step 3: Implement the router** — create `backend/routers/plant_photos.py`:

```python
"""Photo journal: per-plant photo timeline stored in R2.

plants.photo_path is derived state — always the newest journal photo's URL —
so plant cards, the map view, and the dashboard keep working unchanged.
"""
import time
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account
from services.storage import build_storage_from_env

router = APIRouter(tags=["plant-photos"])

MAX_BYTES = 10 * 1024 * 1024  # client compresses to ~300 KB; this is a hard backstop
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


class PhotoOut(BaseModel):
    id: int
    plant_id: int
    url: str
    note: str | None = None
    taken_at: str
    care_log_id: int | None = None
    species_mismatch: bool = False


class PhotoPatch(BaseModel):
    note: str | None = None
    taken_at: str | None = None


async def _owned_plant(db, plant_id: int, household_id: int) -> dict:
    rows = await db.execute_fetchall(
        "SELECT id, household_id, species_id FROM plants WHERE id = ? AND household_id = ?",
        (plant_id, household_id),
    )
    if not rows:
        raise HTTPException(404, "Plant not found")
    return dict(rows[0])


async def _sync_thumbnail(db, plant_id: int) -> None:
    """Point plants.photo_path at the newest journal photo (NULL when empty)."""
    rows = await db.execute_fetchall(
        "SELECT url FROM plant_photos WHERE plant_id = ? ORDER BY taken_at DESC, id DESC LIMIT 1",
        (plant_id,),
    )
    url = rows[0]["url"] if rows else None
    await db.execute(
        "UPDATE plants SET photo_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (url, plant_id),
    )


def _row_to_out(row) -> PhotoOut:
    return PhotoOut(
        id=row["id"], plant_id=row["plant_id"], url=row["url"], note=row["note"],
        taken_at=str(row["taken_at"]), care_log_id=row["care_log_id"],
        species_mismatch=bool(row["species_mismatch"]),
    )


@router.post("/plants/{plant_id}/photos", response_model=PhotoOut)
async def upload_plant_photo(
    plant_id: int,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    note: str | None = Form(None),
    taken_at: str | None = Form(None),
    care_log_id: int | None = Form(None),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    plant = await _owned_plant(db, plant_id, account["household_id"])

    if (file.content_type or "") not in ALLOWED_TYPES:
        raise HTTPException(415, "Only JPEG/PNG/WebP images are accepted")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image too large (max 10 MB)")

    key = f"photos/{account['household_id']}/{plant_id}/{int(time.time() * 1000)}.jpg"
    storage = build_storage_from_env()
    try:
        url = storage.put(key, data, content_type=file.content_type or "image/jpeg")
    except Exception as exc:
        raise HTTPException(502, f"Photo storage failed: {exc}")

    ts = taken_at or datetime.now().isoformat(sep=" ", timespec="seconds")
    try:
        cursor = await db.execute(
            """INSERT INTO plant_photos (plant_id, household_id, r2_key, url, note, taken_at, care_log_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (plant_id, account["household_id"], key, url, note, ts, care_log_id),
        )
        photo_id = cursor.lastrowid
        await _sync_thumbnail(db, plant_id)
        await db.commit()
    except HTTPException:
        raise
    except Exception:
        # DB write failed after the R2 put — best-effort cleanup, then surface.
        try:
            storage.delete(key)
        except Exception:
            pass
        raise

    rows = await db.execute_fetchall("SELECT * FROM plant_photos WHERE id = ?", (photo_id,))
    return _row_to_out(rows[0])


@router.get("/plants/{plant_id}/photos", response_model=list[PhotoOut])
async def list_plant_photos(plant_id: int, db=Depends(db_dep), account=Depends(get_current_account)):
    await _owned_plant(db, plant_id, account["household_id"])
    rows = await db.execute_fetchall(
        "SELECT * FROM plant_photos WHERE plant_id = ? ORDER BY taken_at DESC, id DESC",
        (plant_id,),
    )
    return [_row_to_out(r) for r in rows]
```

(`BackgroundTasks` is imported now but first used in PR 3 — keeps the signature stable.)

- [ ] **Step 4: Register the router** — in `backend/main.py`, next to the existing includes (around line 108):

```python
from routers import plant_photos
app.include_router(plant_photos.router, prefix="/api")
```

(Follow the file's actual import style — routers are imported in a group at the top.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_plant_photos.py -q` — Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/plant_photos.py backend/main.py backend/tests/test_plant_photos.py
git commit -m "feat(photos): photo journal upload + list endpoints"
```

### Task 4: Photo router — edit + delete (with R2 cleanup and thumbnail re-point)

**Files:**
- Modify: `backend/routers/plant_photos.py`
- Test: `backend/tests/test_plant_photos.py` (append)

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_plant_photos.py`:

```python
@pytest.mark.asyncio
async def test_patch_note(client, photo_db, auth_header):
    photo = (await _upload(client, 1, headers=auth_header, note="old")).json()
    res = await client.patch(
        f"/api/photos/{photo['id']}", json={"note": "new"}, headers=auth_header
    )
    assert res.status_code == 200
    assert res.json()["note"] == "new"


@pytest.mark.asyncio
async def test_delete_removes_r2_object_and_repoints_thumbnail(client, photo_db, auth_header):
    db, fake = photo_db
    first = (await _upload(client, 1, headers=auth_header,
                           taken_at="2026-01-01T10:00:00")).json()
    second = (await _upload(client, 1, headers=auth_header,
                            taken_at="2026-03-01T10:00:00")).json()

    res = await client.delete(f"/api/photos/{second['id']}", headers=auth_header)
    assert res.status_code == 200

    # R2 object of the deleted photo was removed
    assert len(fake.deletes) == 1
    assert fake.deletes[0].startswith("photos/1/1/")

    # thumbnail re-points at the remaining (older) photo
    rows = await db.execute_fetchall("SELECT photo_path FROM plants WHERE id = 1")
    assert rows[0]["photo_path"] == first["url"]


@pytest.mark.asyncio
async def test_delete_last_photo_clears_thumbnail(client, photo_db, auth_header):
    db, _ = photo_db
    photo = (await _upload(client, 1, headers=auth_header)).json()
    await client.delete(f"/api/photos/{photo['id']}", headers=auth_header)
    rows = await db.execute_fetchall("SELECT photo_path FROM plants WHERE id = 1")
    assert rows[0]["photo_path"] is None


@pytest.mark.asyncio
async def test_patch_and_delete_reject_foreign_photo(client, photo_db, auth_header):
    db, _ = photo_db
    await db.execute(
        """INSERT INTO plant_photos (plant_id, household_id, r2_key, url)
           VALUES (2, 2, 'photos/2/2/x.jpg', 'https://cdn.test/photos/2/2/x.jpg')"""
    )
    await db.commit()
    rows = await db.execute_fetchall(
        "SELECT id FROM plant_photos WHERE household_id = 2"
    )
    foreign_id = rows[0]["id"]
    assert (await client.patch(f"/api/photos/{foreign_id}", json={"note": "x"},
                               headers=auth_header)).status_code == 404
    assert (await client.delete(f"/api/photos/{foreign_id}",
                                headers=auth_header)).status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_plant_photos.py -q`
Expected: new tests FAIL with 404/405 (routes don't exist)

- [ ] **Step 3: Implement** — append to `backend/routers/plant_photos.py`:

```python
async def _owned_photo(db, photo_id: int, household_id: int) -> dict:
    rows = await db.execute_fetchall(
        "SELECT * FROM plant_photos WHERE id = ? AND household_id = ?",
        (photo_id, household_id),
    )
    if not rows:
        raise HTTPException(404, "Photo not found")
    return dict(rows[0])


@router.patch("/photos/{photo_id}", response_model=PhotoOut)
async def update_photo(photo_id: int, patch: PhotoPatch,
                       db=Depends(db_dep), account=Depends(get_current_account)):
    photo = await _owned_photo(db, photo_id, account["household_id"])
    note = patch.note if patch.note is not None else photo["note"]
    taken_at = patch.taken_at if patch.taken_at is not None else photo["taken_at"]
    await db.execute(
        "UPDATE plant_photos SET note = ?, taken_at = ? WHERE id = ?",
        (note, taken_at, photo_id),
    )
    await _sync_thumbnail(db, photo["plant_id"])  # taken_at edit may change "newest"
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM plant_photos WHERE id = ?", (photo_id,))
    return _row_to_out(rows[0])


@router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: int,
                       db=Depends(db_dep), account=Depends(get_current_account)):
    photo = await _owned_photo(db, photo_id, account["household_id"])
    storage = build_storage_from_env()
    try:
        storage.delete(photo["r2_key"])
    except Exception:
        pass  # R2 orphan is acceptable; the DB row must go regardless
    await db.execute("DELETE FROM plant_photos WHERE id = ?", (photo_id,))
    await _sync_thumbnail(db, photo["plant_id"])
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_plant_photos.py -q` — Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/plant_photos.py backend/tests/test_plant_photos.py
git commit -m "feat(photos): edit + delete with R2 cleanup and thumbnail re-point"
```

### Task 5: Rework legacy `POST /plants/{id}/photo` through the journal

**Files:**
- Modify: `backend/routers/plants.py:449-469` (the existing `upload_photo`)
- Test: `backend/tests/test_plant_photos.py` (append)

- [ ] **Step 1: Write the failing test** — append:

```python
@pytest.mark.asyncio
async def test_legacy_endpoint_creates_journal_entry(client, photo_db, auth_header):
    db, _ = photo_db
    res = await client.post(
        "/api/plants/1/photo",
        files={"file": ("p.jpg", JPEG, "image/jpeg")},
        headers=auth_header,
    )
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT COUNT(*) n FROM plant_photos WHERE plant_id = 1"
    )
    assert rows[0]["n"] == 1


@pytest.mark.asyncio
async def test_legacy_endpoint_rejects_foreign_plant(client, photo_db, auth_header):
    res = await client.post(
        "/api/plants/2/photo",
        files={"file": ("p.jpg", JPEG, "image/jpeg")},
        headers=auth_header,
    )
    assert res.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_plant_photos.py -q`
Expected: first fails (no plant_photos row — legacy path writes only `photo_path`); second fails (no household check; test DB also lacks the storage mock on `routers.plants`, which the rework removes).

- [ ] **Step 3: Replace the body of `upload_photo` in `backend/routers/plants.py`** — delegate to the journal:

```python
@router.post("/plants/{plant_id}/photo", response_model=PlantOut)
async def upload_photo(plant_id: int, background: BackgroundTasks, file: UploadFile = File(...),
                       db = Depends(db_dep), account = Depends(get_current_account)):
    """Legacy single-photo endpoint — now creates a photo-journal entry."""
    from routers.plant_photos import upload_plant_photo
    await upload_plant_photo(plant_id, background, file=file, db=db, account=account)
    return await get_plant(plant_id, db=db)
```

Add `BackgroundTasks` to the `fastapi` import line of `routers/plants.py`. Remove the now-unused `time` / `build_storage_from_env` imports **only if** nothing else in the file uses them (`build_storage_from_env` is also used elsewhere in plants.py — check before removing).

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_plant_photos.py -q` — Expected: all PASS
Also run: `python -m pytest tests/test_plants_create.py tests/test_seed_care_schedules.py -q` (guard against import fallout) — Expected: same results as before the change.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/plants.py backend/tests/test_plant_photos.py
git commit -m "fix(photos): legacy photo endpoint gains household check, writes journal"
```

### Task 6: Frontend — image compression utility

**Files:**
- Create: `frontend/src/utils/compressImage.ts`

- [ ] **Step 1: Implement** (no unit test — canvas APIs need a browser; verified through the build + manual use):

```typescript
/** Downscale + recompress a photo client-side before upload.
 *  Long edge ≤ 1600 px, JPEG q0.8 → typically 200–400 KB, which keeps the
 *  whole journal inside R2's free tier (~30k photos in 10 GB). */
const MAX_EDGE = 1600
const QUALITY = 0.8

export async function compressImage(file: File): Promise<Blob> {
  // from-image: respects EXIF orientation so phone photos aren't sideways
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file  // ancient browser: upload original
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  )
  return blob ?? file
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit` — Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/compressImage.ts
git commit -m "feat(photos): client-side image compression (1600px JPEG q0.8)"
```

### Task 7: Frontend — API client + types

**Files:**
- Modify: `frontend/src/types/index.ts` (add `PlantPhoto`)
- Modify: `frontend/src/api/client.ts` (add `photos` API group)

- [ ] **Step 1: Add the type** — in `frontend/src/types/index.ts`:

```typescript
export interface PlantPhoto {
  id: number
  plant_id: number
  url: string
  note: string | null
  taken_at: string
  care_log_id: number | null
  species_mismatch: boolean
}
```

- [ ] **Step 2: Add API functions** — in `frontend/src/api/client.ts`, next to the existing `uploadPhoto` (line ~177), following the file's object-group style:

```typescript
export const photos = {
  list: (plantId: number) => api<PlantPhoto[]>('GET', `/plants/${plantId}/photos`),
  upload: (plantId: number, image: Blob, opts: { note?: string; takenAt?: string; careLogId?: number } = {}) => {
    const f = new FormData()
    f.append('file', image, 'photo.jpg')
    if (opts.note) f.append('note', opts.note)
    if (opts.takenAt) f.append('taken_at', opts.takenAt)
    if (opts.careLogId != null) f.append('care_log_id', String(opts.careLogId))
    return api<PlantPhoto>('POST', `/plants/${plantId}/photos`, { form: f })
  },
  updateNote: (photoId: number, note: string) => api<PlantPhoto>('PATCH', `/photos/${photoId}`, { body: { note } }),
  remove: (photoId: number) => api<{ ok: boolean }>('DELETE', `/photos/${photoId}`),
}
```

Import `PlantPhoto` in the type-import line at the top of `client.ts`.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit` — Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts
git commit -m "feat(photos): photos API client + PlantPhoto type"
```

### Task 8: Frontend — Groeidagboek section on PlantDetail + i18n + PR

**Files:**
- Create: `frontend/src/components/plant/PhotoJournal.tsx`
- Modify: `frontend/src/pages/PlantDetail.tsx` (add one `<Section>`)
- Modify: `frontend/src/i18n/nl.ts`, `frontend/src/i18n/en.ts` (and `translations.ts` if keys are typed there)

- [ ] **Step 1: Create `frontend/src/components/plant/PhotoJournal.tsx`**

State: photo list (fetched on mount), uploading flag, full-screen viewer index (`number | null`), compare selection. Match the app's existing card/Tailwind idiom (see `PlantDetail.tsx`'s `Section` + `card` classes).

```tsx
import { useEffect, useRef, useState } from 'react'
import { photos as photosApi } from '../../api/client'
import type { PlantPhoto } from '../../types'
import { compressImage } from '../../utils/compressImage'
import { useTranslation } from '../../i18n/translations'

export default function PhotoJournal({ plantId }: { plantId: number }) {
  const t = useTranslation()
  const [photos, setPhotos] = useState<PlantPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)  // index into photos
  const [compare, setCompare] = useState(false)               // before/after split view
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    photosApi.list(plantId).then(setPhotos).catch(() => setPhotos([]))
  }, [plantId])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const created = await photosApi.upload(plantId, blob)
      setPhotos(prev => [created, ...prev])
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(photo: PlantPhoto) {
    if (!window.confirm(t.photoJournal.deleteConfirm)) return
    await photosApi.remove(photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
    setViewer(null)
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={onPick} />
      <button className="btn-secondary w-full mb-3" disabled={uploading}
              onClick={() => fileRef.current?.click()}>
        {uploading ? t.photoJournal.uploading : t.photoJournal.addPhoto}
      </button>

      {photos.length === 0 ? (
        <p className="text-sm text-muted">{t.photoJournal.empty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p, i) => (
            <button key={p.id} className="relative aspect-square overflow-hidden rounded-lg"
                    onClick={() => setViewer(i)}>
              <img src={p.url} loading="lazy" alt={p.note ?? ''}
                   className="h-full w-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[10px] px-1">
                {new Date(p.taken_at).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {viewer !== null && photos[viewer] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col"
             onClick={() => setViewer(null)}>
          {compare ? (
            // before/after: oldest photo next to the one being viewed
            <div className="flex-1 min-h-0 grid grid-cols-2 gap-0.5">
              <img src={photos[photos.length - 1].url} alt="" className="h-full w-full object-contain" />
              <img src={photos[viewer].url} alt="" className="h-full w-full object-contain" />
            </div>
          ) : (
            <img src={photos[viewer].url} alt=""
                 className="flex-1 object-contain min-h-0" />
          )}
          <div className="p-4 text-white text-sm" onClick={e => e.stopPropagation()}>
            <p>{new Date(photos[viewer].taken_at).toLocaleDateString()}</p>
            {photos[viewer].note && <p className="text-white/80">{photos[viewer].note}</p>}
            <div className="flex gap-4 mt-2">
              <button disabled={viewer >= photos.length - 1}
                      onClick={() => setViewer(v => (v ?? 0) + 1)}>‹ {t.photoJournal.older}</button>
              <button disabled={viewer <= 0}
                      onClick={() => setViewer(v => (v ?? 0) - 1)}>{t.photoJournal.newer} ›</button>
              {photos.length > 1 && (
                <button onClick={() => setCompare(c => !c)}>
                  {compare ? t.photoJournal.compareOff : t.photoJournal.compare}
                </button>
              )}
              <button className="ml-auto text-red-400"
                      onClick={() => onDelete(photos[viewer])}>{t.photoJournal.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

(Adapt `useTranslation` to the project's actual i18n hook — check how `PlantDetail.tsx` obtains `t` and copy that. Button classes likewise: reuse whatever `PlantDetail.tsx` uses, don't invent new ones.)

- [ ] **Step 2: Mount it in `PlantDetail.tsx`** — add a section between Care and Care History (around line 350):

```tsx
<Section title={t.plantDetail.photoJournal}>
  <PhotoJournal plantId={plant.id} />
</Section>
```

with `import PhotoJournal from '../components/plant/PhotoJournal'` at the top.

- [ ] **Step 3: Add i18n strings** — in `nl.ts` and `en.ts` following the file's nesting:

```typescript
// nl.ts
photoJournal: {
  addPhoto: 'Foto toevoegen',
  uploading: 'Uploaden…',
  empty: 'Nog geen foto’s — voeg de eerste toe om de groei te volgen.',
  deleteConfirm: 'Deze foto verwijderen?',
  delete: 'Verwijderen',
  older: 'ouder',
  newer: 'nieuwer',
  compare: 'Vergelijk met eerste',
  compareOff: 'Sluit vergelijking',
},
// + plantDetail.photoJournal: 'Groeidagboek'

// en.ts
photoJournal: {
  addPhoto: 'Add photo',
  uploading: 'Uploading…',
  empty: 'No photos yet — add the first one to track growth.',
  deleteConfirm: 'Delete this photo?',
  delete: 'Delete',
  older: 'older',
  newer: 'newer',
  compare: 'Compare with first',
  compareOff: 'Close comparison',
},
// + plantDetail.photoJournal: 'Growth journal'
```

- [ ] **Step 4: Verify with the real build**

Run: `cd frontend && npm run build` — Expected: build succeeds (CLAUDE.md: tsc alone is not sufficient)

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev` (repo root); open `http://localhost:5173`, open a plant, add a photo, confirm it appears in the grid and as the plant's thumbnail on `/plants`. Delete it, confirm the thumbnail clears.

- [ ] **Step 6: Run full backend test gate + commit + PR**

```bash
cd backend && python -m pytest tests/test_plant_photos.py tests/test_storage.py tests/test_admin_auth.py -q
git add frontend/src/components/plant/PhotoJournal.tsx frontend/src/pages/PlantDetail.tsx frontend/src/i18n/nl.ts frontend/src/i18n/en.ts
git commit -m "feat(photos): Groeidagboek timeline on PlantDetail"
git push -u origin feat/photo-journal
gh pr create --title "feat: plant photo journal (Groeidagboek) — PR 1/3" --body "Core journal per docs/plans/2026-06-10-photo-journal-design.md. Closes the journal part; care integration and BioCLIP follow in PR 2/3."
```

---

## PR 2 — Care integration (branch `feat/photo-journal-care` off master after PR 1 merges)

### Task 9: `/care/done` returns the care_log id

**Files:**
- Modify: `backend/routers/care.py:11-48` (`mark_care_done`)
- Test: `backend/tests/test_care_photo.py` (create)

- [ ] **Step 1: Write the failing test** — create `backend/tests/test_care_photo.py`:

```python
"""PR 2: care-log photos + photo-reminder schedule."""
import pytest
import pytest_asyncio

EXTRA_SCHEMA = """
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_by INTEGER, done_at TEXT, notes TEXT,
        skipped BOOLEAN DEFAULT FALSE
    );
"""


@pytest_asyncio.fixture
async def care_db(seeded_db):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO plants (id, name, household_id) VALUES (1, 'Monstera', 1);
        INSERT INTO users (id, name, household_id) VALUES (1, 'Test', 1);
        INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
        VALUES (1, 'water', 7, '2026-06-10', 1);
    """)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_care_done_returns_care_log_id(client, care_db, auth_header):
    res = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=auth_header,
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body.get("care_log_id"), int)

    rows = await care_db.execute_fetchall(
        "SELECT id FROM care_log WHERE plant_id = 1"
    )
    assert rows[0]["id"] == body["care_log_id"]
```

(If `CareAction` requires more fields, check `models.py` and extend the JSON body accordingly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_care_photo.py -q`
Expected: FAIL — response has no `care_log_id`

- [ ] **Step 3: Implement** — in `mark_care_done` (`backend/routers/care.py`), capture the cursor and include the id in the response:

```python
    cursor = await db.execute(
        """INSERT INTO care_log (plant_id, care_type, done_by, done_at, notes, skipped)
           VALUES (?, ?, ?, ?, ?, FALSE)""",
        (action.plant_id, action.care_type, action.user_id, now, action.notes),
    )
    care_log_id = cursor.lastrowid
    ...
    return {"ok": True, "next_due": str(next_due), "care_log_id": care_log_id}
```

- [ ] **Step 4: Run tests** — `python -m pytest tests/test_care_photo.py -q` — Expected: PASS. Also `python -m pytest tests/test_calendar_events.py -q` must not get *worse* (it has known pre-existing failures; compare before/after).

- [ ] **Step 5: Commit**

```bash
git add backend/routers/care.py backend/tests/test_care_photo.py
git commit -m "feat(care): return care_log_id from /care/done"
```

### Task 10: Photo-reminder schedule (`care_type='photo'`) + auto-complete on upload

**Files:**
- Modify: `backend/routers/plant_photos.py` (toggle endpoint + auto-complete)
- Test: `backend/tests/test_care_photo.py` (append)

- [ ] **Step 1: Write the failing tests** — append to `test_care_photo.py` (reuse `photo_db`-style storage mock; import and copy the `FakeStorage` + monkeypatch fixture from `test_plant_photos.py`, including its `plant_photos` table DDL):

```python
@pytest.mark.asyncio
async def test_photo_reminder_toggle_creates_and_deactivates_schedule(client, photo_db, auth_header):
    db, _ = photo_db
    res = await client.put(
        "/api/plants/1/photo-reminder",
        json={"enabled": True, "interval_days": 30},
        headers=auth_header,
    )
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT interval_days, is_active FROM care_schedules WHERE plant_id = 1 AND care_type = 'photo'"
    )
    assert rows[0]["interval_days"] == 30 and rows[0]["is_active"] == 1

    res = await client.put(
        "/api/plants/1/photo-reminder", json={"enabled": False}, headers=auth_header
    )
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT is_active FROM care_schedules WHERE plant_id = 1 AND care_type = 'photo'"
    )
    assert rows[0]["is_active"] == 0


@pytest.mark.asyncio
async def test_photo_upload_completes_photo_schedule(client, photo_db, auth_header):
    db, _ = photo_db
    await db.execute(
        """INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
           VALUES (1, 'photo', 30, '2026-06-10', 1)"""
    )
    await db.commit()
    res = await _upload(client, 1, headers=auth_header)
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT next_due, last_done FROM care_schedules WHERE plant_id = 1 AND care_type = 'photo'"
    )
    assert rows[0]["last_done"] is not None
    assert rows[0]["next_due"] > "2026-06-10"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_care_photo.py -q` — Expected: new tests FAIL (404 / schedule untouched)

- [ ] **Step 3: Implement** — append to `backend/routers/plant_photos.py`:

```python
from datetime import date, timedelta
from services.scheduling import calculate_next_due


class PhotoReminderToggle(BaseModel):
    enabled: bool
    interval_days: int = 30


@router.put("/plants/{plant_id}/photo-reminder")
async def toggle_photo_reminder(plant_id: int, body: PhotoReminderToggle,
                                db=Depends(db_dep), account=Depends(get_current_account)):
    await _owned_plant(db, plant_id, account["household_id"])
    rows = await db.execute_fetchall(
        "SELECT id FROM care_schedules WHERE plant_id = ? AND care_type = 'photo'",
        (plant_id,),
    )
    if body.enabled:
        next_due = (date.today() + timedelta(days=body.interval_days)).isoformat()
        if rows:
            await db.execute(
                "UPDATE care_schedules SET is_active = 1, interval_days = ?, next_due = ? WHERE id = ?",
                (body.interval_days, next_due, rows[0]["id"]),
            )
        else:
            await db.execute(
                """INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
                   VALUES (?, 'photo', ?, ?, 1)""",
                (plant_id, body.interval_days, next_due),
            )
    elif rows:
        await db.execute(
            "UPDATE care_schedules SET is_active = 0 WHERE id = ?", (rows[0]["id"],)
        )
    await db.commit()
    return {"ok": True}


async def _complete_photo_schedule(db, plant_id: int) -> None:
    """Any uploaded photo counts as the progress photo — push next_due forward."""
    rows = await db.execute_fetchall(
        """SELECT id, interval_days, season_adjust FROM care_schedules
           WHERE plant_id = ? AND care_type = 'photo' AND is_active = 1""",
        (plant_id,),
    )
    if not rows:
        return
    next_due = calculate_next_due(date.today(), rows[0]["interval_days"], rows[0]["season_adjust"])
    await db.execute(
        "UPDATE care_schedules SET last_done = CURRENT_TIMESTAMP, next_due = ? WHERE id = ?",
        (next_due, rows[0]["id"]),
    )
```

and inside `upload_plant_photo`, right after `_sync_thumbnail(...)` and before `db.commit()`:

```python
        await _complete_photo_schedule(db, plant_id)
```

- [ ] **Step 4: Run tests** — `python -m pytest tests/test_care_photo.py tests/test_plant_photos.py -q` — Expected: all PASS

- [ ] **Step 5: Check the dashboard tolerates the new care type** — `grep -rn "'photo'\|water\|fertilize" backend/services/care_task_service.py frontend/src/components/dashboard/ | head`. If care types are whitelisted anywhere (icons, labels, filters), add `photo` with a 📷 icon + `nl`/`en` labels in the same places. If care types flow through generically, nothing to do.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/plant_photos.py backend/tests/test_care_photo.py
git commit -m "feat(photos): photo-reminder schedule + auto-complete on upload"
```

### Task 11: Frontend — photo on care logging + reminder toggle + PR

**Files:**
- Modify: `frontend/src/api/client.ts` (reminder toggle fn; care-done already returns extra field — update its return type)
- Modify: the care-done flow component (find it: `grep -rn "care/done\|markCareDone" frontend/src`) — add optional photo attach
- Modify: `frontend/src/components/plant/PhotoJournal.tsx` (care-tagged photos show a badge; reminder toggle UI)
- Modify: `frontend/src/i18n/nl.ts`, `en.ts`

- [ ] **Step 1: API client additions**

```typescript
// in the photos group
photoReminder: (plantId: number, enabled: boolean, intervalDays = 30) =>
  api<{ ok: boolean }>('PUT', `/plants/${plantId}/photo-reminder`,
    { body: { enabled, interval_days: intervalDays } }),
```

Update the care-done client function's return type to include `care_log_id: number`.

- [ ] **Step 2: Care flow** — in the component that calls care-done (located via the grep above): after a successful log, show a small non-blocking "📷 Foto toevoegen?" affordance; tapping it opens a file input, compresses via `compressImage`, and calls `photosApi.upload(plantId, blob, { careLogId })`. Skipping it does nothing. Reuse the exact upload code shape from `PhotoJournal.onPick`, adding `careLogId`.

- [ ] **Step 3: Journal badge + toggle** — in `PhotoJournal.tsx`: photos with `care_log_id != null` get a small 📷-with-care badge in the grid cell. Add a reminder toggle row above the grid (switch + interval presets 14/30/90 days) calling `photosApi.photoReminder`. Initial toggle state: derive from the plant's schedules if PlantDetail already loads them (it renders a Care section from schedules — pass the `photo` schedule down as a prop), else fetch.

- [ ] **Step 4: i18n** — add to both locales: `photoJournal.reminderLabel` ('Foto-herinnering' / 'Photo reminder'), `photoJournal.addCarePhoto` ('Foto toevoegen?' / 'Add a photo?'), care-type label for `photo` wherever care-type labels live ('Voortgangsfoto' / 'Progress photo').

- [ ] **Step 5: Verify**

Run: `cd frontend && npm run build` — Expected: success.
Manual: log watering on a plant → attach photo → photo appears in timeline with badge; enable reminder → a photo task appears on the dashboard when due.

- [ ] **Step 6: Commit + PR**

```bash
git add -A frontend backend
git commit -m "feat(photos): care-log photos + progress-photo reminder UI"
git push -u origin feat/photo-journal-care
gh pr create --title "feat: care-log photos + progress reminder — PR 2/3" --body "Care integration per docs/plans/2026-06-10-photo-journal-design.md."
```

---

## PR 3 — BioCLIP sanity-check (branch `feat/photo-journal-bioclip` off master after PR 2 merges)

### Task 12: Background species check service

**Files:**
- Create: `backend/services/photo_check.py`
- Modify: `backend/routers/plant_photos.py` (schedule the task)
- Test: `backend/tests/test_photo_check.py`

- [ ] **Step 1: Write the failing tests** — create `backend/tests/test_photo_check.py`:

```python
"""BioCLIP photo sanity-check: embed + identify, flag species mismatches.

The worker is mocked at the httpx layer — these tests never touch the GPU.
"""
import pytest

import services.photo_check as pc


class FakeResponse:
    def __init__(self, status_code=200, json_data=None, content=b""):
        self.status_code = status_code
        self._json = json_data or {}
        self.content = content

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


def _patch_worker(monkeypatch, identify_json, embed_bytes=b"emb"):
    class FakeClient:
        def __init__(self, *a, **kw): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **kw):
            if url.endswith("/identify"):
                return FakeResponse(json_data=identify_json)
            return FakeResponse(content=embed_bytes)
    monkeypatch.setattr(pc.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(pc, "_WORKER_URL", "http://worker.test")


@pytest.mark.asyncio
async def test_match_stores_result_without_flag(monkeypatch):
    _patch_worker(monkeypatch, {"results": [{"species_id": 7, "confidence": 0.9}]})
    out = await pc.check_photo(b"jpeg", plant_species_id=7)
    assert out == {"bioclip_species_id": 7, "bioclip_confidence": 0.9,
                   "species_mismatch": False, "embedding": b"emb"}


@pytest.mark.asyncio
async def test_confident_mismatch_sets_flag(monkeypatch):
    _patch_worker(monkeypatch, {"results": [{"species_id": 3, "confidence": 0.8}]})
    out = await pc.check_photo(b"jpeg", plant_species_id=7)
    assert out["species_mismatch"] is True


@pytest.mark.asyncio
async def test_low_confidence_mismatch_not_flagged(monkeypatch):
    _patch_worker(monkeypatch, {"results": [{"species_id": 3, "confidence": 0.2}]})
    out = await pc.check_photo(b"jpeg", plant_species_id=7)
    assert out["species_mismatch"] is False


@pytest.mark.asyncio
async def test_unknown_plant_species_never_flags(monkeypatch):
    _patch_worker(monkeypatch, {"results": [{"species_id": 3, "confidence": 0.9}]})
    out = await pc.check_photo(b"jpeg", plant_species_id=None)
    assert out["species_mismatch"] is False


@pytest.mark.asyncio
async def test_worker_down_returns_none(monkeypatch):
    monkeypatch.setattr(pc, "_WORKER_URL", "")
    assert await pc.check_photo(b"jpeg", plant_species_id=7) is None
```

**Before implementing:** read `backend/routers/plant_id.py:237-280` and `backend/bioclip_worker.py` to confirm the worker's exact request/response shapes (`/identify` response key names, multipart field name, token header), and adjust the fake JSON above to match reality — the shapes here are the plan's best guess and MUST be verified.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_photo_check.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.photo_check'`

- [ ] **Step 3: Implement** — create `backend/services/photo_check.py` (mirror the worker-call conventions of `routers/plant_id.py`, including the `X-Worker-Token` header):

```python
"""BioCLIP sanity-check for journal photos.

Calls the GPU worker's /identify and /embed-image; returns the fields to
store on the plant_photos row, or None when the worker is not configured
or unreachable. Never raises — a failed check is a non-event.
"""
import logging
import os

import httpx

logger = logging.getLogger(__name__)

_WORKER_URL = os.environ.get("BIOCLIP_WORKER_URL", "")
_WORKER_TOKEN = os.environ.get("BIOCLIP_WORKER_TOKEN", "")
MISMATCH_THRESHOLD = 0.35


async def check_photo(image_bytes: bytes, plant_species_id: int | None) -> dict | None:
    if not _WORKER_URL:
        return None
    headers = {"X-Worker-Token": _WORKER_TOKEN} if _WORKER_TOKEN else {}
    base = _WORKER_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            ident = await client.post(
                f"{base}/identify", headers=headers,
                files={"image": ("photo.jpg", image_bytes, "image/jpeg")},
            )
            ident.raise_for_status()
            emb = await client.post(
                f"{base}/embed-image", headers=headers,
                files={"image": ("photo.jpg", image_bytes, "image/jpeg")},
            )
            emb.raise_for_status()
    except Exception as exc:
        logger.warning("photo check skipped (worker unreachable): %s", exc)
        return None

    results = ident.json().get("results") or []
    top = results[0] if results else None
    species_id = top.get("species_id") if top else None
    confidence = float(top.get("confidence", 0)) if top else 0.0
    mismatch = bool(
        plant_species_id is not None
        and species_id is not None
        and species_id != plant_species_id
        and confidence >= MISMATCH_THRESHOLD
    )
    return {
        "bioclip_species_id": species_id,
        "bioclip_confidence": confidence,
        "species_mismatch": mismatch,
        "embedding": emb.content,
    }
```

- [ ] **Step 4: Run tests** — `python -m pytest tests/test_photo_check.py -q` — Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/photo_check.py backend/tests/test_photo_check.py
git commit -m "feat(photos): BioCLIP photo check service (embed + species sanity)"
```

### Task 13: Wire the check into upload + UI badge + PR

**Files:**
- Modify: `backend/routers/plant_photos.py` (`upload_plant_photo`)
- Modify: `frontend/src/components/plant/PhotoJournal.tsx` (mismatch hint)
- Test: `backend/tests/test_plant_photos.py` (append)

- [ ] **Step 1: Write the failing test** — append to `test_plant_photos.py`:

```python
@pytest.mark.asyncio
async def test_upload_schedules_bioclip_check(client, photo_db, auth_header, monkeypatch):
    db, _ = photo_db
    calls = []

    async def fake_check(image_bytes, plant_species_id):
        calls.append(plant_species_id)
        return {"bioclip_species_id": 3, "bioclip_confidence": 0.8,
                "species_mismatch": True, "embedding": b"emb"}

    monkeypatch.setattr(pp, "check_photo", fake_check)
    res = await _upload(client, 1, headers=auth_header)
    assert res.status_code == 200
    assert calls == [None]  # plant 1 has no species_id in the fixture

    rows = await db.execute_fetchall(
        "SELECT species_mismatch, bioclip_confidence FROM plant_photos WHERE id = ?",
        (res.json()["id"],),
    )
    assert rows[0]["species_mismatch"] == 1
    assert rows[0]["bioclip_confidence"] == 0.8
```

(Background tasks run before the test client returns the response when using `ASGITransport`, so the row is updated by assert time.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_plant_photos.py -q` — Expected: new test FAILS (`pp.check_photo` doesn't exist)

- [ ] **Step 3: Implement** — in `backend/routers/plant_photos.py`:

```python
from services.photo_check import check_photo


async def _run_photo_check(db, photo_id: int, image_bytes: bytes, plant_species_id: int | None):
    result = await check_photo(image_bytes, plant_species_id)
    if result is None:
        return
    await db.execute(
        """UPDATE plant_photos SET bioclip_species_id = ?, bioclip_confidence = ?,
           species_mismatch = ?, embedding = ? WHERE id = ?""",
        (result["bioclip_species_id"], result["bioclip_confidence"],
         result["species_mismatch"], result["embedding"], photo_id),
    )
    await db.commit()
```

and in `upload_plant_photo`, after the commit and before the final SELECT:

```python
    background.add_task(_run_photo_check, db, photo_id, data, plant.get("species_id"))
```

**Caveat for the implementer:** in production each request gets its own DB connection from `db_dep`; verify the connection is still usable inside a background task after the response (it is for the test fixture's shared connection). If the prod adapter closes per-request connections, change `_run_photo_check` to open its own connection instead — look at how `database.py` constructs them.

- [ ] **Step 4: Run tests** — `python -m pytest tests/test_plant_photos.py tests/test_photo_check.py -q` — Expected: all PASS

- [ ] **Step 5: Frontend hint** — in `PhotoJournal.tsx`, on grid cells and in the viewer for photos with `species_mismatch`:

```tsx
{p.species_mismatch && (
  <span title={t.photoJournal.mismatchHint}
        className="absolute top-1 right-1 text-xs bg-amber-500/90 text-white rounded px-1">?</span>
)}
```

i18n: `photoJournal.mismatchHint` = 'Dit lijkt niet op deze plantensoort' / 'This doesn't look like this plant's species'.

- [ ] **Step 6: Verify + commit + PR**

```bash
cd frontend && npm run build
cd ../backend && python -m pytest tests/test_plant_photos.py tests/test_photo_check.py tests/test_care_photo.py -q
git add -A backend frontend
git commit -m "feat(photos): BioCLIP species sanity-check on photo upload"
git push -u origin feat/photo-journal-bioclip
gh pr create --title "feat: BioCLIP photo sanity-check — PR 3/3" --body "Final part of docs/plans/2026-06-10-photo-journal-design.md."
```

---

## Definition of done (whole feature)

- All three PRs merged; `alembic upgrade head` ran on Fly (automatic on deploy).
- A photo taken on a phone lands compressed (~300 KB) in R2 under `photos/{household}/{plant}/`.
- PlantDetail shows the Groeidagboek timeline; newest photo is the plant's thumbnail everywhere.
- Logging care offers photo attach; reminder rides the dashboard like watering.
- A wrong-plant photo shows the amber hint when the GPU worker is up; everything works identically (minus the hint) when it's down.
- No new monthly cost.
