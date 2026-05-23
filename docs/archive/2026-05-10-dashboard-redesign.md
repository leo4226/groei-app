# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `Dashboard.tsx` to match the Floreren editorial style — almanac header, status banner, two-column task grid, logboek, live Open-Meteo weather, and responsive desktop sidebar layout.

**Architecture:** New `GET /api/dashboard/v2` backend endpoint returns task lists + status counts + recent care log + plant fact in one call. A `useWeather` hook fetches Open-Meteo independently. `Dashboard.tsx` is rebuilt with extracted sub-components and a CSS-grid responsive wrapper (1-col mobile, 2-col ≥900px).

**Tech Stack:** FastAPI + SQLite (backend), React 19 + TypeScript + Zustand (frontend), Open-Meteo public API (no key), Tailwind-free (inline styles matching existing pattern).

---

## File Map

| Action | File |
|---|---|
| Modify | `groei/backend/models.py` |
| Modify | `groei/backend/routers/dashboard.py` |
| Modify | `groei/frontend/src/types/index.ts` |
| Modify | `groei/frontend/src/api/client.ts` |
| Modify | `groei/frontend/src/store/useGroeiStore.ts` |
| Create | `groei/frontend/src/hooks/useWeather.ts` |
| Modify | `groei/frontend/src/pages/Dashboard.tsx` |

---

## Task 1: Backend — add models for v2 response

**Files:**
- Modify: `groei/backend/models.py` (after `DashboardResponse` class, ~line 157)

- [ ] **Step 1: Add models to `models.py`**

Open `groei/backend/models.py`. After the existing `DashboardResponse` class (around line 157), add:

```python
class StatusCounts(BaseModel):
    total: int
    on_schedule: int
    thirsty: int
    dry: int


class RecentLogEntry(BaseModel):
    id: int
    plant_id: int
    plant_name: str
    icon_key: str | None
    care_type: str
    done_at: str
    notes: str | None


class DashboardV2Response(BaseModel):
    overdue: list[CareTask] = []
    due_today: list[CareTask] = []
    upcoming: list[CareTask] = []
    status_counts: StatusCounts
    recent_log: list[RecentLogEntry] = []
    plant_fact: 'PlantFactOut | None' = None
```

- [ ] **Step 2: Verify the models import cleanly**

Run from `groei/`:
```bash
cd backend && python -c "from models import DashboardV2Response, StatusCounts, RecentLogEntry; print('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add groei/backend/models.py
git commit -m "feat: add DashboardV2Response, StatusCounts, RecentLogEntry models"
```

---

## Task 2: Backend — add `GET /api/dashboard/v2` endpoint

**Files:**
- Modify: `groei/backend/routers/dashboard.py`

- [ ] **Step 1: Add the v2 endpoint**

Open `groei/backend/routers/dashboard.py`. Add these imports at the top (after existing imports):

```python
import json
import random

from fastapi import APIRouter, Depends
from database import db_dep
from models import DashboardResponse, DashboardV2Response, StatusCounts, RecentLogEntry, CareTask, PlantFactOut
from datetime import date
```

Then append the new endpoint **after** the existing `get_plant_fact` function:

```python
@router.get("/dashboard/v2", response_model=DashboardV2Response)
async def get_dashboard_v2(db = Depends(db_dep)):
    today = str(date.today())

    # ── Task lists (same logic as /dashboard) ──
    cursor = await db.execute("""
        SELECT
            cs.id as schedule_id,
            cs.plant_id,
            p.name as plant_name,
            p.photo_path as plant_photo,
            l.name as location,
            cs.care_type,
            cs.next_due,
            cs.last_done_by,
            u.name as last_done_by_name,
            cs.last_done as last_done_at
        FROM care_schedules cs
        JOIN plants p ON cs.plant_id = p.id
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN users u ON cs.last_done_by = u.id
        WHERE cs.is_active = 1 AND p.is_active = 1
        ORDER BY cs.next_due ASC
    """)
    rows = await cursor.fetchall()

    overdue, due_today, upcoming = [], [], []
    for row in rows:
        days_diff = (date.fromisoformat(row["next_due"]) - date.today()).days
        task = CareTask(
            plant_id=row["plant_id"],
            plant_name=row["plant_name"],
            plant_photo=row["plant_photo"],
            location=row["location"],
            care_type=row["care_type"],
            days_overdue=-days_diff,
            last_done_by=row["last_done_by_name"],
            last_done_at=row["last_done_at"],
            schedule_id=row["schedule_id"],
        )
        if days_diff < 0:
            overdue.append(task)
        elif days_diff == 0:
            due_today.append(task)
        elif days_diff <= 7:
            upcoming.append(task)
    overdue.sort(key=lambda t: t.days_overdue, reverse=True)

    # ── Status counts ──
    total_row = await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1"
    )
    total = total_row[0]["n"] if total_row else 0

    water_rows = await db.execute_fetchall("""
        SELECT
            SUM(CASE WHEN CAST(julianday('now') - julianday(cs.next_due) AS INTEGER) BETWEEN 1 AND 2 THEN 1 ELSE 0 END) as thirsty,
            SUM(CASE WHEN CAST(julianday('now') - julianday(cs.next_due) AS INTEGER) >= 3 THEN 1 ELSE 0 END) as dry
        FROM care_schedules cs
        JOIN plants p ON cs.plant_id = p.id
        WHERE cs.care_type = 'water' AND cs.is_active = 1 AND p.is_active = 1
    """)
    thirsty = int(water_rows[0]["thirsty"] or 0) if water_rows else 0
    dry = int(water_rows[0]["dry"] or 0) if water_rows else 0

    on_schedule_rows = await db.execute_fetchall("""
        SELECT COUNT(DISTINCT p.id) as n
        FROM plants p
        WHERE p.is_active = 1
        AND p.id NOT IN (
            SELECT DISTINCT plant_id FROM care_schedules
            WHERE is_active = 1 AND next_due < date('now')
        )
    """)
    on_schedule = on_schedule_rows[0]["n"] if on_schedule_rows else 0

    status_counts = StatusCounts(total=total, on_schedule=on_schedule, thirsty=thirsty, dry=dry)

    # ── Recent log ──
    log_rows = await db.execute_fetchall("""
        SELECT cl.id, cl.plant_id, p.name as plant_name, p.icon_key,
               cl.care_type, cl.done_at, cl.notes
        FROM care_log cl
        JOIN plants p ON cl.plant_id = p.id
        WHERE cl.skipped = 0
        ORDER BY cl.done_at DESC
        LIMIT 5
    """)
    recent_log = [
        RecentLogEntry(
            id=r["id"],
            plant_id=r["plant_id"],
            plant_name=r["plant_name"],
            icon_key=r["icon_key"],
            care_type=r["care_type"],
            done_at=r["done_at"],
            notes=r["notes"],
        )
        for r in log_rows
    ]

    # ── Plant fact (same logic as /plant-fact) ──
    fact_rows = await db.execute_fetchall("""
        SELECT p.id, p.name, p.icon_key, ps.phenology_json, ps.common_name_nl
        FROM plants p
        JOIN plant_species ps ON p.species_id = ps.id
        WHERE p.is_active = 1 AND p.species_id IS NOT NULL
    """)
    candidates = []
    for row in fact_rows:
        phen_str = row["phenology_json"]
        if not phen_str:
            continue
        try:
            phen = json.loads(phen_str) if isinstance(phen_str, str) else phen_str
        except json.JSONDecodeError:
            continue
        fact = phen.get("interesting_facts_nl", "").strip()
        if not fact:
            continue
        candidates.append(PlantFactOut(
            plant_id=row["id"],
            plant_name=row["name"],
            icon_key=row["icon_key"],
            fact_nl=fact,
            species_name=row["common_name_nl"],
        ))
    plant_fact = random.choice(candidates) if candidates else None

    return DashboardV2Response(
        overdue=overdue,
        due_today=due_today,
        upcoming=upcoming,
        status_counts=status_counts,
        recent_log=recent_log,
        plant_fact=plant_fact,
    )
```

- [ ] **Step 2: Start the backend and verify the endpoint responds**

Run from `groei/`:
```bash
npm run dev:backend
```

In a second terminal:
```bash
curl http://localhost:8000/api/dashboard/v2 | python -m json.tool | head -40
```

Expected: JSON with keys `overdue`, `due_today`, `upcoming`, `status_counts` (with `total`, `on_schedule`, `thirsty`, `dry`), `recent_log`, `plant_fact`.

- [ ] **Step 3: Commit**

```bash
git add groei/backend/routers/dashboard.py
git commit -m "feat: add GET /api/dashboard/v2 endpoint with status counts and recent log"
```

---

## Task 3: Frontend — types + API client function

**Files:**
- Modify: `groei/frontend/src/types/index.ts`
- Modify: `groei/frontend/src/api/client.ts`

- [ ] **Step 1: Add types to `types/index.ts`**

Open `groei/frontend/src/types/index.ts`. After the existing `DashboardData` interface (around line 84), add:

```typescript
export interface StatusCounts {
  total: number
  on_schedule: number
  thirsty: number
  dry: number
}

export interface RecentLogEntry {
  id: number
  plant_id: number
  plant_name: string
  icon_key: string | null
  care_type: string
  done_at: string
  notes: string | null
}

export interface DashboardV2Data {
  overdue: CareTask[]
  due_today: CareTask[]
  upcoming: CareTask[]
  status_counts: StatusCounts
  recent_log: RecentLogEntry[]
  plant_fact: PlantFactOut | null
}
```

- [ ] **Step 2: Add `fetchDashboardV2` to `api/client.ts`**

Open `groei/frontend/src/api/client.ts`. Find the line with `fetchDashboard` (around line 83) and add the new function directly after it:

```typescript
export const fetchDashboardV2       = ()                    => api<DashboardV2Data>('GET', '/dashboard/v2')
```

Also update the import at the top of `client.ts` to include the new types:

```typescript
import type { User, Location, Plant, DashboardData, DashboardV2Data, PlantCreateInput, MapInfo, MapDetail, MapPlant, MapObject, MapItems, ObjectCreateInput, GroundZone, PlantIcon, IconSyncResult, PlantAlert, AlertSummary, PlantFactOut, StatusCounts, RecentLogEntry } from '../types'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `groei/`:
```bash
npm run dev:frontend
```

Expected: Vite starts with no TypeScript errors in the terminal.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/types/index.ts groei/frontend/src/api/client.ts
git commit -m "feat: add DashboardV2Data types and fetchDashboardV2 API function"
```

---

## Task 4: Store — add `dashboardV2` + `loadDashboardV2`

**Files:**
- Modify: `groei/frontend/src/store/useGroeiStore.ts`

- [ ] **Step 1: Add `dashboardV2` to the store interface**

Open `groei/frontend/src/store/useGroeiStore.ts`. Update the import at the top:

```typescript
import type { User, Location, Plant, DashboardData, DashboardV2Data, PlantCreateInput, MapInfo, PlantFactOut } from '../types'
import * as api from '../api/client'
```

Add `dashboardV2` to the `GroeiStore` interface (after the existing `dashboard` line):

```typescript
dashboard: DashboardData | null
dashboardV2: DashboardV2Data | null
```

Add `loadDashboardV2` to the interface (after `loadDashboard`):

```typescript
loadDashboardV2: () => Promise<void>
```

- [ ] **Step 2: Add initial state + implementation**

In the `create<GroeiStore>` call, add to the initial state (after `dashboard: null`):

```typescript
dashboardV2: null,
```

Add the `loadDashboardV2` action after `loadDashboard`:

```typescript
loadDashboardV2: async () => {
  try {
    const dashboardV2 = await api.fetchDashboardV2()
    set({ dashboardV2 })
  } catch (e) {
    set({ error: (e as Error).message })
  }
},
```

- [ ] **Step 3: Update `markCareDone` to also remove from `dashboardV2`**

Find the `markCareDone` action. Update its `set(...)` call to also update `dashboardV2`:

```typescript
markCareDone: async (plantId, careType, notes) => {
  const userId = get().activeUserId
  if (!userId) throw new Error('No active user')
  await api.markCareDone(plantId, careType, userId, notes)
  set((s) => ({
    plants: s.plants.map((p) =>
      p.id === plantId ? { ...p, care_status: 'good' as const, most_urgent: undefined } : p,
    ),
    dashboard: _removeDashboardTask(s.dashboard, plantId, careType),
    dashboardV2: s.dashboardV2 ? {
      ...s.dashboardV2,
      overdue: s.dashboardV2.overdue.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
      due_today: s.dashboardV2.due_today.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
      upcoming: s.dashboardV2.upcoming.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
    } : null,
  }))
},
```

Similarly update `skipCare`:

```typescript
skipCare: async (plantId, careType) => {
  const userId = get().activeUserId
  if (!userId) throw new Error('No active user')
  await api.skipCare(plantId, careType, userId)
  set((s) => ({
    dashboard: _removeDashboardTask(s.dashboard, plantId, careType),
    dashboardV2: s.dashboardV2 ? {
      ...s.dashboardV2,
      overdue: s.dashboardV2.overdue.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
      due_today: s.dashboardV2.due_today.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
      upcoming: s.dashboardV2.upcoming.filter(t => !(t.plant_id === plantId && t.care_type === careType)),
    } : null,
  }))
},
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run dev:frontend
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add groei/frontend/src/store/useGroeiStore.ts
git commit -m "feat: add dashboardV2 state and loadDashboardV2 to store"
```

---

## Task 5: Create `useWeather` hook

**Files:**
- Create: `groei/frontend/src/hooks/useWeather.ts`

- [ ] **Step 1: Create the hook**

Create `groei/frontend/src/hooks/useWeather.ts` with the full content below:

```typescript
import { useState, useEffect } from 'react'

const WMO_NL: Record<number, string> = {
  0: 'helder',
  1: 'overwegend helder',
  2: 'gedeeltelijk bewolkt',
  3: 'bewolkt',
  45: 'mist',
  48: 'rijpmist',
  51: 'lichte motregen',
  53: 'motregen',
  55: 'dichte motregen',
  61: 'lichte regen',
  63: 'regen',
  65: 'zware regen',
  71: 'lichte sneeuwval',
  73: 'sneeuwval',
  75: 'zware sneeuwval',
  80: 'lichte buien',
  81: 'buien',
  82: 'zware buien',
  95: 'onweer',
  96: 'onweer met hagel',
  99: 'zwaar onweer met hagel',
}

export type WeatherIcon = 'sun' | 'partly' | 'rain' | 'snow' | 'thunder'

function wmoToIcon(code: number): WeatherIcon {
  if (code <= 1) return 'sun'
  if (code <= 3) return 'partly'
  if (code >= 95) return 'thunder'
  if (code >= 71 && code <= 77) return 'snow'
  return 'rain'
}

export interface WeatherDay {
  date: string
  maxTemp: number
  icon: WeatherIcon
  conditionNl: string
}

export interface WeatherData {
  currentTemp: number
  currentHumidity: number
  currentConditionNl: string
  currentIcon: WeatherIcon
  sunrise: string   // ISO datetime string, e.g. "2026-05-10T05:54"
  sunset: string    // ISO datetime string
  forecast: WeatherDay[]
}

const FALLBACK_LAT = 52.3715
const FALLBACK_LON = 4.8499

export function useWeather(lat: number | null, lon: number | null): {
  weather: WeatherData | null
  loading: boolean
  error: string | null
} {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const resolvedLat = lat ?? FALLBACK_LAT
  const resolvedLon = lon ?? FALLBACK_LON

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      latitude: String(resolvedLat),
      longitude: String(resolvedLon),
      current: 'temperature_2m,relative_humidity_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,sunrise,sunset',
      timezone: 'Europe/Amsterdam',
      forecast_days: '7',
    })

    fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then(r => {
        if (!r.ok) throw new Error(`Open-Meteo: ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        const cur = data.current
        const daily = data.daily

        const forecast: WeatherDay[] = (daily.time as string[]).map((d, i) => ({
          date: d,
          maxTemp: Math.round(daily.temperature_2m_max[i]),
          icon: wmoToIcon(daily.weather_code[i]),
          conditionNl: WMO_NL[daily.weather_code[i]] ?? 'onbekend',
        }))

        setWeather({
          currentTemp: Math.round(cur.temperature_2m),
          currentHumidity: Math.round(cur.relative_humidity_2m),
          currentConditionNl: WMO_NL[cur.weather_code] ?? 'onbekend',
          currentIcon: wmoToIcon(cur.weather_code),
          sunrise: daily.sunrise[0],
          sunset: daily.sunset[0],
          forecast,
        })
        setLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [resolvedLat, resolvedLon])

  return { weather, loading, error }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run dev:frontend
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/hooks/useWeather.ts
git commit -m "feat: add useWeather hook (Open-Meteo, WMO Dutch labels)"
```

---

## Task 6: Dashboard header + status banner

**Files:**
- Modify: `groei/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace the `Dashboard` default export and add header/banner components**

This task replaces the entire content of `Dashboard.tsx`. Open the file. Replace **everything from line 103 to end** (keep the imports and helpers at the top, and existing sub-components like `HeroStat`, `SectionHeader`, `MapCard`, `NewMapCard`, `TaskCard`, `TaskSkeletons`, `CalmEmptyState`) with the new version below.

First, update the import block at the top to include the new types and hook:

```typescript
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { CARE_TYPE_INFO } from '../types'
import type { CareTask, RecentLogEntry, MapInfo, PlantFactOut } from '../types'
import type { WeatherData, WeatherIcon } from '../hooks/useWeather'
import { useWeather } from '../hooks/useWeather'
import UserSwitcher from '../components/UserSwitcher'
import { HALO_COLORS } from '../hooks/usePlantStatus'
```

Keep `CARE_LABEL_NL`, `PX_PER_M`, `parseMapDimensions`, `PAGE_DECOR`, `PageDecor`, `getGreeting`, `getDutchDate`, `leadCopy`, `summaryLede` unchanged.

Replace the `Dashboard` default export with:

```typescript
export default function Dashboard() {
  const { dashboardV2, activeUserId, users, maps, loadDashboardV2, isLoading } = useGroeiStore()
  const activeUser = users.find((u) => u.id === activeUserId)

  const outdoorMap = maps.find((m) => m.map_type === 'outdoor')
  const { weather } = useWeather(outdoorMap?.lat ?? null, outdoorMap?.lon ?? null)

  useEffect(() => {
    loadDashboardV2()
  }, [loadDashboardV2])

  const overdueCount = dashboardV2?.overdue.length ?? 0
  const dueTodayCount = dashboardV2?.due_today.length ?? 0
  const upcomingCount = dashboardV2?.upcoming.length ?? 0
  const totalTasks = overdueCount + dueTodayCount + upcomingCount
  const nextCareTask = dashboardV2?.overdue[0] ?? dashboardV2?.due_today[0] ?? null

  return (
    <div style={{ paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      <PageDecor />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <DashboardHeader
          greeting={getGreeting()}
          userName={activeUser?.name ?? '…'}
          date={getDutchDate()}
          lede={leadCopy(overdueCount, dueTodayCount)}
          weather={weather}
          nextCareTask={nextCareTask}
        />

        {/* ── Status Banner ── */}
        {dashboardV2 && (
          <StatusBanner counts={dashboardV2.status_counts} />
        )}

        {/* ── Responsive grid: main + sidebar ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 0,
        }}
          className="dashboard-grid"
        >
          {/* MAIN column */}
          <div>
            {/* Mijn Tuinen */}
            <section style={{ padding: '0 24px' }}>
              <SectionHeader
                leftLede={maps.length === 0 ? 'Nog geen tuinen' : maps.length === 1 ? 'Toon je tuin' : `Toon alle ${maps.length} tuinen`}
                rightMarker="§ Mijn Tuinen"
                rightAction={{ to: '/maps', label: 'Beheer →' }}
              />
              {maps.length > 0 ? (
                <div className="no-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: 14, margin: '0 -24px', padding: '0 24px 8px' }}>
                  {maps.map((map) => <MapCard key={map.id} map={map} />)}
                  <NewMapCard />
                </div>
              ) : (
                <Link to="/maps" style={{
                  display: 'flex', width: '100%', height: 132,
                  border: '1px dashed var(--color-border)', borderRadius: 14,
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-muted)', background: 'var(--color-surface)',
                  textDecoration: 'none', marginBottom: 18,
                }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>Voeg een tuin toe</span>
                </Link>
              )}
            </section>

            {/* Vandaag */}
            <section style={{ padding: '0 24px' }}>
              <SectionHeader
                leftLede={summaryLede(overdueCount, dueTodayCount, upcomingCount)}
                rightMarker="§ Vandaag"
              />
              {isLoading && <TaskSkeletons />}
              {!isLoading && totalTasks === 0 && <CalmEmptyState />}
              {!isLoading && dashboardV2 && totalTasks > 0 && (
                <TodayGrid
                  overdue={dashboardV2.overdue}
                  dueToday={dashboardV2.due_today}
                />
              )}
            </section>

            {/* Logboek */}
            {dashboardV2 && dashboardV2.recent_log.length > 0 && (
              <section style={{ padding: '0 24px' }}>
                <SectionHeader leftLede="" rightMarker="§ Logboek" />
                <LogboekSection entries={dashboardV2.recent_log} />
              </section>
            )}
          </div>

          {/* SIDEBAR column */}
          <div className="dashboard-sidebar" style={{ padding: '0 24px' }}>
            <WeatherCard weather={weather} />
            {dashboardV2?.plant_fact && (
              <CareTipCard fact={dashboardV2.plant_fact} />
            )}
            <UnderConstructionCard
              icon="🌿"
              title="Detectie"
              description="Onkruid & ziektes herkennen — binnenkort beschikbaar."
            />
            <UnderConstructionCard
              icon="📷"
              title="Foto-identificatie"
              description="Richt de camera op een plant — binnenkort beschikbaar."
            />
          </div>
        </div>

      </div>

      <style>{`
        @media (min-width: 900px) {
          .dashboard-grid {
            grid-template-columns: 1fr 340px !important;
            align-items: start;
            padding: 0 24px;
            gap: 28px;
          }
          .dashboard-sidebar {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Add `DashboardHeader` component**

Add this new component to `Dashboard.tsx` (before the `HeroStat` helper component):

```typescript
function DashboardHeader({
  greeting, userName, date, lede, weather, nextCareTask,
}: {
  greeting: string
  userName: string
  date: string
  lede: string
  weather: WeatherData | null
  nextCareTask: CareTask | null
}) {
  const sunrise = weather ? new Date(weather.sunrise).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '—'
  const sunset  = weather ? new Date(weather.sunset).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '—'
  const temp    = weather ? `${weather.currentTemp}°C` : '—'
  const nextCare = nextCareTask
    ? `${nextCareTask.plant_name}${nextCareTask.days_overdue > 0 ? ` · ${nextCareTask.days_overdue}d te laat` : ' · vandaag'}`
    : 'Alles op schema'

  return (
    <header style={{
      padding: '40px 24px 20px',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      gap: 20,
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        {/* Eyebrow */}
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: 'var(--color-text-muted)',
          margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 24, height: 1, background: 'var(--color-border)', flex: 'none' }} />
          {greeting} · {date}
          <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </p>

        {/* H1 */}
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 500,
          fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 0.95,
          letterSpacing: '-0.02em', color: 'var(--color-text)', margin: 0,
        }}>
          {greeting},{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>
            {userName}
          </em>.
        </h1>

        {/* Lede */}
        <p style={{
          fontFamily: 'var(--font-heading)', fontStyle: 'italic',
          fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-soft)',
          maxWidth: 440, margin: '8px 0 16px 0',
        }}>
          {lede}
        </p>

        {/* Almanac 2×2 grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden',
          maxWidth: 440,
        }}>
          {[
            { label: 'Zonsopkomst', value: sunrise },
            { label: 'Zonsondergang', value: sunset },
            { label: 'Buitentemperatuur', value: temp },
            { label: 'Volgende verzorging', value: nextCare },
          ].map((row, i) => (
            <div key={row.label} style={{
              padding: '10px 14px',
              borderRight: i % 2 === 0 ? '1px solid var(--color-border)' : 'none',
              borderBottom: i < 2 ? '1px solid var(--color-border)' : 'none',
              background: 'var(--color-surface)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                textTransform: 'uppercase', letterSpacing: '0.18em',
                color: 'var(--color-text-muted)', marginBottom: 3,
              }}>{row.label}</div>
              <div style={{
                fontFamily: 'var(--font-heading)', fontSize: 14,
                color: i === 2 ? 'var(--color-overdue)' : 'var(--color-text)',
                fontWeight: 500,
              }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16, paddingTop: 4 }}>
        <UserSwitcher />
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Add `StatusBanner` component**

Add after `DashboardHeader`:

```typescript
function StatusBanner({ counts }: { counts: { total: number; on_schedule: number; thirsty: number; dry: number } }) {
  const cells = [
    { label: 'Collectie', value: counts.total, color: 'var(--color-text)' },
    { label: 'In schema', value: counts.on_schedule, color: 'var(--color-primary)' },
    { label: 'Dorstig', value: counts.thirsty, color: counts.thirsty > 0 ? 'var(--color-due)' : 'var(--color-text-muted)' },
    { label: 'Droog', value: counts.dry, color: counts.dry > 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)' },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
      border: '1px solid var(--color-border)',
      borderLeft: 'none', borderRight: 'none',
      background: 'var(--color-surface)',
      margin: '0 0 4px',
    }}>
      {cells.map((cell, i) => (
        <div key={cell.label} style={{
          padding: '14px 16px', textAlign: 'center',
          borderRight: i < cells.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            textTransform: 'uppercase', letterSpacing: '0.18em',
            color: 'var(--color-text-muted)', marginBottom: 5,
          }}>{cell.label}</div>
          <div style={{
            fontFamily: 'var(--font-heading)', fontSize: 28,
            fontWeight: 500, lineHeight: 1, color: cell.color,
          }}>{cell.value}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Add component stubs so the file compiles**

The Dashboard export now references `TodayGrid`, `LogboekSection`, `WeatherCard`, `CareTipCard`, and `UnderConstructionCard` — these get full implementations in Tasks 7 and 8. Add these stubs at the bottom of `Dashboard.tsx` so TypeScript compiles now:

```typescript
// Stubs — replaced in Tasks 7 and 8
function TodayGrid(_p: { overdue: CareTask[]; dueToday: CareTask[] }) {
  return <p style={{ padding: '20px 24px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>Vandaag laden…</p>
}
function LogboekSection(_p: { entries: RecentLogEntry[] }) { return null }
function WeatherCard(_p: { weather: WeatherData | null }) { return null }
function CareTipCard(_p: { fact: PlantFactOut }) { return null }
function UnderConstructionCard(_p: { icon: string; title: string; description: string }) { return null }
```

- [ ] **Step 5: Open the browser and check the header + banner render**

Run `npm run dev` from `groei/`, open `http://localhost:5173`, navigate to the dashboard. Verify:
- Greeting + date eyebrow appears
- 2×2 almanac grid shows (may show `—` while weather loads, then fills in)
- Status banner shows 4 cells below the header
- "Vandaag laden…" placeholder appears where TodayGrid will be

- [ ] **Step 6: Commit**

```bash
git add groei/frontend/src/pages/Dashboard.tsx
git commit -m "feat: add DashboardHeader with almanac grid and StatusBanner"
```

---

## Task 7: Two-column task grid (`TodayGrid`)

**Files:**
- Modify: `groei/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace the `TodayGrid` stub with the real implementation**

Find the stub `function TodayGrid(...)` added in Task 6 and replace it entirely with the real implementation below (keep it in the same location in the file):

```typescript
function TodayGrid({ overdue, dueToday }: { overdue: CareTask[]; dueToday: CareTask[] }) {
  const allDue = [...overdue, ...dueToday]
  const waterTasks = allDue.filter(t => t.care_type === 'water')
  const attnTasks  = allDue.filter(t => t.care_type !== 'water')

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      border: '1px solid var(--color-border)', borderRadius: 14,
      overflow: 'hidden', marginBottom: 24,
    }}>
      {/* Column headers */}
      <TodayColHead label="Water" count={waterTasks.length} pip="overdue" />
      <TodayColHead label="Aandacht" count={attnTasks.length} pip="due" borderLeft />

      {/* Task rows */}
      <div style={{ borderRight: '1px solid var(--color-border-soft)' }}>
        {waterTasks.length === 0
          ? <EmptyCol />
          : waterTasks.map(t => <TodayTaskRow key={t.schedule_id} task={t} />)}
      </div>
      <div>
        {attnTasks.length === 0
          ? <EmptyCol />
          : attnTasks.map(t => <TodayTaskRow key={t.schedule_id} task={t} />)}
      </div>
    </div>
  )
}

function TodayColHead({ label, count, pip, borderLeft }: { label: string; count: number; pip: 'overdue' | 'due'; borderLeft?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '12px 16px 10px',
      borderBottom: '1px solid var(--color-border-soft)',
      borderLeft: borderLeft ? '1px solid var(--color-border-soft)' : 'none',
      fontFamily: 'var(--font-mono)', fontSize: 10,
      textTransform: 'uppercase', letterSpacing: '0.18em',
      color: 'var(--color-text-muted)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: pip === 'overdue' ? 'var(--color-overdue)' : 'var(--color-due)',
      }} />
      {label}
      <span style={{
        marginLeft: 'auto', fontFamily: 'var(--font-heading)',
        fontStyle: 'italic', fontSize: 14, color: 'var(--color-text-soft)',
        textTransform: 'none', letterSpacing: 0,
      }}>{count}</span>
    </div>
  )
}

function EmptyCol() {
  return (
    <div style={{ padding: '20px 16px', textAlign: 'center' }}>
      <span style={{
        fontFamily: 'var(--font-heading)', fontStyle: 'italic',
        fontSize: 13, color: 'var(--color-text-muted)',
      }}>Niets — alles op schema.</span>
    </div>
  )
}

function TodayTaskRow({ task }: { task: CareTask }) {
  const markCareDone = useGroeiStore(s => s.markCareDone)
  const careLabel = CARE_LABEL_NL[task.care_type] ?? task.care_type
  const isOverdue = task.days_overdue > 0

  const taskHaloColor: string | null =
    task.care_type === 'water' && task.days_overdue > 0  ? HALO_COLORS.dry :
    task.care_type === 'water' && task.days_overdue === 0 ? HALO_COLORS.thirsty :
    null

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '44px 1fr auto',
      gap: 10, alignItems: 'center',
      padding: '12px 14px',
      borderBottom: '1px dashed var(--color-border-soft)',
    }}>
      {/* Icon */}
      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        {taskHaloColor && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            background: `radial-gradient(circle, ${taskHaloColor} 0%, transparent 70%)`,
            opacity: 0.5, pointerEvents: 'none',
          }} />
        )}
        {task.plant_photo ? (
          <img src={task.plant_photo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', display: 'block', position: 'relative' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)', border: '1px solid var(--color-border-soft)' }} />
        )}
      </div>

      {/* Meta */}
      <Link to={`/plants/${task.plant_id}`} style={{ minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
        <p style={{
          margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 14,
          color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{task.plant_name}</p>
        <p style={{
          margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: 8,
          textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)',
        }}>
          {careLabel}{task.location ? ` · ${task.location}` : ''}
        </p>
        {isOverdue && (
          <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-overdue)' }}>
            {task.days_overdue}d te laat
          </p>
        )}
        {!isOverdue && (
          <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-due)' }}>
            Vandaag
          </p>
        )}
      </Link>

      {/* Done button */}
      <button
        onClick={() => markCareDone(task.plant_id, task.care_type)}
        style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
          color: 'var(--color-primary)', border: '1px solid var(--color-primary)',
          borderRadius: 100, background: 'transparent', padding: '6px 10px',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-surface)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-primary)' }}
      >Gedaan</button>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to the dashboard. The "Vandaag" section should now show a two-column grid: Water on the left, Aandacht on the right. Each column shows task rows with icon, plant name, care label, overdue label, and Gedaan button. If a column is empty it shows "Niets — alles op schema."

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/pages/Dashboard.tsx
git commit -m "feat: replace flat task list with two-column TodayGrid (water/attention)"
```

---

## Task 8: Logboek section + sidebar cards

**Files:**
- Modify: `groei/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace the `LogboekSection`, `WeatherCard`, `CareTipCard`, `UnderConstructionCard` stubs with real implementations**

Find each stub added in Task 6 and replace it. The `WeatherIcon` helper is new (not a stub) — add it before `WeatherCard`:

```typescript
const LOG_TAG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  water:       { label: 'water',      color: 'var(--color-primary)',  bg: 'rgba(47,93,58,.08)',   border: 'rgba(47,93,58,.2)' },
  fertilize:   { label: 'bemesten',   color: 'var(--color-primary)',  bg: 'rgba(47,93,58,.08)',   border: 'rgba(47,93,58,.2)' },
  repot_check: { label: 'verpotten',  color: 'var(--color-text-soft)', bg: 'rgba(74,90,71,.06)',  border: 'var(--color-border)' },
  prune:       { label: 'snoeien',    color: 'var(--color-text-soft)', bg: 'rgba(74,90,71,.06)',  border: 'var(--color-border)' },
  mist:        { label: 'sproeien',   color: 'var(--color-primary)',  bg: 'rgba(47,93,58,.08)',   border: 'rgba(47,93,58,.2)' },
  rotate:      { label: 'draaien',    color: 'var(--color-text-muted)', bg: 'rgba(138,148,130,.08)', border: 'var(--color-border-soft)' },
}

function LogboekSection({ entries }: { entries: RecentLogEntry[] }) {
  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
      {entries.map((entry, i) => {
        const tag = LOG_TAG[entry.care_type] ?? LOG_TAG.water
        const dateStr = new Date(entry.done_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
        const timeStr = new Date(entry.done_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        const actionLabel = CARE_LABEL_NL[entry.care_type] ?? entry.care_type

        return (
          <div key={entry.id} style={{
            display: 'grid', gridTemplateColumns: '56px 1fr auto',
            gap: 14, padding: '16px 18px', alignItems: 'flex-start',
            borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
          }}>
            {/* Plant icon */}
            <div style={{
              width: 56, height: 56, borderRadius: 8,
              background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)',
              border: '1px solid var(--color-border-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {entry.icon_key ? (
                <img src={`/api/icons/${entry.icon_key}.svg`} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-text-muted)' }}>🌿</span>
              )}
            </div>

            {/* Meta */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 3 }}>
                {dateStr} · {timeStr}
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-text)', marginBottom: 2 }}>
                {actionLabel} · <em style={{ color: 'var(--color-primary)' }}>{entry.plant_name}</em>
              </div>
              {entry.notes && (
                <p style={{
                  margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic',
                  fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.45,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{entry.notes}</p>
              )}
            </div>

            {/* Tag */}
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
              letterSpacing: '0.15em', color: tag.color, background: tag.bg,
              padding: '3px 8px', borderRadius: 99, border: `1px solid ${tag.border}`,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>{tag.label}</span>
          </div>
        )
      })}
      <div style={{
        borderTop: '1px solid var(--color-border-soft)', padding: '12px 18px',
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <Link to="/plants" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-primary)', textDecoration: 'none' }}>
          Volledig logboek →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add sidebar components**

Add `WeatherCard`, `CareTipCard`, and `UnderConstructionCard` after `LogboekSection`:

```typescript
function WeatherIcon({ icon, size = 22 }: { icon: WeatherIcon; size?: number }) {
  if (icon === 'sun') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#D9A418" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" fill="#F4C542" stroke="none"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>
    </svg>
  )
  if (icon === 'snow') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" opacity=".5"/>
      <circle cx="12" cy="12" r="2" fill="#6B8FCA" stroke="none"/>
    </svg>
  )
  if (icon === 'rain' || icon === 'thunder') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 14a4 4 0 1 1 1-7.9A5 5 0 0 1 17 7a4 4 0 0 1 0 8H6z" fill="#C5D4ED" stroke="#6B8FCA"/>
      <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>
    </svg>
  )
  // partly
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8A9482" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="9" cy="10" r="3" fill="#F4C542" stroke="#D9A418"/>
      <path d="M8 16a4 4 0 1 1 1-7.9A5 5 0 0 1 19 9a4 4 0 0 1 0 8H8z" fill="#E8E0CC" stroke="#8A9482"/>
    </svg>
  )
}

function WeatherCard({ weather }: { weather: WeatherData | null }) {
  const DAYS_NL = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '16px 18px 6px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', marginBottom: 4 }}>§ Weer &amp; sensoren</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
          {weather ? (
            <><em style={{ color: 'var(--color-overdue)', fontStyle: 'italic', fontWeight: 400 }}>{weather.currentTemp}°</em> — {weather.currentConditionNl}.</>
          ) : 'Weer laden…'}
        </div>
      </div>

      {weather && (
        <>
          {/* Humidity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid var(--color-border-soft)', borderBottom: '1px solid var(--color-border-soft)' }}>
            {[
              { v: `${weather.currentHumidity}%`, l: 'Lucht' },
              { v: '—', l: 'Bodem' },
              { v: '—', l: 'Licht' },
            ].map((cell, i) => (
              <div key={i} style={{ padding: '10px 0', textAlign: 'center', borderRight: i < 2 ? '1px solid var(--color-border-soft)' : 'none' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--color-text)', display: 'block' }}>{cell.v}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)' }}>{cell.l}</span>
              </div>
            ))}
          </div>

          {/* 7-day forecast */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '12px 8px 14px' }}>
            {weather.forecast.map((day, i) => {
              const d = new Date(day.date)
              return (
                <div key={day.date} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: i === 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)', marginBottom: 4 }}>
                    {DAYS_NL[d.getDay()]}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                    <WeatherIcon icon={day.icon} size={18} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: i === 0 ? 'var(--color-overdue)' : 'var(--color-text)', fontWeight: i === 0 ? 500 : 400 }}>
                    {day.maxTemp}°
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function CareTipCard({ fact }: { fact: PlantFactOut }) {
  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '16px 18px 6px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', marginBottom: 4 }}>§ Wist je dat</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
          <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--color-primary)' }}>{fact.plant_name}</em>.
        </div>
      </div>
      <div style={{ padding: '10px 18px 18px', borderTop: '1px solid var(--color-border-soft)', marginTop: 8 }}>
        <p style={{
          fontFamily: 'var(--font-heading)', fontStyle: 'italic',
          fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-soft)',
          margin: '0 0 14px', position: 'relative',
        }}>
          <span style={{ color: 'var(--color-overdue)', fontSize: 32, lineHeight: 0, position: 'relative', top: 10, marginRight: 3, fontStyle: 'normal' }}>"</span>
          {fact.fact_nl}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {fact.icon_key && (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={`/api/icons/${fact.icon_key}.svg`} alt="" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text)' }}>{fact.plant_name}</div>
            {fact.species_name && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)' }}>{fact.species_name}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function UnderConstructionCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden', marginBottom: 18,
      border: '1px solid var(--color-border)',
      background: 'repeating-linear-gradient(45deg, var(--color-surface) 0px, var(--color-surface) 8px, var(--color-background) 8px, var(--color-background) 16px)',
      padding: '18px 18px',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        🚧 Binnenkort
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 18, color: 'var(--color-text)', marginBottom: 4 }}>
        {icon} {title}
      </div>
      <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
        {description}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Remove the old `HeroStat` component (now unused)**

Find and delete the `HeroStat` function in `Dashboard.tsx` — it was used by the old dashboard header and is no longer referenced.

- [ ] **Step 4: Verify in browser**

- Logboek shows recent care log entries (if any exist in the DB). If `care_log` is empty, the section is hidden (the conditional in the JSX handles this).
- Weather sidebar card shows temperature + 7-day forecast.
- Tip van de dag card shows a plant fact.
- Two under-construction cards appear with hatched background.

- [ ] **Step 5: Commit**

```bash
git add groei/frontend/src/pages/Dashboard.tsx
git commit -m "feat: add LogboekSection, WeatherCard, CareTipCard, UnderConstructionCard"
```

---

## Task 9: Responsive desktop layout + final verification

**Files:**
- Modify: `groei/frontend/src/pages/Dashboard.tsx`

The `<style>` block with the `@media (min-width: 900px)` rule was already added in Task 6. This task verifies it works and fixes any issues.

- [ ] **Step 1: Verify responsive layout in browser**

Open DevTools → toggle responsive mode. At < 900px: all sections stack in one column. At ≥ 900px: main column (tuinen, vandaag, logboek) on the left, sidebar (weather, tip, under-construction) on the right at 340px width.

Check that the status banner spans full width on both breakpoints.

On desktop the header almanac grid should sit at max-width 440px (already constrained by `maxWidth: 440` on the grid container).

- [ ] **Step 2: Remove unused `loadPlantFact` call**

In the `Dashboard` component, the old `useEffect` called both `loadDashboard()` and `loadPlantFact()`. The new one calls only `loadDashboardV2()`. Confirm the `useEffect` in the new component is:

```typescript
useEffect(() => {
  loadDashboardV2()
}, [loadDashboardV2])
```

Confirm `loadPlantFact` and `plantFact` are no longer imported from the store in `Dashboard.tsx`. Remove any unused imports.

- [ ] **Step 3: Check TypeScript for no errors**

```bash
npm run dev:frontend
```

Expected: Vite starts cleanly with zero TypeScript errors.

- [ ] **Step 4: Smoke-test the full golden path**

1. Open `http://localhost:5173` and navigate to the dashboard.
2. Header shows greeting + 2×2 almanac (may briefly show `—` before weather loads).
3. Status banner shows 4 cells with correct counts.
4. Mijn Tuinen shows map cards.
5. Vandaag shows two-column grid; click "Gedaan" on a task — it disappears from both columns.
6. Logboek shows recent entries (or is hidden if DB is empty).
7. Sidebar: weather loads within ~2s, tip van de dag shows a plant fact.
8. Under-construction cards show with hatched background.
9. At desktop width (≥ 900px) the sidebar appears on the right; at < 900px it stacks below.

- [ ] **Step 5: Final commit**

```bash
git add groei/frontend/src/pages/Dashboard.tsx
git commit -m "feat: complete dashboard redesign — Floreren-inspired layout, responsive, live weather"
```
