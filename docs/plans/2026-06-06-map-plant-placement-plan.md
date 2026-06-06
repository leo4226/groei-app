# Map Plant Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new plants placeable on the map (surface the zone picker in Add Plant) and give already-unplaced plants a one-tap path onto the current map via a floating "unplaced plants" tray.

**Architecture:** Frontend-only. Two pure helpers (`selectUnplacedPlants`, `viewboxCenter`) are unit-tested. A presentational `UnplacedPlantsTray` lists unplaced plants from the Zustand store; `MapPage` wires it to the existing `PUT /plants/{id}/position` route (`clientApis.plants.setPosition`) and refreshes both the map (`useMapData.refresh`) and the store (`loadPlants`). In `AddPlant.tsx` the zone picker is lifted out of the collapsed `{showDetails}` section so it is always visible.

**Tech Stack:** React 19 + TypeScript, Zustand (`useFloreren`), Vite, vitest (node env, tests in `src/**/__tests__/**/*.test.ts`). Bilingual i18n via a typed `Translations` object (`src/i18n/translations.ts` + `nl.ts` + `en.ts`), consumed with `useT()` from `src/context/LanguageContext`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/components/map/unplacedPlants.ts` | Create | Pure helpers: `selectUnplacedPlants`, `viewboxCenter` |
| `frontend/src/components/map/__tests__/unplacedPlants.test.ts` | Create | Unit tests for the helpers |
| `frontend/src/i18n/translations.ts` | Modify | Add `unplacedTitle` / `unplacedCount` to the `mapPage` type |
| `frontend/src/i18n/nl.ts` | Modify | Dutch strings for the tray |
| `frontend/src/i18n/en.ts` | Modify | English strings for the tray |
| `frontend/src/components/map/UnplacedPlantsTray.tsx` | Create | Floating chip + expandable list; calls `onPlace` |
| `frontend/src/pages/MapPage.tsx` | Modify | Load store plants, compute unplaced, render tray, place handler |
| `frontend/src/pages/AddPlant.tsx` | Modify | Lift zone picker out of `{showDetails}` |

**Honest deviation from the spec:** the spec mentions an "error toast" on placement failure. The repo has no generic toast system (the only "toast" is the undo banner from `useUndoableRemove`). To avoid inventing one, a failed placement is handled by **keeping the plant in the tray** (we only refresh on success) plus a `console.error`. A real toast is a future enhancement, noted here so it isn't silently dropped.

---

## Task 1: Pure helpers + unit tests (TDD)

**Files:**
- Create: `frontend/src/components/map/unplacedPlants.ts`
- Test: `frontend/src/components/map/__tests__/unplacedPlants.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/map/__tests__/unplacedPlants.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectUnplacedPlants, viewboxCenter } from '../unplacedPlants'
import type { Plant } from '../../../types'

function plant(over: Partial<Plant>): Plant {
  return {
    id: 1, name: 'P', species: null, location_id: null, location_name: null,
    location_icon: null, map_id: null, map_x: null, map_y: null, photo_path: null,
    acquired_date: null, pot_size_cm: null, container_id: null, last_repotted: null,
    notes: null, is_active: true, is_locked: false, created_at: null, sown_date: null,
    sun_requirement: null, plant_type: null, icon_key: null, icon_requested: false,
    phase: 'established', species_id: null, phenology: null, care_schedules: [],
    care_status: 'good', temp_status: 'comfortable',
    ...over,
  }
}

describe('selectUnplacedPlants', () => {
  it('keeps active plants with no map_id', () => {
    const result = selectUnplacedPlants([plant({ id: 1, map_id: null })])
    expect(result.map((p) => p.id)).toEqual([1])
  })
  it('drops plants already placed on a map', () => {
    expect(selectUnplacedPlants([plant({ id: 2, map_id: 5 })])).toEqual([])
  })
  it('drops inactive (archived) plants', () => {
    expect(selectUnplacedPlants([plant({ id: 3, map_id: null, is_active: false })])).toEqual([])
  })
})

describe('viewboxCenter', () => {
  it('returns the integer centre of "x y w h"', () => {
    expect(viewboxCenter('0 0 100 50')).toEqual({ x: 50, y: 25 })
  })
  it('handles a non-zero origin', () => {
    expect(viewboxCenter('10 20 100 100')).toEqual({ x: 60, y: 70 })
  })
  it('falls back to {0,0} on malformed input', () => {
    expect(viewboxCenter('garbage')).toEqual({ x: 0, y: 0 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/map/__tests__/unplacedPlants.test.ts`
Expected: FAIL — cannot resolve `../unplacedPlants` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/src/components/map/unplacedPlants.ts`:

```ts
import type { Plant } from '../../types'

/** Active plants not yet placed on any map. */
export function selectUnplacedPlants(plants: Plant[]): Plant[] {
  return plants.filter((p) => p.is_active && p.map_id == null)
}

/** Centre of an SVG viewbox string ("minX minY width height"), rounded to
 *  integers. Returns {x:0,y:0} for malformed input. */
export function viewboxCenter(viewbox: string): { x: number; y: number } {
  const parts = viewbox.trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return { x: 0, y: 0 }
  }
  const [x0, y0, w, h] = parts
  return { x: Math.round(x0 + w / 2), y: Math.round(y0 + h / 2) }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/map/__tests__/unplacedPlants.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/map/unplacedPlants.ts frontend/src/components/map/__tests__/unplacedPlants.test.ts
git commit -m "feat(map): unplaced-plants selector + viewbox-centre helpers"
```

---

## Task 2: i18n strings for the tray

**Files:**
- Modify: `frontend/src/i18n/translations.ts` (the `mapPage` type block)
- Modify: `frontend/src/i18n/nl.ts` (the `mapPage` object)
- Modify: `frontend/src/i18n/en.ts` (the `mapPage` object)

- [ ] **Step 1: Add the keys to the `mapPage` type**

In `frontend/src/i18n/translations.ts`, inside the `mapPage: { ... }` type block, add these two lines just before its closing `}`:

```ts
    unplacedTitle: string                 // "Nog te plaatsen" — unplaced tray header
    unplacedCount: (n: number) => string  // "{n} niet geplaatst"
```

- [ ] **Step 2: Add the Dutch strings**

In `frontend/src/i18n/nl.ts`, inside `mapPage`, add after the `sheetAllGood: 'Alles op schema',` line:

```ts
    unplacedTitle: 'Nog te plaatsen',
    unplacedCount: (n) => `${n} niet geplaatst`,
```

- [ ] **Step 3: Add the English strings**

In `frontend/src/i18n/en.ts`, inside `mapPage`, add a matching pair just before the `mapPage` object's closing `},`:

```ts
    unplacedTitle: 'To place',
    unplacedCount: (n) => `${n} unplaced`,
```

- [ ] **Step 4: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — no new errors. (A missing key in `nl.ts` or `en.ts` would surface here as a type error against `Translations`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/translations.ts frontend/src/i18n/nl.ts frontend/src/i18n/en.ts
git commit -m "i18n(map): strings for the unplaced-plants tray"
```

---

## Task 3: `UnplacedPlantsTray` component

**Files:**
- Create: `frontend/src/components/map/UnplacedPlantsTray.tsx`

This is a presentational component (no data fetching). The repo tests pure logic only and verifies components via `npm run dev` (no jsdom). The selector logic it relies on is already covered by Task 1.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/map/UnplacedPlantsTray.tsx`:

```tsx
import { useState } from 'react'
import type { Plant } from '../../types'
import { useT } from '../../context/LanguageContext'

interface Props {
  plants: Plant[]
  onPlace: (plantId: number) => void
}

export default function UnplacedPlantsTray({ plants, onPlace }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)

  if (plants.length === 0) return null

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full bg-paper/90 backdrop-blur border border-border px-3 py-1.5 font-heading text-xs text-text-soft shadow-sm"
      >
        🪴 {t.mapPage.unplacedCount(plants.length)}
      </button>
      {open && (
        <div className="flex flex-col gap-1 rounded-2xl bg-paper/95 backdrop-blur border border-border p-2 shadow-md max-h-[40vh] overflow-y-auto">
          <span className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t.mapPage.unplacedTitle}
          </span>
          {plants.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlace(p.id)}
              className="text-left rounded-lg px-3 py-2 font-heading text-sm text-text hover:bg-primary/10 transition-all"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/map/UnplacedPlantsTray.tsx
git commit -m "feat(map): UnplacedPlantsTray component"
```

---

## Task 4: Wire the tray into `MapPage`

**Files:**
- Modify: `frontend/src/pages/MapPage.tsx`

`MapPage` already imports `useState, useCallback, useMemo, useEffect` (`:1`), `useFloreren` (`:24`), `* as clientApis` (`:27`), and destructures `refresh: refreshMapData` (`:39`) and `map` (`:54`).

- [ ] **Step 1: Add imports**

In `frontend/src/pages/MapPage.tsx`, add after the existing `useT` import (`:28`):

```ts
import UnplacedPlantsTray from '../components/map/UnplacedPlantsTray'
import { selectUnplacedPlants, viewboxCenter } from '../components/map/unplacedPlants'
```

- [ ] **Step 2: Read store plants and ensure they are loaded**

In `frontend/src/pages/MapPage.tsx`, just after `const loadMaps = useFloreren((s) => s.loadMaps)` (`:36`), add:

```ts
  const allPlants = useFloreren((s) => s.plants)
  const loadPlantsStore = useFloreren((s) => s.loadPlants)
  useEffect(() => {
    if (allPlants.length === 0) loadPlantsStore()
  }, [loadPlantsStore])
```

- [ ] **Step 3: Compute unplaced plants and the place handler**

In `frontend/src/pages/MapPage.tsx`, immediately after `const { map, plants, objects, groundZones, loading } = mapData` (`:54`), add:

```ts
  const unplacedPlants = useMemo(() => selectUnplacedPlants(allPlants), [allPlants])

  const handlePlaceUnplaced = useCallback(async (plantId: number) => {
    if (!map) return
    const pos = viewboxCenter(map.viewbox)
    try {
      await clientApis.plants.setPosition(plantId, {
        map_id: map.id,
        map_x: pos.x,
        map_y: pos.y,
        ground_zone_id: null,
      })
      await Promise.all([refreshMapData(), loadPlantsStore()])
    } catch (e) {
      console.error('Failed to place plant on map', e)
    }
  }, [map, refreshMapData, loadPlantsStore])
```

- [ ] **Step 4: Render the tray**

In `frontend/src/pages/MapPage.tsx`, add a floating container just after the `MapTopBar` block (after its closing `</div>` at `:284`):

```tsx
      {/* Left, below the garden pill: unplaced-plants tray */}
      <div className="absolute top-16 left-3 z-20 landscape-mobile-hide">
        <UnplacedPlantsTray plants={unplacedPlants} onPlace={handlePlaceUnplaced} />
      </div>
```

- [ ] **Step 5: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — no new errors. In particular `setPosition`'s argument shape `{ map_id, map_x, map_y, ground_zone_id: null }` matches `api/client.ts:177`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MapPage.tsx
git commit -m "feat(map): wire unplaced-plants tray into MapPage"
```

---

## Task 5: Surface the zone picker in `AddPlant` (Part A)

**Files:**
- Modify: `frontend/src/pages/AddPlant.tsx` (the Placement card, `:639`-`:743`)

Goal: the Placement card (and its zone picker) renders in **both** Basis and Details modes; only the advanced fields (light, pot, substrate) stay gated behind `{showDetails}`.

- [ ] **Step 1: Make the Placement card always render**

In `frontend/src/pages/AddPlant.tsx`, change the opening of the Placement card. Replace:

```tsx
        {/* ——— § II · Placement Card ——— */}
        {showDetails && (
        <Card
          eyebrow={t.addPlant.secPlacement}
          title={t.addPlant.secPlacementTitle}
          subtitle={t.addPlant.secPlacementSubtitle}
        >
```

with:

```tsx
        {/* ——— § II · Placement Card (zone always visible; rest under Details) ——— */}
        <Card
          eyebrow={t.addPlant.secPlacement}
          title={t.addPlant.secPlacementTitle}
          subtitle={t.addPlant.secPlacementSubtitle}
        >
```

- [ ] **Step 2: Gate the advanced fields behind `{showDetails}`**

In the same file, the zone-picker `FormRow` ends at `:666` (`</FormRow>`), and the next comment is `{/* Light measurement */}` (`:668`). Insert an opening fragment between them. Replace:

```tsx
          </FormRow>

          {/* Light measurement */}
```

with:

```tsx
          </FormRow>

          {showDetails && (<>
          {/* Light measurement */}
```

- [ ] **Step 3: Close the fragment and the now-unconditional card**

Still in `AddPlant.tsx`, the Placement card currently closes with `</Card>` then `)}` (`:742`-`:743`). Replace:

```tsx
        </Card>
        )}

        {/* ——— § III · Care Card ——— */}
```

with:

```tsx
          </>)}
        </Card>

        {/* ——— § III · Care Card ——— */}
```

- [ ] **Step 4: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — no new errors. (A mismatched JSX fragment/tag would fail here.)

- [ ] **Step 5: Manual sanity check of the toggle**

Run: `cd frontend && npm run dev`, open `/plants/add`.
Expected: the **Zone** picker is visible in **Basis** mode (not just Details); switching to **Details** still shows light/pot/substrate; switching back to Basis hides them but keeps the Zone picker.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AddPlant.tsx
git commit -m "feat(add-plant): always show the zone picker (out of the details section)"
```

---

## Task 6: Full verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + unit tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest all green (includes the 6 new helper tests).

- [ ] **Step 2: Manual end-to-end (`npm run dev`)**

1. Add a plant **without** picking a zone → save.
2. Open the map → the floating tray shows `🪴 1 niet geplaatst`; expand it → the new plant is listed.
3. Tap the plant → it appears at the centre of the map and the tray count drops (hides at zero).
4. Drag the plant to reposition → reload the page → position persisted.
5. Add a plant **with** a zone selected → it appears on that map directly and is **not** in the tray.

Expected: all five behave as described.

- [ ] **Step 3: Verify against the real Venkel case**

In the running app, confirm **Venkel** appears in the unplaced tray (it has `map_id = null` in production), place it onto the garden map, and confirm it persists after reload.

- [ ] **Step 4: Final commit (if anything was adjusted during smoke)**

```bash
git add -A
git commit -m "chore(map): placement smoke-test adjustments"
```

(If nothing changed, skip.)

---

## Self-Review Notes

- **Spec coverage:** Part A → Task 5; Part B tray + place + refresh → Tasks 3–4; pure helpers + tests → Task 1; i18n → Task 2; manual smoke incl. Venkel → Task 6. ✓
- **Types:** `selectUnplacedPlants(Plant[]) → Plant[]` and `viewboxCenter(string) → {x,y}` are used consistently in Task 4. `setPosition(id, {map_id, map_x, map_y, ground_zone_id})` matches `api/client.ts:177`. ✓
- **No placeholders:** every code step shows complete code; commands list expected output. ✓
- **Deviation flagged:** no toast system → failed placement keeps the plant in the tray + `console.error` (see File Structure note). ✓
</content>
