import re

from fastapi import APIRouter, Depends, HTTPException

from database import db_dep
from auth import get_current_account
from services.svg_validator import validate_icon_svg
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
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1 AND icon_requested = TRUE"
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


async def _target_species(db, *, scope: str, map_only: bool) -> list[dict]:
    """The plant_species rows that need an icon generated, deduped by latin name
    and excluding species already covered by a curated/generated icon.

    scope="all"     → the whole species catalog (every species with a latin name).
    scope="in_use"  → only species linked to active plants that still lack a real
                      icon (icon_requested / null / placeholder). map_only=True
                      further restricts to plants actually placed on a map.
    """
    covered = await _existing_sci(db)
    if scope == "in_use":
        sql = (
            "SELECT DISTINCT ps.id, ps.common_name_nl, ps.latin_name "
            "FROM plants p JOIN plant_species ps ON p.species_id = ps.id "
            "WHERE p.is_active = 1 "
            "AND (p.icon_requested = TRUE OR p.icon_key IS NULL OR p.icon_key = '' "
            "     OR p.icon_key LIKE 'placeholder%') "
            "AND ps.latin_name IS NOT NULL AND ps.latin_name != '' "
        )
        if map_only:
            sql += "AND p.map_id IS NOT NULL "
        sql += "ORDER BY ps.common_name_nl"
    else:
        sql = (
            "SELECT id, common_name_nl, latin_name FROM plant_species "
            "WHERE latin_name IS NOT NULL AND latin_name != '' ORDER BY common_name_nl"
        )
    rows = await db.execute_fetchall(sql)
    targets: list[dict] = []
    seen = set(covered)
    for row in rows:
        latin = (row["latin_name"] or "").strip()
        norm = icons_router._normalize(latin)
        if not latin or norm in seen:
            continue
        seen.add(norm)
        targets.append({"id": row["id"], "common_name_nl": row["common_name_nl"], "latin_name": latin})
    return targets


@router.get("/admin-panel/generate-icons/preview")
async def generate_icons_preview(scope: str = "all", map_only: bool = False,
                                 admin=Depends(require_admin), db=Depends(db_dep)):
    """How many icons a generate-icons run would create — generates nothing."""
    targets = await _target_species(db, scope=scope, map_only=map_only)
    return {"scope": scope, "map_only": map_only, "count": len(targets)}


@router.post("/admin-panel/generate-icons")
async def generate_plant_icons(scope: str = "all", map_only: bool = False, limit: int = 25,
                               admin=Depends(require_admin), db=Depends(db_dep)):
    """Generate distinctive icons (AI, validated; procedural fallback) for the
    target species, store SVGs in R2 + metadata in generated_icons, then re-match
    plants. `scope`/`map_only` pick the target set (see _target_species); `limit`
    caps how many are processed per run (0 = no cap)."""
    storage = build_storage_from_env()
    targets = await _target_species(db, scope=scope, map_only=map_only)
    total_targets = len(targets)
    if limit and limit > 0:
        targets = targets[:limit]

    generated, skipped = [], []
    for row in targets:
        latin = row["latin_name"]
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
        generated.append({"id": row["id"], "name": name_nl, "latin": latin, "icon_id": base_id, "cat": cat, "source": source})

    sync_result = await _sync_from_admin(db)
    return {"generated": generated, "count": len(generated),
            "skipped": skipped, "skipped_count": len(skipped), "sync_result": sync_result,
            "scope": scope, "map_only": map_only,
            "remaining": max(0, total_targets - len(generated))}


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


@router.post("/admin-panel/backfill-facts")
async def backfill_plant_facts(
    limit: int = 50,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Generate interesting_facts_nl for plant_species entries that lack one."""
    from species_service import backfill_missing_facts
    result = await backfill_missing_facts(db, limit=limit)
    return result
