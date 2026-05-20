DEFAULT_LOCATIONS: list[tuple[str, str, int]] = [
    ("Tuin", "🌿", 0),
    ("Huis", "🏠", 1),
]

from fastapi import APIRouter, Depends, HTTPException, status
from database import db_dep
from models import RegisterInput, LoginInput, AuthResponse, AccountOut
from auth import hash_password, verify_password, create_token, get_current_account

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterInput, db=Depends(db_dep)):
    existing = await db.execute_fetchall(
        "SELECT id FROM accounts WHERE email = ?", (body.email.lower(),)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    household_name = body.household_name.strip() or f"{body.name.strip()}'s Garden"
    cur = await db.execute(
        "INSERT INTO households (name) VALUES (?)", (household_name,)
    )
    household_id = cur.lastrowid

    pw_hash = hash_password(body.password)
    cur2 = await db.execute(
        "INSERT INTO accounts (household_id, email, name, password_hash) VALUES (?, ?, ?, ?)",
        (household_id, body.email.lower(), body.name.strip(), pw_hash),
    )
    account_id = cur2.lastrowid

    # Create default locations for the new household
    for name, icon, sort_order in DEFAULT_LOCATIONS:
        await db.execute(
            "INSERT INTO locations (name, icon, sort_order, household_id) VALUES (?, ?, ?, ?)",
            (name, icon, sort_order, household_id),
        )

    await db.commit()

    token = create_token(account_id=account_id, household_id=household_id)
    return AuthResponse(token=token, account_id=account_id, household_id=household_id, name=body.name.strip())


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginInput, db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, household_id, name, password_hash FROM accounts WHERE email = ?",
        (body.email.lower(),),
    )
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    account = dict(rows[0])
    if not verify_password(body.password, account["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(account_id=account["id"], household_id=account["household_id"])
    return AuthResponse(
        token=token,
        account_id=account["id"],
        household_id=account["household_id"],
        name=account["name"],
    )


@router.get("/me", response_model=AccountOut)
async def me(current=Depends(get_current_account), db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, household_id, email, name, avatar FROM accounts WHERE id = ?",
        (current["account_id"],),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    return dict(rows[0])
