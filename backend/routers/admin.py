import json
from typing import List

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from database import db_dep
from auth import get_current_account
from threshold_service import generate_thresholds
from routers.plants import _seed_care_schedules
from routers.icons import load_manifest

router = APIRouter(tags=["admin"])


class BulkDeleteRequest(BaseModel):
    account_ids: List[int]


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


@router.post("/admin/backfill-plant-types")
async def backfill_plant_types(db = Depends(db_dep)):
    """Backfill NULL plant_type from icon manifest cat field."""
    manifest = load_manifest()
    icon_to_cat: dict[str, str] = {
        p["id"]: p["cat"] for p in manifest if "cat" in p and p["cat"]
    }

    rows = await db.execute_fetchall(
        "SELECT id, name, icon_key FROM plants "
        "WHERE plant_type IS NULL AND icon_key IS NOT NULL"
    )

    if not rows:
        return {"status": "ok", "message": "No plants need backfilling", "updated": 0}

    updated = 0
    skipped = 0
    details: list[dict] = []

    for row in rows:
        icon_key = row["icon_key"]
        cat = icon_to_cat.get(icon_key)
        if cat:
            await db.execute(
                "UPDATE plants SET plant_type = $1 WHERE id = $2",
                (cat, row["id"]),
            )
            updated += 1
            details.append({
                "id": row["id"],
                "name": row["name"],
                "icon_key": icon_key,
                "plant_type": cat,
            })
        else:
            skipped += 1

    await db.commit()

    return {
        "status": "ok",
        "found": len(rows),
        "updated": updated,
        "skipped": skipped,
        "details": details,
    }


ADMIN_EMAIL = "leon_korbee@hotmail.com"


@router.get("/admin/accounts")
async def list_accounts(account = Depends(get_current_account), db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, email, name FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows or rows[0]["email"] != ADMIN_EMAIL:
        raise HTTPException(403, "Forbidden")

    accounts = await db.execute_fetchall("""
        SELECT a.id, a.email, a.name, a.created_at, h.name as household_name
        FROM accounts a
        JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC
    """)
    return [dict(r) for r in accounts]


@router.delete("/admin/accounts/{account_id}")
async def delete_account(account_id: int, account = Depends(get_current_account), db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, email, name FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows or rows[0]["email"] != ADMIN_EMAIL:
        raise HTTPException(403, "Forbidden")

    target = await db.execute_fetchall(
        "SELECT id, household_id, name FROM accounts WHERE id = ?", (account_id,)
    )
    if not target:
        raise HTTPException(404, "Account not found")
    if target[0]["id"] == account["account_id"]:
        raise HTTPException(400, "Cannot delete your own account")

    household_id = target[0]["household_id"]
    await _cascade_delete_household(db, household_id)
    await _cascade_delete_account_links(db, account_id, household_id)
    await db.execute("DELETE FROM accounts WHERE id = $1", (account_id,))
    await db.execute("DELETE FROM households WHERE id = $1", (household_id,))
    await db.commit()

    return {"status": "deleted", "account_id": account_id, "name": target[0]["name"]}


@router.delete("/admin/accounts/bulk")
async def bulk_delete_accounts(
    body: BulkDeleteRequest,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    rows = await db.execute_fetchall(
        "SELECT id, email, name FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows or rows[0]["email"] != ADMIN_EMAIL:
        raise HTTPException(403, "Forbidden")

    ids = body.account_ids
    if not ids:
        raise HTTPException(400, "No account_ids provided")
    if account["account_id"] in ids:
        raise HTTPException(400, "Cannot delete your own account")

    # Fetch all targets
    placeholders = ", ".join(f"${i+1}" for i in range(len(ids)))
    targets = await db.execute_fetchall(
        f"SELECT id, household_id, name FROM accounts WHERE id IN ({placeholders})",
        tuple(ids),
    )
    if len(targets) != len(ids):
        found = {t["id"] for t in targets}
        missing = [i for i in ids if i not in found]
        raise HTTPException(404, f"Accounts not found: {missing}")

    # Deduplicate households — only cascade once per household
    seen_households: set[int] = set()
    for t in targets:
        hid = t["household_id"]
        if hid not in seen_households:
            await _cascade_delete_household(db, hid)
            seen_households.add(hid)

    # Delete all specified accounts
    for t in targets:
        await _cascade_delete_account_links(db, t["id"], t["household_id"])
        await db.execute("DELETE FROM accounts WHERE id = $1", (t["id"],))

    # Delete households that now have zero accounts
    for hid in seen_households:
        remaining = await db.execute_fetchall(
            "SELECT COUNT(*) as cnt FROM accounts WHERE household_id = $1", (hid,)
        )
        if remaining[0]["cnt"] == 0:
            await db.execute("DELETE FROM households WHERE id = $1", (hid,))

    await db.commit()

    names = [t["name"] for t in targets]
    return {"status": "deleted", "account_ids": ids, "names": names, "households_cleared": len(seen_households)}


async def _cascade_delete_household(db, household_id: int):
    """Delete all data belonging to a household (bottom-up FK-safe order)."""
    # 1. NULL out user references
    await db.execute(
        "UPDATE care_schedules SET last_done_by = NULL "
        "WHERE plant_id IN (SELECT id FROM plants WHERE household_id = $1)",
        (household_id,),
    )
    await db.execute(
        "UPDATE care_log SET done_by = NULL "
        "WHERE plant_id IN (SELECT id FROM plants WHERE household_id = $1)",
        (household_id,),
    )
    await db.execute(
        "UPDATE garden_water_log SET watered_by = NULL "
        "WHERE watered_by IN (SELECT id FROM users WHERE household_id = $1)",
        (household_id,),
    )
    await db.execute(
        "UPDATE garden_fertilize_log SET fertilized_by = NULL "
        "WHERE fertilized_by IN (SELECT id FROM users WHERE household_id = $1)",
        (household_id,),
    )

    # 2. Delete plants (cascades care_schedules + care_log)
    await db.execute("DELETE FROM plants WHERE household_id = $1", (household_id,))

    # 3. Delete map children
    await db.execute(
        "DELETE FROM weed_sightings WHERE map_id IN "
        "(SELECT id FROM maps WHERE household_id = $1)",
        (household_id,),
    )
    await db.execute(
        "DELETE FROM zones WHERE map_id IN "
        "(SELECT id FROM maps WHERE household_id = $1)",
        (household_id,),
    )
    await db.execute(
        "DELETE FROM ground_zones WHERE map_id IN "
        "(SELECT id FROM maps WHERE household_id = $1)",
        (household_id,),
    )
    await db.execute(
        "DELETE FROM objects WHERE map_id IN "
        "(SELECT id FROM maps WHERE household_id = $1)",
        (household_id,),
    )

    # 4. Delete household-scoped tables
    await db.execute("DELETE FROM users WHERE household_id = $1", (household_id,))
    await db.execute("DELETE FROM locations WHERE household_id = $1", (household_id,))
    await db.execute("DELETE FROM maps WHERE household_id = $1", (household_id,))


async def _cascade_delete_account_links(db, account_id: int, household_id: int):
    """Delete records linked directly to an account (FK → accounts)."""
    await db.execute("DELETE FROM password_reset_tokens WHERE account_id = $1", (account_id,))
    await db.execute("DELETE FROM plantnet_quota WHERE account_id = $1", (account_id,))
    await db.execute(
        "DELETE FROM household_invites WHERE household_id = $1 OR created_by = $2",
        (household_id, account_id),
    )
