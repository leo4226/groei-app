import json
from typing import List

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from database import db_dep
from auth import get_current_account, require_admin
from threshold_service import generate_thresholds
from routers.plants import _seed_care_schedules
from routers.icons import load_manifest
from services.admin_audit import log_admin_action

# Every /admin/* route requires the admin account — never add an unprotected route here.
router = APIRouter(tags=["admin"], dependencies=[Depends(require_admin)])


class BulkDeleteRequest(BaseModel):
    account_ids: List[int]


@router.post("/admin/backfill-thresholds")
async def backfill_thresholds(account=Depends(get_current_account), db = Depends(db_dep)):
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

    result = {"processed": processed, "succeeded": succeeded, "failed": len(failures), "failures": failures}
    await log_admin_action(db, account, "backfill_thresholds", target=f"{processed} plants", detail={"succeeded": succeeded, "failed": len(failures)})
    return result


@router.get("/admin/backfill-thresholds/preview")
async def backfill_thresholds_preview(db = Depends(db_dep)):
    """Preview: count plants that backfill-thresholds would process."""
    rows = await db.execute_fetchall(
        "SELECT id FROM plants WHERE care_thresholds IS NULL AND is_active = 1"
    )
    total_active = await db.execute_fetchall(
        "SELECT id FROM plants WHERE is_active = 1"
    )
    return {
        "active_total": len(total_active),
        "missing_thresholds": len(rows),
        "has_thresholds": len(total_active) - len(rows),
    }


@router.post("/admin/backfill-care-schedules")
async def backfill_care_schedules(account=Depends(get_current_account), db = Depends(db_dep)):
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

    result = {"checked": len(rows), "seeded": seeded}
    await log_admin_action(db, account, "backfill_care_schedules", target=f"{len(rows)} plants checked", detail=result)
    return result


@router.post("/admin/backfill-species")
async def backfill_species(db = Depends(db_dep)):
    """Retry species generation for all active plants missing species_id."""
    rows = await db.execute_fetchall(
        "SELECT id, name FROM plants WHERE species_id IS NULL AND is_active = 1"
    )

    processed = len(rows)
    succeeded = 0
    failures = []

    for row in rows:
        plant_id = row["id"]
        plant_name = row["name"]
        try:
            species_id = await get_or_create_species(db, plant_name)
            await db.execute(
                "UPDATE plants SET species_id = $1 WHERE id = $2",
                (species_id, plant_id),
            )
            await db.commit()
            succeeded += 1
            print(f"  ✓ Species created for plant {plant_id} ({plant_name})")
        except Exception as exc:
            failures.append({"plant_id": plant_id, "name": plant_name, "error": str(exc)})
            print(f"  ✗ Failed for plant {plant_id} ({plant_name}): {exc}")

    return {
        "processed": processed,
        "succeeded": succeeded,
        "failed": len(failures),
        "failures": failures,
    }


@router.get("/admin/backfill-species/preview")
async def backfill_species_preview(db = Depends(db_dep)):
    """Preview: count plants missing species_id."""
    rows = await db.execute_fetchall(
        "SELECT id AS plant_id, name FROM plants WHERE species_id IS NULL AND is_active = 1"
    )
    total_active = await db.execute_fetchall(
        "SELECT id FROM plants WHERE is_active = 1"
    )
    return {
        "active_total": len(total_active),
        "missing_species": [dict(r) for r in rows],
        "missing_count": len(rows),
    }


@router.get("/admin/backfill-care-schedules/preview")
async def backfill_care_schedules_preview(db = Depends(db_dep)):
    """Preview: count plants that backfill-care-schedules would seed."""
    rows = await db.execute_fetchall(
        """SELECT p.id FROM plants p
           WHERE p.care_thresholds IS NOT NULL AND p.is_active = 1
           AND p.id NOT IN (
               SELECT DISTINCT plant_id FROM care_schedules WHERE care_type = 'water' AND is_active = 1
           )"""
    )
    total_with_thresholds = await db.execute_fetchall(
        "SELECT id FROM plants WHERE care_thresholds IS NOT NULL AND is_active = 1"
    )
    return {
        "total_with_thresholds": len(total_with_thresholds),
        "missing_schedules": len(rows),
        "has_schedules": len(total_with_thresholds) - len(rows),
    }




@router.get("/admin/backfill-plant-types/preview")
async def backfill_plant_types_preview(db = Depends(db_dep)):
    """Preview: count plants that backfill-plant-types would process."""
    rows = await db.execute_fetchall(
        "SELECT id FROM plants "
        "WHERE plant_type IS NULL AND icon_key IS NOT NULL"
    )
    total = await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1"
    )
    return {
        "total_active_plants": total[0]["n"],
        "missing_plant_type": len(rows),
    }


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
                "UPDATE plants SET plant_type = ? WHERE id = ?",
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


@router.get("/admin/accounts")
async def list_accounts(db = Depends(db_dep)):
    accounts = await db.execute_fetchall("""
        SELECT a.id, a.email, a.name, a.is_admin, a.created_at, h.name as household_name
        FROM accounts a
        JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC
    """)
    rows = []
    for r in accounts:
        row = dict(r)
        row["is_admin"] = bool(row["is_admin"])
        rows.append(row)
    return rows


# NB: /admin/accounts/bulk MUST be defined before /admin/accounts/{account_id},
# or the param route matches "bulk" and 422s (same trap as plants/bulk-archive).
@router.delete("/admin/accounts/bulk")
async def bulk_delete_accounts(
    body: BulkDeleteRequest,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    ids = body.account_ids
    if not ids:
        raise HTTPException(400, "No account_ids provided")
    if account["account_id"] in ids:
        raise HTTPException(400, "Cannot delete your own account")

    placeholders = ", ".join("?" for _ in ids)
    targets = await db.execute_fetchall(
        f"SELECT id, household_id, name FROM accounts WHERE id IN ({placeholders})",
        tuple(ids),
    )
    if len(targets) != len(ids):
        found = {t["id"] for t in targets}
        missing = [i for i in ids if i not in found]
        raise HTTPException(404, f"Accounts not found: {missing}")

    for t in targets:
        await _delete_account(db, dict(t))

    # Households only disappear once their last account is gone.
    households_cleared = 0
    for hid in {t["household_id"] for t in targets}:
        if await _delete_household_if_empty(db, hid):
            households_cleared += 1

    await db.commit()

    names = [t["name"] for t in targets]
    result = {"status": "deleted", "account_ids": ids, "names": names, "households_cleared": households_cleared}
    await log_admin_action(db, account, "bulk_delete_accounts", target=", ".join(names), detail={"account_ids": ids, "households_cleared": households_cleared})
    return result


@router.delete("/admin/accounts/{account_id}")
async def delete_account(account_id: int, account = Depends(get_current_account), db = Depends(db_dep)):
    target = await db.execute_fetchall(
        "SELECT id, household_id, name FROM accounts WHERE id = ?", (account_id,)
    )
    if not target:
        raise HTTPException(404, "Account not found")
    if target[0]["id"] == account["account_id"]:
        raise HTTPException(400, "Cannot delete your own account")

    target_row = dict(target[0])
    household_id = target_row["household_id"]
    await _delete_account(db, target_row)
    household_deleted = await _delete_household_if_empty(db, household_id)
    await db.commit()

    result = {"status": "deleted", "account_id": account_id, "name": target_row["name"], "household_deleted": household_deleted}
    await log_admin_action(db, account, "delete_account", target=f"{target_row['name']} (id={account_id})", detail={"household_deleted": household_deleted})
    return result


async def _delete_account(db, target: dict):
    """Delete one account and everything owned by it personally — but NOT the
    household's shared data. target: {id, household_id, name}."""
    await _cascade_delete_account_links(db, target["id"], target["household_id"])
    await _delete_users_for_account(db, target["name"], target["household_id"])
    await db.execute("DELETE FROM accounts WHERE id = ?", (target["id"],))


async def _delete_users_for_account(db, account_name: str, household_id: int):
    """Delete the users row matching this account (mapped by name + household,
    the same convention household.remove_member uses) after NULL-ing FK refs."""
    rows = await db.execute_fetchall(
        "SELECT id FROM users WHERE name = ? AND household_id = ?",
        (account_name, household_id),
    )
    for row in rows:
        user_id = row["id"]
        await db.execute("UPDATE care_log SET done_by = NULL WHERE done_by = ?", (user_id,))
        await db.execute("UPDATE care_schedules SET last_done_by = NULL WHERE last_done_by = ?", (user_id,))
        await db.execute("UPDATE garden_water_log SET watered_by = NULL WHERE watered_by = ?", (user_id,))
        await db.execute("UPDATE garden_fertilize_log SET fertilized_by = NULL WHERE fertilized_by = ?", (user_id,))
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))


async def _delete_household_if_empty(db, household_id: int) -> bool:
    """Cascade-delete the household's data and row, but only when no accounts
    remain in it. Returns True if the household was deleted."""
    remaining = await db.execute_fetchall(
        "SELECT COUNT(*) as cnt FROM accounts WHERE household_id = ?", (household_id,)
    )
    if remaining[0]["cnt"] > 0:
        return False
    await _cascade_delete_household(db, household_id)
    await db.execute("DELETE FROM households WHERE id = ?", (household_id,))
    return True


async def _cascade_delete_household(db, household_id: int):
    """Delete all data belonging to a household (bottom-up FK-safe order)."""
    # 1. NULL out user references
    await db.execute(
        "UPDATE care_schedules SET last_done_by = NULL "
        "WHERE plant_id IN (SELECT id FROM plants WHERE household_id = ?)",
        (household_id,),
    )
    await db.execute(
        "UPDATE care_log SET done_by = NULL "
        "WHERE plant_id IN (SELECT id FROM plants WHERE household_id = ?)",
        (household_id,),
    )
    await db.execute(
        "UPDATE garden_water_log SET watered_by = NULL "
        "WHERE watered_by IN (SELECT id FROM users WHERE household_id = ?)",
        (household_id,),
    )
    await db.execute(
        "UPDATE garden_fertilize_log SET fertilized_by = NULL "
        "WHERE fertilized_by IN (SELECT id FROM users WHERE household_id = ?)",
        (household_id,),
    )

    # 2. Delete plants (cascades care_schedules + care_log)
    await db.execute("DELETE FROM plants WHERE household_id = ?", (household_id,))

    # 3. Delete map children
    await db.execute(
        "DELETE FROM weed_sightings WHERE map_id IN "
        "(SELECT id FROM maps WHERE household_id = ?)",
        (household_id,),
    )
    await db.execute(
        "DELETE FROM zones WHERE map_id IN "
        "(SELECT id FROM maps WHERE household_id = ?)",
        (household_id,),
    )
    await db.execute(
        "DELETE FROM ground_zones WHERE map_id IN "
        "(SELECT id FROM maps WHERE household_id = ?)",
        (household_id,),
    )
    await db.execute(
        "DELETE FROM objects WHERE map_id IN "
        "(SELECT id FROM maps WHERE household_id = ?)",
        (household_id,),
    )

    # 4. Delete household-scoped tables
    await db.execute("DELETE FROM household_invites WHERE household_id = ?", (household_id,))
    await db.execute("DELETE FROM users WHERE household_id = ?", (household_id,))
    await db.execute("DELETE FROM locations WHERE household_id = ?", (household_id,))
    await db.execute("DELETE FROM maps WHERE household_id = ?", (household_id,))


async def _cascade_delete_account_links(db, account_id: int, household_id: int):
    """Delete records linked directly to an account (FK → accounts). Touches only
    this account's rows — shared household data is handled by the household cascade."""
    await db.execute("DELETE FROM password_reset_tokens WHERE account_id = ?", (account_id,))
    await db.execute("DELETE FROM plantnet_quota WHERE account_id = ?", (account_id,))
    await db.execute("DELETE FROM household_invites WHERE created_by = ?", (account_id,))
