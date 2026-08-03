#!/usr/bin/env python3
"""
Floreren Unified Cloud Cost Monitor — Neon + Cloudflare + Fly.io.

One script that reports cost/usage for all three Floreren subscriptions:

  * Neon        — consumption vs Free plan allowances, endpoint/branch inventory
  * Cloudflare  — R2 buckets + paygo-usage line items (42 R2 items, all $0 currently)
  * Fly.io      — machine/app inventory (read-only; billing is dashboard-only)

Stdlib only (urllib, json, subprocess, datetime). No new dependencies.

Tokens are read from the environment first and fall back to:
  * NEON_API_KEY / CLOUDFLARE_API_TOKEN -> froink profile .env (default:
    C:\\Users\\<user>\\AppData\\Local\\hermes\\profiles\\froink\\.env, override with --env-file)
  * FLY_API_TOKEN -> ~/.fly/config.yml `access_token` (flyctl does not pick this
    up on this host; the script injects it itself)

Secrets are never printed.

Usage:
    python scripts/cloud-cost-monitor.py [--json] [--since YYYY-MM-DD]

Exit code is 0 as long as every provider was attempted (missing tokens / API
errors degrade to a "not configured"/error section); non-zero only on
unexpected errors.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NEON_BASE = "https://console.neon.tech/api/v2"
NEON_ORG_ID = os.environ.get("NEON_ORG_ID", "org-calm-sound-88862018")
NEON_PROJECT_ID = os.environ.get("NEON_PROJECT_ID", "old-moon-34518269")
NEON_PROJECT_NAME = "Floreren"

CF_BASE = "https://api.cloudflare.com/client/v4"
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "a90191eee5b628a41d078414421d2ded")

FLY_APPS = ("floreren-api", "leon-ssh-relay")

# Fallback token file (froink profile .env). Override with --env-file.
DEFAULT_ENV_FILE = str(
    Path.home() / "AppData" / "Local" / "hermes" / "profiles" / "froink" / ".env"
)

# Neon plan constants — org switched Launch -> Free on 2026-08-03.
# Free plan (neon.com/docs/introduction/plans): 100 CU-h / project included,
# 0.5 GB storage / project included, 10 branches / project included,
# autoscaling up to 2 CU, scale-to-zero after 5 min idle.
NEON_PLAN = "Free"
PLAN_ALLOWANCES = {
    "compute_hours": 100.0,   # CU-hours included per month
    "storage_gb": 0.5,        # GB included per month
    "extra_branches": 10,     # branches included per month
    "autoscale_max_cu": 2.0,  # endpoints capped at 2 CU
    "scale_to_zero_min": 5,   # idle -> suspend after 5 minutes
}
# Overage pricing (only applies ABOVE the included allowance; under-tier = $0.00)
PRICING = {
    "compute_per_cu_hour": 0.106,      # $ per overage CU-hour
    "storage_per_gb_month": 0.35,      # $ per overage GB-month
    "extra_branch_per_month": 1.50,    # $ per extra branch-month beyond allowance
}
BRANCH_HOURS_PER_MONTH = 730.0  # Neon bills extra_branches_month in branch-hours

CONSUMPTION_METRICS = (
    "compute_unit_seconds,root_branch_bytes_month,child_branch_bytes_month,"
    "instant_restore_bytes_month,snapshot_storage_bytes_month,"
    "public_network_transfer_bytes,private_network_transfer_bytes,"
    "extra_branches_month"
)

GIB = 1024 ** 3


class ProviderError(Exception):
    """A handled provider failure (API error, missing binary, ...)."""


class NotConfigured(Exception):
    """Provider has no usable credential/configuration."""


# ---------------------------------------------------------------------------
# Token / config discovery (never prints secrets)
# ---------------------------------------------------------------------------

def load_env_file(path):
    """Parse a KEY=VALUE env file into a dict (no shell execution)."""
    env = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key:
                    env[key] = value
    except OSError:
        pass
    return env


def get_secret(name, env_file):
    """Secret resolution: process env first, then the fallback env file."""
    value = os.environ.get(name)
    if value:
        return value
    return load_env_file(env_file).get(name)


def get_fly_token():
    """FLY_API_TOKEN from env, else `access_token` in ~/.fly/config.yml."""
    token = os.environ.get("FLY_API_TOKEN")
    if token:
        return token
    cfg = Path.home() / ".fly" / "config.yml"
    try:
        text = cfg.read_text(encoding="utf-8")
    except OSError:
        return None
    m = re.search(r"^\s*access_token\s*:\s*[\"']?([^\"'\s]+)", text, re.MULTILINE)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def api_get(base, path, query, token):
    """GET a JSON API endpoint; raises ProviderError on HTTP/network errors."""
    url = f"{base}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"
    req = Request(url, headers={"Accept": "application/json", "Authorization": f"Bearer {token}"})
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode()
        raise ProviderError(f"HTTP {e.code}: {body[:400]}") from e
    except URLError as e:
        raise ProviderError(f"Network error: {e.reason}") from e


# ---------------------------------------------------------------------------
# Neon
# ---------------------------------------------------------------------------

def _neon_consumption_v2(api_key):
    """V2 consumption API (Launch plan and above). Raises ProviderError on 403."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = api_get(
        NEON_BASE,
        "/consumption_history/v2/projects",
        {
            "org_id": NEON_ORG_ID,
            "from": _since_iso(None),
            "to": now,
            "granularity": "daily",
            "metrics": CONSUMPTION_METRICS,
        },
        api_key,
    )
    totals = {
        "compute_unit_seconds": 0,
        "root_branch_bytes_month": 0,
        "child_branch_bytes_month": 0,
        "instant_restore_bytes_month": 0,
        "snapshot_storage_bytes_month": 0,
        "public_network_transfer_bytes": 0,
        "private_network_transfer_bytes": 0,
        "extra_branches_month": 0,
    }
    periods = []
    for project in data.get("projects", []):
        for period in project.get("periods", []):
            periods.append({
                "period_id": period.get("period_id"),
                "period_plan": period.get("period_plan"),
                "period_start": period.get("period_start"),
                "period_end": period.get("period_end"),
            })
            for c in period.get("consumption", []):
                for m in c.get("metrics", []):
                    name = m.get("metric_name")
                    if name in totals:
                        totals[name] += m.get("value", 0) or 0
    return {
        "source": "v2_consumption_api",
        "compute_cu_seconds": totals["compute_unit_seconds"],
        "root_storage_gb_months": totals["root_branch_bytes_month"] / GIB,
        "child_storage_gb_months": totals["child_branch_bytes_month"] / GIB,
        "pitr_storage_gb_months": totals["instant_restore_bytes_month"] / GIB,
        "snapshot_storage_gb_months": totals["snapshot_storage_bytes_month"] / GIB,
        "public_transfer_gb": totals["public_network_transfer_bytes"] / GIB,
        "private_transfer_gb": totals["private_network_transfer_bytes"] / GIB,
        "extra_branches_branch_hours": totals["extra_branches_month"],
        "periods": periods,
    }


def _neon_consumption_summary(api_key):
    """Free-plan fallback: live usage summary from GET /projects/{id}."""
    data = api_get(NEON_BASE, f"/projects/{NEON_PROJECT_ID}", {}, api_key)
    p = data.get("project", {})
    return {
        "source": "project_summary (v2 consumption API is Launch+ only)",
        "compute_cu_seconds": p.get("compute_time_seconds", 0),
        "active_time_seconds": p.get("active_time_seconds", 0),
        "cpu_used_sec": p.get("cpu_used_sec", 0),
        "storage_bytes": p.get("synthetic_storage_size", 0),
        "data_storage_bytes_hour": p.get("data_storage_bytes_hour", 0),
        "data_transfer_bytes": p.get("data_transfer_bytes", 0),
        "written_data_bytes": p.get("written_data_bytes", 0),
        "consumption_period_start": p.get("consumption_period_start"),
        "consumption_period_end": p.get("consumption_period_end"),
        "compute_last_active_at": p.get("compute_last_active_at"),
    }


def _neon_inventory(api_key):
    endpoints = api_get(
        NEON_BASE, f"/projects/{NEON_PROJECT_ID}/endpoints", {"org_id": NEON_ORG_ID}, api_key
    ).get("endpoints", [])
    branches = api_get(
        NEON_BASE, f"/projects/{NEON_PROJECT_ID}/branches", {"org_id": NEON_ORG_ID}, api_key
    ).get("branches", [])

    eps = [{
        "id": e.get("id"),
        "branch_id": e.get("branch_id"),
        "type": e.get("type"),
        "current_state": e.get("current_state"),
        "autoscaling_limit_min_cu": e.get("autoscaling_limit_min_cu"),
        "autoscaling_limit_max_cu": e.get("autoscaling_limit_max_cu"),
        "suspend_timeout_seconds": e.get("suspend_timeout_seconds"),
    } for e in endpoints]

    branches_out = [{
        "id": b.get("id"),
        "name": b.get("name"),
        "updated_at": b.get("updated_at"),
    } for b in branches]

    ep_branch_ids = {e["branch_id"] for e in eps}
    for b in branches_out:
        b["has_endpoint"] = b["id"] in ep_branch_ids

    return {"endpoints": eps, "branches": branches_out}


def collect_neon(api_key, env_file):
    """Returns the Neon section dict. Raises NotConfigured/ProviderError."""
    if not api_key:
        raise NotConfigured("NEON_API_KEY not found (env or froink .env)")

    result = {
        "status": "ok",
        "plan": NEON_PLAN,
        "allowances": PLAN_ALLOWANCES,
        "pricing": PRICING,
        "inventory": _neon_inventory(api_key),
    }

    # Usage: prefer V2 consumption API, fall back to the Free-accessible
    # project usage summary when the plan gates the V2 endpoint (403).
    try:
        result["consumption"] = _neon_consumption_v2(api_key)
    except ProviderError as e:
        if "403" in str(e):
            result["consumption"] = _neon_consumption_summary(api_key)
            result["consumption"]["v2_note"] = (
                "V2 consumption API returned 403 (\"included with Launch plans and above\"); "
                "using the Free-accessible project usage summary instead."
            )
        else:
            raise

    cons = result["consumption"]

    # Honesty flag for the Free-plan fallback: the project usage summary may
    # return unpopulated ZEROS for the compute fields (compute_time_seconds,
    # active_time_seconds, cpu_used_sec) even while endpoints are active in this
    # period — the V2 consumption API (which does populate these) is Launch+ and
    # 403s on Free. A bare "0.00 CU-h" would read as measured-zero, so flag it.
    # Storage (synthetic_storage_size) IS measured and stays authoritative.
    if not cons["source"].startswith("v2"):
        eps = result["inventory"]["endpoints"]
        any_active = any(
            e.get("current_state") not in (None, "idle", "suspended", "broken", "deleted")
            for e in eps
        )
        compute_unmeasured = (
            (cons.get("compute_cu_seconds") or 0) == 0
            and (cons.get("active_time_seconds") or 0) == 0
            and (cons.get("cpu_used_sec") or 0) == 0
            and (bool(cons.get("compute_last_active_at")) or any_active)
        )
        cons["compute_available"] = not compute_unmeasured
        if compute_unmeasured:
            cons["compute_note"] = (
                "compute usage niet beschikbaar via API op Free: V2 consumption is "
                "Launch+ (403) en de project summary rapporteert 0 CU-h terwijl de "
                "endpoints actief zijn (metrics kunnen tot ~1h achterlopen). Check de "
                "Neon console voor live verbruik. Storage hieronder is wél gemeten."
            )
    else:
        cons["compute_available"] = True

    if cons["source"].startswith("v2"):
        cu_hours = cons["compute_cu_seconds"] / 3600.0
        storage_gb = (
            cons["root_storage_gb_months"] + cons["child_storage_gb_months"]
            + cons["pitr_storage_gb_months"] + cons["snapshot_storage_gb_months"]
        )
        branch_months = cons["extra_branches_branch_hours"] / BRANCH_HOURS_PER_MONTH
    else:
        cu_hours = cons["compute_cu_seconds"] / 3600.0
        storage_gb = cons["storage_bytes"] / GIB  # current size, not GB-months
        # project summary has no branch-hours; count child branches from inventory
        branch_months = max(0, len(result["inventory"]["branches"]) - 1)

    overage_cu = max(0.0, cu_hours - PLAN_ALLOWANCES["compute_hours"])
    overage_storage = max(0.0, storage_gb - PLAN_ALLOWANCES["storage_gb"])
    overage_branches = max(0.0, branch_months - PLAN_ALLOWANCES["extra_branches"])

    compute_cost = overage_cu * PRICING["compute_per_cu_hour"]
    storage_cost = overage_storage * PRICING["storage_per_gb_month"]
    branch_cost = overage_branches * PRICING["extra_branch_per_month"]

    result["usage"] = {
        "cu_hours": round(cu_hours, 4),
        "storage_gb": round(storage_gb, 6),
        "branch_months": round(branch_months, 4),
        "overage_cu_hours": round(overage_cu, 4),
        "overage_storage_gb": round(overage_storage, 6),
        "overage_branches": round(overage_branches, 4),
        "compute_cost": round(compute_cost, 2),
        "storage_cost": round(storage_cost, 2),
        "branch_cost": round(branch_cost, 2),
        "total_cost": round(compute_cost + storage_cost + branch_cost, 2),
    }
    return result


# ---------------------------------------------------------------------------
# Cloudflare
# ---------------------------------------------------------------------------

def collect_cloudflare(token, env_file):
    """R2 buckets + paygo-usage line items."""
    if not token:
        raise NotConfigured("CLOUDFLARE_API_TOKEN not found (env or froink .env)")

    buckets = api_get(
        CF_BASE, f"/accounts/{CF_ACCOUNT_ID}/r2/buckets", {}, token
    ).get("result", {}).get("buckets", [])

    usage = api_get(CF_BASE, f"/accounts/{CF_ACCOUNT_ID}/paygo-usage", {}, token)
    items = usage.get("result", []) if isinstance(usage.get("result"), list) else []

    grouped = {}
    total_cost = 0.0
    for it in items:
        fam = it.get("ServiceFamilyName") or "?"
        name = it.get("ServiceName") or "?"
        cat = it.get("ChargeCategory") or "?"
        key = (fam, name, cat)
        grouped.setdefault(key, {"items": 0, "cost": 0.0})
        grouped[key]["items"] += 1
        grouped[key]["cost"] += it.get("ListCost") or 0
        total_cost += it.get("ListCost") or 0

    charge_starts = sorted({it.get("ChargePeriodStart", "")[:10] for it in items if it.get("ChargePeriodStart")})

    return {
        "status": "ok",
        "account_id": CF_ACCOUNT_ID,
        "buckets": [{
            "name": b.get("name"),
            "creation_date": b.get("creation_date"),
            "location": b.get("location"),
        } for b in buckets],
        "paygo_usage": {
            "line_items": len(items),
            "total_cost_usd": round(total_cost, 2),
            "charge_period_start": charge_starts[0] if charge_starts else None,
            "charge_period_end": charge_starts[-1] if charge_starts else None,
            "grouped": [{
                "service_family": fam,
                "service_name": name,
                "charge_category": cat,
                "items": g["items"],
                "cost_usd": round(g["cost"], 2),
            } for (fam, name, cat), g in sorted(grouped.items())],
            "limitation": (
                "paygo-usage reports usage line items only (R2); registrar/subscription "
                "invoices are NOT included — those live in the Cloudflare dashboard Billing."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Fly.io
# ---------------------------------------------------------------------------

def _run_flyctl(args, fly_token, timeout=60):
    binary = shutil.which("flyctl") or shutil.which("fly")
    if not binary:
        raise ProviderError("flyctl binary not found on PATH")
    env = dict(os.environ)
    if fly_token:
        env["FLY_API_TOKEN"] = fly_token
    try:
        proc = subprocess.run(
            [binary] + args, capture_output=True, text=True, timeout=timeout, env=env
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        raise ProviderError(f"flyctl {' '.join(args)} failed: {e}") from e
    return proc


def _fly_app_states(fly_token):
    """STATUS column from `flyctl apps list` text (the JSON State field is empty)."""
    states = {}
    proc = _run_flyctl(["apps", "list"], fly_token)
    if proc.returncode != 0:
        return states
    for line in proc.stdout.splitlines():
        parts = [p.strip() for p in line.split("│")]
        if len(parts) >= 3 and parts[0] in FLY_APPS:
            states[parts[0]] = parts[2]
    return states


def collect_fly():
    """Machine/app inventory for floreren-api + leon-ssh-relay (read-only)."""
    fly_token = get_fly_token()
    if not fly_token:
        raise NotConfigured("FLY_API_TOKEN not found (env or ~/.fly/config.yml access_token)")
    # flyctl alone does not pick up ~/.fly/config.yml on this host; token injected above.

    apps_json = _run_flyctl(["apps", "list", "--json"], fly_token)
    apps = []
    if apps_json.returncode == 0 and apps_json.stdout.strip():
        try:
            apps = json.loads(apps_json.stdout)
        except json.JSONDecodeError:
            apps = []

    app_states = _fly_app_states(fly_token)
    apps_out = []
    for app in apps:
        name = app.get("Name")
        if name in FLY_APPS or not FLY_APPS:
            apps_out.append({
                "name": name,
                "platform": app.get("PlatformVersion"),
                "state": app.get("State") or app_states.get(name),
            })

    machines = {}
    for app_name in FLY_APPS:
        proc = _run_flyctl(["machine", "list", "-a", app_name, "--json"], fly_token)
        if proc.returncode != 0 or not proc.stdout.strip():
            machines[app_name] = []
            continue
        try:
            raw = json.loads(proc.stdout)
        except json.JSONDecodeError:
            raw = []
        machines[app_name] = [{
            "id": m.get("id"),
            "name": m.get("name"),
            "state": m.get("state"),
            "region": m.get("region"),
            "created_at": m.get("created_at"),
            "guest": m.get("config", {}).get("guest"),
        } for m in raw]

    releases = {"floreren-api": None}
    proc = _run_flyctl(["apps", "releases", "-a", "floreren-api", "--json"], fly_token)
    if proc.returncode == 0 and proc.stdout.strip():
        try:
            rel = json.loads(proc.stdout)
            if isinstance(rel, list) and rel:
                releases["floreren-api"] = {
                    "count": len(rel),
                    "latest_version": rel[0].get("version") or rel[0].get("Version"),
                    "latest_status": rel[0].get("status") or rel[0].get("Status"),
                    "latest_date": (rel[0].get("CreatedAt") or rel[0].get("created_at") or rel[0].get("Date") or "")[:16],
                }
        except json.JSONDecodeError:
            releases["floreren-api"] = {"note": "releases --json not parseable"}

    return {
        "status": "ok",
        "apps": apps_out,
        "machines": machines,
        "releases": releases,
        "billing": {
            "limitation": (
                "Fly.io has NO public billing API (community wishlist; `flyctl billing` does "
                "not exist). Machine/app inventory is the cost-driver picture; the monetary "
                "invoice amount is dashboard-only (fly.io dashboard → CostExplorer). "
                "No Fly price is fabricated here."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _since_iso(since_arg):
    if since_arg:
        return f"{since_arg}T00:00:00Z"
    return datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def _fmt_usd(x):
    return f"${x:.2f}"


def format_report(results, since, since_explicit=False):
    lines = []
    lines.append(f"📊 **Floreren Cloud Cost Monitor** — vanaf `{since[:10]}`")
    lines.append("")

    # ---------------- Neon ----------------
    lines.append("=== Neon ===")
    neon = results.get("neon")
    if not neon or neon.get("status") == "not_configured":
        lines.append("⚠️ Neon: niet geconfigureerd (NEON_API_KEY ontbreekt)")
    elif neon.get("status") == "error":
        lines.append(f"⚠️ Neon: fout — {neon['error']}")
    else:
        cons = neon["consumption"]
        src = cons.get("source", "")
        if src.startswith("v2_"):
            periods = cons.get("periods") or []
            p_start = (periods[0].get("period_start") or since)[:10] if periods else since[:10]
            p_end = (periods[-1].get("period_end") or "")[:10] if periods else ""
            plan_label = periods[0].get("period_plan") if periods else None
            lines.append(f"`{p_start}` → `{p_end}` (bron: V2 Consumption API, plan `{plan_label or '?'}`)")
        else:
            p_start = (cons.get("consumption_period_start") or "")[:10]
            p_end = (cons.get("consumption_period_end") or "")[:10]
            if p_start:
                lines.append(f"`{p_start}` → `{p_end}` (bron: project usage summary)")
            else:
                lines.append("(periode: onbekend — project usage summary toont geen verbruiksperiode)")
            if since_explicit:
                lines.append(
                    f"ℹ️ `--since {since[:10]}` is niet van toepassing op de project "
                    "usage summary — die rapporteert altijd de huidige verbruiksperiode van Neon."
                )
            if cons.get("v2_note"):
                lines.append(f"ℹ️ {cons['v2_note']}")

        u = neon["usage"]
        a = neon["allowances"]
        lines.append(f"Plan: **{neon['plan']}** — {a['compute_hours']:.0f} CU-h / {a['storage_gb']:.2f} GB / {a['extra_branches']:.0f} branches inbegrepen, autoscale max {a['autoscale_max_cu']:.0f} CU, scale-to-zero na {a['scale_to_zero_min']} min")
        if cons.get("compute_available") is False:
            lines.append(
                f"Compute: ⚠️ **niet meetbaar via API op Free** — {cons.get('compute_note', 'zie Neon console')}"
            )
        else:
            lines.append(f"Compute: `{u['cu_hours']:.2f}` CU-h gebruikt (inclusief {a['compute_hours']:.0f}) → overage `{u['overage_cu_hours']:.2f}` CU-h ({_fmt_usd(u['compute_cost'])})")
        lines.append(f"Storage: `{u['storage_gb']:.4f}` GB gebruikt (inclusief {a['storage_gb']:.2f}) → overage `{u['overage_storage_gb']:.4f}` GB ({_fmt_usd(u['storage_cost'])})")
        lines.append(f"Extra branches: `{u['branch_months']:.3f}` branch-maanden (inclusief {a['extra_branches']:.0f}) → overage `{u['overage_branches']:.3f}` ({_fmt_usd(u['branch_cost'])})")
        lines.append(f"Neon totaal: **{_fmt_usd(u['total_cost'])}** (onder tier → $0.00)")

        # endpoint inventory
        inv = neon["inventory"]
        known = {
            "ep-weathered-lake-al5q450z": ("production", "br-steep-dawn-al8xci32"),
            "ep-crimson-darkness-alvzvh16": ("dev", "br-bitter-cherry-alfvn8c2"),
        }
        lines.append("Endpoints:")
        for e in inv["endpoints"]:
            label = known.get(e["id"], e["id"])
            lines.append(
                f"  • `{e['id']}` ({label[0] if isinstance(label, tuple) else '?'}, branch `{e['branch_id']}`) "
                f"— state `{e['current_state']}`, autoscale {e['autoscaling_limit_min_cu']}–{e['autoscaling_limit_max_cu']} CU"
            )
        for b in inv["branches"]:
            if not b.get("has_endpoint", True):
                lines.append(
                    f"  • branch `{b['id']}` (`{b['name']}`) — GEEN endpoint (endpoint was deleted; data remains)"
                )
    lines.append("")

    # ---------------- Cloudflare ----------------
    lines.append("=== Cloudflare ===")
    cf = results.get("cloudflare")
    if not cf or cf.get("status") == "not_configured":
        lines.append("⚠️ Cloudflare: niet geconfigureerd (CLOUDFLARE_API_TOKEN ontbreekt)")
    elif cf.get("status") == "error":
        lines.append(f"⚠️ Cloudflare: fout — {cf['error']}")
    else:
        for b in cf["buckets"]:
            lines.append(f"R2 bucket: `{b['name']}` (created {b['creation_date'][:10]}, {b.get('location') or 'region n/a'})")
        pu = cf["paygo_usage"]
        lines.append(f"PayGo usage: {pu['line_items']} line items, totaal **{_fmt_usd(pu['total_cost_usd'])}** "
                     f"(periode {pu['charge_period_start']} → {pu['charge_period_end']})")
        for g in pu["grouped"]:
            lines.append(f"  • {g['service_family']} | {g['service_name']} | {g['items']} items | {_fmt_usd(g['cost_usd'])}")
        lines.append(f"⚠️ {pu['limitation']}")
    lines.append("")

    # ---------------- Fly.io ----------------
    lines.append("=== Fly.io ===")
    fly = results.get("fly")
    if not fly or fly.get("status") == "not_configured":
        lines.append("⚠️ Fly.io: niet geconfigureerd (FLY_API_TOKEN ontbreekt / ~/.fly/config.yml)")
    elif fly.get("status") == "error":
        lines.append(f"⚠️ Fly.io: fout — {fly['error']}")
    else:
        for app in fly["apps"]:
            lines.append(f"App: `{app['name']}` (platform {app['platform']}{', state ' + app['state'] if app.get('state') else ''})")
        for app_name, ms in fly["machines"].items():
            if not ms:
                lines.append(f"  {app_name}: geen machines")
                continue
            lines.append(f"  {app_name}:")
            for m in ms:
                guest = m.get("guest") or {}
                spec = f"{guest.get('cpu_kind', '?')}-{guest.get('cpus', '?')}x:{guest.get('memory_mb', '?')}MB" if guest else "spec n/a"
                lines.append(f"    • `{m['id']}` `{m['name']}` — {m['state']} ({m['region']}, {spec})")
        rel = fly["releases"].get("floreren-api")
        if rel and "note" not in rel:
            lines.append(f"  floreren-api releases: {rel['count']} — latest v{rel['latest_version']} {rel['latest_status']} {rel['latest_date']}")
        lines.append(f"⚠️ {fly['billing']['limitation']}")
    lines.append("")

    # ---------------- Total ----------------
    neon_total = 0.0
    if results.get("neon") and results["neon"].get("status") == "ok":
        neon_total = results["neon"]["usage"]["total_cost"]
    cf_total = 0.0
    if results.get("cloudflare") and results["cloudflare"].get("status") == "ok":
        cf_total = results["cloudflare"]["paygo_usage"]["total_cost_usd"]
    total = neon_total + cf_total
    lines.append(f"**Estimated monthly cost: {_fmt_usd(total)}**")
    lines.append(f"  ├ Neon overage: {_fmt_usd(neon_total)}")
    lines.append(f"  ├ Cloudflare usage: {_fmt_usd(cf_total)}")
    lines.append("  └ Fly.io: dashboard-only (fly.io CostExplorer) — geen publieke billing API")
    lines.append("")
    lines.append("_Bronnen: Neon API v2 + project summary, Cloudflare PayGo usage, flyctl (read-only)_")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Floreren unified cloud cost monitor (Neon + Cloudflare + Fly.io)")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    parser.add_argument("--since", metavar="YYYY-MM-DD", help="Consumption window start (default: 1st of current month)")
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE, help="Fallback env file with NEON_API_KEY / CLOUDFLARE_API_TOKEN")
    args = parser.parse_args()

    since = _since_iso(args.since)
    env_file = args.env_file

    results = {"since": since}
    providers = [
        ("neon", lambda: collect_neon(get_secret("NEON_API_KEY", env_file), env_file)),
        ("cloudflare", lambda: collect_cloudflare(get_secret("CLOUDFLARE_API_TOKEN", env_file), env_file)),
        ("fly", collect_fly),
    ]
    for name, fn in providers:
        try:
            results[name] = fn()
        except NotConfigured as e:
            results[name] = {"status": "not_configured", "error": str(e)}
        except ProviderError as e:
            results[name] = {"status": "error", "error": str(e)}

    if args.json:
        print(json.dumps(results, indent=2, default=str))
    else:
        print(format_report(results, since, since_explicit=bool(args.since)))
    # Exit 0: all providers were attempted; per-provider issues are reported inline.
    sys.exit(0)


if __name__ == "__main__":
    main()
