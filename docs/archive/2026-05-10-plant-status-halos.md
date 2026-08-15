# Plant Status Halos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a soft radial glow halo behind plant icons whenever a plant needs attention — on the map canvas, the Plants page grid, and the Dashboard task rows.

**Architecture:** A new `getHaloStatus(plant)` pure function encodes a severity-ordered priority (freezing > dry/heatstress > chilling > thirsty > null). On the map, an SVG radial gradient circle renders behind the plant icon. On card UIs, a `position:absolute` CSS radial-gradient overlay sits inside the card image well. The backend `PlantOut` model gains `care_status` + `temp_status` fields so the Plants page can use the same helper (the enrichment already computes them; they just need to be exposed in the response).

**Tech Stack:** React 19, TypeScript, Vitest (frontend tests), FastAPI + Pydantic (backend), SQLite via aiosqlite

---

## File Map

| File | Change |
|---|---|
| `groei/backend/models.py` | Add `care_status`, `temp_status` to `PlantOut` |
| `groei/frontend/src/types/index.ts` | Add `care_status`, `temp_status` to `Plant` interface |
| `groei/frontend/src/hooks/usePlantStatus.ts` | Add `HaloStatus`, `HALO_COLORS`, `getHaloStatus` |
| `groei/frontend/src/hooks/__tests__/usePlantStatus.test.ts` | New — unit tests for `getHaloStatus` |
| `groei/frontend/src/components/map/PlantMarker.tsx` | Add halo SVG circle, remove `StatusBadge` export+usage |
| `groei/frontend/src/components/map/ObjectShape.tsx` | Remove `StatusBadge` import/usage, remove `getPlantStatus` import |
| `groei/frontend/src/pages/Plants.tsx` | Add halo overlay in `PlantIconWell` |
| `groei/frontend/src/pages/Dashboard.tsx` | Add halo overlay in `TaskCard` thumbnail |

---

## Task 1: Expose `care_status` + `temp_status` on `PlantOut`

The enrichment in `services/plant_reader.py` already computes `care_status` and `temp_status` for every plant, but `PlantOut` doesn't declare those fields so Pydantic silently drops them. Adding two fields to the model is all that's needed.

**Files:**
- Modify: `groei/backend/models.py` (class `PlantOut`, lines 81–105)
- Modify: `groei/frontend/src/types/index.ts` (interface `Plant`, lines 28–53)

- [ ] **Step 1: Add fields to `PlantOut` in `models.py`**

  In `groei/backend/models.py`, find `class PlantOut(BaseModel):` and add two lines after `care_schedules`:

  ```python
  class PlantOut(BaseModel):
      id: int
      name: str
      species: str | None = None
      location_id: int | None = None
      location_name: str | None = None
      location_icon: str | None = None
      map_id: int | None = None
      map_x: float | None = None
      map_y: float | None = None
      photo_path: str | None = None
      acquired_date: str | None = None
      pot_size_cm: int | None = None
      last_repotted: str | None = None
      container_id: int | None = None
      notes: str | None = None
      is_active: bool = True
      is_locked: bool = False
      created_at: str | None = None
      sun_requirement: str | None = None
      plant_type: str | None = None
      icon_key: str | None = None
      species_id: int | None = None
      phenology: Any | None = None
      care_schedules: list[CareScheduleOut] = []
      care_status: str = "good"
      temp_status: str = "comfortable"
  ```

- [ ] **Step 2: Add fields to the `Plant` TypeScript interface**

  In `groei/frontend/src/types/index.ts`, find `export interface Plant {` and add two lines after `care_schedules`:

  ```ts
  export interface Plant {
    id: number
    name: string
    species: string | null
    location_id: number | null
    location_name: string | null
    location_icon: string | null
    map_id: number | null
    map_x: number | null
    map_y: number | null
    photo_path: string | null
    acquired_date: string | null
    pot_size_cm: number | null
    container_id: number | null
    last_repotted: string | null
    notes: string | null
    is_active: boolean
    is_locked: boolean
    created_at: string | null
    sun_requirement: string | null
    plant_type: string | null
    icon_key: string | null
    species_id: number | null
    phenology: Phenology | null
    care_schedules: CareSchedule[]
    care_status: 'overdue' | 'due_today' | 'good'
    temp_status: 'comfortable' | 'chilling' | 'freezing' | 'heatstress'
  }
  ```

- [ ] **Step 3: Verify the backend responds with the new fields**

  From `groei/`:
  ```bash
  npm run dev:backend
  ```

  In another terminal:
  ```bash
  curl -s http://localhost:8000/plants | python -c "import sys,json; p=json.load(sys.stdin); print(p[0]['care_status'], p[0]['temp_status'])"
  ```

  Expected output: `good comfortable` (or `overdue comfortable` if a plant is overdue)

- [ ] **Step 4: Commit**

  ```bash
  git add groei/backend/models.py groei/frontend/src/types/index.ts
  git commit -m "feat: expose care_status + temp_status on PlantOut"
  ```

---

## Task 2: Add `getHaloStatus` helper with unit tests

**Files:**
- Modify: `groei/frontend/src/hooks/usePlantStatus.ts`
- Create: `groei/frontend/src/hooks/__tests__/usePlantStatus.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `groei/frontend/src/hooks/__tests__/usePlantStatus.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { getHaloStatus, HALO_COLORS } from '../usePlantStatus'

  describe('getHaloStatus', () => {
    it('returns null when hydrated and comfortable', () => {
      expect(getHaloStatus({ care_status: 'good', temp_status: 'comfortable' })).toBeNull()
    })

    it('returns thirsty when due_today and comfortable', () => {
      expect(getHaloStatus({ care_status: 'due_today', temp_status: 'comfortable' })).toBe('thirsty')
    })

    it('returns dry when overdue and comfortable', () => {
      expect(getHaloStatus({ care_status: 'overdue', temp_status: 'comfortable' })).toBe('dry')
    })

    it('returns chilling when good water and chilling temp', () => {
      expect(getHaloStatus({ care_status: 'good', temp_status: 'chilling' })).toBe('chilling')
    })

    it('returns freezing when good water and freezing temp', () => {
      expect(getHaloStatus({ care_status: 'good', temp_status: 'freezing' })).toBe('freezing')
    })

    it('returns dry when heatstress (same orange as dry)', () => {
      expect(getHaloStatus({ care_status: 'good', temp_status: 'heatstress' })).toBe('dry')
    })

    it('freezing beats dry (severity priority)', () => {
      expect(getHaloStatus({ care_status: 'overdue', temp_status: 'freezing' })).toBe('freezing')
    })

    it('dry beats chilling', () => {
      expect(getHaloStatus({ care_status: 'overdue', temp_status: 'chilling' })).toBe('dry')
    })

    it('chilling beats thirsty', () => {
      expect(getHaloStatus({ care_status: 'due_today', temp_status: 'chilling' })).toBe('chilling')
    })

    it('handles null/undefined fields gracefully', () => {
      expect(getHaloStatus({})).toBeNull()
      expect(getHaloStatus({ care_status: undefined, temp_status: undefined })).toBeNull()
    })
  })

  describe('HALO_COLORS', () => {
    it('has a color for each non-null halo status', () => {
      expect(HALO_COLORS.freezing).toBe('#2544a0')
      expect(HALO_COLORS.dry).toBe('#FF7A2E')
      expect(HALO_COLORS.chilling).toBe('#24e3dc')
      expect(HALO_COLORS.thirsty).toBe('#FFC233')
    })
  })
  ```

- [ ] **Step 2: Run tests — expect failure**

  From `groei/frontend/`:
  ```bash
  npm test -- src/hooks/__tests__/usePlantStatus.test.ts
  ```

  Expected: FAIL — `getHaloStatus is not a function` (or similar import error)

- [ ] **Step 3: Add `HaloStatus`, `HALO_COLORS`, and `getHaloStatus` to `usePlantStatus.ts`**

  In `groei/frontend/src/hooks/usePlantStatus.ts`, append after the existing exports:

  ```ts
  export type HaloStatus = 'freezing' | 'dry' | 'chilling' | 'thirsty' | null

  export const HALO_COLORS: Record<NonNullable<HaloStatus>, string> = {
    freezing: '#2544a0',
    dry:      '#FF7A2E',
    chilling: '#24e3dc',
    thirsty:  '#FFC233',
  }

  export function getHaloStatus(plant: { care_status?: string | null; temp_status?: string | null }): HaloStatus {
    const temp  = plant.temp_status  ?? ''
    const water = plant.care_status  ?? ''
    if (temp  === 'freezing')   return 'freezing'
    if (water === 'overdue')    return 'dry'
    if (temp  === 'heatstress') return 'dry'
    if (temp  === 'chilling')   return 'chilling'
    if (water === 'due_today')  return 'thirsty'
    return null
  }
  ```

- [ ] **Step 4: Run tests — expect pass**

  From `groei/frontend/`:
  ```bash
  npm test -- src/hooks/__tests__/usePlantStatus.test.ts
  ```

  Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add groei/frontend/src/hooks/usePlantStatus.ts groei/frontend/src/hooks/__tests__/usePlantStatus.test.ts
  git commit -m "feat: add getHaloStatus helper with severity-order priority"
  ```

---

## Task 3: Halo on map canvas — `PlantMarker.tsx` + `ObjectShape.tsx`

**Files:**
- Modify: `groei/frontend/src/components/map/PlantMarker.tsx`
- Modify: `groei/frontend/src/components/map/ObjectShape.tsx`

- [ ] **Step 1: Update imports in `PlantMarker.tsx`**

  Replace the existing import line:
  ```ts
  import { getPlantStatus } from '../../hooks/usePlantStatus'
  ```
  With:
  ```ts
  import { getHaloStatus, HALO_COLORS } from '../../hooks/usePlantStatus'
  ```

- [ ] **Step 2: Remove `StatusBadge` and update the unlocked plant render path**

  In `PlantMarker.tsx`, replace the entire `StatusBadge` component (lines 35–57) and the `getPlantStatus` usage with the halo implementation. The full updated file structure for the relevant sections:

  **Remove** the `StatusBadge` function entirely (it was lines 35–57).

  **In the component body**, replace:
  ```ts
  const { tempStatus } = getPlantStatus(plant)
  ```
  With:
  ```ts
  const haloStatus = getHaloStatus(plant)
  const haloColor  = haloStatus ? HALO_COLORS[haloStatus] : null
  ```

  **In the unlocked render path**, replace the three lines:
  ```tsx
  {/* Status badge — bottom-right of icon */}
  <StatusBadge cx={iconR * 0.72} cy={iconR * 0.72} tempStatus={tempStatus} />
  ```
  With the halo circle **before** the `<g transform={rot}>` block (so it renders behind the plant icon):
  ```tsx
  {/* Status halo — renders behind plant icon */}
  {haloColor && (
    <>
      <defs>
        <radialGradient id={`halo-${plant.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={haloColor} stopOpacity={0.70} />
          <stop offset="100%" stopColor={haloColor} stopOpacity={0}    />
        </radialGradient>
      </defs>
      <circle r={iconR * 1.6} fill={`url(#halo-${plant.id})`} style={{ pointerEvents: 'none' }} />
    </>
  )}
  ```

  **In the locked render path**, replace:
  ```tsx
  {/* Status badge — bottom-right */}
  <StatusBadge cx={lockBadgeOffset} cy={lockBadgeOffset} tempStatus={tempStatus} />
  ```
  With (placed before the `<g transform={rot}>` block inside the locked outer `<g>`):
  ```tsx
  {/* Status halo — renders behind plant icon */}
  {haloColor && (
    <>
      <defs>
        <radialGradient id={`halo-${plant.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={haloColor} stopOpacity={0.70} />
          <stop offset="100%" stopColor={haloColor} stopOpacity={0}    />
        </radialGradient>
      </defs>
      <circle r={lockedIconR * 1.6} fill={`url(#halo-${plant.id})`} style={{ pointerEvents: 'none' }} />
    </>
  )}
  ```

  Also remove the now-unused `export` keyword from `StatusBadge` — actually delete the entire `StatusBadge` function since `ObjectShape` won't need it after Task 3, Step 3.

- [ ] **Step 3: Remove `StatusBadge` from `ObjectShape.tsx`**

  In `groei/frontend/src/components/map/ObjectShape.tsx`:

  Remove line 3:
  ```ts
  import { StatusBadge } from './PlantMarker'
  ```

  Remove line 5:
  ```ts
  import { getPlantStatus } from '../../hooks/usePlantStatus'
  ```

  In `renderContainedPlants()`, remove lines:
  ```ts
  const { tempStatus } = getPlantStatus(plant)
  const badgeOffset = iconHalf * 0.72
  ```
  And remove:
  ```tsx
  <StatusBadge cx={badgeOffset} cy={badgeOffset} tempStatus={tempStatus} />
  ```

  The `renderContainedPlants` return block for each plant becomes:
  ```tsx
  return (
    <g key={plant.id} transform={`translate(${pos.x}, ${pos.y})`}>
      {sunFit && (
        <circle
          r={iconHalf + 3}
          fill="none"
          stroke={SUN_FIT_COLORS[sunFit]}
          strokeWidth={isDragging ? 2 : 1.2}
          strokeDasharray={sunFit === 'good' ? 'none' : '2 2'}
          opacity={0.85}
        />
      )}
      <g transform={counterRot ? `rotate(${counterRot})` : undefined}>
        {plant.icon_key ? (
          <image
            href={`/api/icons/${plant.icon_key}.svg`}
            x={-iconHalf}
            y={-iconHalf}
            width={iconHalf * 2}
            height={iconHalf * 2}
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          <circle r={dotR} fill={dotColor} opacity={0.8} />
        )}
      </g>
    </g>
  )
  ```

- [ ] **Step 4: TypeScript check**

  From `groei/frontend/`:
  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors

- [ ] **Step 5: Visual check in browser**

  Start the dev server (`npm run dev` from `groei/`) and open `http://localhost:5173/map/tuin`.

  - A plant with an overdue water task should show an orange glow behind its icon
  - A plant with a freezing temp_status should show a blue glow
  - Healthy plants have no glow
  - No emoji badge visible anymore on any plant

- [ ] **Step 6: Commit**

  ```bash
  git add groei/frontend/src/components/map/PlantMarker.tsx groei/frontend/src/components/map/ObjectShape.tsx
  git commit -m "feat: add status halo to plant markers, remove StatusBadge"
  ```

---

## Task 4: Halo on Plants page grid

**Files:**
- Modify: `groei/frontend/src/pages/Plants.tsx` (function `PlantIconWell`, lines 533–591)

- [ ] **Step 1: Import `getHaloStatus` and `HALO_COLORS`**

  At the top of `groei/frontend/src/pages/Plants.tsx`, add to the existing imports:

  ```ts
  import { getHaloStatus, HALO_COLORS } from '../hooks/usePlantStatus'
  ```

- [ ] **Step 2: Add halo overlay in `PlantIconWell`**

  `PlantIconWell` receives `plant: Plant`. Add a halo overlay inside both branches (icon branch and fallback branch). The overlay is a `position: absolute` div with a CSS radial gradient.

  **Icon branch** — replace the existing `<div>` that wraps the `<img>`:
  ```tsx
  function PlantIconWell({ plant, iconMap }: { plant: Plant; iconMap: Map<string, PlantIcon> }) {
    const haloStatus = getHaloStatus(plant)
    const haloColor  = haloStatus ? HALO_COLORS[haloStatus] : null

    if (plant.icon_key) {
      return (
        <div style={{
          aspectRatio: '1',
          background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
          borderBottom: '1px solid var(--color-border-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16%',
          position: 'relative',
        }}>
          {haloColor && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle, ${haloColor} 0%, transparent 70%)`,
              opacity: 0.35,
              pointerEvents: 'none',
            }} />
          )}
          <img
            src={`/api/icons/${plant.icon_key}.svg`}
            alt={plant.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', transition: 'transform 0.3s cubic-bezier(0.2,0.8,0.2,1)', position: 'relative' }}
            className="card-icon"
          />
        </div>
      )
    }

    const type = plant.plant_type || 'unknown'
    const accentColor = TYPE_BG[type] || TYPE_BG.unknown
    const iconBody = PLANT_ICONS[type] || PLANT_ICONS['unknown']

    return (
      <div style={{
        aspectRatio: '1',
        background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
        borderBottom: '1px solid var(--color-border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18%',
        position: 'relative',
      }}>
        {haloColor && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle, ${haloColor} 0%, transparent 70%)`,
            opacity: 0.35,
            pointerEvents: 'none',
          }} />
        )}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accentColor,
          opacity: 0.4,
          borderRadius: '0 0 0 3px',
        }} />
        <svg
          viewBox="0 0 100 100"
          style={{ width: '100%', height: '100%', transition: 'transform 0.3s cubic-bezier(0.2,0.8,0.2,1)', position: 'relative' }}
          className="card-icon"
          dangerouslySetInnerHTML={{ __html: iconBody }}
        />
      </div>
    )
  }
  ```

- [ ] **Step 3: Visual check in browser**

  Open `http://localhost:5173/plants`.

  - Plants with overdue care should show an orange glow behind their card image
  - Thirsty (due today) plants show amber
  - Cold plants (if any have chilling/freezing temp_status) show blue/cyan
  - Healthy plants have no glow

- [ ] **Step 4: Commit**

  ```bash
  git add groei/frontend/src/pages/Plants.tsx
  git commit -m "feat: add status halo overlay to plant card wells"
  ```

---

## Task 5: Halo on Dashboard task row thumbnails

**Files:**
- Modify: `groei/frontend/src/pages/Dashboard.tsx` (function `TaskCard`, lines 508–620)

**Note:** `CareTask` doesn't have `temp_status`, so the halo here is water-only. The color is derived from `task.care_type` and `task.days_overdue`:
- `care_type === 'water' && days_overdue > 0`  → `dry`  (orange `#FF7A2E`)
- `care_type === 'water' && days_overdue === 0` → `thirsty` (amber `#FFC233`)
- any other task → no halo

- [ ] **Step 1: Import `HALO_COLORS`**

  At the top of `groei/frontend/src/pages/Dashboard.tsx`, add:

  ```ts
  import { HALO_COLORS } from '../hooks/usePlantStatus'
  ```

- [ ] **Step 2: Add halo helper and overlay inside `TaskCard`**

  In `TaskCard`, add a `taskHaloColor` derivation immediately after the `accentColor` lines, then add the overlay inside the thumbnail container:

  ```tsx
  function TaskCard({ task, tone }: { task: CareTask; tone: 'overdue' | 'due' | 'upcoming' }) {
    const markCareDone = useGroeiStore((s) => s.markCareDone)
    const careLabel = CARE_LABEL_NL[task.care_type] ?? CARE_TYPE_INFO[task.care_type as keyof typeof CARE_TYPE_INFO]?.label ?? task.care_type

    const accentColor =
      tone === 'overdue' ? 'var(--color-overdue)' :
      tone === 'due' ? 'var(--color-due)' :
      'var(--color-border)'

    const taskHaloColor: string | null =
      task.care_type === 'water' && task.days_overdue > 0  ? HALO_COLORS.dry :
      task.care_type === 'water' && task.days_overdue === 0 ? HALO_COLORS.thirsty :
      null

    return (
      <div className="card" style={{
        borderRadius: 14,
        padding: '14px 16px',
        borderLeft: `3px solid ${accentColor}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        {task.plant_photo ? (
          <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
            {taskHaloColor && (
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 10,
                background: `radial-gradient(circle, ${taskHaloColor} 0%, transparent 70%)`,
                opacity: 0.5,
                pointerEvents: 'none',
              }} />
            )}
            <img src={task.plant_photo} alt="" style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              objectFit: 'cover',
              display: 'block',
            }} />
          </div>
        ) : (
          <div style={{
            position: 'relative',
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
            border: '1px solid var(--color-border-soft)',
            flexShrink: 0,
          }}>
            {taskHaloColor && (
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 10,
                background: `radial-gradient(circle, ${taskHaloColor} 0%, transparent 70%)`,
                opacity: 0.5,
                pointerEvents: 'none',
              }} />
            )}
          </div>
        )}
  ```

  Keep the rest of `TaskCard` (the `<Link>` block, the done button) unchanged from line 545 onward.

- [ ] **Step 3: Visual check in browser**

  Open `http://localhost:5173/dashboard`.

  - Overdue watering tasks show an orange glow on the thumbnail
  - Due-today watering tasks show amber
  - Non-water tasks (fertilise, prune, etc.) show no glow
  - Layout and checkmark button unchanged

- [ ] **Step 4: Run full test suite**

  From `groei/frontend/`:
  ```bash
  npm test
  ```

  Expected: all tests pass (no regressions)

- [ ] **Step 5: Commit**

  ```bash
  git add groei/frontend/src/pages/Dashboard.tsx
  git commit -m "feat: add water status halo to dashboard task thumbnails"
  ```

---

## Done

All five tasks complete. The feature is fully visible:
- Map canvas: glowing halo behind plant icons, replaces old emoji badges
- Plants grid: colored glow on card image wells for attention-needed plants  
- Dashboard: amber/orange glow on watering task thumbnails
