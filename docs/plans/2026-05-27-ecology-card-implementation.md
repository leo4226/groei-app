# EcologyCard Frontend — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build the EcologyCard React component and wire up remaining infrastructure so the Plant Detail page shows biodiversity data from the already-working backend pipeline.

**Architecture:** The backend enrichment pipeline (GBIF + DeepSeek LLM) is complete with Alembic migration, `ensure_ecology()`, and `GET /species/{id}/ecology`. The frontend scaffolding (types, i18n, API client, PlantDetail import) is complete. Three gaps remain: the `EcologyCard.tsx` component itself, a yoyo migration for the SQLite production database, and a backfill script.

**Tech Stack:** React 18 + TypeScript, FastAPI + asyncpg + Alembic + yoyo, Tailwind CSS (custom theme tokens)

---

## Context: What's Already Done

- **Alembic migration** `0010` — adds 7 ecology columns to `plant_species` (native_to_nl, invasive_nl, flowering_months, pollinator_value, host_plant_for, ecology_data_source, ecology_enriched_at)
- **`backend/services/ecology_enrichment.py`** — complete pipeline: GBIF distributions → native/invasive flags, DeepSeek LLM → flowering + pollinator, `compute_biodiversity_score()` → 0-100 score
- **`backend/routers/species.py:67-74`** — `GET /species/{id}/ecology` returns `EcologyOut` with lazy enrichment
- **Frontend types** `EcologyOut` and `EcologyDataSource` in `types/index.ts:550-563`
- **Frontend i18n** `ecology` keys in `translations.ts:429-446`, `nl.ts:470-487`, `en.ts:470-483` (with handoffs for both languages)
- **Frontend API client** `species.ecology(id)` in `api/client.ts:197`
- **`PlantDetail.tsx:278`** — imports `EcologyCard` and renders it when `plant.species_id != null`

## What's Missing

1. `EcologyCard.tsx` component (imported but doesn't exist)
2. yoyo migration `0006_add_species_ecology.py` (SQLite production DB)
3. Backfill script `scripts/enrich_species_ecology.py` (batch-enrich existing species)
4. Backend test `tests/test_ecology_enrichment.py`

---

### Task 1: Add yoyo migration for SQLite

**Objective:** Mirror the Alembic migration `0010` as a yoyo step for the production SQLite database.

**Files:**
- Create: `backend/migrations/0006_add_species_ecology.py`

**Step 1: Create the migration file**

The project uses yoyo-migrations for SQLite. Copy the Alembic column additions but in yoyo format:

```python
"""Add species ecology columns to plant_species."""

from yoyo import step

step("""
    ALTER TABLE plant_species
      ADD COLUMN native_to_nl        BOOLEAN,
      ADD COLUMN invasive_nl         BOOLEAN,
      ADD COLUMN flowering_months    TEXT,
      ADD COLUMN pollinator_value    INTEGER,
      ADD COLUMN host_plant_for      TEXT,
      ADD COLUMN ecology_data_source TEXT,
      ADD COLUMN ecology_enriched_at TEXT
""")
```

**Step 2: Verify**

SQLite doesn't have JSONB/SMALLINT/TIMESTAMPTZ types — the migration uses TEXT for JSON columns, INTEGER for pollinator_value, and TEXT for timestamps. The DbAdapter / _maybe_json function in the backend handles reading TEXT columns as JSON. This matches the existing pattern in the codebase.

Run: `cd backend && python -c "from yoyo import read_migrations; from database import get_connection; read_migrations('migrations')"`  
Expected: No errors, migration file detected.

---

### Task 2: Backfill script for existing species

**Objective:** Script that runs the enrichment pipeline on all existing species that haven't been enriched yet.

**Files:**
- Create: `backend/scripts/enrich_species_ecology.py`

**Step 1: Create the script**

```python
#!/usr/bin/env python3
"""Backfill ecology data for all plant_species rows not yet enriched.

Usage:
  cd backend
  python scripts/enrich_species_ecology.py [--dry-run]
"""

import asyncio
import os
import sys
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import init_pool, close_pool, get_db
from services.ecology_enrichment import enrich, compute_biodiversity_score
from datetime import datetime, timezone
import json


def _serialize_months(months):
    """Convert flowering months to JSON string for SQLite compatibility."""
    if months is None:
        return None
    return json.dumps(months)


def _serialize_hosts(hosts):
    if hosts is None:
        return None
    return json.dumps(hosts)


async def main(dry_run: bool = False):
    await init_pool()

    async with get_db() as db:
        # Fetch all species not yet enriched
        rows = await db.execute_fetchall(
            "SELECT id, latin_name, gbif_taxon_key, ecology_enriched_at "
            "FROM plant_species"
        )

        pending = [dict(r) for r in rows if r.get("ecology_enriched_at") is None]
        print(f"Found {len(pending)} species to enrich "
              f"(out of {len(rows)} total)")

        for i, species in enumerate(pending, 1):
            print(f"[{i}/{len(pending)}] {species['latin_name']} (id={species['id']})...")

            profile = await enrich(
                species["latin_name"],
                species.get("gbif_taxon_key"),
            )

            score = compute_biodiversity_score(
                profile.native_to_nl,
                profile.pollinator_value,
                profile.flowering_months,
                profile.host_plant_for,
            )

            enriched_at = datetime.now(timezone.utc)

            if dry_run:
                print(f"  → native={profile.native_to_nl}, invasive={profile.invasive_nl}, "
                      f"pollinator={profile.pollinator_value}, flowering={profile.flowering_months}, "
                      f"source={profile.data_source}, score={score}")
                continue

            await db.execute(
                """UPDATE plant_species SET
                     native_to_nl = ?,
                     invasive_nl = ?,
                     flowering_months = ?,
                     pollinator_value = ?,
                     host_plant_for = ?,
                     ecology_data_source = ?,
                     ecology_enriched_at = ?
                   WHERE id = ?""",
                (
                    profile.native_to_nl,
                    profile.invasive_nl,
                    _serialize_months(profile.flowering_months),
                    profile.pollinator_value,
                    _serialize_hosts(profile.host_plant_for),
                    profile.data_source,
                    enriched_at,
                    species["id"],
                ),
            )
            await db.commit()
            print(f"  → source={profile.data_source}, score={score}")

    await close_pool()
    print("Done.")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(main(dry_run=dry_run))
```

**Step 2: Verify**

Run: `cd backend && python scripts/enrich_species_ecology.py --dry-run`  
Expected: Lists all unenriched species with what would be written. No errors.

---

### Task 3: Create EcologyCard component

**Objective:** Build a React component that fetches and displays ecology data for a species.

**Files:**
- Create: `frontend/src/components/EcologyCard.tsx`

**Step 1: Understand the data shape**

The `GET /species/{id}/ecology` endpoint returns:

```typescript
{
  native_to_nl: boolean | null,
  invasive_nl: boolean | null,
  flowering_months: number[] | null,   // e.g. [4, 5, 6, 7, 8]
  pollinator_value: number | null,      // 0-3
  host_plant_for: string[] | null,
  data_source: 'gbif' | 'llm' | 'mixed' | 'failed',
  enriched_at: string,                  // ISO
  score: number | null                  // 0-100; null when no data
}
```

**Step 2: Write the component**

Create `frontend/src/components/EcologyCard.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useT } from '../context/LanguageContext'
import { species } from '../api/client'
import type { EcologyOut } from '../types'

const MONTH_NAMES_NL = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

function ScoreRing({ score }: { score: number | null }) {
  const t = useT()

  if (score === null) {
    return (
      <div className="text-center text-text-muted text-xs">
        —
      </div>
    )
  }

  const radius = 22
  const circumference = 2 * Math.PI * radius
  const dash = (score / 100) * circumference
  const color = score >= 60 ? '#4ade80' : score >= 30 ? '#fbbf24' : '#f87171'

  return (
    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke="var(--color-surface)"
          strokeWidth="5"
        />
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-sm font-bold text-text">{score}</span>
    </div>
  )
}

function PollinatorLabel({ value }: { value: number | null }) {
  const t = useT()

  if (value === null) return null

  if (value === 3) return <span className="text-text">{t.ecology.pollinatorTopTier}</span>
  if (value === 2) return <span className="text-text">{t.ecology.pollinatorGood}</span>
  if (value === 1) return <span className="text-text">{t.ecology.pollinatorMinor}</span>
  return <span className="text-text-muted">{t.ecology.pollinatorNone}</span>
}

function SourceBadge({ source }: { source: string }) {
  const t = useT()
  if (source === 'llm') {
    return (
      <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
        {t.ecology.sourceLlmWarning}
      </span>
    )
  }
  return (
    <span className="text-[10px] text-text-muted">
      {t.ecology.sourceLabel}: {source}
    </span>
  )
}

function FloweringBadge({ months }: { months: number[] | null }) {
  const t = useT()
  if (!months || months.length === 0) return null

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-text-muted shrink-0">{t.ecology.floweringPrefix}:</span>
      <div className="flex gap-1 flex-wrap">
        {months.map((m) => (
          <span
            key={m}
            className="px-1.5 py-0.5 bg-pink-300/20 text-pink-700 dark:text-pink-300 rounded text-[11px] font-medium"
          >
            {MONTH_NAMES_NL[m - 1]}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function EcologyCard({ speciesId }: { speciesId: number }) {
  const t = useT()
  const [data, setData] = useState<EcologyOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    species.ecology(speciesId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [speciesId])

  if (loading) {
    return (
      <div className="card p-4 mb-6">
        <p className="text-sm text-text-muted">{t.ecology.loading}</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card p-4 mb-6">
        <p className="text-sm text-text-muted">{t.ecology.failed}</p>
      </div>
    )
  }

  return (
    <section className="card p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted">
          {t.ecology.title}
        </h3>
        <SourceBadge source={data.data_source} />
      </div>

      {/* Score + Key facts */}
      <div className="flex items-start gap-4 mb-3">
        <ScoreRing score={data.score} />

        <div className="flex-1 space-y-1 min-w-0">
          {/* Native/Invasive */}
          {data.native_to_nl ? (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              {t.ecology.native}
            </p>
          ) : data.native_to_nl === false ? (
            <p className="text-sm text-text-muted">{t.ecology.nonNative}</p>
          ) : null}

          {data.invasive_nl && (
            <p className="text-sm font-semibold text-fiery-red">{t.ecology.invasive}</p>
          )}

          {/* Pollinator */}
          <p className="text-sm">
            <PollinatorLabel value={data.pollinator_value} />
          </p>

          {/* Host plant */}
          {data.host_plant_for && data.host_plant_for.length > 0 && (
            <p className="text-sm">
              <span className="text-text-muted">{t.ecology.hostPrefix}:</span>{' '}
              <span className="text-text">{data.host_plant_for.join(', ')}</span>
            </p>
          )}
        </div>
      </div>

      {/* Flowering months */}
      <FloweringBadge months={data.flowering_months} />

      {/* Score label (under ring) */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
        <span className="text-[10px] text-text-muted">
          {t.ecology.scoreLabel}
        </span>
        <span className="text-[10px] text-text-muted">
          {t.ecology.enrichedAt}: {new Date(data.enriched_at).toLocaleDateString('nl-NL')}
        </span>
      </div>
    </section>
  )
}
```

**Step 3: Verify**

Run: `cd frontend && npm run dev`  
Expected: Navigate to any plant detail page where plant has a `species_id`. Ecology card loads with:
- Loading state briefly
- Score ring (0-100) with color gradient
- Native/invasive flags
- Pollinator value label
- Flowering months as pink badges
- Source badge (shows LLM warning for `llm` source)
- Date of enrichment

**Edge cases to verify:**
- Plant without species_id: card not rendered (already handled by `{plant.species_id != null && ...}`)
- Plant with species_id but ecology fails: shows error text from i18n
- Plant with native_to_nl=null: no native/non-native line shown
- Plant with no host_plant_for: line not rendered
- Plant with empty flowering_months: badge section not rendered
- Plant with score=null and data_source=failed: shows "—" in ring
- Invasive plant with good pollinator: both shown (invasive warning + biodiversity benefits)

**Step 4: Commit**

```bash
git add frontend/src/components/EcologyCard.tsx
git commit -m "feat: add EcologyCard component to plant detail"
```

---

### Task 4: Verify end-to-end

**Objective:** Confirm the full pipeline works from database to frontend.

**Step 1: Run migration**

```bash
cd backend
yoyo apply migrations/
```

**Step 2: Backfill a few species**

```bash
cd backend
python scripts/enrich_species_ecology.py
```

Expected: Species enriched with GBIF + LLM data, sources logged.

**Step 3: Test API endpoint**

```bash
curl http://localhost:8000/api/species/1/ecology | jq
```

Expected: Response with all EcologyOut fields, score computed.

**Step 4: Verify frontend**

```bash
cd frontend && npm run dev
```

Navigate to `/plants/{id}` for a plant with species. EcologyCard renders correctly.

---

### Task 5: Final commit

```bash
git add backend/migrations/0006_add_species_ecology.py \
        backend/scripts/enrich_species_ecology.py \
        frontend/src/components/EcologyCard.tsx
git commit -m "feat: complete ecology enrichment — migration, backfill, frontend card"
```

---

## Summary

| # | Task | File | Status |
|---|------|------|--------|
| 1 | yoyo migration | `backend/migrations/0006_add_species_ecology.py` | Create |
| 2 | Backfill script | `backend/scripts/enrich_species_ecology.py` | Create |
| 3 | EcologyCard component | `frontend/src/components/EcologyCard.tsx` | Create |
| 4 | End-to-end verification | Manual | Verify |
| 5 | Final commit | — | Commit |
