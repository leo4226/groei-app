# Plant Status Halos — Design Spec

**Date:** 2026-05-10

## Overview

Soft radial glow halos appear behind plant icons whenever a plant needs attention. The halo color encodes the most urgent problem the plant has (water or temperature). Appears in three places: the garden/indoor map canvas, the Plants page grid, and the Dashboard task rows.

## Status Priority

A single halo color is shown per plant. When a plant has both a water problem and a temperature problem, the most severe wins:

| Priority | Status key | Color | Hex | Trigger |
|---|---|---|---|---|
| 1 | `freezing` | Blue | `#2544a0` | `temp_status === 'freezing'` |
| 2 | `dry` | Orange | `#FF7A2E` | `care_status === 'overdue'` |
| 3 | `chilling` | Cyan | `#24e3dc` | `temp_status === 'chilling'` |
| 4 | `thirsty` | Amber | `#FFC233` | `care_status === 'due_today'` |
| — | `null` | *(no halo)* | — | hydrated + comfortable |

`heatstress` maps to `dry` priority level (same orange, added to priority 2).

## New helper: `getHaloStatus`

Add to `groei/frontend/src/hooks/usePlantStatus.ts`:

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

Reads `care_status` and `temp_status` directly — no cast needed, works with `MapPlant`, `Plant`, or any duck-typed object that has those two fields (e.g. a future `CareTask` with `temp_status` added).

## 1. Map Canvas (`PlantMarker.tsx`)

- A `<radialGradient>` SVG circle renders **behind** the plant icon (before the `<image>` element)
- Gradient: status color at 0% opacity 0.7, fading to transparent at 100%
- Radius: `iconR * 1.6` — large enough to be clearly visible, small enough not to overlap neighbours
- The existing `StatusBadge` component (emoji circle for temp) is **removed** — the halo replaces it for both water and temp signalling
- The garden-wide water status banner on `MapPage` is unchanged

```tsx
{haloColor && (
  <>
    <defs>
      <radialGradient id={`halo-${plant.id}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor={haloColor} stopOpacity={0.70} />
        <stop offset="100%" stopColor={haloColor} stopOpacity={0}    />
      </radialGradient>
    </defs>
    <circle r={iconR * 1.6} fill={`url(#halo-${plant.id})`} />
  </>
)}
```

Both the locked and unlocked plant rendering paths get the halo. For locked plants the radius uses `lockedIconR * 1.6`.

## 2. Plants Page Grid (`PlantIconWell` in `Plants.tsx`)

- A `position: absolute; inset: 0` div with `background: radial-gradient(circle, <color> 0%, transparent 70%)` overlays the card well
- Opacity: `0.35` — visible but not garish against the warm `#FDFAF1 → #F4EEDB` gradient background
- Rendered only when `getHaloStatus(plant) !== null`
- `Plant` type already carries `care_status` and `temp_status` so no backend changes needed

## 3. Dashboard Task Rows (`TaskCard` in `Dashboard.tsx`)

- The 44×44 thumbnail container gets the same `position: absolute; inset: 0; border-radius: 10px` overlay
- Opacity: `0.45` — slightly more vivid on the smaller surface

**Data gap:** `CareTask` currently lacks `temp_status`. Two-step approach:
1. **Water halo** (no backend change): derive from `task.care_type === 'water' && task.days_overdue >= 0` — overdue water task = `dry`, due-today = `thirsty`. Non-water tasks show no halo initially.
2. **Temp halo** (requires backend): add `temp_status: string | null` to the `CareTask` Pydantic model and populate it from the associated plant's `temp_status` in the dashboard query.

Ship step 1 first; step 2 is a follow-up.

## `ObjectShape.tsx`

`ObjectShape` renders contained plants inside building objects and currently imports and renders `StatusBadge`. That import and usage is removed — the halo on the parent `PlantMarker` already handles status signalling for contained plants. No new halo is added inside `ObjectShape` (the shapes are too small).

## What is NOT changing

- The garden-wide water status chips/banner on `MapPage` — stays as-is
- The sun-fit ring on `PlantMarker` — unchanged, rendered outside the halo
- The lock badge on locked plants — unchanged
- The `WaterStatusIcon` and `TempStatusIcon` components — kept (used in `MapPage` banner), but `StatusBadge` inside `PlantMarker` is removed

## Files touched

| File | Change |
|---|---|
| `src/hooks/usePlantStatus.ts` | Add `HaloStatus`, `HALO_COLORS`, `getHaloStatus` |
| `src/components/map/PlantMarker.tsx` | Add halo circle, remove `StatusBadge` |
| `src/components/map/ObjectShape.tsx` | Remove `StatusBadge` import/usage |
| `src/pages/Plants.tsx` | Add halo overlay in `PlantIconWell` |
| `src/pages/Dashboard.tsx` | Add halo overlay in `TaskCard` thumbnail |
| `backend/routers/dashboard.py` | Add `temp_status` to `CareTask` response (step 2) |
| `backend/models.py` | Add `temp_status` field to `CareTask` model (step 2) |
