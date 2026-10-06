"""Deleting an account without losing the household's history.

Shared by the admin panel and the household "remove member" flow, which used
to do this two different ways — and the household one reassigned the removed
member's whole care log to whoever removed them.

The database carries the same rules since migration 0080 (history keeps its
row and loses the name; per-account rows go with the account). The statements
here spell them out so the intent is readable in one place, and so test
databases without those foreign keys behave the same.

Callers own the transaction.
"""
from __future__ import annotations


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
    # Keyed on users.account_id (migration 0073), never on the display name: a
    # name match once deleted an unrelated profile that happened to share it.
    profiles = await db.execute_fetchall(
        "SELECT id FROM users WHERE account_id = ?", (account_id,),
    )
    for row in profiles:
        await delete_user_profile(db, row["id"])
    await db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
