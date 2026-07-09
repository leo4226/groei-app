import asyncio
import os
import re
import time
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import db_dep
from auth import require_admin
from services.svg_validator import validate_icon_svg
from services.storage import build_storage_from_env
from services.icon_ai import generate_icon_variants
from services.icon_catalog import load_catalog
from services.admin_audit import log_admin_action
from services.job_runner import start_job, is_kind_running, mark_stale_jobs_interrupted  # noqa: F401
from routers.icon_generator import (
    generate_icon_svg, guess_category, derive_common_name,
    make_pot, make_ground_shadow, CANVAS,
)
import routers.icons as icons_router

router = APIRouter(tags=["admin-panel"])

HEALTH_CHECK_TIMEOUT_SECONDS = 3.0
DATABASE_HEALTH_CHECK_TIMEOUT_SECONDS = 1.0
_R2_REQUIRED_ENV = (
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
)


def _health(status: str, detail: str, latency_ms: int | None = None) -> dict:
    return {"status": status, "latency_ms": latency_ms, "detail": detail}


def _error_detail(exc: Exception) -> str:
    message = str(exc).strip()
    return message or exc.__class__.__name__


async def _run_health_check(
    check: Callable[[], Awaitable[dict]],
    *,
    timeout: float | None = None,
) -> dict:
    started = time.perf_counter()
    check_timeout = HEALTH_CHECK_TIMEOUT_SECONDS if timeout is None else timeout
    try:
        result = await asyncio.wait_for(check(), timeout=check_timeout)
    except asyncio.TimeoutError:
        return _health(
            "down",
            f"Timed out after {check_timeout:g}s",
            round((time.perf_counter() - started) * 1000),
        )
    except Exception as exc:  # noqa: BLE001 — health checks must isolate failures
        return _health(
            "down",
            _error_detail(exc),
            round((time.perf_counter() - started) * 1000),
        )

    if result.get("latency_ms") is None:
        result["latency_ms"] = round((time.perf_counter() - started) * 1000)
    return result

async def _check_database(db) -> dict:
    await db.execute_fetchall("SELECT 1 as ok")
    return _health("ok", "SELECT 1 succeeded")


async def _check_bioclip_worker() -> dict:
    worker_url = (os.environ.get("BIOCLIP_WORKER_URL") or "").strip()
    if not worker_url:
        return _health("unconfigured", "BIOCLIP_WORKER_URL is not set")

    import httpx

    async with httpx.AsyncClient(timeout=HEALTH_CHECK_TIMEOUT_SECONDS) as client:
        response = await client.get(f"{worker_url.rstrip('/')}/health")

    if response.status_code >= 500:
        return _health("down", f"HTTP {response.status_code} from worker")
    if response.status_code >= 400:
        return _health("degraded", f"HTTP {response.status_code} from worker")

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    worker_status = payload.get("status")
    model_loaded = payload.get("model_loaded")
    embeddings_loaded = payload.get("embeddings_loaded")
    device = payload.get("device") or "unknown"

    status = "ok" if response.is_success else "degraded"
    if worker_status and worker_status != "ok":
        status = "degraded"
    if model_loaded is False or embeddings_loaded is False:
        status = "degraded"

    detail_bits = [f"device={device}"]
    if model_loaded is not None:
        detail_bits.append(f"model_loaded={bool(model_loaded)}")
    if embeddings_loaded is not None:
        detail_bits.append(f"embeddings_loaded={bool(embeddings_loaded)}")
    if worker_status:
        detail_bits.append(f"status={worker_status}")
    return _health(status, "; ".join(detail_bits))


def _missing_env(names: tuple[str, ...]) -> list[str]:
    return [name for name in names if not (os.environ.get(name) or "").strip()]


async def _check_r2_storage() -> dict:
    missing = _missing_env(_R2_REQUIRED_ENV)
    if missing:
        return _health("unconfigured", "Missing " + ", ".join(missing))

    storage = build_storage_from_env()
    health_key = (os.environ.get("R2_HEALTHCHECK_KEY") or "").strip().lstrip("/")

    def _probe() -> tuple[str, str]:
        if health_key:
            response = storage._client.head_object(Bucket=storage.bucket, Key=health_key)  # noqa: SLF001
            code = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            status = "ok" if code is None or 200 <= int(code) < 300 else "degraded"
            return status, f"head_object ok for {health_key}"

        response = storage._client.list_objects_v2(Bucket=storage.bucket, MaxKeys=1)  # noqa: SLF001
        code = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        status = "ok" if code is None or 200 <= int(code) < 300 else "degraded"
        count = response.get("KeyCount", 0)
        return status, f"bucket {storage.bucket} reachable; sampled {count} object(s)"

    status, detail = await asyncio.to_thread(_probe)
    return _health(status, detail)


async def _check_llm_config() -> dict:
    from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

    if not LLM_API_KEY:
        return _health("unconfigured", "NOUS_API_KEY is not set")

    host = urlparse(LLM_CHAT_URL).netloc or "custom endpoint"
    return _health("ok", f"Configured for {LLM_MODEL} via {host}; no live call made")


async def _check_email_config() -> dict:
    if not (os.environ.get("RESEND_API_KEY") or "").strip():
        return _health("unconfigured", "RESEND_API_KEY is not set")
    return _health("ok", "Resend API key configured; no live call made")


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


def _is_procedural_icon(entry: dict) -> bool:
    return entry.get("source") == "procedural"


async def _existing_sci(db) -> set[str]:
    """Latin names already covered by curated OR AI-generated icons.

    Procedural generated icons are fallback placeholders. They make a plant render,
    but they should not block a later AI retry or make the admin preview report
    "0 missing" for species that still only have generic fallback art.
    """
    catalog = await load_catalog(db)
    return {
        icons_router._normalize(e.get("sci", ""))
        for e in catalog
        if e.get("sci") and not _is_procedural_icon(e)
    }


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


def _admin_row(row) -> dict:
    data = dict(row)
    if "is_admin" in data:
        data["is_admin"] = bool(data["is_admin"])
    return data


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
    return {"rows": [_admin_row(r) for r in rows], "total": int(total_row["n"])}


@router.get("/admin-panel/me")
async def admin_me(admin=Depends(require_admin)):
    return {"email": admin["email"], "is_admin": True}


@router.get("/admin-panel/health")
async def admin_health(admin=Depends(require_admin), db=Depends(db_dep)):
    checks: dict[str, tuple[Callable[[], Awaitable[dict]], float | None]] = {
        "database": (lambda: _check_database(db), DATABASE_HEALTH_CHECK_TIMEOUT_SECONDS),
        "bioclip": (_check_bioclip_worker, None),
        "r2": (_check_r2_storage, None),
        "llm": (_check_llm_config, None),
        "email": (_check_email_config, None),
    }
    results = await asyncio.gather(
        *(_run_health_check(check, timeout=timeout) for check, timeout in checks.values()),
        return_exceptions=True,
    )

    response: dict[str, dict] = {}
    for service, result in zip(checks.keys(), results):
        if isinstance(result, Exception):
            response[service] = _health("down", _error_detail(result))
        else:
            response[service] = result
    return response


def _worker_headers() -> dict[str, str]:
    token = (os.environ.get("BIOCLIP_WORKER_TOKEN") or "").strip()
    return {"X-Worker-Token": token} if token else {}


async def _fetch_bioclip_coverage() -> dict:
    worker_url = (os.environ.get("BIOCLIP_WORKER_URL") or "").strip()
    if not worker_url:
        return {
            "status": "unconfigured",
            "detail": "BIOCLIP_WORKER_URL is not set",
            "embedded_species": 0,
            "species_ids": [],
        }

    import httpx

    try:
        async with httpx.AsyncClient(timeout=HEALTH_CHECK_TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{worker_url.rstrip('/')}/coverage",
                headers=_worker_headers(),
            )
    except Exception as exc:  # noqa: BLE001 - coverage should degrade gracefully
        return {
            "status": "down",
            "detail": _error_detail(exc),
            "embedded_species": 0,
            "species_ids": [],
        }

    if response.status_code >= 400:
        return {
            "status": "down",
            "detail": f"HTTP {response.status_code} from worker",
            "embedded_species": 0,
            "species_ids": [],
        }

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    raw_ids = payload.get("species_ids") or []
    species_ids: list[int] = []
    for sid in raw_ids:
        try:
            species_ids.append(int(sid))
        except (TypeError, ValueError):
            continue

    ready = bool(payload.get("ready", True))
    status = "ok" if ready else "degraded"
    detail = payload.get("detail") or f"{len(species_ids)} species embedded"
    return {
        "status": status,
        "detail": detail,
        "embedded_species": int(payload.get("species_count") or len(species_ids)),
        "species_ids": species_ids,
    }


def _has_text(value) -> bool:
    return bool(str(value or "").strip())


def _parse_json_object(raw) -> dict:
    if not raw:
        return {}
    try:
        data = __import__("json").loads(raw)
    except Exception:  # noqa: BLE001 - bad phenology should count as missing data
        return {}
    return data if isinstance(data, dict) else {}


def _small_plant_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "species": row.get("species"),
        "species_id": row.get("species_id"),
        "icon_key": row.get("icon_key"),
        "plant_type": row.get("plant_type"),
    }


@router.get("/admin-panel/coverage")
async def admin_coverage(admin=Depends(require_admin), db=Depends(db_dep)):
    plant_rows = [dict(r) for r in await db.execute_fetchall(
        "SELECT id, name, species, species_id, icon_key, plant_type, is_active FROM plants"
    )]
    active_plants = [p for p in plant_rows if bool(p.get("is_active"))]
    archived_plants = [p for p in plant_rows if not bool(p.get("is_active"))]

    species_rows = [dict(r) for r in await db.execute_fetchall(
        "SELECT id, common_name_nl, common_name_en, latin_name, phenology_json, care_thresholds FROM plant_species"
    )]

    manifest = icons_router.load_manifest()
    valid_icon_ids = {entry.get("id") for entry in manifest if entry.get("id")}

    active_stale_icon_rows = [
        _small_plant_row(p)
        for p in active_plants
        if _has_text(p.get("icon_key")) and p.get("icon_key") not in valid_icon_ids
    ]
    archived_stale_icon_rows = [
        _small_plant_row(p)
        for p in archived_plants
        if _has_text(p.get("icon_key")) and p.get("icon_key") not in valid_icon_ids
    ]
    missing_species_link_rows = [
        _small_plant_row(p) for p in active_plants if p.get("species_id") is None
    ]

    species_stats = {
        "total": len(species_rows),
        "missing_latin_name": 0,
        "missing_common_name_nl": 0,
        "missing_common_name_en": 0,
        "missing_phenology": 0,
        "missing_facts_nl": 0,
        "missing_facts_en": 0,
        "missing_thresholds": 0,
    }
    for row in species_rows:
        if not _has_text(row.get("latin_name")):
            species_stats["missing_latin_name"] += 1
        if not _has_text(row.get("common_name_nl")):
            species_stats["missing_common_name_nl"] += 1
        if not _has_text(row.get("common_name_en")):
            species_stats["missing_common_name_en"] += 1
        if not _has_text(row.get("care_thresholds")):
            species_stats["missing_thresholds"] += 1
        phenology = _parse_json_object(row.get("phenology_json"))
        if not phenology:
            species_stats["missing_phenology"] += 1
        if not _has_text(phenology.get("interesting_facts_nl")):
            species_stats["missing_facts_nl"] += 1
        if not _has_text(phenology.get("interesting_facts_en")):
            species_stats["missing_facts_en"] += 1

    bioclip_worker = await _fetch_bioclip_coverage()
    embedded_ids = set(bioclip_worker.get("species_ids") or [])
    db_missing_ids = set()
    db_missing_rows: list[dict] = []
    active_missing_bioclip = 0
    if bioclip_worker.get("status") == "ok":
        for row in species_rows:
            sid = row.get("id")
            if sid is not None and _has_text(row.get("latin_name")) and int(sid) not in embedded_ids:
                db_missing_ids.add(int(sid))
                if len(db_missing_rows) < 50:
                    db_missing_rows.append({
                        "id": int(sid),
                        "common_name_nl": row.get("common_name_nl"),
                        "latin_name": row.get("latin_name"),
                    })
        active_missing_bioclip = sum(
            1 for p in active_plants
            if p.get("species_id") is not None and int(p["species_id"]) in db_missing_ids
        )

    return {
        "plants": {
            "active_total": len(active_plants),
            "missing_species_link": len(missing_species_link_rows),
            "missing_species_link_rows": missing_species_link_rows[:50],
        },
        "species": species_stats,
        "icons": {
            "active_missing_icon": sum(1 for p in active_plants if not _has_text(p.get("icon_key"))),
            "active_stale_icon_key": len(active_stale_icon_rows),
            "archived_stale_icon_key": len(archived_stale_icon_rows),
            "missing_plant_type": sum(1 for p in active_plants if not _has_text(p.get("plant_type"))),
            "active_stale_icon_rows": active_stale_icon_rows[:50],
            "archived_stale_icon_rows": archived_stale_icon_rows[:50],
        },
        "bioclip": {
            "status": bioclip_worker.get("status"),
            "detail": bioclip_worker.get("detail"),
            "embedded_species": bioclip_worker.get("embedded_species", 0),
            "db_species_missing_from_bioclip": len(db_missing_ids),
            "active_plants_missing_from_bioclip": active_missing_bioclip,
            "missing_species_rows": db_missing_rows,
        },
    }


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
        SELECT a.id, a.name, a.email, a.is_admin, a.created_at::text, h.name as household_name,
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
        "recent_accounts": [_admin_row(r) for r in recent_accounts],
        "recent_activity": activity,
    }

@router.get("/admin-panel/growth-metrics")
async def admin_growth_metrics(
    days: int = Query(30, ge=1, le=365),
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Daily growth metrics over the last N days: signups, plants added, care logs, active households."""
    from collections import defaultdict
    from datetime import date, timedelta

    # Generate complete date series
    today = date.today()
    start_date = today - timedelta(days=days - 1)
    date_series = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]

    # --- 1. Signups per day ---
    signups_raw = await db.execute_fetchall("""
        SELECT DATE(created_at) as d, COUNT(*) as n
        FROM accounts
        WHERE created_at >= $1::date
        GROUP BY DATE(created_at)
        ORDER BY d
    """, (start_date,))
    signups_map: dict[str, int] = {}
    for r in signups_raw:
        signups_map[r["d"]] = r["n"]

    # --- 2. Plants added per day ---
    plants_raw = await db.execute_fetchall("""
        SELECT DATE(created_at) as d, COUNT(*) as n
        FROM plants
        WHERE is_active = 1 AND created_at >= $1::date
        GROUP BY DATE(created_at)
        ORDER BY d
    """, (start_date,))
    plants_map: dict[str, int] = {}
    for r in plants_raw:
        plants_map[r["d"]] = r["n"]

    # --- 3. Care logs per day ---
    care_raw = await db.execute_fetchall("""
        SELECT DATE(done_at) as d, COUNT(*) as n
        FROM care_log
        WHERE done_at >= $1::date
        GROUP BY DATE(done_at)
        ORDER BY d
    """, (start_date,))
    care_map: dict[str, int] = {}
    for r in care_raw:
        care_map[r["d"]] = r["n"]

    # --- 4. Active households (≥1 care log) per day ---
    active_raw = await db.execute_fetchall("""
        SELECT DATE(cl.done_at) as d, COUNT(DISTINCT p.household_id) as n
        FROM care_log cl
        JOIN plants p ON cl.plant_id = p.id
        WHERE cl.done_at >= $1::date
        GROUP BY DATE(cl.done_at)
        ORDER BY d
    """, (start_date,))
    active_map: dict[str, int] = {}
    for r in active_raw:
        active_map[r["d"]] = r["n"]

    # Build the response — fill in zeros for missing dates
    signups = [{"date": d, "count": signups_map.get(d, 0)} for d in date_series]
    plants_added = [{"date": d, "count": plants_map.get(d, 0)} for d in date_series]
    care_logs = [{"date": d, "count": care_map.get(d, 0)} for d in date_series]
    active_households = [{"date": d, "count": active_map.get(d, 0)} for d in date_series]

    # --- Deltas: current period vs previous period of same length ---
    previous_start = start_date - timedelta(days=days)

    # Compute previous period totals using separate queries
    prev_signups_raw = await db.execute_fetchall("""
        SELECT COUNT(*) as n FROM accounts
        WHERE created_at >= $1::date AND created_at < $2::date
    """, (previous_start, start_date))
    prev_plants_raw = await db.execute_fetchall("""
        SELECT COUNT(*) as n FROM plants
        WHERE is_active = 1 AND created_at >= $1::date AND created_at < $2::date
    """, (previous_start, start_date))
    prev_care_raw = await db.execute_fetchall("""
        SELECT COUNT(*) as n FROM care_log
        WHERE done_at >= $1::date AND done_at < $2::date
    """, (previous_start, start_date))
    prev_active_raw = await db.execute_fetchall("""
        SELECT COUNT(DISTINCT p.household_id) as n
        FROM care_log cl
        JOIN plants p ON cl.plant_id = p.id
        WHERE cl.done_at >= $1::date AND cl.done_at < $2::date
    """, (previous_start, start_date))

    current_signups = sum(v["count"] for v in signups)
    current_plants = sum(v["count"] for v in plants_added)
    current_care = sum(v["count"] for v in care_logs)
    current_active = sum(1 for v in active_households if v["count"] > 0)

    prev_signups = prev_signups_raw[0]["n"]
    prev_plants = prev_plants_raw[0]["n"]
    prev_care = prev_care_raw[0]["n"]
    prev_active = prev_active_raw[0]["n"]

    return {
        "days": days,
        "metrics": {
            "signups": signups,
            "plants_added": plants_added,
            "care_logs": care_logs,
            "active_households": active_households,
        },
        "deltas": {
            "signups": current_signups - prev_signups,
            "plants_added": current_plants - prev_plants,
            "care_logs": current_care - prev_care,
            "active_households": current_active - prev_active,
        },
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
                a.id, a.name, a.email, a.is_admin, CAST(a.created_at AS TEXT) as created_at,
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


async def _target_species(
    db,
    *,
    scope: str,
    map_only: bool,
    household_id: int | None = None,
) -> list[dict]:
    """The plant_species rows that need an icon generated, deduped by latin name
    and excluding species already covered by a curated/generated icon.

    scope="all"     → the whole species catalog (every species with a latin name).
    scope="in_use"  → only species linked to this admin household's active plants
                      that still lack a real/AI icon — flagged, placeholdered,
                      icon-less, procedurally generated, OR carrying a dangling
                      icon_key that no longer resolves to a real icon. map_only=True
                      further restricts to plants placed on a map.
    """
    covered = await _existing_sci(db)
    if scope == "in_use":
        valid_ids = {e["id"] for e in await load_catalog(db) if not _is_procedural_icon(e)}
        sql = (
            "SELECT ps.id, ps.common_name_nl, ps.latin_name, p.icon_key, p.icon_requested "
            "FROM plants p JOIN plant_species ps ON p.species_id = ps.id "
            "WHERE p.is_active = 1 AND ps.latin_name IS NOT NULL AND ps.latin_name != '' "
        )
        params: list[object] = []
        if household_id is not None:
            sql += "AND p.household_id = ? "
            params.append(household_id)
        if map_only:
            sql += "AND p.map_id IS NOT NULL "
        rows = await db.execute_fetchall(sql, tuple(params)) if params else await db.execute_fetchall(sql)
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
    targets = await _target_species(db, scope=scope, map_only=map_only, household_id=admin.get("household_id"))
    return {"scope": scope, "map_only": map_only, "count": len(targets)}


@router.post("/admin-panel/generate-icons")
async def generate_plant_icons(scope: str = "all", map_only: bool = False, limit: int = 25,
                               admin=Depends(require_admin), db=Depends(db_dep)):
    """Generate distinctive icons (AI, validated; procedural fallback) for the
    target species, store SVGs in R2 + metadata in generated_icons, then re-match
    plants. `scope`/`map_only` pick the target set (see _target_species); `limit`
    caps how many are processed per run (0 = no cap)."""
    storage = build_storage_from_env()
    targets = await _target_species(db, scope=scope, map_only=map_only, household_id=admin.get("household_id"))
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
    result = {"generated": generated, "count": len(generated),
              "skipped": skipped, "skipped_count": len(skipped), "sync_result": sync_result,
              "scope": scope, "map_only": map_only,
              "remaining": max(0, total_targets - len(generated))}
    await log_admin_action(db, admin, "generate_icons", target=f"scope={scope}", detail={"count": len(generated), "skipped": len(skipped), "scope": scope, "map_only": map_only})
    return result


async def _sync_from_admin(db):
    """Re-match active plants after admin icon generation.

    This uses the same rules as Settings → Sync icons: missing/placeholder/
    dangling icons are assigned a real catalog key, and valid generic/shared icons
    are upgraded when an exact AI-generated icon exists for the plant.
    """
    catalog = await load_catalog(db)
    valid_ids = {e["id"] for e in catalog}
    plants = await db.execute_fetchall(
        "SELECT id, name, species, icon_key, icon_requested FROM plants WHERE is_active = 1"
    )
    matched = []
    for row in plants:
        plant = dict(row)
        found = await icons_router.sync_match_icon_key(db, plant, catalog=catalog, valid_ids=valid_ids)
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
    scope: str = "all",
    map_only: bool = False,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Preview: count species missing either Dutch or English facts."""
    from species_service import preview_missing_facts

    return await preview_missing_facts(
        db,
        scope=scope,
        map_only=map_only,
        household_id=admin.get("household_id"),
    )


@router.post("/admin-panel/backfill-facts")
async def backfill_plant_facts(
    limit: int = 50,
    scope: str = "all",
    map_only: bool = False,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Generate bilingual interesting facts for selected plant_species entries."""
    from species_service import backfill_missing_facts

    result = await backfill_missing_facts(
        db,
        limit=limit,
        scope=scope,
        map_only=map_only,
        household_id=admin.get("household_id"),
    )
    await log_admin_action(
        db,
        admin,
        "backfill_facts",
        target=f"scope={scope};limit={limit}",
        detail={
            "processed": result.get("processed"),
            "updated": result.get("updated"),
            "skipped": result.get("skipped"),
            "scope": scope,
            "map_only": map_only,
        },
    )
    return result


@router.patch("/admin-panel/species/{species_id}")
async def admin_patch_species(
    species_id: int,
    body: dict,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Edit common_name_nl and/or latin_name for a species."""
    from fastapi import HTTPException

    allowed = {"common_name_nl", "latin_name"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    row = await db.execute_fetchall("SELECT id FROM plant_species WHERE id = ?", (species_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Species not found")

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    await db.execute(
        f"UPDATE plant_species SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (*updates.values(), species_id),
    )
    await db.commit()

    updated = await db.execute_fetchall(
        "SELECT id, common_name_nl, latin_name FROM plant_species WHERE id = ?",
        (species_id,),
    )
    row = dict(updated[0])
    await log_admin_action(db, admin, "patch_species", target=f"species/{species_id}", detail={"fields": list(updates.keys()), **updates})
    return row


@router.post("/admin-panel/species/{species_id}/regenerate-thresholds")
async def admin_regenerate_species_thresholds(
    species_id: int,
    propagate: bool = False,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Re-run threshold generation for this species. Optionally propagate to linked plants."""
    from fastapi import HTTPException
    from threshold_service import generate_thresholds
    import json as _json

    row = await db.execute_fetchall(
        "SELECT id, common_name_nl, latin_name FROM plant_species WHERE id = ?",
        (species_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Species not found")

    name = row[0]["common_name_nl"]
    latin = row[0]["latin_name"]

    try:
        thresholds = await generate_thresholds(name, latin)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Threshold generation failed: {exc}") from exc

    thresholds_json = _json.dumps(thresholds, ensure_ascii=False)
    await db.execute(
        "UPDATE plant_species SET care_thresholds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (thresholds_json, species_id),
    )

    plants_updated = 0
    if propagate:
        plant_rows = await db.execute_fetchall(
            "SELECT id FROM plants WHERE species_id = ? AND is_active = 1",
            (species_id,),
        )
        for p in plant_rows:
            await db.execute(
                "UPDATE plants SET care_thresholds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (thresholds_json, p["id"]),
            )
        plants_updated = len(plant_rows)

    await db.commit()
    result = {"species_id": species_id, "name": name, "propagated_to_plants": plants_updated}
    await log_admin_action(db, admin, "regenerate_species_thresholds", target=f"{name} (id={species_id})", detail={"propagate": propagate, "plants_updated": plants_updated})
    return result


@router.post("/admin-panel/species/{species_id}/regenerate-fact")
async def admin_regenerate_species_fact(
    species_id: int,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Re-run the bilingual interesting-fact generator for this species."""
    from fastapi import HTTPException
    from species_service import generate_fact_for_species
    import json as _json

    row = await db.execute_fetchall(
        "SELECT id, common_name_nl, latin_name, phenology_json FROM plant_species WHERE id = ?",
        (species_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Species not found")

    name = row[0]["common_name_nl"]
    latin = row[0]["latin_name"]
    phenology_str = row[0]["phenology_json"]

    try:
        facts = await generate_fact_for_species(name, latin)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Fact generation failed: {exc}") from exc

    fact_nl = (facts.get("fact_nl") or facts.get("interesting_facts_nl") or "").strip()
    fact_en = (facts.get("fact_en") or facts.get("interesting_facts_en") or "").strip()
    if not fact_nl or not fact_en:
        raise HTTPException(status_code=503, detail="LLM returned incomplete bilingual facts")

    try:
        phenology = _json.loads(phenology_str) if phenology_str else {}
    except _json.JSONDecodeError:
        phenology = {}
    if not isinstance(phenology, dict):
        phenology = {}

    phenology["interesting_facts_nl"] = fact_nl
    phenology["interesting_facts_en"] = fact_en
    await db.execute(
        "UPDATE plant_species SET phenology_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (_json.dumps(phenology, ensure_ascii=False), species_id),
    )
    await db.commit()
    await log_admin_action(db, admin, "regenerate_species_fact", target=f"{name} (id={species_id})", detail=None)
    return {"species_id": species_id, "name": name, "fact": fact_nl, "fact_en": fact_en}


class SpeciesMergeRequest(BaseModel):
    source_id: int
    target_id: int


@router.post("/admin-panel/species/merge")
async def admin_merge_species(
    body: SpeciesMergeRequest,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Repoint all plants from source species to target, then delete source."""
    from fastapi import HTTPException

    if body.source_id == body.target_id:
        raise HTTPException(status_code=400, detail="Cannot merge a species into itself")

    source = await db.execute_fetchall(
        "SELECT id, common_name_nl FROM plant_species WHERE id = ?", (body.source_id,)
    )
    target = await db.execute_fetchall(
        "SELECT id, common_name_nl FROM plant_species WHERE id = ?", (body.target_id,)
    )
    if not source:
        raise HTTPException(status_code=404, detail="Source species not found")
    if not target:
        raise HTTPException(status_code=404, detail="Target species not found")

    plant_rows = await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE species_id = ? AND is_active = 1",
        (body.source_id,),
    )
    moved = plant_rows[0]["n"]

    await db.execute(
        "UPDATE plants SET species_id = ?, updated_at = CURRENT_TIMESTAMP WHERE species_id = ?",
        (body.target_id, body.source_id),
    )
    await db.execute("DELETE FROM plant_species WHERE id = ?", (body.source_id,))
    await db.commit()

    result = {
        "merged": True,
        "source_id": body.source_id,
        "source_name": source[0]["common_name_nl"],
        "target_id": body.target_id,
        "target_name": target[0]["common_name_nl"],
        "plants_moved": moved,
    }
    await log_admin_action(db, admin, "merge_species", target=f"{source[0]['common_name_nl']} → {target[0]['common_name_nl']}", detail={"source_id": body.source_id, "target_id": body.target_id, "plants_moved": moved})
    return result


@router.get("/admin-panel/households/{household_id}")
async def admin_household_detail(
    household_id: int,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Household drill-down: accounts, maps, plants, and recent care log."""
    from fastapi import HTTPException

    hh = await db.execute_fetchall(
        "SELECT id, name, CAST(created_at AS TEXT) as created_at FROM households WHERE id = ?",
        (household_id,),
    )
    if not hh:
        raise HTTPException(status_code=404, detail="Household not found")
    hh = dict(hh[0])

    accounts = await db.execute_fetchall(
        """SELECT id, name, email, is_admin, CAST(created_at AS TEXT) as created_at
           FROM accounts WHERE household_id = ? ORDER BY created_at""",
        (household_id,),
    )

    maps = await db.execute_fetchall(
        """SELECT m.id, m.name, m.map_type,
                  (SELECT COUNT(*) FROM plants p WHERE p.map_id = m.id AND p.is_active = 1) as plant_count
           FROM maps m WHERE m.household_id = ? ORDER BY m.name""",
        (household_id,),
    )

    plants = await db.execute_fetchall(
        """SELECT p.id, p.name, p.species, p.icon_key, p.phase,
                  (p.care_thresholds IS NOT NULL) as has_thresholds,
                  CAST(p.created_at AS TEXT) as created_at
           FROM plants p WHERE p.household_id = ? AND p.is_active = 1
           ORDER BY p.created_at DESC""",
        (household_id,),
    )

    care_log = await db.execute_fetchall(
        """SELECT cl.id, p.name as plant_name, cl.care_type, CAST(cl.done_at AS TEXT) as done_at
           FROM care_log cl
           JOIN plants p ON cl.plant_id = p.id
           WHERE p.household_id = ?
           ORDER BY cl.done_at DESC LIMIT 20""",
        (household_id,),
    )

    return {
        "id": hh["id"],
        "name": hh["name"],
        "created_at": hh["created_at"],
        "accounts": [_admin_row(r) for r in accounts],
        "maps": [dict(r) for r in maps],
        "plants": [dict(r) for r in plants],
        "care_log": [dict(r) for r in care_log],
    }


# ── Background job runner functions ──────────────────────────────────────────

async def _run_generate_icons(db, params: dict, on_progress) -> dict:
    scope = params.get("scope", "all")
    map_only = bool(params.get("map_only", False))
    limit = int(params.get("limit", 25))
    household_id = params.get("household_id")

    storage = build_storage_from_env()
    targets = await _target_species(
        db,
        scope=scope,
        map_only=map_only,
        household_id=int(household_id) if household_id is not None else None,
    )
    total_targets = len(targets)
    if limit and limit > 0:
        targets = targets[:limit]

    await on_progress(0, len(targets))
    generated, skipped = [], []
    for i, row in enumerate(targets):
        latin = row["latin_name"]
        name_nl = row["common_name_nl"] or derive_common_name(latin)
        base_id = f"gen_{_slug(name_nl)}"

        source = "ai"
        ai_svgs = None
        for _attempt in range(3):
            try:
                ai = await generate_icon_variants(name=name_nl, sci=latin)
                plant = ai["plant_svg"]
                potted = validate_icon_svg(_compose_icon(plant, potted=True))
                bare = validate_icon_svg(_compose_icon(plant, potted=False))
                cat = ai.get("cat") or guess_category(latin) or "unknown"
                ai_svgs = (potted, bare, cat)
                break
            except Exception:
                continue
        if ai_svgs is not None:
            potted, bare, cat = ai_svgs
        else:
            source = "procedural"
            cat = guess_category(latin) or guess_category(name_nl) or "houseplant"
            potted = generate_icon_svg(name=name_nl, sci=latin, cat=cat, form="potted", icon_id=base_id)
            bare = generate_icon_svg(name=name_nl, sci=latin, cat=cat, form="bare", icon_id=base_id)

        try:
            potted_url = storage.put(f"icons/generated/{base_id}.svg", potted.encode("utf-8"), "image/svg+xml")
            bare_url = storage.put(f"icons/generated/{base_id}_bare.svg", bare.encode("utf-8"), "image/svg+xml")
        except Exception as exc:
            skipped.append({"id": row["id"], "name": name_nl, "latin": latin, "error": f"r2: {exc}"})
            await on_progress(i + 1, len(targets))
            continue

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
        generated.append({"id": row["id"], "name": name_nl, "latin": latin, "icon_id": base_id, "cat": cat, "source": source})
        await on_progress(i + 1, len(targets))

    sync_result = await _sync_from_admin(db)
    return {
        "generated": generated, "count": len(generated),
        "skipped": skipped, "skipped_count": len(skipped),
        "sync_result": sync_result,
        "scope": scope, "map_only": map_only,
        "remaining": max(0, total_targets - len(generated)),
    }


async def _run_backfill_thresholds(db, params: dict, on_progress) -> dict:
    import json as _json
    from threshold_service import generate_thresholds as _gen_thresholds

    rows = await db.execute_fetchall(
        "SELECT id, name, species FROM plants WHERE care_thresholds IS NULL AND is_active = 1"
    )
    total = len(rows)
    await on_progress(0, total)
    succeeded = 0
    failures = []
    for i, row in enumerate(rows):
        try:
            thresholds = await _gen_thresholds(row["name"], row["species"])
            await db.execute(
                "UPDATE plants SET care_thresholds = ? WHERE id = ?",
                (_json.dumps(thresholds), row["id"]),
            )
            succeeded += 1
        except Exception as exc:
            failures.append({"plant_id": row["id"], "name": row["name"], "error": str(exc)})
        await on_progress(i + 1, total)
    return {"processed": total, "succeeded": succeeded, "failed": len(failures)}


async def _run_backfill_care_schedules(db, params: dict, on_progress) -> dict:
    from routers.plants import _seed_care_schedules

    rows = await db.execute_fetchall(
        """SELECT p.id, p.care_thresholds FROM plants p
           WHERE p.care_thresholds IS NOT NULL AND p.is_active = 1
           AND p.id NOT IN (
               SELECT DISTINCT plant_id FROM care_schedules WHERE care_type = 'water' AND is_active = 1
           )"""
    )
    total = len(rows)
    await on_progress(0, total)
    seeded = 0
    for i, row in enumerate(rows):
        try:
            await _seed_care_schedules(db, row["id"], row["care_thresholds"])
            seeded += 1
        except Exception as exc:
            pass
        await on_progress(i + 1, total)
    return {"checked": total, "seeded": seeded}


async def _run_backfill_facts(db, params: dict, on_progress) -> dict:
    from species_service import backfill_missing_facts

    limit = int(params.get("limit", 50))
    scope = str(params.get("scope", "all"))
    map_only = bool(params.get("map_only", False))
    household_id = params.get("household_id")
    await on_progress(0, 1)
    result = await backfill_missing_facts(
        db,
        limit=limit,
        scope=scope,
        map_only=map_only,
        household_id=int(household_id) if household_id is not None else None,
    )
    await on_progress(1, 1)
    return result


async def _run_backfill_plant_types(db, params: dict, on_progress) -> dict:
    await on_progress(0, 1)
    rows = await db.execute_fetchall(
        "SELECT id, name, icon_key FROM plants "
        "WHERE is_active = 1 AND plant_type IS NULL AND icon_key IS NOT NULL"
    )
    from services.icon_catalog import load_catalog as _load_catalog
    catalog = await _load_catalog(db)
    cat_map = {e["id"]: e.get("cat", "houseplant") for e in catalog if e.get("id")}
    updated = 0
    details: list[dict] = []
    skipped_details: list[dict] = []
    for row in rows:
        cat = cat_map.get(row["icon_key"])
        if cat:
            await db.execute(
                "UPDATE plants SET plant_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (cat, row["id"]),
            )
            updated += 1
            details.append({
                "id": row["id"],
                "name": row["name"],
                "icon_key": row["icon_key"],
                "plant_type": cat,
            })
        else:
            skipped_details.append({
                "id": row["id"],
                "name": row["name"],
                "icon_key": row["icon_key"],
                "reason": "icon_key_not_in_catalog",
                "message": "Icon key is not present in the icon catalog",
            })
    await on_progress(1, 1)
    return {
        "found": len(rows),
        "updated": updated,
        "skipped": len(skipped_details),
        "details": details,
        "skipped_details": skipped_details,
    }


_JOB_RUNNERS = {
    "generate_icons":         _run_generate_icons,
    "backfill_thresholds":    _run_backfill_thresholds,
    "backfill_care_schedules": _run_backfill_care_schedules,
    "backfill_facts":         _run_backfill_facts,
    "backfill_plant_types":   _run_backfill_plant_types,
}


class StartJobRequest(BaseModel):
    kind: str
    params: dict = {}


@router.post("/admin-panel/jobs")
async def start_admin_job(
    body: StartJobRequest,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    runner = _JOB_RUNNERS.get(body.kind)
    if runner is None:
        raise HTTPException(status_code=400, detail=f"Unknown job kind: {body.kind!r}")
    if is_kind_running(body.kind):
        raise HTTPException(status_code=409, detail=f"A '{body.kind}' job is already running")
    params = dict(body.params)
    if body.kind in {"backfill_facts", "generate_icons"}:
        params["household_id"] = admin.get("household_id")
    job_id = await start_job(db, admin, body.kind, params, runner)
    return {"job_id": job_id}


@router.get("/admin-panel/jobs")
async def list_admin_jobs(
    limit: int = Query(20, ge=1, le=100),
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    import json as _json

    rows = await db.execute_fetchall(
        """SELECT j.id, j.kind, j.status, j.progress_done, j.progress_total,
                  j.result, j.error,
                  CAST(j.created_at AS TEXT) as created_at,
                  CAST(j.updated_at AS TEXT) as updated_at,
                  a.name as admin_name
           FROM admin_jobs j
           LEFT JOIN accounts a ON j.account_id = a.id
           ORDER BY j.created_at DESC
           LIMIT ?""",
        (limit,),
    )
    result_rows = []
    for r in rows:
        row = dict(r)
        result = row.get("result")
        if isinstance(result, str):
            try:
                row["result"] = _json.loads(result)
            except Exception:
                pass
        result_rows.append(row)
    return result_rows


@router.get("/admin-panel/jobs/{job_id}")
async def get_admin_job(
    job_id: int,
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    import json as _json

    rows = await db.execute_fetchall(
        """SELECT j.id, j.kind, j.status, j.progress_done, j.progress_total,
                  j.result, j.error,
                  CAST(j.created_at AS TEXT) as created_at,
                  CAST(j.updated_at AS TEXT) as updated_at,
                  a.name as admin_name
           FROM admin_jobs j
           LEFT JOIN accounts a ON j.account_id = a.id
           WHERE j.id = ?""",
        (job_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Job not found")
    row = dict(rows[0])
    result = row.get("result")
    if isinstance(result, str):
        try:
            row["result"] = _json.loads(result)
        except Exception:
            pass
    return row


@router.get("/admin-panel/audit")
async def admin_audit(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin=Depends(require_admin),
    db=Depends(db_dep),
):
    """Paginated audit log of all admin actions."""
    import json as _json

    total_row = await db.execute_fetchall("SELECT COUNT(*) as n FROM admin_audit_log")
    total = int(total_row[0]["n"])

    rows = await db.execute_fetchall(
        """SELECT al.id, al.action, al.target, al.detail,
                  CAST(al.created_at AS TEXT) as created_at,
                  a.email as admin_email, a.name as admin_name
           FROM admin_audit_log al
           LEFT JOIN accounts a ON al.account_id = a.id
           ORDER BY al.created_at DESC
           LIMIT ? OFFSET ?""",
        (limit, offset),
    )

    result_rows = []
    for r in rows:
        row = dict(r)
        detail = row.get("detail")
        if isinstance(detail, str):
            try:
                row["detail"] = _json.loads(detail)
            except Exception:
                pass
        elif detail is None:
            row["detail"] = None
        result_rows.append(row)

    return {"rows": result_rows, "total": total}
