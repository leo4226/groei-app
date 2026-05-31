import json
import os
import re

from fastapi import APIRouter, Depends, HTTPException

from database import db_dep
from auth import get_current_account
from routers.icon_generator import generate_icon_svg, guess_category, derive_common_name, update_manifest

router = APIRouter(tags=["admin-panel"])

ADMIN_EMAIL = "leon_korbee@hotmail.com"

# Use same ICONS_DIR resolution as icons.py
ICONS_DIR = os.environ.get(
    "ICONS_DIR",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "public", "icons")),
)


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


@router.post("/admin-panel/generate-icons")
async def generate_plant_icons(admin=Depends(require_admin), db=Depends(db_dep)):
    """Generate SVGs + update manifest for all species_without_icon that have a latin_name."""
    manifest_path = os.path.join(ICONS_DIR, "manifest.json")
    if not os.path.exists(manifest_path):
        raise HTTPException(500, f"Manifest not found at {manifest_path}")

    # 1. Load existing manifest + build sci→icon_id lookup
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    manifest = data.get("plants", data if isinstance(data, list) else [])

    existing_sci = set()
    for entry in manifest:
        sci = entry.get("sci", "")
        if sci:
            existing_sci.add(sci.strip().lower())

    # 2. Find species with latin_name that have no matching manifest entry
    species_rows = await db.execute_fetchall(
        "SELECT id, common_name_nl, latin_name FROM plant_species WHERE latin_name IS NOT NULL AND latin_name != '' ORDER BY common_name_nl"
    )

    generated: list[dict] = []
    skipped: list[dict] = []

    for row in species_rows:
        latin = row["latin_name"].strip()
        if latin.lower() in existing_sci:
            continue

        name_nl = row["common_name_nl"] or derive_common_name(latin)

        # Auto-detect category from latin name
        cat = guess_category(latin) or guess_category(name_nl) or "houseplant"

        icon_id = name_nl.lower().replace(" ", "_").replace("-", "_")
        icon_id = re.sub(r"[^a-z0-9_]", "", icon_id)

        # Generate SVG
        try:
            svg = generate_icon_svg(
                name=name_nl,
                sci=latin,
                cat=cat,
                form="potted",
                plant_height=50,
                icon_id=icon_id,
            )
        except Exception as e:
            skipped.append({"id": row["id"], "name": name_nl, "latin": latin, "error": str(e)})
            continue

        # Write SVG
        svg_path = os.path.join(ICONS_DIR, f"{icon_id}.svg")
        os.makedirs(ICONS_DIR, exist_ok=True)
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg)

        # Update manifest
        update_manifest(ICONS_DIR, icon_id, name_nl, latin, cat, "potted")

        existing_sci.add(latin.lower())
        generated.append({"id": row["id"], "name": name_nl, "latin": latin, "icon_id": icon_id, "cat": cat})

    # 3. Trigger sync to update plant icon_keys in the DB
    sync_result = await _sync_from_admin(db)

    return {
        "generated": generated,
        "count": len(generated),
        "skipped": skipped,
        "skipped_count": len(skipped),
        "sync_result": sync_result,
    }


async def _sync_from_admin(db):
    """Simplified sync — matches plants without icon_key using manifest entries."""
    import routers.icons as icons_router

    manifest_path = os.path.join(ICONS_DIR, "manifest.json")
    if not os.path.exists(manifest_path):
        return {"matched": 0, "note": "manifest not found"}

    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    manifest = data.get("plants", data if isinstance(data, list) else [])

    # Build lookup the same way icons_router does
    lookup = {}
    for entry in manifest:
        for text in [entry["id"], entry.get("name", ""), entry.get("sci", ""), entry.get("name_nl", "")]:
            if text:
                norm = icons_router._normalize(text)
                lookup[norm] = entry["id"]
    for dutch_norm, icon_id in getattr(icons_router, "DUTCH_TO_ICON", {}).items():
        lookup[icons_router._normalize(dutch_norm)] = icon_id

    plants = await db.execute_fetchall(
        "SELECT id, name, species FROM plants WHERE is_active = 1 AND (icon_key IS NULL OR icon_key = '')"
    )

    matched = []
    for row in plants:
        plant = dict(row)
        found = None
        for text in [plant["name"], plant.get("species") or ""]:
            if not text:
                continue
            norm = icons_router._normalize(text)
            if norm in lookup:
                found = lookup[norm]
                break
            for icon_norm, icon_id in lookup.items():
                if icon_norm and (norm.startswith(icon_norm) or icon_norm.startswith(norm)):
                    found = icon_id
                    break
            if found:
                break
        if found:
            await db.execute(
                "UPDATE plants SET icon_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (found, plant["id"]),
            )
            matched.append({"plant_id": plant["id"], "plant_name": plant["name"], "icon_key": found})

    if matched:
        await db.commit()

    return {"matched": len(matched), "matches": matched}
