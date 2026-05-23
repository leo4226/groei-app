# useMapData refactor — design spec

Date: 2026-05-05  
Status: implemented

## Problem

`MapPage.tsx` (~490 lines) owns all map data lifecycle directly: 8 state variables, a single `loadData()` that re-fetches everything on every mutation, and ~80 lines of inline garden water chip logic including its own state and handlers. The remove-with-undo toast has `undoFn: null` — undo was never wired up.

## Solution

Extract three hooks and add two backend restore endpoints. MapPage drops to ~220 lines and owns only UI state.

## New modules

```
groei/frontend/src/hooks/useMapData.ts
groei/frontend/src/hooks/useGardenWater.ts
groei/frontend/src/hooks/useUndoableRemove.ts
```

```
groei/backend/routers/plants.py   — PATCH /plants/{id}/restore
groei/backend/routers/objects.py  — PATCH /objects/{id}/restore
```

```
groei/frontend/src/api/client.ts  — restorePlant(id), restoreObject(id)
```

---

## Hook interfaces

### `useMapData(slug: string)`

```ts
{
  map: MapDetail | null
  plants: MapPlant[]
  objects: MapObject[]
  groundZones: GroundZone[]
  loading: boolean
  refresh: () => Promise<void>
  remove: (type: 'plant' | 'object', id: number) => Promise<RestoreInfo | null>
  duplicate: (plantId: number) => Promise<void>
}

interface RestoreInfo {
  label: string
  canUndo: boolean
  restore: () => Promise<void>
}
```

**Behavior:**
- On mount and on `slug` change: fetches `fetchMapDetail`, `fetchMapItems`, `fetchGroundZones` in parallel.
- `refresh()` re-runs the same three fetches. Called internally after every mutation.
- `remove(type, id)` archives the item, calls `refresh()`, returns `RestoreInfo`. Objects with contained plants show a confirm dialog first — if the user cancels, **nothing is archived** and `null` is returned. `canUndo` is `true` for plants and for objects with zero contained plants.
- `RestoreInfo.restore` is a closure created inside `remove` with access to the item id and `refresh` — calling it hits the backend restore endpoint then calls `refresh()`.
- `duplicate(plantId)` creates the plant, centres it at the viewbox midpoint, calls `refresh()`.

Garden water is no longer co-fetched here.

---

### `useGardenWater()`

```ts
{
  gardenWater: GardenWaterStatus | null
  watering: boolean
  showPicker: boolean
  pickerDate: string
  setPickerDate: (date: string) => void
  openPicker: () => void
  closePicker: () => void
  save: () => Promise<void>
  deleteLast: () => Promise<void>
}
```

**Behavior:**
- Fetches `fetchGardenWaterStatus()` independently on mount.
- `save` and `deleteLast` call their respective API functions then re-fetch water status.
- `showPicker` / `pickerDate` UI state lives here, not in MapPage.

---

### `useUndoableRemove()`

```ts
{
  toast: { label: string; canUndo: boolean } | null
  trigger: (info: RestoreInfo) => void
  dismiss: () => void
}
```

**Behavior:**
- `trigger(info)` stores `info.restore`, shows the toast, starts a 4-second auto-dismiss timer.
- Tapping undo calls `info.restore()` (backend restore + refresh) and dismisses immediately.
- `dismiss()` clears toast and cancels any pending timer.
- Toast renders an "Ongedaan maken" button only when `canUndo` is `true`.

---

## Backend restore endpoints

```
PATCH /plants/{id}/restore   → 204 No Content
PATCH /objects/{id}/restore  → 204 No Content
```

Both set `is_active = 1, updated_at = CURRENT_TIMESTAMP` for the given id.  
Object restore does **not** re-link previously contained plants (container_id stays NULL after a 4-second undo window this is acceptable).

---

## MapPage after refactor

Keeps:
- `useMapData(slug)` — data + mutations
- `useGardenWater()` — water chip state + handlers
- `useUndoableRemove()` — toast
- `useSunVisualization(...)` — unchanged
- UI state: `selectedPlant`, `selectedObject`, `showAddObject`, `selectedFixedPlant`, `showLabels`
- Pure UI handlers: `handlePlantTap`, `handleObjectTap`, `handleCloseSheet`, `handleOpenDetails`
- All JSX

Remove wiring:
```ts
const handleRemove = async (type, id) => {
  const info = await mapData.remove(type, id)
  if (info) undo.trigger(info)
}
```

Estimated line count: ~490 → ~220.
