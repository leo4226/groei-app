from fastapi import APIRouter
from database import get_db
from models import UserOut

router = APIRouter(tags=["users"])


@router.get("/users", response_model=list[UserOut])
async def list_users():
    async with get_db() as db:
        cursor = await db.execute("SELECT id, name, avatar FROM users ORDER BY id")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
