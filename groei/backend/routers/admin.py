import json

from fastapi import APIRouter, Depends

from database import db_dep
from threshold_service import generate_thresholds
from routers.plants import _seed_care_schedules

router = APIRouter(tags=["admin"])


@router.post("/admin/backfill-thresholds")
async def backfill_thresholds(db = Depends(db_dep)):
    """One-time tool: generate care_thresholds for all plants that don't have them yet."""
    rows = await db.execute_fetchall(
        "SELECT id, name, species FROM plants WHERE care_thresholds IS NULL AND is_active = 1"
    )

    processed = len(rows)
    succeeded = 0
    failures = []

    for row in rows:
        plant_id = row["id"]
        name = row["name"]
        species = row["species"]
        try:
            thresholds = await generate_thresholds(name, species)
            await db.execute(
                "UPDATE plants SET care_thresholds = ? WHERE id = ?",
                (json.dumps(thresholds), plant_id),
            )
            await db.commit()
            succeeded += 1
            print(f"  ✓ Thresholds generated for plant {plant_id} ({name})")
        except Exception as exc:
            failures.append({"plant_id": plant_id, "name": name, "error": str(exc)})
            print(f"  ✗ Failed for plant {plant_id} ({name}): {exc}")

    return {
        "processed": processed,
        "succeeded": succeeded,
        "failed": len(failures),
        "failures": failures,
    }


@router.post("/admin/backfill-care-schedules")
async def backfill_care_schedules(db = Depends(db_dep)):
    """Seed care_schedules for all active plants that have thresholds but no water schedule."""
    rows = await db.execute_fetchall(
        """SELECT p.id, p.care_thresholds FROM plants p
           WHERE p.care_thresholds IS NOT NULL AND p.is_active = 1
           AND p.id NOT IN (
               SELECT DISTINCT plant_id FROM care_schedules WHERE care_type = 'water' AND is_active = 1
           )"""
    )

    seeded = 0
    for row in rows:
        try:
            await _seed_care_schedules(db, row["id"], row["care_thresholds"])
            seeded += 1
        except Exception as exc:
            print(f"Warning: could not seed schedules for plant {row['id']}: {exc}")

    return {"checked": len(rows), "seeded": seeded}
