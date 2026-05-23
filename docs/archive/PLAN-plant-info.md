# PLAN: Plant Info Panel + Rain Context
**Groei app — feature plan for Claude Code**

---

## Overview

Two connected features:

1. **Plant Care Info** — when a plant is tapped, fetch rich care data from the Perenual API (sunlight, watering, fertilizer, bloom months) and display it: a summary in the existing sidebar panel, and a full detail screen reachable from there.
2. **Rain Context Widget** — a small rainfall indicator in the sidebar showing the last 7 days of precipitation for Amsterdam from Open-Meteo (no API key needed), so outdoor watering decisions have real context.

---

## Prerequisites

- Get a free Perenual API key at https://perenual.com/docs/api (sign up, instant key)
- Add it to the backend `.env` as `PERENUAL_API_KEY=sk-...`
- Open-Meteo requires no key

---

## Architecture

All external API calls go through the **FastAPI backend** — never directly from the React frontend. This keeps the Perenual key server-side and avoids CORS issues.

```
React frontend
  → GET /api/plants/{id}/care-info
      → FastAPI checks SQLite cache (plant_care_cache table)
      → if fresh (< 7 days old): return cached data
      → if stale/missing: fetch Perenual API, store in cache, return

  → GET /api/garden/rain-context
      → FastAPI fetches Open-Meteo (last 7 days, Amsterdam)
      → cache in memory for 1 hour (simple dict, no DB needed)
      → return daily mm values + 7-day total
```

---

## Session 1 — Backend: DB migration + Perenual proxy

### What to build

**1. New SQLite table** via Alembic migration:

```sql
CREATE TABLE plant_care_cache (
    id INTEGER PRIMARY KEY,
    scientific_name TEXT UNIQUE NOT NULL,
    perenual_species_id INTEGER,
    sunlight TEXT,           -- JSON array e.g. ["full sun", "part shade"]
    watering TEXT,           -- "frequent" | "average" | "minimum" | "none"
    watering_period TEXT,    -- "morning" etc if available
    fertilization TEXT,      -- from care guide
    bloom_months TEXT,       -- JSON array of month names
    hardiness_min TEXT,
    hardiness_max TEXT,
    description TEXT,
    image_url TEXT,
    raw_json TEXT,           -- full API response for future use
    fetched_at DATETIME NOT NULL,
    FOREIGN KEY ... -- no FK needed, matched by scientific_name
);
```

**2. New FastAPI router** `routers/plant_care.py`:

```
GET /api/plants/{plant_id}/care-info
```

Logic:
1. Look up the plant's `scientific_name` from the plants table
2. Query `plant_care_cache` WHERE `scientific_name = ?` AND `fetched_at > NOW() - 7 days`
3. Cache hit → return immediately
4. Cache miss → call Perenual in two steps:
   - `GET https://perenual.com/api/species-list?q={scientific_name}&key={KEY}` → get species_id
   - `GET https://perenual.com/api/species/details/{id}?key={KEY}` → get full details
   - `GET https://perenual.com/api/species-care-guide-list?species_id={id}&key={KEY}` → care guide
5. Parse and store in cache
6. Return structured response

**Response shape:**
```json
{
  "scientific_name": "Miscanthus sinensis",
  "common_name": "Chinese Silver Grass",
  "sunlight": ["full sun", "part shade"],
  "watering": "average",
  "fertilization": "Apply balanced fertilizer in spring",
  "bloom_months": ["August", "September", "October"],
  "hardiness": { "min": "5", "max": "9" },
  "image_url": "https://...",
  "description": "...",
  "source": "perenual",
  "cached_at": "2026-04-18T..."
}
```

**3. New FastAPI endpoint** `GET /api/garden/rain-context`:

```python
import httpx

OPEN_METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=52.3715&longitude=4.8499"
    "&daily=precipitation_sum"
    "&past_days=7"
    "&forecast_days=1"
    "&timezone=Europe/Amsterdam"
)
```

Response shape:
```json
{
  "days": [
    { "date": "2026-04-11", "mm": 0.0 },
    { "date": "2026-04-12", "mm": 3.2 },
    ...
  ],
  "total_7day_mm": 12.4,
  "assessment": "well_watered" | "moderate" | "dry" | "very_dry"
}
```

Assessment thresholds (Amsterdam context):
- `well_watered`: ≥ 15mm in 7 days
- `moderate`: 8–15mm
- `dry`: 2–8mm
- `very_dry`: < 2mm

**Caching:** simple module-level dict `{"data": ..., "fetched_at": datetime}`, refresh if > 1 hour old.

### Claude Code session starter prompt

```
I'm working on the Groei garden app (React + FastAPI + SQLite).
Read PLAN-plant-info.md for full context.

Please implement Session 1:
1. Alembic migration to add `plant_care_cache` table (schema in the plan)
2. New router `routers/plant_care.py` with:
   - GET /api/plants/{plant_id}/care-info (Perenual proxy with SQLite cache)
   - GET /api/garden/rain-context (Open-Meteo last 7 days, in-memory 1h cache)
3. Register both routes in main.py
4. Add PERENUAL_API_KEY to .env.example

The Perenual key will be in .env as PERENUAL_API_KEY. Use httpx for async HTTP calls.
Handle the case where Perenual returns no results gracefully (return null fields, don't crash).
```

---

## Session 2 — Frontend: Care summary in sidebar

### What to build

Extend the existing **plant detail sidebar panel** (the one that appears when you tap a plant marker on the map) with a new "Care" section below the existing content.

**PlantCareInfo component** (`components/PlantCareInfo.tsx`):

```tsx
// Displays inside the sidebar when a plant is selected
// Shows a compact care summary

interface CareInfo {
  sunlight: string[]
  watering: string
  bloom_months: string[]
  fertilization: string
  total_7day_mm: number
  rain_assessment: 'well_watered' | 'moderate' | 'dry' | 'very_dry'
}
```

**Visual design for the sidebar section:**

```
┌─────────────────────────────────┐
│ 🌱 Care Info                    │
├─────────────────────────────────┤
│ ☀️  Full sun / Part shade       │
│ 💧 Average watering             │
│ 🌸 Blooms: Aug – Oct            │
│ 🌿 Fertilize in spring          │
├─────────────────────────────────┤
│ 🌧 Last 7 days: 3.2mm  [DRY]   │
│ [View full care guide →]        │
└─────────────────────────────────┘
```

- Rain assessment badge: green = well watered, yellow = moderate, orange = dry, red = very dry
- "View full care guide →" opens the detail screen (Session 3)
- Loading state: skeleton placeholders for each row
- Error state: "Care info not available" with a subtle retry link
- Both API calls fire in parallel using `Promise.all`

**Rain context** is fetched once per app session (or when sidebar first opens), shared via a small React context or Zustand slice — not re-fetched per plant.

**Data fetching hooks:**
- `usePlantCareInfo(plantId)` — fetches `/api/plants/{plantId}/care-info`, keyed by plantId
- `useRainContext()` — fetches `/api/garden/rain-context` once, cached in state

Use React Query if it's already in the project, otherwise simple `useEffect` + `useState`.

### Claude Code session starter prompt

```
I'm working on the Groei garden app (React + FastAPI + SQLite).
Read PLAN-plant-info.md for full context. Session 1 (backend) is complete.

Please implement Session 2:
1. Create `hooks/usePlantCareInfo.ts` — fetches /api/plants/{plantId}/care-info
2. Create `hooks/useRainContext.ts` — fetches /api/garden/rain-context once, cached in module scope
3. Create `components/PlantCareInfo.tsx` — compact care summary card (see design in plan)
   - Sunlight, watering, bloom months, fertilization rows with icons
   - Rain context strip at the bottom with assessment badge
   - Loading skeleton + graceful empty state
4. Add <PlantCareInfo plantId={selectedPlant.id} /> to the existing plant sidebar panel,
   below the existing plant name/status content

Keep it visually consistent with the existing sidebar style.
```

---

## Session 3 — Frontend: Full care detail screen

### What to build

A **full-screen plant care detail view**, navigable from the sidebar's "View full care guide →" link.

Route: `/plants/:plantId/care` (or a modal overlay — use whatever routing pattern is already in the app)

**Layout:**

```
┌────────────────────────────────────┐
│ ← Back          Miscanthus sinensis│
│                 Chinese Silver Grass│
├────────────────────────────────────┤
│  [Plant image if available]        │
├────────────────────────────────────┤
│  LIGHT                             │
│  ████████░░  Full sun              │
│  Prefers 6+ hours direct sun       │
│                                    │
│  WATER                             │
│  ████░░░░░░  Average               │
│  Water when top 2cm of soil is dry │
│                                    │
│  FERTILIZER                        │
│  Apply balanced NPK in spring      │
│  Avoid over-fertilizing            │
│                                    │
│  BLOOM CALENDAR                    │
│  J F M A M J J A S O N D          │
│              ● ● ● ●               │
│                                    │
│  HARDINESS                         │
│  Zones 5–9 · Survives Amsterdam    │
│                                    │
│  DESCRIPTION                       │
│  [text...]                         │
└────────────────────────────────────┘
```

**Bloom calendar** is a simple 12-month grid, filled circles on bloom months.

**Hardiness context:** if zones include 8 (Amsterdam is ~8b), show "✓ Hardy in Amsterdam", otherwise show a warning.

### Claude Code session starter prompt

```
I'm working on the Groei garden app (React + FastAPI + SQLite).
Read PLAN-plant-info.md for full context. Sessions 1 & 2 are complete.

Please implement Session 3 — the full plant care detail screen:
1. Create `pages/PlantCareDetail.tsx` (or a full-screen modal, matching existing nav patterns)
2. Reuse the usePlantCareInfo hook from Session 2
3. Implement the layout described in the plan:
   - Plant image (if available from Perenual)
   - Light bar (visual fill based on sunlight type)
   - Water bar
   - Fertilizer text section
   - 12-month bloom calendar (filled circles on bloom months)
   - Hardiness with Amsterdam context (zone 8b)
   - Description text
4. Wire the "View full care guide →" link in PlantCareInfo.tsx to navigate here
5. Add the route to the router

Match the existing app's typography and color palette.
```

---

## Data notes for existing plants

When Perenual is queried, it matches on `scientific_name`. All plants in the Groei database already have scientific names. Expected matches:

| Plant | Scientific Name | Expected Perenual match |
|-------|----------------|------------------------|
| Camellia | Camellia japonica | ✓ Good coverage |
| Clematis | Clematis sp. | ✓ Good coverage |
| Agapanthus | Agapanthus africanus | ✓ Good coverage |
| Artemisia | Artemisia sp. | ✓ Likely match |
| Miscanthus | Miscanthus sinensis | ✓ Good coverage |
| Verbena | Verbena bonariensis | ✓ Good coverage |
| Festuca | Festuca glauca | ✓ Good coverage |
| Geranium | Geranium sp. | ✓ Good coverage |
| Oak | Quercus robur | ✓ Good coverage |
| Bamboo | Fargesia sp. | ⚠️ May need genus fallback |
| Buddleja | Buddleja davidii | ✓ Good coverage |
| Fern | (dormant, unknown sp.) | ⚠️ Skip if no species name |
| Hedera | Hedera helix | ✓ Good coverage |

**Fallback strategy:** if exact species match fails, retry with genus only. If still no match, return `{ source: "not_found" }` and show "Care info not available" gracefully in the UI — never crash.

---

## Open-Meteo endpoint reference

```
https://api.open-meteo.com/v1/forecast
  ?latitude=52.3715
  &longitude=4.8499
  &daily=precipitation_sum
  &past_days=7
  &forecast_days=0
  &timezone=Europe%2FAmsterdam
```

Returns a `daily` object with `time` (array of date strings) and `precipitation_sum` (array of mm floats). No API key. Free forever.

---

## Future ideas (not in this plan)

- **Watering warnings based on rain + plant needs**: combine the `watering` field from Perenual ("frequent" = needs more water, "minimum" = drought tolerant) with the rain assessment to generate per-plant outdoor warnings. E.g. "Agapanthus — frequent waterer, only 2mm rain this week → water today".
- **Seasonal tasks**: use bloom months + current month to show "now flowering" or "prune after flowering" prompts
- **Sun requirement cross-check**: compare Perenual's sunlight field against the heatmap data (Phase 2b) to flag plants in the wrong position
