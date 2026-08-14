"""Household invite + join endpoints."""

import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from database import db_dep
from models import (
    InviteInput, InviteOutput, JoinInput, AuthResponse, HouseholdUpdate,
    HouseholdMemberOut, HouseholdMemberUpdate, CalendarGroupingPreferencesIn,
    CalendarGroupingPreferencesOut,
)
from services.calendar_grouping import (
    get_calendar_grouping_preferences, save_calendar_grouping_preferences,
)
from auth import hash_password, create_token, get_current_account
import asyncpg

router = APIRouter(prefix="/household", tags=["household"])


def _generate_code(length: int = 6) -> str:
    """Generate a readable alphanumeric invite code."""
    alphabet = string.ascii_uppercase + string.digits
    # Avoid ambiguous characters
    alphabet = alphabet.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.post("/invite", response_model=InviteOutput)
async def create_invite(
    current=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Generate an invite code for the current user's household (7-day expiry)."""
    household_id = current["household_id"]
    account_id = current["account_id"]

    # Remove any existing unused invites for this household (one active at a time)
    await db.execute(
        """DELETE FROM household_invites
           WHERE household_id = ? AND used_at IS NULL""",
        (household_id,),
    )

    # Generate a unique code
    for _ in range(10):
        code = _generate_code()
        existing = await db.execute_fetchall(
            "SELECT id FROM household_invites WHERE code = ?",
            (code,),
        )
        if not existing:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique invite code")

    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7)

    await db.execute(
        """INSERT INTO household_invites (household_id, code, created_by, expires_at)
           VALUES (?, ?, ?, ?)""",
        (household_id, code, account_id, expires_at),
    )
    await db.commit()

    return InviteOutput(code=code, expires_at=expires_at.isoformat())


@router.post("/join", response_model=AuthResponse)
async def join_household(
    body: JoinInput,
    db=Depends(db_dep),
):
    """Join an existing household using an invite code."""
    # 1. Validate the invite code
    invites = await db.execute_fetchall(
        """SELECT id, household_id, expires_at, used_at
           FROM household_invites WHERE code = ?""",
        (body.code.strip().upper(),),
    )
    if not invites:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    invite = dict(invites[0])
    now = datetime.utcnow()

    # Check expiry
    expires = invite["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if now > expires:
        raise HTTPException(status_code=410, detail="Invite code has expired")

    # Check already used
    if invite.get("used_at") is not None:
        raise HTTPException(status_code=410, detail="Invite code has already been used")

    household_id = invite["household_id"]

    # 2. Check email doesn't already exist
    existing = await db.execute_fetchall(
        "SELECT id FROM accounts WHERE email = ?",
        (body.email.lower(),),
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # 3. Create the account with the language chosen on the landing page
    # (NL/EN toggle, Dutch default)
    pw_hash = hash_password(body.password)
    cur = await db.execute(
        """INSERT INTO accounts (household_id, email, name, password_hash, language)
           VALUES (?, ?, ?, ?, ?)""",
        (household_id, body.email.lower(), body.name.strip(), pw_hash, body.language),
    )
    account_id = cur.lastrowid

    # 4. Create a user entry
    try:
        await db.execute(
            "INSERT INTO users (name, household_id, language) VALUES (?, ?, ?)",
            (body.name.strip(), household_id, body.language),
        )
    except asyncpg.exceptions.UniqueViolationError:
        # Roll back the account we just created
        await db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        raise HTTPException(
            status_code=409,
            detail="Deze gebruikersnaam is al in gebruik. Kies een andere naam.",
        )

    # 5. Mark the invite as used
    await db.execute(
        "UPDATE household_invites SET used_at = ? WHERE id = ?",
        (now, invite["id"]),
    )

    await db.commit()

    token = create_token(account_id=account_id, household_id=household_id)
    return AuthResponse(
        token=token,
        account_id=account_id,
        household_id=household_id,
        name=body.name.strip(),
    )


@router.get("/calendar-grouping", response_model=CalendarGroupingPreferencesOut)
async def get_calendar_grouping(
    current=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Return the shared Calendar grouping configuration for this household."""
    return await get_calendar_grouping_preferences(db, current["household_id"])


@router.put("/calendar-grouping", response_model=CalendarGroupingPreferencesOut)
async def update_calendar_grouping(
    body: CalendarGroupingPreferencesIn,
    current=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Save shared Calendar grouping choices after household/map validation."""
    return await save_calendar_grouping_preferences(
        db,
        household_id=current["household_id"],
        rules=[rule.model_dump() for rule in body.rules] if body.rules is not None else None,
        care_types=body.care_types,
        map_ids=body.map_ids,
    )


@router.get("/members")
async def list_members(
    current=Depends(get_current_account),
    db=Depends(db_dep),
):
    """List all accounts in the current household (for the settings page).

    Each row also carries `user_id` — the legacy `users` row that `DELETE
    /household/members/{user_id}` expects — and `is_self`.

    `accounts` and `users` are two id spaces joined only by name (there is no
    FK between them), so *somebody* has to bridge them. That used to be the
    settings page, which matched `users.name === member.name` in the browser
    and would remove the wrong person when two members shared a name. Doing it
    here keeps the guesswork in one server-side place where the household is
    already scoped, and lets the client pass an id it was given.
    """
    rows = await db.execute_fetchall(
        """SELECT a.id, a.name, a.email, a.avatar, a.created_at,
                  u.id AS user_id
           FROM accounts a
           LEFT JOIN users u
             ON u.household_id = a.household_id AND u.name = a.name
           WHERE a.household_id = ?
           ORDER BY a.created_at ASC""",
        (current["household_id"],),
    )
    return [
        {**dict(r), "is_self": r["id"] == current["account_id"]}
        for r in rows
    ]


@router.patch("/members/{member_id}", response_model=HouseholdMemberOut)
async def update_member_profile(
    member_id: int,
    body: HouseholdMemberUpdate,
    current=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Update a household member's account profile and sync care attribution."""
    household_id = current["household_id"]
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Member name cannot be empty")

    rows = await db.execute_fetchall(
        """SELECT id, name, email, avatar, created_at
           FROM accounts WHERE id = ? AND household_id = ?""",
        (member_id, household_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found in your household")
    member = dict(rows[0])

    conflict = await db.execute_fetchall(
        "SELECT id FROM accounts WHERE household_id = ? AND name = ? AND id <> ?",
        (household_id, name, member_id),
    )
    if conflict:
        raise HTTPException(status_code=409, detail="A household member already uses that name")

    avatar = body.avatar.strip() if body.avatar else None
    await db.execute(
        "UPDATE accounts SET name = ?, avatar = ? WHERE id = ?",
        (name, avatar, member_id),
    )

    legacy_rows = await db.execute_fetchall(
        "SELECT id FROM users WHERE household_id = ? AND name = ?",
        (household_id, member["name"]),
    )
    if legacy_rows:
        await db.execute(
            "UPDATE users SET name = ?, avatar = ? WHERE household_id = ? AND name = ?",
            (name, avatar, household_id, member["name"]),
        )
    else:
        await db.execute(
            "INSERT INTO users (name, avatar, household_id, language) VALUES (?, ?, ?, ?)",
            (name, avatar, household_id, "nl"),
        )
    await db.commit()

    return {
        "id": member_id,
        "name": name,
        "email": member["email"],
        "avatar": avatar,
        "created_at": member["created_at"],
    }


@router.delete("/members/{user_id}", status_code=204)
async def remove_member(
    user_id: int,
    current=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Remove a member from the current household by user_id.

    Cleans up both users and accounts tables, plus FK references
    in care_log, care_schedules, garden_water_log, garden_fertilize_log.
    """
    household_id = current["household_id"]
    account_name = current["name"]

    # 1) Look up target user in same household
    target_rows = await db.execute_fetchall(
        "SELECT id, name FROM users WHERE id = ? AND household_id = ?",
        (user_id, household_id),
    )
    if not target_rows:
        raise HTTPException(status_code=404, detail="User not found in your household")
    target_user = target_rows[0]

    # 2) Find current user for self-check and FK reassignment
    current_rows = await db.execute_fetchall(
        "SELECT id FROM users WHERE name = ? AND household_id = ?",
        (account_name, household_id),
    )
    if not current_rows:
        raise HTTPException(status_code=500, detail="Current user record not found")
    current_user_id = current_rows[0]["id"]

    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    # 3) Find corresponding account by (name, household_id)
    account_rows = await db.execute_fetchall(
        "SELECT id FROM accounts WHERE name = ? AND household_id = ?",
        (target_user["name"], household_id),
    )
    account_to_delete = account_rows[0]["id"] if account_rows else None

    # 4) Clean up FK references → reassign NOT NULL columns, NULL others
    await db.execute(
        "UPDATE care_log SET done_by = ? WHERE done_by = ?",
        (current_user_id, user_id),
    )
    await db.execute(
        "UPDATE care_schedules SET last_done_by = NULL WHERE last_done_by = ?",
        (user_id,),
    )
    await db.execute(
        "UPDATE garden_water_log SET watered_by = NULL WHERE watered_by = ?",
        (user_id,),
    )
    await db.execute(
        "UPDATE garden_fertilize_log SET fertilized_by = NULL WHERE fertilized_by = ?",
        (user_id,),
    )

    # 5) Delete user
    await db.execute("DELETE FROM users WHERE id = ?", (user_id,))

    # 6) Delete account if it exists
    if account_to_delete:
        await db.execute("DELETE FROM accounts WHERE id = ?", (account_to_delete,))

    await db.commit()

@router.patch("", status_code=200)
async def rename_household(
    body: HouseholdUpdate,
    current=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Rename the current user's household."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Household name cannot be empty")
    await db.execute(
        "UPDATE households SET name = ? WHERE id = ?",
        (name, current["household_id"]),
    )
    await db.commit()
    return {"name": name}
