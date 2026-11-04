"""Deleting an account without losing the household's history.

Shared by the admin panel, the household "remove member" flow and the
self-service "delete my account" in Settings. The first two used to do this
two different ways — and the household one reassigned the removed member's
whole care log to whoever removed them.

`delete_household_if_empty` removes a household and everything in it once its
last account is gone (admin delete, or a sole owner deleting themselves).

The database carries the same rules since migration 0080 (history keeps its
row and loses the name; per-account rows go with the account). The statements
here spell them out so the intent is readable in one place, and so test
databases without those foreign keys behave the same.

Callers own the transaction.
"""
from __future__ import annotations

from services import integration_snapshot


async def clear_user_references(db, user_id: int) -> None:
    """Keep every record this profile left in the household, minus the name."""
    await db.execute("UPDATE care_log SET done_by = NULL WHERE done_by = ?", (user_id,))
    await db.execute(
        "UPDATE care_schedules SET last_done_by = NULL WHERE last_done_by = ?", (user_id,),
    )
    await db.execute(
        "UPDATE garden_water_log SET watered_by = NULL WHERE watered_by = ?", (user_id,),
    )
    await db.execute(
        "UPDATE garden_fertilize_log SET fertilized_by = NULL WHERE fertilized_by = ?",
        (user_id,),
    )


async def delete_user_profile(db, user_id: int) -> None:
    await clear_user_references(db, user_id)
    await db.execute("DELETE FROM users WHERE id = ?", (user_id,))


async def delete_account(db, account_id: int) -> None:
    """Delete one account, its profile and its personal rows. The household's
    shared data (plants, maps, logs) stays."""
    await db.execute("DELETE FROM password_reset_tokens WHERE account_id = ?", (account_id,))
    await db.execute("DELETE FROM plantnet_quota WHERE account_id = ?", (account_id,))
    await db.execute("DELETE FROM household_invites WHERE created_by = ?", (account_id,))
    await db.execute("DELETE FROM integration_tokens WHERE account_id = ?", (account_id,))
    # Keyed on users.account_id (migration 0073), never on the display name: a
    # name match once deleted an unrelated profile that happened to share it.
    profiles = await db.execute_fetchall(
        "SELECT id FROM users WHERE account_id = ?", (account_id,),
    )
    for row in profiles:
        await delete_user_profile(db, row["id"])
    await db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    # A dashboard's cached snapshot must not outlive the account here.
    integration_snapshot.forget_account(account_id)


async def delete_household_if_empty(db, household_id: int) -> bool:
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

    # Garden-wide water/fertilise logs carry household_id with no delete rule
    # (migration 0034); left in place they block the DELETE FROM households
    # below, so any household that ever logged garden care could not go.
    await db.execute("DELETE FROM garden_water_log WHERE household_id = ?", (household_id,))
    await db.execute("DELETE FROM garden_fertilize_log WHERE household_id = ?", (household_id,))

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
