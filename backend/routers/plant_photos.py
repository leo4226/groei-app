"""Photo journal: per-plant photo timeline stored in R2.

plants.photo_path is derived state — always the newest journal photo's URL —
so plant cards, the map view, and the dashboard keep working unchanged.
"""
import time
from datetime import date, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from database import db_dep, get_db as _get_db
from auth import get_current_account
from services.photo_check import check_photo
from services.scheduling import calculate_next_due
from services.storage import build_storage_from_env
from services.local_time import local_today

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


def _parse_taken_at(value: str) -> datetime:
    """Accept ISO timestamps (T or space separated); 422 on garbage.

    Returns a datetime OBJECT — asyncpg requires that for TIMESTAMP columns
    (strings raise DataError at runtime, see CLAUDE.md / #142).
    """
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "taken_at must be an ISO timestamp (YYYY-MM-DDTHH:MM:SS)")


def _iso_t(value) -> str:
    """Serialise a timestamp with the T separator — Safari's Date() rejects spaces."""
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    return str(value).replace(" ", "T")


def _row_to_out(row) -> PhotoOut:
    return PhotoOut(
        id=row["id"], plant_id=row["plant_id"], url=row["url"], note=row["note"],
        taken_at=_iso_t(row["taken_at"]), care_log_id=row["care_log_id"],
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

    ts = _parse_taken_at(taken_at) if taken_at else datetime.now().replace(microsecond=0)
    try:
        cursor = await db.execute(
            """INSERT INTO plant_photos (plant_id, household_id, r2_key, url, note, taken_at, care_log_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (plant_id, account["household_id"], key, url, note, ts, care_log_id),
        )
        photo_id = cursor.lastrowid
        await _sync_thumbnail(db, plant_id)
        await _complete_photo_schedule(db, plant_id)
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

    background.add_task(
        _run_photo_check, photo_id, data, plant.get("species_id"),
        plant_id, account["account_id"], url,
    )

    rows = await db.execute_fetchall("SELECT * FROM plant_photos WHERE id = ?", (photo_id,))
    return _row_to_out(rows[0])


async def _run_photo_check(
    photo_id: int,
    image_bytes: bytes,
    plant_species_id: int | None,
    plant_id: int | None = None,
    account_id: int | None = None,
    photo_url: str | None = None,
) -> None:
    """BioCLIP sanity-check, after the response. Opens its OWN connection:
    the request's pooled connection is already back in the pool by the time
    background tasks run (FastAPI tears down yielded dependencies first).

    The same call also yields an image embedding, which we keep as a user-
    confirmed anchor for the plant's species (#866 phase 2): journal photos are
    the best reference material we have — the user's own plant, in their light,
    across seasons — and the embedding was already being computed and discarded.
    """
    result = await check_photo(image_bytes, plant_species_id)
    if result is None:
        return
    async with _get_db() as task_db:
        await task_db.execute(
            """UPDATE plant_photos SET bioclip_species_id = ?, bioclip_confidence = ?,
               species_mismatch = ?, embedding = ? WHERE id = ?""",
            (result["bioclip_species_id"], result["bioclip_confidence"],
             result["species_mismatch"], result["embedding"], photo_id),
        )
        await task_db.commit()

        # Only anchor photos we have reason to trust: the plant must be linked
        # to a species, and BioCLIP must not be confidently saying this is
        # something else — that disagreement is exactly the case where the
        # label is in doubt, and a doubtful label is worse than no anchor.
        if plant_species_id and not result["species_mismatch"]:
            from services.user_refs import add_anchor

            await add_anchor(
                task_db, plant_species_id, result["embedding"],
                account_id=account_id, photo_url=photo_url, plant_id=plant_id,
            )


class PhotoReminderToggle(BaseModel):
    enabled: bool
    interval_days: int = Field(default=30, ge=1, le=365)


@router.put("/plants/{plant_id}/photo-reminder")
async def toggle_photo_reminder(plant_id: int, body: PhotoReminderToggle,
                                db=Depends(db_dep), account=Depends(get_current_account)):
    """Opt-in progress-photo reminder — rides care_schedules as care_type='photo'."""
    await _owned_plant(db, plant_id, account["household_id"])
    rows = await db.execute_fetchall(
        "SELECT id FROM care_schedules WHERE plant_id = ? AND care_type = 'photo'",
        (plant_id,),
    )
    if body.enabled:
        # date OBJECT, not isoformat — asyncpg rejects strings for DATE (#142)
        next_due = local_today() + timedelta(days=body.interval_days)
        if rows:
            await db.execute(
                "UPDATE care_schedules SET is_active = TRUE, interval_days = ?, next_due = ? WHERE id = ?",
                (body.interval_days, next_due, rows[0]["id"]),
            )
        else:
            await db.execute(
                """INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
                   VALUES (?, 'photo', ?, ?, TRUE)""",
                (plant_id, body.interval_days, next_due),
            )
    elif rows:
        await db.execute(
            "UPDATE care_schedules SET is_active = FALSE WHERE id = ?", (rows[0]["id"],)
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
    next_due = calculate_next_due(local_today(), rows[0]["interval_days"], rows[0]["season_adjust"])
    await db.execute(
        "UPDATE care_schedules SET last_done = CURRENT_TIMESTAMP, next_due = ? WHERE id = ?",
        (next_due, rows[0]["id"]),
    )


@router.get("/plants/{plant_id}/photos", response_model=list[PhotoOut])
async def list_plant_photos(plant_id: int, db=Depends(db_dep), account=Depends(get_current_account)):
    await _owned_plant(db, plant_id, account["household_id"])
    rows = await db.execute_fetchall(
        "SELECT * FROM plant_photos WHERE plant_id = ? ORDER BY taken_at DESC, id DESC",
        (plant_id,),
    )
    return [_row_to_out(r) for r in rows]


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
    taken_at = _parse_taken_at(patch.taken_at) if patch.taken_at is not None else photo["taken_at"]
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

    # A deleted photo must not keep steering identification (#866 phase 2).
    from services.user_refs import retract_photo_anchor

    await retract_photo_anchor(db, photo.get("url"))
    return {"ok": True}
