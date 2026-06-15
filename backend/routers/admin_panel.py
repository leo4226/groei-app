import re

from fastapi import APIRouter, Depends, Query

from database import db_dep
from auth import require_admin
from services.svg_validator import validate_icon_svg
from services.storage import build_storage_from_env
from services.icon_ai import generate_icon_variants
from services.icon_catalog import load_catalog
from routers.icon_generator import (
    generate_icon_svg, guess_category, derive_common_name,
    make_pot, make_ground_shadow, CANVAS,
)
import routers.icons as icons_router

router = APIRouter(tags=["admin-panel"])


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9_]", "", text.lower().replace(" ", "_").replace("-", "_"))
    return s or "plant"


def _compose_icon(plant_svg: str, *, potted: bool) -> str:
    """Wrap an AI-generated plant fragment in the canonical 100x100 <svg>, on top
    of the standard curated pot (potted) or a ground shadow (bare). This keeps the
    pot pixel-identical to the curated icons — the AI only ever draws the plant."""
    base = make_pot(50, 46) if potted else make_ground_shadow(50)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" '
        f'width="{CANVAS}" height="{CANVAS}">\n{base}\n{plant_svg}\n</svg>'
    )


async def _existing_sci(db) -> set[str]:
    """Latin names already covered by curated OR generated icons (normalised)."""
    catalog = await load_catalog(db)
    return {icons_router._normalize(e.get("sci", "")) for e in catalog if e.get("sci")}


def _sort_clause(sort: str, direction: str, allowed: dict[str, str], default: str, default_dir: str = "asc") -> str:
    """Build a safe ORDER BY clause from a whitelist.

    Sort keys arrive from the admin UI, so never interpolate them directly.
    Only known keys map to SQL fragments; unknown keys fall back to the default.
    """
    key = sort if sort in allowed else default
    safe_dir = direction.lower() if direction and direction.lower() in {"asc", "desc"} else default_dir
    return f"{allowed[key]} {safe_dir.upper()}"


def _add_search(where: list[str], params: list[object], q: str | None, columns: list[str]) -> None:
    term = (q or "").strip()
    if not term:
        return
    clauses = []
    for column in columns:
        clauses.append(f"LOWER(COALESCE({column}, '')) LIKE LOWER(?)")
        params.append(f"%{term}%")
    where.append("(" + " OR ".join(clauses) + ")")


def _where_sql(where: list[str]) -> str:
    return " WHERE " + " AND ".join(where) if where else ""


async def _fetch_admin_page(
    db,
    *,
    select_sql: str,
    from_sql: str,
    where: list[str],
    params: list[object],
    order_by: str,
    limit: int,
    offset: int,
) -> dict:
    where_sql = _where_sql(where)
    total_row = (await db.execute_fetchall(
        f"SELECT COUNT(*) as n {from_sql}{where_sql}",
        tuple(params),
    ))[0]
    rows = await db.execute_fetchall(
        f"{select_sql} {from_sql}{where_sql} ORDER BY {order_by} LIMIT ? OFFSET ?",
        tuple(params + [limit, offset]),
    )
    return {"rows": [dict(r) for r in rows], "total": int(total_row["n"])}


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
async def admin_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    sort: str = "created_at",
    direction: str = Query("desc", alias="dir"),
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    where: list[str] = []
    params: list[object] = []
    _add_search(where, params, q, ["a.name", "a.email", "h.name"])
    order_by = _sort_clause(
        sort,
        direction,
        {
            "name": "a.name",
            "email": "a.email",
            "household": "h.name",
            "plant_count": "plant_count",
            "map_count": "map_count",
            "last_activity": "last_activity",
            "created_at": "a.created_at",
        },
        "created_at",
        "desc",
    )
    return await _fetch_admin_page(
        db,
        select_sql="""
            SELECT
                a.id, a.name, a.email, CAST(a.created_at AS TEXT) as created_at,
                h.id as household_id, h.name as household_name,
                (SELECT COUNT(*) FROM plants p
                 WHERE p.household_id = a.household_id AND p.is_active = 1) as plant_count,
                (SELECT COUNT(*) FROM maps m
                 WHERE m.household_id = a.household_id) as map_count,
                (SELECT CAST(MAX(cl.done_at) AS TEXT) FROM care_log cl
                 JOIN plants p ON cl.plant_id = p.id
                 WHERE p.household_id = a.household_id) as last_activity
        """,
        from_sql="""
            FROM accounts a
            JOIN households h ON a.household_id = h.id
        """,
        where=where,
        params=params,
        order_by=order_by,
        limit=limit,
        offset=offset,
    )


@router.get("/admin-panel/plants")
async def admin_plants(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    filter: str = "all",
    sort: str = "created_at",
    direction: str = Query("desc", alias="dir"),
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    where: list[str] = ["p.is_active = 1"]
    params: list[object] = []
    _add_search(where, params, q, ["p.name", "p.species", "h.name"])
    if filter == "no_icon":
        where.append("(p.icon_key IS NULL OR p.icon_key = '')")
    elif filter == "no_thresholds":
        where.append("p.care_thresholds IS NULL")
    order_by = _sort_clause(
        sort,
        direction,
        {
            "name": "p.name",
            "species": "p.species",
            "household": "h.name",
            "phase": "p.phase",
            "icon": "p.icon_key",
            "thresholds": "has_thresholds",
            "created_at": "p.created_at",
        },
        "created_at",
        "desc",
    )
    return await _fetch_admin_page(
        db,
        select_sql="""
            SELECT
                p.id, p.name, p.species, p.icon_key, p.phase,
                p.icon_requested,
                (p.care_thresholds IS NOT NULL) as has_thresholds,
                h.name as household_name,
                CAST(p.created_at AS TEXT) as created_at
        """,
        from_sql="""
            FROM plants p
            JOIN households h ON p.household_id = h.id
        """,
        where=where,
        params=params,
        order_by=order_by,
        limit=limit,
        offset=offset,
    )


@router.get("/admin-panel/species")
async def admin_species(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    filter: str = "all",
    sort: str = "common_name",
    direction: str = Query("asc", alias="dir"),
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    where: list[str] = []
    params: list[object] = []
    _add_search(where, params, q, ["ps.common_name_nl", "ps.latin_name"])
    if filter == "no_latin":
        where.append("(ps.latin_name IS NULL OR ps.latin_name = '')")
    elif filter == "no_thresholds":
        where.append("ps.care_thresholds IS NULL")
    order_by = _sort_clause(
        sort,
        direction,
        {
            "common_name": "ps.common_name_nl",
            "latin_name": "ps.latin_name",
            "plant_count": "plant_count",
            "thresholds": "has_thresholds",
        },
        "common_name",
        "asc",
    )
    return await _fetch_admin_page(
        db,
        select_sql="""
            SELECT
                ps.id, ps.common_name_nl, ps.latin_name,
                (ps.care_thresholds IS NOT NULL) as has_thresholds,
                (ps.latin_name IS NOT NULL AND ps.latin_name != '') as has_latin_name,
                (SELECT COUNT(*) FROM plants p
                 WHERE p.species_id = ps.id AND p.is_active = 1) as plant_count
        """,
        from_sql="FROM plant_species ps",
        where=where,
        params=params,
        order_by=order_by,
        limit=limit,
        offset=offset,
    )


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
                      icon — flagged, placeholdered, icon-less, OR carrying a
                      dangling icon_key that no longer resolves to a real icon.
                      map_only=True further restricts to plants placed on a map.
    """
    covered = await _existing_sci(db)
    if scope == "in_use":
        valid_ids = {e["id"] for e in await load_catalog(db)}
        sql = (
            "SELECT ps.id, ps.common_name_nl, ps.latin_name, p.icon_key, p.icon_requested "
            "FROM plants p JOIN plant_species ps ON p.species_id = ps.id "
            "WHERE p.is_active = 1 AND ps.latin_name IS NOT NULL AND ps.latin_name != '' "
        )
        if map_only:
            sql += "AND p.map_id IS NOT NULL "
        rows = await db.execute_fetchall(sql)
        rows = [r for r in rows
                if r["icon_requested"] or icons_router._needs_real_icon(r["icon_key"], valid_ids)]
    else:
        rows = await db.execute_fetchall(
            "SELECT id, common_name_nl, latin_name FROM plant_species "
            "WHERE latin_name IS NOT NULL AND latin_name != '' ORDER BY common_name_nl"
        )
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

        # 1. AI attempt — retry a few times before giving up, because the reasoning
        #    model is non-deterministic (occasional timeout / empty content). Only
        #    fall back to the (category-generic) procedural icon if every try fails.
        source = "ai"
        ai_svgs = None
        for _attempt in range(3):
            try:
                ai = await generate_icon_variants(name=name_nl, sci=latin)
                plant = ai["plant_svg"]
                # Composite the plant onto the standard pot / ground shadow, then
                # validate the finished icon (same pot as every curated icon).
                potted = validate_icon_svg(_compose_icon(plant, potted=True))
                bare = validate_icon_svg(_compose_icon(plant, potted=False))
                cat = ai.get("cat") or guess_category(latin) or "unknown"
                ai_svgs = (potted, bare, cat)
                break
            except Exception:  # noqa: BLE001 — timeout / empty / invalid → retry
                continue
        if ai_svgs is not None:
            potted, bare, cat = ai_svgs
        else:
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
    """Re-match every plant that lacks a usable icon (flagged, placeholdered,
    icon-less, or carrying a dangling key) against the unified catalog, assigning
    a real curated/generated icon when one exists."""
    valid_ids = {e["id"] for e in await load_catalog(db)}
    plants = await db.execute_fetchall(
        "SELECT id, name, species, icon_key, icon_requested FROM plants WHERE is_active = 1"
    )
    matched = []
    for row in plants:
        plant = dict(row)
        if not (plant["icon_requested"] or icons_router._needs_real_icon(plant["icon_key"], valid_ids)):
            continue
        found = await icons_router.match_icon_key(db, plant["name"], plant.get("species"))
        if found and found in valid_ids and not found.startswith("placeholder"):
            await db.execute(
                "UPDATE plants SET icon_key = ?, icon_requested = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (found, plant["id"]))
            matched.append({"plant_id": plant["id"], "plant_name": plant["name"], "icon_key": found})
    if matched:
        await db.commit()
    return {"matched": len(matched), "matches": matched}



@router.get("/admin-panel/backfill-facts/preview")
async def backfill_facts_preview(
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Preview: count species that backfill-facts would process."""
    rows = await db.execute_fetchall(
        "SELECT id FROM plant_species "
        "WHERE phenology_json IS NULL OR phenology_json = '' "
        "   OR phenology_json NOT LIKE '%interesting_facts_nl%'"
    )
    total = await db.execute_fetchall("SELECT COUNT(*) as n FROM plant_species")
    return {
        "total_species": total[0]["n"],
        "missing_facts": len(rows),
    }


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
