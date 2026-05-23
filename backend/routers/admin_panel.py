from fastapi import APIRouter, Depends, HTTPException

from database import db_dep
from auth import get_current_account

router = APIRouter(tags=["admin-panel"])

ADMIN_EMAIL = "leon_korbee@hotmail.com"


async def require_admin(account=Depends(get_current_account), db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT email FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows or rows[0]["email"] != ADMIN_EMAIL:
        raise HTTPException(403, "Forbidden")
    return {**account, "email": rows[0]["email"]}


@router.get("/admin-panel/me")
async def admin_me(admin=Depends(require_admin)):
    return {"email": admin["email"], "is_admin": True}


@router.get("/admin-panel/overview")
async def admin_overview(admin=Depends(require_admin), db=Depends(db_dep)):
    total_accounts = (await db.execute_fetchall("SELECT COUNT(*) as n FROM accounts"))[0]["n"]
    total_plants = (await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1"
    ))[0]["n"]
    total_maps = (await db.execute_fetchall("SELECT COUNT(*) as n FROM maps"))[0]["n"]
    missing_icons = (await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1 AND (icon_key IS NULL OR icon_key = '')"
    ))[0]["n"]

    recent_accounts = await db.execute_fetchall("""
        SELECT a.id, a.name, a.email, a.created_at::text, h.name as household_name,
               (SELECT COUNT(*) FROM plants p
                WHERE p.household_id = a.household_id AND p.is_active = 1) as plant_count
        FROM accounts a
        JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC
        LIMIT 10
    """)

    new_accounts = await db.execute_fetchall("""
        SELECT 'account_registered' as kind, a.name as label, h.name as household,
               a.created_at::text as ts
        FROM accounts a JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC LIMIT 5
    """)
    new_plants = await db.execute_fetchall("""
        SELECT 'plant_added' as kind, p.name as label, h.name as household,
               p.created_at::text as ts
        FROM plants p JOIN households h ON p.household_id = h.id
        WHERE p.is_active = 1
        ORDER BY p.created_at DESC LIMIT 5
    """)
    icon_requests = await db.execute_fetchall("""
        SELECT 'icon_requested' as kind, p.name as label, h.name as household,
               p.created_at::text as ts
        FROM plants p JOIN households h ON p.household_id = h.id
        WHERE p.icon_requested = TRUE
        ORDER BY p.created_at DESC LIMIT 5
    """)

    activity = sorted(
        [dict(r) for r in new_accounts] +
        [dict(r) for r in new_plants] +
        [dict(r) for r in icon_requests],
        key=lambda x: x["ts"] or "",
        reverse=True,
    )[:10]

    return {
        "total_accounts": total_accounts,
        "total_plants": total_plants,
        "total_maps": total_maps,
        "missing_icons": missing_icons,
        "recent_accounts": [dict(r) for r in recent_accounts],
        "recent_activity": activity,
    }


@router.get("/admin-panel/users")
async def admin_users(admin=Depends(require_admin), db=Depends(db_dep)):
    rows = await db.execute_fetchall("""
        SELECT
            a.id, a.name, a.email, a.created_at::text as created_at,
            h.id as household_id, h.name as household_name,
            (SELECT COUNT(*) FROM plants p
             WHERE p.household_id = a.household_id AND p.is_active = 1) as plant_count,
            (SELECT COUNT(*) FROM maps m
             WHERE m.household_id = a.household_id) as map_count,
            (SELECT MAX(cl.done_at)::text FROM care_log cl
             JOIN plants p ON cl.plant_id = p.id
             WHERE p.household_id = a.household_id) as last_activity
        FROM accounts a
        JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC
    """)
    return [dict(r) for r in rows]


@router.get("/admin-panel/plants")
async def admin_plants(admin=Depends(require_admin), db=Depends(db_dep)):
    rows = await db.execute_fetchall("""
        SELECT
            p.id, p.name, p.species, p.icon_key, p.phase,
            p.icon_requested,
            (p.care_thresholds IS NOT NULL) as has_thresholds,
            h.name as household_name,
            p.created_at::text as created_at
        FROM plants p
        JOIN households h ON p.household_id = h.id
        WHERE p.is_active = 1
        ORDER BY p.created_at DESC
    """)
    return [dict(r) for r in rows]


@router.get("/admin-panel/species")
async def admin_species(admin=Depends(require_admin), db=Depends(db_dep)):
    rows = await db.execute_fetchall("""
        SELECT
            ps.id, ps.common_name_nl, ps.latin_name,
            (ps.care_thresholds IS NOT NULL) as has_thresholds,
            (ps.latin_name IS NOT NULL) as has_latin_name,
            (SELECT COUNT(*) FROM plants p
             WHERE p.species_id = ps.id AND p.is_active = 1) as plant_count
        FROM plant_species ps
        ORDER BY ps.common_name_nl
    """)
    return [dict(r) for r in rows]


@router.get("/admin-panel/activity")
async def admin_activity(admin=Depends(require_admin), db=Depends(db_dep)):
    new_accounts = await db.execute_fetchall("""
        SELECT 'account_registered' as kind, a.name as label, h.name as household,
               a.created_at::text as ts
        FROM accounts a JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC LIMIT 20
    """)
    new_plants = await db.execute_fetchall("""
        SELECT 'plant_added' as kind, p.name as label, h.name as household,
               p.created_at::text as ts
        FROM plants p JOIN households h ON p.household_id = h.id
        WHERE p.is_active = 1
        ORDER BY p.created_at DESC LIMIT 20
    """)
    icon_requests = await db.execute_fetchall("""
        SELECT 'icon_requested' as kind, p.name as label, h.name as household,
               p.created_at::text as ts
        FROM plants p JOIN households h ON p.household_id = h.id
        WHERE p.icon_requested = TRUE
        ORDER BY p.created_at DESC LIMIT 20
    """)
    care_logs = await db.execute_fetchall("""
        SELECT 'care_log' as kind,
               (cl.care_type || ' · ' || p.name) as label,
               h.name as household,
               cl.done_at::text as ts
        FROM care_log cl
        JOIN plants p ON cl.plant_id = p.id
        JOIN households h ON p.household_id = h.id
        ORDER BY cl.done_at DESC LIMIT 20
    """)

    all_events = (
        [dict(r) for r in new_accounts] +
        [dict(r) for r in new_plants] +
        [dict(r) for r in icon_requests] +
        [dict(r) for r in care_logs]
    )
    all_events.sort(key=lambda x: x["ts"] or "", reverse=True)
    return all_events[:50]
