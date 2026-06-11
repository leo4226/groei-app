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
