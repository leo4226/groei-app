from fastapi import APIRouter, Depends, HTTPException
from database import db_dep
from auth import get_current_account
from models import UserOut, UserLanguageUpdate, UserUpdate

router = APIRouter(tags=["users"])


@router.get("/users", response_model=list[UserOut])
async def list_users(db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute(
        "SELECT id, name, avatar, language FROM users WHERE household_id = ? ORDER BY id",
        (account["household_id"],)
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.patch("/users/{user_id}/language", response_model=UserOut)
async def update_user_language(
    user_id: int,
    body: UserLanguageUpdate,
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    await db.execute(
        "UPDATE users SET language = ? WHERE id = ? AND household_id = ?",
        (body.language, user_id, account["household_id"])
    )
    await db.commit()
    cursor = await db.execute(
        "SELECT id, name, avatar, language FROM users WHERE id = ? AND household_id = ?",
        (user_id, account["household_id"])
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)

@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    """Update name and/or avatar for a user. Only the caller's own household."""
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.avatar is not None:
        updates["avatar"] = body.avatar.strip()

    if not updates:
        # Return current state
        cursor = await db.execute(
            "SELECT id, name, avatar, language FROM users WHERE id = ? AND household_id = ?",
            (user_id, account["household_id"])
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(row)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [user_id, account["household_id"]]
    await db.execute(
        f"UPDATE users SET {set_clause} WHERE id = ? AND household_id = ?",
        tuple(values)
    )
    await db.commit()

    cursor = await db.execute(
        "SELECT id, name, avatar, language FROM users WHERE id = ? AND household_id = ?",
        (user_id, account["household_id"])
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Also update account name if name changed and caller is this user's account
    if body.name is not None:
        # Find the account associated with this user (by matching household)
        account_rows = await db.execute_fetchall(
            "SELECT id FROM accounts WHERE id = ?",
            (account["account_id"],)
        )
        if account_rows:
            await db.execute(
                "UPDATE accounts SET name = ? WHERE id = ?",
                (body.name.strip(), account["account_id"])
            )
            await db.commit()

    return dict(row)