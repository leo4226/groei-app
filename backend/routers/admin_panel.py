import re

from fastapi import APIRouter, Depends, HTTPException

from database import db_dep
from auth import get_current_account
from services.svg_validator import validate_icon_svg, SvgValidationError
from services.storage import build_storage_from_env
from services.icon_ai import generate_icon_variants
from services.icon_catalog import load_catalog
from routers.icon_generator import generate_icon_svg, guess_category, derive_common_name
import routers.icons as icons_router

router = APIRouter(tags=["admin-panel"])

ADMIN_EMAIL = "leon_korbee@hotmail.com"


async def require_admin(account=Depends(get_current_account), db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT email FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows or rows[0]["email"] != ADMIN_EMAIL:
        raise HTTPException(403, "Forbidden")
    return {**account, "email": rows[0]["email"]}


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9_]", "", text.lower().replace(" ", "_").replace("-", "_"))
    return s or "plant"


async def _existing_sci(db) -> set[str]:
    """Latin names already covered by curated OR generated icons (normalised)."""
    catalog = await load_catalog(db)
    return {icons_router._normalize(e.get("sci", "")) for e in catalog if e.get("sci")}


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
    """For every plant_species with a latin_name and no matching icon, generate a
    distinctive icon (AI, validated; procedural fallback), store SVGs in R2 and
    metadata in generated_icons, then re-match plants."""
    storage = build_storage_from_env()
    covered = await _existing_sci(db)

    species_rows = await db.execute_fetchall(
        "SELECT id, common_name_nl, latin_name FROM plant_species "
        "WHERE latin_name IS NOT NULL AND latin_name != '' ORDER BY common_name_nl"
    )

    generated, skipped = [], []
    for row in species_rows:
        latin = (row["latin_name"] or "").strip()
        if not latin or icons_router._normalize(latin) in covered:
            continue
        name_nl = row["common_name_nl"] or derive_common_name(latin)
        base_id = f"gen_{_slug(name_nl)}"

        # 1. AI attempt; any failure (validation or otherwise) falls back to procedural.
        source = "ai"
        try:
            ai = await generate_icon_variants(name=name_nl, sci=latin)
            cat = ai.get("cat") or guess_category(latin) or "unknown"
            potted = validate_icon_svg(ai["potted_svg"])
            bare = validate_icon_svg(ai["bare_svg"])
        except Exception:  # noqa: BLE001 — any failure → procedural fallback
            source = "procedural"
            cat = guess_category(latin) or guess_category(name_nl) or "houseplant"
            potted = generate_icon_svg(name=name_nl, sci=latin, cat=cat, form="potted", icon_id=base_id)
            bare = generate_icon_svg(name=name_nl, sci=latin, cat=cat, form="bare", icon_id=base_id)

        # 2. Upload both variants to R2
        try:
            potted_url = storage.put(f"icons/generated/{base_id}.svg", potted.encode("utf-8"), "image/svg+xml")
            bare_url = storage.put(f"icons/generated/{base_id}_bare.svg", bare.encode("utf-8"), "image/svg+xml")
        except Exception as exc:  # noqa: BLE001
            skipped.append({"id": row["id"], "name": name_nl, "latin": latin, "error": f"r2: {exc}"})
            continue

        # 3. Upsert two rows (base potted + bare variant)
        for icon_id, form, variant_of, url in [
            (base_id, "potted", None, potted_url),
            (f"{base_id}_bare", "bare", base_id, bare_url),
        ]:
            await db.execute("DELETE FROM generated_icons WHERE id = ?", (icon_id,))
            await db.execute(
                "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,family,url,source) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (icon_id, name_nl, latin, cat, form, variant_of, "", url, source),
            )
        await db.commit()
        covered.add(icons_router._normalize(latin))
        generated.append({"id": row["id"], "name": name_nl, "latin": latin, "icon_id": base_id, "cat": cat, "source": source})

    sync_result = await _sync_from_admin(db)
    return {"generated": generated, "count": len(generated),
            "skipped": skipped, "skipped_count": len(skipped), "sync_result": sync_result}


async def _sync_from_admin(db):
    """Match flagged plants (icon_requested) against the unified catalog."""
    catalog = await load_catalog(db)
    lookup = {}
    for entry in catalog:
        for text in [entry["id"], entry.get("name", ""), entry.get("sci", ""), entry.get("name_nl", "")]:
            if text:
                lookup[icons_router._normalize(text)] = entry["id"]
    for dutch_norm, icon_id in getattr(icons_router, "DUTCH_TO_ICON", {}).items():
        lookup[icons_router._normalize(dutch_norm)] = icon_id

    plants = await db.execute_fetchall(
        "SELECT id, name, species FROM plants "
        "WHERE is_active = 1 AND icon_requested = TRUE"
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
                "UPDATE plants SET icon_key = ?, icon_requested = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (found, plant["id"]))
            matched.append({"plant_id": plant["id"], "plant_name": plant["name"], "icon_key": found})
    if matched:
        await db.commit()
    return {"matched": len(matched), "matches": matched}
