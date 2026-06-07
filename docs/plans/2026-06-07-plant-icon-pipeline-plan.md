# Plant Icon Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every plant get a durable, distinctive (potted + bare) icon — fix the broken "sync" + admin generation by routing curated icons through git/Vercel and AI-generated icons through R2 + Postgres, with a placeholder-and-flag fallback at plant creation, and migrate all LLM calls to Nous Portal.

**Architecture:** The icon catalog becomes the union of two durable sources merged by the backend: curated SVGs in git (`frontend/public/icons`, served by Vercel) and AI-generated SVGs in Cloudflare R2 with metadata in a new `generated_icons` Postgres table. `GET /icon-catalog` returns both with explicit `url`s; the frontend resolves each icon's URL from a primed index. Generation (Approach A) asks Nous for constrained SVG, validates/sanitizes it, and falls back to the existing procedural generator. The backend never again writes icon files it expects the frontend to serve.

**Tech Stack:** FastAPI + asyncpg (Postgres prod, in-memory SQLite tests), Alembic, Cloudflare R2 (`services/storage.py`), Nous Portal (OpenAI-compatible, DeepSeek V4 Flash), React 19 + TypeScript + Vite, Zustand.

**Spec:** `docs/plans/2026-06-07-plant-icon-pipeline-design.md`

---

## File Structure

**Backend (new):**
- `backend/services/svg_validator.py` — pure SVG validation/sanitization. One responsibility: is this SVG safe + on-spec?
- `backend/services/icon_catalog.py` — unified catalog loader (curated manifest + `generated_icons` rows → list of entries with `url`). One responsibility: "what icons exist and where do they live."
- `backend/services/icon_ai.py` — Nous prompt + call returning `{potted_svg, bare_svg, cat}`. One responsibility: ask the LLM for an icon.
- `backend/alembic/versions/0012_add_generated_icons.py` — migration.
- `backend/tests/test_svg_validator.py`, `test_icon_catalog.py`, `test_icon_generation.py`, `test_icon_create_fallback.py`.

**Backend (modified):**
- `backend/llm_config.py` — point at Nous Portal.
- `backend/routers/icons.py` — `find_variant`/`resolve_placement_icon` become catalog-aware; `GET /icon-catalog`; rewrite `/sync` to match-only; `/gaps` keys off `icon_requested`.
- `backend/routers/admin_panel.py` — rewrite `generate-icons` orchestration (validate→fallback→R2→DB→rematch); overview `missing_icons` keys off `icon_requested`.
- `backend/routers/plants.py` — creation-time match + placeholder + flag.
- `backend/.env.example`, `CLAUDE.md` — provider note.

**Frontend (modified):**
- `frontend/src/utils/icons.ts` — catalog-aware `resolveIconUrl` + `indexIconUrls`.
- `frontend/src/api/client.ts` — `icons.catalog()` hits backend `/icon-catalog`, primes index.
- `frontend/src/types/index.ts` — `PlantIcon.url`, new `IconSyncResult` shape.
- `frontend/src/pages/Settings.tsx`, `frontend/src/i18n/en.ts`, `frontend/src/i18n/nl.ts` — match-only sync result.
- `frontend/src/App.tsx` (or store init) — load catalog once at startup to prime the index.

**Assets (one-time, git):**
- `frontend/public/icons/manifest.json` — add 6 orphan entries + ~13 placeholders.
- `frontend/public/icons/placeholder_*.svg` — generated once.

> **Scope note:** This is one feature with coherent parts. Phase 0 (Nous) is independently shippable and can be merged on its own. Phases 1–7 build the icon pipeline and should land together.

---

## Phase 0 — Nous migration (independently shippable)

### Task 0.1: Point llm_config at Nous Portal

**Files:**
- Modify: `backend/llm_config.py`
- Test: `backend/tests/test_llm_config.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_llm_config.py
"""llm_config defaults to Nous Portal but stays env-overridable."""
import importlib
import os


def _reload(monkeypatch, **env):
    for k in ("NOUS_API_KEY", "LLM_CHAT_URL", "LLM_MODEL", "OPENROUTER_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    import llm_config
    return importlib.reload(llm_config)


def test_defaults_to_nous_portal(monkeypatch):
    cfg = _reload(monkeypatch, NOUS_API_KEY="secret")
    assert cfg.LLM_API_KEY == "secret"
    assert cfg.LLM_CHAT_URL == "https://inference-api.nousresearch.com/v1/chat/completions"
    assert cfg.LLM_MODEL == "deepseek/deepseek-v4-flash"


def test_env_overrides_url_and_model(monkeypatch):
    cfg = _reload(monkeypatch, NOUS_API_KEY="k", LLM_CHAT_URL="https://x/v1/chat", LLM_MODEL="other")
    assert cfg.LLM_CHAT_URL == "https://x/v1/chat"
    assert cfg.LLM_MODEL == "other"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_llm_config.py -v`
Expected: FAIL — current `LLM_API_KEY` reads `OPENROUTER_API_KEY`, URL/model defaults differ.

- [ ] **Step 3: Edit `backend/llm_config.py`**

Replace the docstring and the three assignment lines:

```python
"""Central chat-completion (LLM) configuration.

Every LLM caller in the backend shares this one provider config, so switching
provider or model is a single-file change instead of editing seven call sites.

Defaults to Nous Portal (an OpenAI-compatible inference gateway) using
DeepSeek V4 Flash. Override per environment:

    NOUS_API_KEY   the Nous Portal API key (required for any LLM call)
    LLM_CHAT_URL   chat-completions endpoint (default: Nous Portal)
    LLM_MODEL      model id (default: deepseek/deepseek-v4-flash)

The request shape is OpenAI-compatible (Bearer auth), so call sites are
unchanged apart from the URL, key and model id.
"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

LLM_API_KEY = os.getenv("NOUS_API_KEY") or ""
LLM_CHAT_URL = os.getenv("LLM_CHAT_URL") or "https://inference-api.nousresearch.com/v1/chat/completions"
LLM_MODEL = os.getenv("LLM_MODEL") or "deepseek/deepseek-v4-flash"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_llm_config.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/llm_config.py backend/tests/test_llm_config.py
git commit -m "feat(llm): migrate provider config to Nous Portal (DeepSeek V4 Flash)"
```

### Task 0.2: Update env example + docs + provision secret

**Files:**
- Modify: `backend/.env.example`, `CLAUDE.md`

- [ ] **Step 1: Edit `backend/.env.example`** — add (and leave any old `OPENROUTER_API_KEY` line removed/commented):

```
# LLM provider — Nous Portal (OpenAI-compatible). DeepSeek V4 Flash by default.
NOUS_API_KEY=
# Optional overrides:
# LLM_CHAT_URL=https://inference-api.nousresearch.com/v1/chat/completions
# LLM_MODEL=deepseek/deepseek-v4-flash
```

- [ ] **Step 2: Edit `CLAUDE.md`** — in the "Key Fly secrets" table, replace the `ANTHROPIC_API_KEY` row with:

```
| `NOUS_API_KEY` | LLM calls (care thresholds, species, icon generation) via Nous Portal — DeepSeek V4 Flash |
```

- [ ] **Step 3: Provision the secret** (requires the real key — ask Leon, or he sets it himself):

```bash
~/.fly/bin/flyctl secrets set NOUS_API_KEY=<key> -a floreren-api --remote-only
```

And add `NOUS_API_KEY=<key>` to local `backend/.env` (never committed).

- [ ] **Step 4: Commit**

```bash
git add backend/.env.example CLAUDE.md
git commit -m "docs: document Nous Portal provider + NOUS_API_KEY"
```

---

## Phase 1 — One-time durable assets (git)

### Task 1.1: Add the 6 orphan SVGs to the manifest

**Files:**
- Modify: `frontend/public/icons/manifest.json`
- Test: `frontend/scripts/check_manifest_coverage.py` (create — a guard, runnable in CI)

- [ ] **Step 1: Write the failing guard**

```python
# frontend/scripts/check_manifest_coverage.py
"""Fail if any .svg in public/icons is missing from manifest.json (and vice versa)."""
import json
import os
import sys

ICONS = os.path.join(os.path.dirname(__file__), "..", "public", "icons")


def main() -> int:
    with open(os.path.join(ICONS, "manifest.json"), encoding="utf-8") as f:
        data = json.load(f)
    entries = data["plants"] if isinstance(data, dict) else data
    manifest_files = {e["file"] for e in entries}
    disk = {f for f in os.listdir(ICONS) if f.lower().endswith(".svg")}
    missing = sorted(disk - manifest_files)
    orphan = sorted(manifest_files - disk)
    if missing or orphan:
        print(f"SVGs on disk not in manifest: {missing}")
        print(f"manifest entries with no SVG file: {orphan}")
        return 1
    print(f"OK — {len(disk)} svgs, {len(entries)} manifest entries, in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && python scripts/check_manifest_coverage.py`
Expected: FAIL listing `['brownbean_nopot.svg', 'cortaderia_bare.svg', 'error-plant.svg', 'leon.svg', 'seed.svg', 'seed_bare.svg']`

- [ ] **Step 3: Add the 6 entries to `manifest.json`** — append to the `plants` array (match the existing entry shape; set sensible fields):

```json
{ "id": "error-plant", "name": "Error Plant", "sci": "", "cat": "state", "form": "potted", "family": "", "file": "error-plant.svg" },
{ "id": "leon", "name": "Leon", "sci": "", "cat": "state", "form": "portrait", "family": "", "file": "leon.svg" },
{ "id": "seed", "name": "Seed", "sci": "", "cat": "growth", "form": "potted", "family": "", "file": "seed.svg" },
{ "id": "seed_bare", "name": "Seed", "sci": "", "cat": "growth", "form": "bare", "variant_of": "seed", "family": "", "file": "seed_bare.svg" },
{ "id": "brownbean_nopot", "name": "Brown Bean", "sci": "Phaseolus vulgaris", "cat": "edible", "form": "bare", "variant_of": "brownbean", "family": "", "file": "brownbean_nopot.svg" },
{ "id": "cortaderia_bare", "name": "Pampasgras", "sci": "Cortaderia selloana", "cat": "grass", "form": "bare", "variant_of": "cortaderia", "family": "", "file": "cortaderia_bare.svg" }
```

Then bump the top-level `"count"` and `"iconCount"` to 220.

- [ ] **Step 4: Run the guard to verify it passes**

Run: `cd frontend && python scripts/check_manifest_coverage.py`
Expected: PASS — "OK — 220 svgs, 220 manifest entries, in sync"

- [ ] **Step 5: Commit**

```bash
git add frontend/public/icons/manifest.json frontend/scripts/check_manifest_coverage.py
git commit -m "fix(icons): register 6 orphan SVGs in manifest (stops repeating +6 sync)"
```

### Task 1.2: Commit category placeholder icons

**Files:**
- Create: `frontend/public/icons/placeholder_<cat>.svg` (13 files)
- Modify: `frontend/public/icons/manifest.json`
- Create: `frontend/scripts/generate_placeholders.py`

The 13 categories: `houseplant, flower, succulent, herb, edible, tree, shrub, grass, fern, bulb, climber, cactus, unknown`.

- [ ] **Step 1: Write the generator script** (reuses the backend procedural generator)

```python
# frontend/scripts/generate_placeholders.py
"""Write one potted placeholder SVG per category into public/icons + manifest."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend", "routers"))
from icon_generator import generate_icon_svg  # noqa: E402

ICONS = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
CATS = ["houseplant", "flower", "succulent", "herb", "edible", "tree",
        "shrub", "grass", "fern", "bulb", "climber", "cactus", "unknown"]


def main() -> int:
    with open(os.path.join(ICONS, "manifest.json"), encoding="utf-8") as f:
        data = json.load(f)
    plants = data["plants"]
    have = {e["id"] for e in plants}
    for cat in CATS:
        icon_id = f"placeholder_{cat}"
        svg = generate_icon_svg(name=cat.title(), sci="", cat=cat, form="potted", icon_id=icon_id)
        with open(os.path.join(ICONS, f"{icon_id}.svg"), "w", encoding="utf-8") as f:
            f.write(svg)
        if icon_id not in have:
            plants.append({"id": icon_id, "name": f"{cat.title()} (placeholder)",
                           "sci": "", "cat": cat, "form": "potted", "family": "",
                           "file": f"{icon_id}.svg"})
    data["count"] = data["iconCount"] = len(plants)
    with open(os.path.join(ICONS, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {len(CATS)} placeholders; manifest now {len(plants)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run it**

Run: `cd frontend && python scripts/generate_placeholders.py`
Expected: "wrote 13 placeholders; manifest now 233 entries"

- [ ] **Step 3: Verify coverage guard still passes**

Run: `cd frontend && python scripts/check_manifest_coverage.py`
Expected: PASS — 233 svgs / 233 entries.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/icons/placeholder_*.svg frontend/public/icons/manifest.json frontend/scripts/generate_placeholders.py
git commit -m "feat(icons): add 13 category placeholder icons"
```

---

## Phase 2 — Database schema

### Task 2.1: `generated_icons` table migration

**Files:**
- Create: `backend/alembic/versions/0012_add_generated_icons.py`

- [ ] **Step 1: Write the migration** (revision chain head is `0011`)

```python
"""add generated_icons table

Stores AI/procedural generated plant icons. The SVG bytes live in R2; this
table holds the metadata + the R2 public url. Two rows per icon (potted base
+ bare variant) mirror the curated manifest's form-variant convention.

See docs/plans/2026-06-07-plant-icon-pipeline-design.md.

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-07
"""
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE generated_icons (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            sci         TEXT NOT NULL DEFAULT '',
            cat         TEXT NOT NULL DEFAULT 'unknown',
            form        TEXT NOT NULL DEFAULT 'potted',
            variant_of  TEXT,
            family      TEXT NOT NULL DEFAULT '',
            url         TEXT NOT NULL,
            source      TEXT NOT NULL DEFAULT 'ai',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS generated_icons")
```

- [ ] **Step 2: Apply locally**

Run: `cd backend && .venv/Scripts/python -m alembic upgrade head`
Expected: "Running upgrade 0011 -> 0012, add generated_icons table"

- [ ] **Step 3: Verify downgrade is clean, then re-upgrade**

Run: `cd backend && .venv/Scripts/python -m alembic downgrade -1 && .venv/Scripts/python -m alembic upgrade head`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0012_add_generated_icons.py
git commit -m "feat(db): add generated_icons table"
```

---

## Phase 3 — SVG validator

### Task 3.1: `validate_icon_svg`

**Files:**
- Create: `backend/services/svg_validator.py`
- Test: `backend/tests/test_svg_validator.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_svg_validator.py
import pytest
from services.svg_validator import validate_icon_svg, SvgValidationError

GOOD = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" '
    'height="100"><ellipse cx="50" cy="50" rx="10" ry="10" fill="#4A7C4E"/></svg>'
)


def test_valid_svg_passes_and_is_returned_normalised():
    out = validate_icon_svg(GOOD)
    assert out.strip().startswith("<svg")
    assert 'viewBox="0 0 100 100"' in out


@pytest.mark.parametrize("bad", [
    "not xml at all",
    '<div>nope</div>',
    '<svg viewBox="0 0 50 50" width="50" height="50"></svg>',          # wrong viewBox
    '<svg viewBox="0 0 100 100"><script>alert(1)</script></svg>',       # script
    '<svg viewBox="0 0 100 100"><image href="http://x/y.png"/></svg>',  # external ref
    '<svg viewBox="0 0 100 100"><rect onload="x()"/></svg>',            # event handler
    '<svg viewBox="0 0 100 100"><foreignObject/></svg>',               # disallowed tag
])
def test_invalid_svg_rejected(bad):
    with pytest.raises(SvgValidationError):
        validate_icon_svg(bad)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_svg_validator.py -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `backend/services/svg_validator.py`**

```python
"""Validate + sanitize an icon SVG produced by the LLM.

Guarantees the SVG is well-formed XML, has the canonical 100x100 viewBox, and
contains only whitelisted drawing tags/attributes — no scripts, no external
references, no event handlers. Raises SvgValidationError on any violation.
"""
from __future__ import annotations

import re
from xml.etree import ElementTree as ET

try:
    from defusedxml.ElementTree import fromstring as _safe_fromstring
except ImportError:  # defusedxml is a declared dependency; fall back defensively
    _safe_fromstring = ET.fromstring

SVG_NS = "http://www.w3.org/2000/svg"

ALLOWED_TAGS = {
    "svg", "g", "path", "ellipse", "rect", "circle", "line", "polyline",
    "polygon", "title", "defs", "lineargradient", "radialgradient", "stop",
}
# Attributes that may carry a URL we must police.
URL_ATTRS = {"href", "{http://www.w3.org/1999/xlink}href", "xlink:href"}


class SvgValidationError(ValueError):
    """Raised when an SVG is unsafe or off-spec."""


def _localname(tag: str) -> str:
    return tag.split("}", 1)[-1].lower()


def validate_icon_svg(svg: str) -> str:
    svg = (svg or "").strip()
    if not svg.startswith("<svg") and "<svg" in svg:
        svg = svg[svg.index("<svg"):]  # tolerate leading prose/code fences
    try:
        root = _safe_fromstring(svg)
    except Exception as exc:  # ParseError, EntitiesForbidden, etc.
        raise SvgValidationError(f"not well-formed XML: {exc}") from exc

    if _localname(root.tag) != "svg":
        raise SvgValidationError("root element is not <svg>")

    if (root.get("viewBox") or "").replace(",", " ").split() != ["0", "0", "100", "100"]:
        raise SvgValidationError("viewBox must be '0 0 100 100'")

    for el in root.iter():
        name = _localname(el.tag)
        if name not in ALLOWED_TAGS:
            raise SvgValidationError(f"disallowed tag <{name}>")
        for attr, value in el.attrib.items():
            local = attr.split("}", 1)[-1].lower() if "}" in attr else attr.lower()
            if local.startswith("on"):
                raise SvgValidationError(f"event handler attribute {attr}")
            if attr in URL_ATTRS or local == "href":
                if re.match(r"\s*(https?:|//|data:)", value, re.I):
                    raise SvgValidationError(f"external/data reference in {attr}")
    return svg
```

- [ ] **Step 4: Ensure `defusedxml` is a dependency**

Edit `backend/requirements.txt` — add `defusedxml` if absent. Then:
Run: `cd backend && .venv/Scripts/python -m pip install defusedxml`

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_svg_validator.py -v`
Expected: PASS (all parametrized cases)

- [ ] **Step 6: Commit**

```bash
git add backend/services/svg_validator.py backend/tests/test_svg_validator.py backend/requirements.txt
git commit -m "feat(icons): SVG validator/sanitizer for generated icons"
```

---

## Phase 4 — Unified catalog (backend)

### Task 4.1: Unified catalog loader

**Files:**
- Create: `backend/services/icon_catalog.py`
- Test: `backend/tests/test_icon_catalog.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_icon_catalog.py
import json
import os
import pytest
import aiosqlite

from services.icon_catalog import load_catalog, _curated_entries


@pytest.fixture
def icons_dir(tmp_path):
    d = tmp_path / "icons"
    d.mkdir()
    (d / "manifest.json").write_text(json.dumps({"plants": [
        {"id": "monstera", "name": "Monstera", "sci": "Monstera deliciosa",
         "cat": "houseplant", "form": "potted", "family": "", "file": "monstera.svg"},
    ]}), encoding="utf-8")
    return str(d)


def test_curated_entries_get_vercel_url(icons_dir):
    entries = _curated_entries(icons_dir)
    assert entries[0]["url"] == "/icons/monstera.svg"


@pytest.mark.asyncio
async def test_load_catalog_merges_generated(icons_dir):
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,url,source) "
        "VALUES ('gen_rosa','Roos','Rosa','flower','potted','https://r2/gen_rosa.svg','ai')")
    await db.commit()
    catalog = await load_catalog(db, icons_dir=icons_dir)
    by_id = {e["id"]: e for e in catalog}
    assert by_id["monstera"]["url"] == "/icons/monstera.svg"
    assert by_id["gen_rosa"]["url"] == "https://r2/gen_rosa.svg"
    await db.close()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_catalog.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `backend/services/icon_catalog.py`**

```python
"""Unified icon catalog: curated (static manifest) + generated (DB rows).

Curated icons live in the manifest baked into the image and are served by
Vercel at /icons/<file>. Generated icons live in R2 and their public url is
stored in generated_icons.url. This module returns one merged list where every
entry carries an explicit `url`, so the frontend can resolve either source.
"""
from __future__ import annotations

import json
import os

# Same resolution as the routers (env override, else repo path).
ICONS_DIR = os.environ.get(
    "ICONS_DIR",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "public", "icons")),
)


def _curated_entries(icons_dir: str | None = None) -> list[dict]:
    icons_dir = icons_dir or ICONS_DIR
    path = os.path.join(icons_dir, "manifest.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    entries = data["plants"] if isinstance(data, dict) else data
    out = []
    for e in entries:
        e = dict(e)
        e["url"] = f"/icons/{e.get('file') or (e['id'] + '.svg')}"
        e["source"] = "curated"
        out.append(e)
    return out


async def _generated_entries(db) -> list[dict]:
    rows = await db.execute_fetchall(
        "SELECT id, name, sci, cat, form, variant_of, family, url, source FROM generated_icons"
    )
    return [dict(r) for r in rows]


async def load_catalog(db, *, icons_dir: str | None = None) -> list[dict]:
    """Curated + generated, deduped by id (generated wins on conflict)."""
    merged: dict[str, dict] = {}
    for e in _curated_entries(icons_dir):
        merged[e["id"]] = e
    for e in await _generated_entries(db):
        merged[e["id"]] = e
    return list(merged.values())
```

> **Note:** the test seeds a `generated_icons` table on a raw aiosqlite connection and calls `db.execute_fetchall`. The seeded test DB connection used by the app exposes `execute_fetchall`; mirror that. If the standalone aiosqlite connection lacks it, use the same wrapper the existing tests rely on (see `conftest.py`), or query via `db.execute(...).fetchall()`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_catalog.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/icon_catalog.py backend/tests/test_icon_catalog.py
git commit -m "feat(icons): unified curated+generated catalog loader"
```

### Task 4.2: `GET /icon-catalog` returns the unified catalog

**Files:**
- Modify: `backend/routers/icons.py` (the existing `get_catalog` at `@router.get("")`)
- Test: `backend/tests/test_icon_catalog_endpoint.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_icon_catalog_endpoint.py
import pytest


@pytest.mark.asyncio
async def test_catalog_endpoint_returns_url_field(client, seeded_db):
    await seeded_db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await seeded_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,url,source) "
        "VALUES ('gen_rosa','Roos','Rosa','flower','potted','https://r2/gen_rosa.svg','ai')")
    await seeded_db.commit()
    resp = await client.get("/icon-catalog")
    assert resp.status_code == 200, resp.text
    entries = resp.json()
    assert any(e["id"] == "gen_rosa" and e["url"] == "https://r2/gen_rosa.svg" for e in entries)
    assert all("url" in e for e in entries)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_catalog_endpoint.py -v`
Expected: FAIL — current endpoint returns manifest entries without `url`/generated rows.

- [ ] **Step 3: Edit `get_catalog` in `backend/routers/icons.py`**

```python
from database import db_dep
from services.icon_catalog import load_catalog

@router.get("")
async def get_catalog(db = Depends(db_dep)):
    """Return all icons (curated + generated), each with a url, sorted by name."""
    entries = await load_catalog(db)
    return sorted(entries, key=lambda e: e.get("name", e["id"]).lower())
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_catalog_endpoint.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/icons.py backend/tests/test_icon_catalog_endpoint.py
git commit -m "feat(icons): /icon-catalog serves unified catalog with url"
```

### Task 4.3: Make `find_variant`/`resolve_placement_icon` catalog-aware

**Files:**
- Modify: `backend/routers/icons.py`, `backend/routers/plants.py` (placement call sites)
- Test: `backend/tests/test_resolve_placement_icon.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_resolve_placement_icon.py
import pytest
from routers.icons import resolve_placement_icon


@pytest.mark.asyncio
async def test_uses_generated_bare_variant(seeded_db):
    await seeded_db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await seeded_db.execute("INSERT INTO generated_icons (id,name,form,url,source) "
                            "VALUES ('gen_rosa','Roos','potted','u','ai')")
    await seeded_db.execute("INSERT INTO generated_icons (id,name,form,variant_of,url,source) "
                            "VALUES ('gen_rosa_bare','Roos','bare','gen_rosa','u','ai')")
    await seeded_db.commit()
    # Not in a container -> bare form expected.
    assert await resolve_placement_icon(seeded_db, "gen_rosa", container_id=None) == "gen_rosa_bare"
    assert await resolve_placement_icon(seeded_db, "gen_rosa", container_id=5) == "gen_rosa"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_resolve_placement_icon.py -v`
Expected: FAIL — current functions are sync and read only the static manifest.

- [ ] **Step 3: Edit `backend/routers/icons.py`** — make both async + catalog-aware:

```python
from services.icon_catalog import load_catalog

async def find_variant(db, icon_key: str | None, target_form: str) -> str | None:
    """Return the icon_id for the given form variant of icon_key, across the
    unified catalog (curated + generated). Falls back to icon_key."""
    if not icon_key:
        return icon_key
    base = _FORM_SUFFIXES.sub("", icon_key)
    catalog = await load_catalog(db)
    for entry in catalog:
        entry_base = _FORM_SUFFIXES.sub("", entry["id"])
        if entry_base == base and entry.get("form") == target_form:
            return entry["id"]
    return icon_key


async def resolve_placement_icon(db, icon_key: str | None, *, container_id: int | None) -> str | None:
    target_form = "potted" if container_id is not None else "bare"
    return await find_variant(db, icon_key, target_form)
```

- [ ] **Step 4: Update the 3 placement call sites in `backend/routers/plants.py`**

They currently call `resolve_placement_icon(row["icon_key"], container_id=...)`. Change each to await + pass `db`:

```python
new_icon = await resolve_placement_icon(db, row["icon_key"], container_id=None)
# ...and the container variant:
new_icon = await resolve_placement_icon(db, row["icon_key"], container_id=data.container_id)
```

(Grep `resolve_placement_icon(` in `plants.py` — there are 3 occurrences around lines 268/297/315.)

- [ ] **Step 5: Run the test + the existing plants tests**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_resolve_placement_icon.py tests/test_plants_create.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/icons.py backend/routers/plants.py backend/tests/test_resolve_placement_icon.py
git commit -m "feat(icons): placement icon resolution reads unified catalog"
```

---

## Phase 5 — Generation pipeline (Approach A)

### Task 5.1: Nous icon prompt + call

**Files:**
- Create: `backend/services/icon_ai.py`
- Test: `backend/tests/test_icon_ai.py`

- [ ] **Step 1: Write the failing test** (mocks the HTTP call)

```python
# backend/tests/test_icon_ai.py
import json
import pytest
from unittest.mock import AsyncMock, patch

from services.icon_ai import generate_icon_variants


class _Resp:
    def __init__(self, content): self._c = content
    def raise_for_status(self): pass
    def json(self):
        return {"choices": [{"message": {"content": self._c}}], "usage": {}}


@pytest.mark.asyncio
async def test_parses_potted_and_bare_from_llm_json():
    payload = json.dumps({
        "potted_svg": '<svg viewBox="0 0 100 100"></svg>',
        "bare_svg": '<svg viewBox="0 0 100 100"></svg>',
        "cat": "flower",
    })
    with patch("services.icon_ai.httpx.AsyncClient") as cli:
        inst = cli.return_value.__aenter__.return_value
        inst.post = AsyncMock(return_value=_Resp("```json\n" + payload + "\n```"))
        out = await generate_icon_variants(name="Roos", sci="Rosa")
    assert out["cat"] == "flower"
    assert out["potted_svg"].startswith("<svg")
    assert out["bare_svg"].startswith("<svg")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_ai.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `backend/services/icon_ai.py`**

```python
"""Ask the configured LLM (Nous Portal) for a distinctive plant icon.

Returns dict {potted_svg, bare_svg, cat}. Pure I/O — validation, fallback,
storage and DB writes are the caller's job (admin_panel.generate-icons).
"""
from __future__ import annotations

import json
import re

import httpx

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

_PROMPT = """You design tiny flat-vector plant icons for a gardening app.

Style guide — follow EXACTLY:
- Output a single SVG per variant, root <svg> with viewBox="0 0 100 100" width="100" height="100".
- Only use these tags: g, path, ellipse, rect, circle, line, polyline, polygon, defs, linearGradient, stop, title.
- NO <script>, NO <image>, NO external href/url, NO event handlers.
- Terracotta pot palette: #B2664A pot, #C77B5D rim, #8E4A33 inner, #4A3429 soil.
- Foliage greens: #2F5D3A dark, #4A7C4E mid, #5C8A4E light, #3D5C3A stems.
- The plant should be recognisably "{name}"{sci_clause}. Keep it simple and centred.
- "potted" sits in a terracotta pot bottom ~y=75-100. "bare" has no pot, just a soft ground shadow.

Return ONLY minified JSON, no prose:
{{"potted_svg": "<svg.../>", "bare_svg": "<svg.../>", "cat": "<one of: houseplant,flower,succulent,herb,edible,tree,shrub,grass,fern,bulb,climber,cactus>"}}"""


def _build_prompt(name: str, sci: str) -> str:
    sci_clause = f" (scientific name {sci})" if sci else ""
    return _PROMPT.format(name=name, sci_clause=sci_clause)


async def generate_icon_variants(*, name: str, sci: str = "") -> dict:
    prompt = _build_prompt(name, sci)
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            LLM_CHAT_URL,
            headers={"Authorization": f"Bearer {LLM_API_KEY}", "content-type": "application/json"},
            json={"model": LLM_MODEL, "max_tokens": 4000,
                  "messages": [{"role": "user", "content": prompt}]},
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    data = json.loads(raw)
    return {"potted_svg": data["potted_svg"], "bare_svg": data["bare_svg"],
            "cat": data.get("cat", "unknown")}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_ai.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/icon_ai.py backend/tests/test_icon_ai.py
git commit -m "feat(icons): Nous-backed distinctive icon generation call"
```

### Task 5.2: Rewrite `generate-icons` orchestration (validate → fallback → R2 → DB → rematch)

**Files:**
- Modify: `backend/routers/admin_panel.py` (`generate_plant_icons` + `_sync_from_admin`)
- Test: `backend/tests/test_icon_generation.py` (create)

- [ ] **Step 1: Write the failing test** (mocks Nous + R2)

```python
# backend/tests/test_icon_generation.py
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

GOOD = '<svg viewBox="0 0 100 100" width="100" height="100"><ellipse cx="50" cy="50" rx="9" ry="9" fill="#4A7C4E"/></svg>'


@pytest.fixture
async def admin_db(seeded_db):
    await seeded_db.execute("UPDATE accounts SET email='leon_korbee@hotmail.com' WHERE id=1")
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, latin_name TEXT)")
    await seeded_db.execute("INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (1,'Roos','Rosa canina')")
    await seeded_db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_generate_ai_path_writes_r2_and_db(client, admin_db, auth_header):
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"potted_svg": GOOD, "bare_svg": GOOD, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        resp = await client.post("/admin-panel/generate-icons", headers=auth_header)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 1
    rows = await admin_db.execute_fetchall("SELECT id, source, url FROM generated_icons ORDER BY id")
    ids = {r["id"] for r in rows}
    assert {"gen_rosa", "gen_rosa_bare"} <= ids
    assert fake_storage.put.call_count == 2


@pytest.mark.asyncio
async def test_falls_back_to_procedural_on_bad_svg(client, admin_db, auth_header):
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"potted_svg": "garbage", "bare_svg": "garbage", "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        resp = await client.post("/admin-panel/generate-icons", headers=auth_header)
    assert resp.status_code == 200, resp.text
    rows = await admin_db.execute_fetchall("SELECT source FROM generated_icons")
    assert rows and all(r["source"] == "procedural" for r in rows)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_generation.py -v`
Expected: FAIL — endpoint still writes to disk + manifest, no `generated_icons` rows.

- [ ] **Step 3: Rewrite `generate_plant_icons` in `backend/routers/admin_panel.py`**

Replace the body (and imports) with the R2 + DB pipeline. Keep `require_admin`.

```python
import re
from services.svg_validator import validate_icon_svg, SvgValidationError
from services.storage import build_storage_from_env
from services.icon_ai import generate_icon_variants
from routers.icon_generator import generate_icon_svg, guess_category, derive_common_name
import routers.icons as icons_router


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9_]", "", text.lower().replace(" ", "_").replace("-", "_"))
    return s or "plant"


async def _existing_sci(db) -> set[str]:
    """Latin names already covered by curated OR generated icons (normalised)."""
    catalog = await icons_router.load_catalog(db) if hasattr(icons_router, "load_catalog") else []
    from services.icon_catalog import load_catalog
    catalog = await load_catalog(db)
    return {icons_router._normalize(e.get("sci", "")) for e in catalog if e.get("sci")}


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

        # 1. AI attempt
        source = "ai"
        try:
            ai = await generate_icon_variants(name=name_nl, sci=latin)
            cat = ai.get("cat") or guess_category(latin) or "unknown"
            potted = validate_icon_svg(ai["potted_svg"])
            bare = validate_icon_svg(ai["bare_svg"])
        except (SvgValidationError, Exception):  # noqa: BLE001 — any failure → fallback
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
```

Then update `_sync_from_admin` to build its lookup from the **unified catalog** (so generated icons match) instead of reading `manifest.json` from disk:

```python
async def _sync_from_admin(db):
    """Match plants without an icon (or placeholdered) against the unified catalog."""
    from services.icon_catalog import load_catalog
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
                found = lookup[norm]; break
            for icon_norm, icon_id in lookup.items():
                if icon_norm and (norm.startswith(icon_norm) or icon_norm.startswith(norm)):
                    found = icon_id; break
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
```

> Remove the now-dead imports (`update_manifest`, `os`/manifest-path logic) from `admin_panel.py` if unused.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_generation.py -v`
Expected: PASS (both AI and fallback cases)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/admin_panel.py backend/tests/test_icon_generation.py
git commit -m "feat(icons): generate-icons writes AI/procedural SVGs to R2 + generated_icons"
```

---

## Phase 6 — Creation fallback, gaps, sync

### Task 6.1: Placeholder + flag at plant creation

**Files:**
- Modify: `backend/routers/plants.py` (`create_plant`, after the INSERT/commit)
- Test: `backend/tests/test_icon_create_fallback.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_icon_create_fallback.py
import pytest
from unittest.mock import AsyncMock, patch

EXTRA = """
CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT, icon TEXT);
"""  # plant_species already created where needed


@pytest.fixture
async def db_ready(seeded_db):
    await seeded_db.executescript(EXTRA)
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, care_thresholds TEXT, phenology_json TEXT)")
    # add icon_requested column the create path now sets
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_unmatched_plant_gets_placeholder_and_flag(client, db_ready, auth_header):
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post("/api/plants", headers=auth_header,
            json={"name": "Basterdkool", "species": "Bunias orientalis", "care_schedules": []})
    assert resp.status_code == 200, resp.text
    pid = resp.json()["id"]
    row = (await db_ready.execute_fetchall(
        "SELECT icon_key, icon_requested FROM plants WHERE id = ?", (pid,)))[0]
    assert row["icon_key"] and row["icon_key"].startswith("placeholder_")
    assert row["icon_requested"] in (1, True)


@pytest.mark.asyncio
async def test_matched_plant_keeps_real_icon(client, db_ready, auth_header):
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post("/api/plants", headers=auth_header,
            json={"name": "Monstera", "care_schedules": []})
    pid = resp.json()["id"]
    row = (await db_ready.execute_fetchall(
        "SELECT icon_key, icon_requested FROM plants WHERE id = ?", (pid,)))[0]
    assert row["icon_key"] == "monstera"
    assert not row["icon_requested"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_create_fallback.py -v`
Expected: FAIL — create endpoint does no server-side matching/placeholder.

- [ ] **Step 3: Add a helper + call it in `create_plant`**

In `backend/routers/icons.py`, add a reusable matcher built on the unified catalog:

```python
async def match_icon_key(db, name: str, species: str | None) -> str | None:
    """Best-effort icon_key for a plant by name/species. None if no match."""
    from services.icon_catalog import load_catalog
    catalog = await load_catalog(db)
    lookup: dict[str, str] = {}
    for entry in catalog:
        for text in [entry["id"], entry.get("name", ""), entry.get("sci", ""), entry.get("name_nl", "")]:
            if text:
                lookup[_normalize(text)] = entry["id"]
    for dutch_norm, icon_id in DUTCH_TO_ICON.items():
        lookup[_normalize(dutch_norm)] = icon_id
    for text in [name, species or ""]:
        if not text:
            continue
        norm = _normalize(text)
        if norm in lookup:
            return lookup[norm]
        for icon_norm, icon_id in lookup.items():
            if icon_norm and (norm.startswith(icon_norm) or icon_norm.startswith(norm)):
                return icon_id
    return None
```

In `backend/routers/plants.py`, after `plant_id = cursor.lastrowid` and the first `await db.commit()` (around line 163), and only when the client sent no icon_key, insert:

```python
    # Ensure every plant gets an icon. If the client did not pick one, try a
    # server-side match; otherwise assign a category placeholder and flag the
    # plant so the admin can generate a distinctive icon later. Never fatal.
    if not data.icon_key:
        try:
            from routers.icons import match_icon_key
            from routers.icon_generator import guess_category
            matched = await match_icon_key(db, data.name, data.species)
            if matched:
                await db.execute("UPDATE plants SET icon_key = ? WHERE id = ?", (matched, plant_id))
            else:
                cat = guess_category(data.species or "") or guess_category(data.name) or "unknown"
                await db.execute(
                    "UPDATE plants SET icon_key = ?, icon_requested = TRUE WHERE id = ?",
                    (f"placeholder_{cat}", plant_id))
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            print(f"Warning: icon assignment failed for {data.name}: {exc}")
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_create_fallback.py tests/test_plants_create.py -v`
Expected: PASS (new + existing)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/icons.py backend/routers/plants.py backend/tests/test_icon_create_fallback.py
git commit -m "feat(icons): assign placeholder + flag when a new plant has no icon"
```

### Task 6.2: Gaps + overview key off `icon_requested`

**Files:**
- Modify: `backend/routers/icons.py` (`get_icon_gaps`), `backend/routers/admin_panel.py` (`admin_overview`)
- Test: `backend/tests/test_icon_gaps.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_icon_gaps.py
import pytest


@pytest.mark.asyncio
async def test_placeholdered_plant_shows_as_requested(client, seeded_db, auth_header):
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, latin_name TEXT)")
    await seeded_db.execute(
        "INSERT INTO plants (id,name,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Basterdkool','placeholder_unknown',1,1,1)")
    await seeded_db.commit()
    resp = await client.get("/icon-catalog/gaps", headers=auth_header)
    assert resp.status_code == 200, resp.text
    names = [r["name"] for r in resp.json()["requested"]]
    assert "Basterdkool" in names
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_gaps.py -v`
Expected: FAIL — `requested` query also requires `icon_key IS NULL`, so a placeholdered plant is excluded.

- [ ] **Step 3: Edit `get_icon_gaps` in `backend/routers/icons.py`** — drop the `icon_key` clause:

```python
    requested_rows = await db.execute_fetchall(
        "SELECT id, name, species FROM plants WHERE is_active = 1 AND icon_requested = TRUE"
    )
```

- [ ] **Step 4: Edit `admin_overview` in `backend/routers/admin_panel.py`** — count flagged plants:

```python
    missing_icons = (await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1 AND icon_requested = TRUE"
    ))[0]["n"]
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_gaps.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/icons.py backend/routers/admin_panel.py backend/tests/test_icon_gaps.py
git commit -m "feat(icons): gap list + admin count track icon_requested (placeholders)"
```

### Task 6.3: Rewrite `/icon-catalog/sync` to match-only

**Files:**
- Modify: `backend/routers/icons.py` (`sync_icons`)
- Test: `backend/tests/test_icon_sync.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_icon_sync.py
import pytest


@pytest.mark.asyncio
async def test_sync_is_match_only_no_new_icons(client, seeded_db):
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await seeded_db.execute(
        "INSERT INTO plants (id,name,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Monstera','placeholder_houseplant',1,1,1)")
    await seeded_db.commit()
    resp = await client.post("/icon-catalog/sync")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "new_icons" not in body  # the old field is gone
    assert body["matched_plants"] == 1
    row = (await seeded_db.execute_fetchall("SELECT icon_key, icon_requested FROM plants WHERE id=1"))[0]
    assert row["icon_key"] == "monstera"
    assert not row["icon_requested"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_sync.py -v`
Expected: FAIL — current sync scans disk + returns `new_icons`.

- [ ] **Step 3: Replace `sync_icons` in `backend/routers/icons.py`**

```python
@router.post("/sync")
async def sync_icons(db = Depends(db_dep)):
    """Re-match flagged/placeholdered plants against the unified catalog.

    Does NOT touch the filesystem. Curated icons arrive via git/deploy; generated
    icons via the admin generate-icons pipeline. Idempotent."""
    matched: list[dict] = []
    plants = await db.execute_fetchall(
        "SELECT id, name, species FROM plants WHERE is_active = 1 AND icon_requested = TRUE"
    )
    for row in plants:
        plant = dict(row)
        found = await match_icon_key(db, plant["name"], plant.get("species"))
        if found and not found.startswith("placeholder_"):
            await db.execute(
                "UPDATE plants SET icon_key = ?, icon_requested = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (found, plant["id"]))
            matched.append({"plant_id": plant["id"], "plant_name": plant["name"], "icon_key": found})
    if matched:
        await db.commit()
    unmatched = [{"plant_id": dict(r)["id"], "plant_name": dict(r)["name"]}
                 for r in plants if not any(m["plant_id"] == dict(r)["id"] for m in matched)]
    return {"matched_plants": len(matched), "matches": matched,
            "unmatched_plants": len(unmatched), "unmatched": unmatched}
```

> `match_icon_key` was added in Task 6.1; it returns a placeholder-free curated/generated match (placeholders are excluded above so a placeholdered plant only "matches" when a real icon now exists).

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_icon_sync.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/icons.py backend/tests/test_icon_sync.py
git commit -m "fix(icons): sync is match-only (no ephemeral disk writes, no phantom +N)"
```

---

## Phase 7 — Frontend

### Task 7.1: `PlantIcon.url` + catalog-aware `resolveIconUrl`

**Files:**
- Modify: `frontend/src/types/index.ts`, `frontend/src/utils/icons.ts`
- Test: `frontend/src/utils/icons.test.ts` (create; Vitest)

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/utils/icons.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveIconUrl, indexIconUrls } from './icons'

describe('resolveIconUrl', () => {
  beforeEach(() => indexIconUrls([]))

  it('falls back to /icons/<key>.svg for unknown keys', () => {
    expect(resolveIconUrl('monstera')).toBe('/icons/monstera.svg')
  })

  it('uses the catalog url for indexed (generated) icons', () => {
    indexIconUrls([
      { id: 'gen_rosa', url: 'https://r2/icons/generated/gen_rosa.svg' } as any,
    ])
    expect(resolveIconUrl('gen_rosa')).toBe('https://r2/icons/generated/gen_rosa.svg')
  })

  it('returns null for empty key', () => {
    expect(resolveIconUrl(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/utils/icons.test.ts`
Expected: FAIL — `indexIconUrls` does not exist.

- [ ] **Step 3: Edit `frontend/src/types/index.ts`** — add `url` to `PlantIcon`:

```ts
export interface PlantIcon {
  id: string
  name: string
  sci: string
  cat: string
  form: string
  phase?: string
  variant_of?: string
  family: string
  file: string
  url?: string
}
```

- [ ] **Step 4: Rewrite `frontend/src/utils/icons.ts`**

```ts
import type { PlantIcon } from '../types'

// Module-level index primed once the catalog loads (see api/client.ts).
// resolveIconUrl stays synchronous so its ~17 call sites are unchanged.
let iconUrlIndex: Record<string, string> = {}

export function indexIconUrls(catalog: Pick<PlantIcon, 'id' | 'url' | 'file'>[]): void {
  const next: Record<string, string> = {}
  for (const e of catalog) {
    next[e.id] = e.url ?? `/icons/${e.file ?? `${e.id}.svg`}`
  }
  iconUrlIndex = next
}

export function resolveIconUrl(iconKey: string | null | undefined): string | null {
  if (!iconKey) return null
  return iconUrlIndex[iconKey] ?? `/icons/${iconKey}.svg`
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && npx vitest run src/utils/icons.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/utils/icons.ts frontend/src/utils/icons.test.ts
git commit -m "feat(icons): catalog-aware resolveIconUrl (Vercel + R2)"
```

### Task 7.2: `icons.catalog()` → backend `/icon-catalog`, prime index at startup

**Files:**
- Modify: `frontend/src/api/client.ts` (the `icons` object)
- Modify: `frontend/src/App.tsx` (load once at startup)

- [ ] **Step 1: Edit `icons.catalog` in `frontend/src/api/client.ts`**

```ts
import { indexIconUrls } from '../utils/icons'

export const icons = {
  catalog: async (): Promise<PlantIcon[]> => {
    const entries = await api<PlantIcon[]>('GET', '/icon-catalog')
    indexIconUrls(entries)
    return entries.slice().sort((a, b) => a.name.localeCompare(b.name))
  },
  // sync()/gaps()/request() unchanged
  sync:    () => api<IconSyncResult>('POST', '/icon-catalog/sync'),
  gaps:    () => api<IconGapReport>('GET', '/icon-catalog/gaps'),
  request: (plantId: number) => api<{ status: string; plant_id: number }>('PATCH', `/icon-catalog/request/${plantId}`),
}
```

> `api()` is the existing JSON helper in `client.ts`. `/icon-catalog` lives on the backend (note: no `/api` prefix — confirm the router mount in `main.py`; if it is mounted under `/api`, use `'/api/icon-catalog'`). The previous `fetch('/icons/manifest.json')` static read is removed.

- [ ] **Step 2: Prime the index at app startup in `frontend/src/App.tsx`**

Add an effect near the top-level app mount:

```tsx
import { useEffect } from 'react'
import { icons } from './api/client'
// inside the App component body:
useEffect(() => { icons.catalog().catch(() => {}) }, [])
```

- [ ] **Step 3: Update `IconSyncResult` in `frontend/src/types/index.ts`** to the match-only shape:

```ts
export interface IconSyncResult {
  matched_plants: number
  matches: { plant_id: number; plant_name: string; icon_key: string }[]
  unmatched_plants: number
  unmatched: { plant_id: number; plant_name: string }[]
}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors ONLY in `Settings.tsx` referencing removed fields (`total_icons`, `new_icons`, `new_icon_ids`) — fixed in Task 7.3. If errors appear elsewhere, fix the references to use the new shape.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/App.tsx frontend/src/types/index.ts
git commit -m "feat(icons): load unified catalog from backend + prime url index at startup"
```

### Task 7.3: Settings "Sync icons" reflects match-only result

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`, `frontend/src/i18n/en.ts`, `frontend/src/i18n/nl.ts`

- [ ] **Step 1: Update the result render block in `Settings.tsx`** (the `{syncResult && (…)}` block ~lines 291-320). Remove `total_icons`/`new_icons`/`new_icon_ids` usage; show matched + unmatched:

```tsx
{syncResult && (
  <div className="text-sm space-y-1">
    {syncResult.matched_plants > 0 ? (
      <p>{t.settings.icons.linked} {syncResult.matches.map((m) => m.plant_name).join(', ')}</p>
    ) : (
      <p>{t.settings.icons.noChanges}</p>
    )}
    {syncResult.unmatched_plants > 0 && (
      <p className="text-fiery-red">
        {t.settings.icons.stillMissing}: {syncResult.unmatched.map((u) => u.plant_name).join(', ')}
      </p>
    )}
  </div>
)}
```

- [ ] **Step 2: Update i18n keys in `frontend/src/i18n/en.ts`** under `settings.icons` — remove `totalIcons`/`newIcons`, add:

```ts
linked: '✅ Linked:',
noChanges: 'No new matches — every flagged plant still needs a generated icon.',
stillMissing: '⚠️ Still missing',
```

- [ ] **Step 3: Mirror the same keys in `frontend/src/i18n/nl.ts`** (Dutch):

```ts
linked: '✅ Gekoppeld:',
noChanges: 'Geen nieuwe matches — elke gemarkeerde plant heeft nog een gegenereerd icoon nodig.',
stillMissing: '⚠️ Nog steeds zonder icoon',
```

- [ ] **Step 4: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS (no references to removed fields)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Settings.tsx frontend/src/i18n/en.ts frontend/src/i18n/nl.ts
git commit -m "feat(icons): Settings sync shows match-only result"
```

---

## Phase 8 — Full verification

### Task 8.1: Backend + frontend test sweep

- [ ] **Step 1: Backend**

Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: all pass.

- [ ] **Step 2: Frontend**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: all pass.

- [ ] **Step 3: Manifest coverage guard**

Run: `cd frontend && python scripts/check_manifest_coverage.py`
Expected: in sync.

### Task 8.2: Manual smoke (per design "Risks")

- [ ] **Step 1:** Start app (`npm run dev`), open `/admin`, confirm the "Missing icons" count reflects `icon_requested` plants.
- [ ] **Step 2:** With `NOUS_API_KEY` set, click "Generate icons"; confirm `generated_icons` rows appear, R2 has `icons/generated/*.svg`, and the affected plants render a distinctive icon (eyeball quality — tune prompt or switch `LLM_MODEL` if poor).
- [ ] **Step 3:** Create a plant with an obscure name (e.g. "Basterdkool"); confirm it shows a category placeholder immediately and appears in the admin gap list.
- [ ] **Step 4:** Click Settings → "Sync icons" twice; confirm it reports real matches and NEVER repeats a phantom "+N new".

---

## Self-Review

**Spec coverage:**
- Unified catalog (static+dynamic) → Tasks 4.1–4.2, 7.1–7.2 ✓
- Generation pipeline Approach A (validate+fallback+R2+DB) → Tasks 3.1, 5.1, 5.2 ✓
- Potted↔bare for generated → Tasks 4.3, 5.2 (two rows) ✓
- Creation placeholder+flag → Task 6.1 ✓
- Gap definition = icon_requested → Task 6.2 ✓
- Sync fix (orphans + match-only) → Tasks 1.1, 6.3 ✓
- Nous global migration → Tasks 0.1–0.2 ✓
- Category placeholders committed → Task 1.2 ✓
- generated_icons table → Task 2.1 ✓
- Error handling (fallback, skipped, never-fatal create) → Tasks 5.2, 6.1 ✓
- Tests enumerated in spec → Tasks 3.1, 4.x, 5.x, 6.x, 7.1 ✓

**Type consistency:** `match_icon_key(db, name, species)` defined in 6.1, used in 6.3 ✓. `resolve_placement_icon(db, key, *, container_id)` async signature defined in 4.3, call sites updated in 4.3 ✓. `indexIconUrls`/`resolveIconUrl` defined in 7.1, used in 7.2 ✓. `generated_icons` columns identical across 2.1 / 4.1 / 5.2 ✓. `IconSyncResult` shape updated in 7.2, consumed in 7.3 ✓.

**Open confirmations for the implementer:**
1. Router mount prefix for `/icon-catalog` (`main.py`) — adjust the frontend path if mounted under `/api`.
2. The test `seeded_db` connection must expose `execute_fetchall`; the standalone aiosqlite connections in unit tests (4.1) may need the same accessor or a `.execute().fetchall()` rewrite.
3. `plants` table needs the `icon_requested` column in prod (already present per existing `/gaps` query) — no new migration; tests add it via `ALTER TABLE`.
