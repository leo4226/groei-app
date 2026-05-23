# Containers to View Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move container objects (pot, planter, raised bed) out of the layout editor and into the map/view layer, where they can be placed with a "+" button and repositioned by dragging — just like plant markers.

**Architecture:** Containers (`category === 'container'`) are filtered out of `EditorCanvas` rendering and the editor's preset panel. `MapView`'s drag system is extended from plants-only to also handle containers, using the same `DragItem` / `dragPositions` / `handlePointerUp` pattern. A "+ Pot" button in `MapPage` opens a lightweight preset picker that creates the container at the map centre; the user then drags it into position. Hardscape objects (`category === 'hardscape' | 'utility'`) stay in the editor unchanged.

**Tech Stack:** React 19 + TypeScript, existing `MapView` pointer-event drag system, `updateObjectPosition` API call, `CONTAINER_PRESETS` from `useEditorState`

---

## File map

| File | Change |
|---|---|
| `frontend/src/components/editor/EditorLegendPanel.tsx` | Show only `HARDSCAPE_PRESETS` in "Objecten" panel |
| `frontend/src/components/editor/EditorCanvas.tsx` | Filter `category === 'container'` objects before rendering |
| `frontend/src/components/map/ObjectShape.tsx` | Add `onPointerDown` + `isDragging` props; wire grab cursor & visual feedback |
| `frontend/src/components/map/ObjectsLayer.tsx` | Forward `onContainerPointerDown` + `dragPositions` to each `ObjectShape` |
| `frontend/src/components/map/MapView.tsx` | Extend `DragItem`, replace no-op `handleObjectPointerDown`, update `handlePointerUp`, import `updateObjectPosition` |
| `frontend/src/pages/MapPage.tsx` | Add "+ Pot" button + inline container picker sheet |

---

### Task 1: Remove containers from the editor

**Files:**
- Modify: `frontend/src/components/editor/EditorLegendPanel.tsx:133`
- Modify: `frontend/src/components/editor/EditorCanvas.tsx` (objects render block, search for `objects.map((obj) =>`)

**Context:** `EditorLegendPanel` currently lists all presets via `[...CONTAINER_PRESETS, ...HARDSCAPE_PRESETS].map(...)`. `EditorCanvas` renders every object in the `objects` prop, including containers. Both need to stop showing containers.

- [ ] **Step 1: Filter presets in EditorLegendPanel**

In `frontend/src/components/editor/EditorLegendPanel.tsx`, line 133, change:

```tsx
// Before
{[...CONTAINER_PRESETS, ...HARDSCAPE_PRESETS].map((p) => {

// After
{HARDSCAPE_PRESETS.map((p) => {
```

The `CONTAINER_PRESETS` import on line 4 can be removed entirely since it's no longer used:

```ts
// Before
import { CONTAINER_PRESETS, HARDSCAPE_PRESETS } from '../../hooks/useEditorState'

// After
import { HARDSCAPE_PRESETS } from '../../hooks/useEditorState'
```

- [ ] **Step 2: Filter containers in EditorCanvas**

In `frontend/src/components/editor/EditorCanvas.tsx`, find the line that starts `{objects.map((obj) => {` (around line 750) and prepend a filter:

```tsx
// Before
{objects.map((obj) => {

// After
{objects.filter(o => o.category !== 'container').map((obj) => {
```

This is the only change needed — if a container can't be rendered it can't be clicked or selected, so no further guard is needed.

- [ ] **Step 3: Verify in browser**

Run `npm run dev` from `groei/`. Open the editor for any map. Confirm "Objecten" panel shows only hardscape items (Stepping stone, Bench, Table, Chair, Rain barrel). Confirm any existing container objects on the map are invisible in the editor canvas but still visible in the map view page.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/components/editor/EditorLegendPanel.tsx groei/frontend/src/components/editor/EditorCanvas.tsx
git commit -m "feat: hide container objects from layout editor"
```

---

### Task 2: Add drag props to ObjectShape

**Files:**
- Modify: `frontend/src/components/map/ObjectShape.tsx:9-17` (Props interface) and `:182-187` (root `<g>`)

**Context:** `ObjectShape` currently has this Props interface and root element:

```tsx
interface Props {
  object: MapObject
  x: number
  y: number
  isHoverTarget?: boolean
  showLabel?: boolean
  heatmapCells?: HeatmapCell[]
  onTap: (object: MapObject) => void
}
// ...
return (
  <g
    transform={`translate(${x}, ${y}) rotate(${effectiveRotation})`}
    onClick={(e) => { e.stopPropagation(); onTap(object) }}
    style={{ cursor: 'pointer' }}
  >
```

Add `onPointerDown` and `isDragging` props and wire them to the `<g>` element. Only containers receive these props — hardscape objects keep pointer cursor and no drag.

- [ ] **Step 1: Extend Props interface**

```tsx
interface Props {
  object: MapObject
  x: number
  y: number
  isHoverTarget?: boolean
  showLabel?: boolean
  heatmapCells?: HeatmapCell[]
  onTap: (object: MapObject) => void
  onPointerDown?: (e: React.PointerEvent, object: MapObject) => void
  isDragging?: boolean
}
```

- [ ] **Step 2: Update the root `<g>` element**

```tsx
return (
  <g
    transform={`translate(${x}, ${y}) rotate(${effectiveRotation})`}
    onClick={(e) => { e.stopPropagation(); if (!isDragging) onTap(object) }}
    onPointerDown={onPointerDown ? (e) => { e.stopPropagation(); onPointerDown(e, object) } : undefined}
    style={{
      cursor: onPointerDown ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
      touchAction: onPointerDown ? 'none' : undefined,
      opacity: isDragging ? 0.75 : 1,
    }}
  >
```

The `if (!isDragging) onTap(object)` guard prevents the sheet from opening when the user just finishes dragging.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd groei && npm run build 2>&1 | grep -i error
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/components/map/ObjectShape.tsx
git commit -m "feat: add drag props to ObjectShape"
```

---

### Task 3: Forward drag props through ObjectsLayer

**Files:**
- Modify: `frontend/src/components/map/ObjectsLayer.tsx` (full file, it's only 30 lines)

**Context:** The current full file:

```tsx
import type { MapObject } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import ObjectShape from './ObjectShape'

interface Props {
  objects: MapObject[]
  hoveredContainerId: number | null
  showLabels?: boolean
  heatmapCells?: HeatmapCell[]
  onObjectTap: (object: MapObject) => void
}

export default function ObjectsLayer({ objects, hoveredContainerId, showLabels = true, heatmapCells, onObjectTap }: Props) {
  return (
    <g>
      {objects.map((obj) => (
        <ObjectShape
          key={obj.id}
          object={obj}
          x={obj.map_x ?? 0}
          y={obj.map_y ?? 0}
          isHoverTarget={hoveredContainerId === obj.id}
          showLabel={showLabels}
          heatmapCells={heatmapCells}
          onTap={onObjectTap}
        />
      ))}
    </g>
  )
}
```

Replace with the version that accepts and forwards drag props. The position of a container being dragged comes from `dragPositions` keyed as `container-{id}`.

- [ ] **Step 1: Replace full file content**

```tsx
import type { MapObject } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import ObjectShape from './ObjectShape'

interface Props {
  objects: MapObject[]
  hoveredContainerId: number | null
  showLabels?: boolean
  heatmapCells?: HeatmapCell[]
  onObjectTap: (object: MapObject) => void
  onContainerPointerDown?: (e: React.PointerEvent, object: MapObject) => void
  dragPositions?: Record<string, { x: number; y: number }>
}

export default function ObjectsLayer({
  objects,
  hoveredContainerId,
  showLabels = true,
  heatmapCells,
  onObjectTap,
  onContainerPointerDown,
  dragPositions,
}: Props) {
  return (
    <g>
      {objects.map((obj) => {
        const isContainer = obj.category === 'container'
        const key = `container-${obj.id}`
        const dragPos = isContainer ? dragPositions?.[key] : undefined
        return (
          <ObjectShape
            key={obj.id}
            object={obj}
            x={dragPos?.x ?? obj.map_x ?? 0}
            y={dragPos?.y ?? obj.map_y ?? 0}
            isHoverTarget={hoveredContainerId === obj.id}
            showLabel={showLabels}
            heatmapCells={heatmapCells}
            onTap={onObjectTap}
            onPointerDown={isContainer ? onContainerPointerDown : undefined}
            isDragging={!!dragPos}
          />
        )
      })}
    </g>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd groei && npm run build 2>&1 | grep -i error
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/components/map/ObjectsLayer.tsx
git commit -m "feat: forward container drag props through ObjectsLayer"
```

---

### Task 4: Extend MapView drag system for containers

**Files:**
- Modify: `frontend/src/components/map/MapView.tsx`

**Context:** Key facts about the current file:
- Line 5: imports `updatePlantPosition, updatePlantContainer, updatePlantDisplayRadius, updatePlantGroundZone` — need to add `updateObjectPosition`
- Line 57: `type DragItem = { type: 'plant'; id: number }` — extend to include containers
- Lines 187-190: existing no-op `handleObjectPointerDown` — replace with real handler
- Lines 263-278: `if (pos && didDrag.current && dragging.type === 'plant') { ... }` in `handlePointerUp` — add container branch
- Lines 440-444: `<ObjectsLayer ... onObjectTap=... />` — add new props

- [ ] **Step 1: Add `updateObjectPosition` to import**

```ts
// Before (line 5):
import { updatePlantPosition, updatePlantContainer, updatePlantDisplayRadius, updatePlantGroundZone } from '../../api/client'

// After:
import { updatePlantPosition, updatePlantContainer, updatePlantDisplayRadius, updatePlantGroundZone, updateObjectPosition } from '../../api/client'
```

- [ ] **Step 2: Extend DragItem type**

```ts
// Before (line 57):
type DragItem = { type: 'plant'; id: number }

// After:
type DragItem = { type: 'plant'; id: number } | { type: 'container'; id: number }
```

- [ ] **Step 3: Replace the no-op `handleObjectPointerDown`**

Lines 187-190 currently read:
```ts
// Objects are static — no drag, no selection
const handleObjectPointerDown = useCallback((_e: React.PointerEvent, _object: MapObject) => {
  // no-op: objects are placed in the editor and not movable in the map view
}, [])
```

Replace with:
```ts
const handleContainerPointerDown = useCallback((e: React.PointerEvent, obj: MapObject) => {
  e.stopPropagation()
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
  const key = `container-${obj.id}`
  setDragging({ type: 'container', id: obj.id })
  didDrag.current = false
  setDragPositions((prev) => ({ ...prev, [key]: { x: obj.map_x ?? 0, y: obj.map_y ?? 0 } }))
}, [])
```

- [ ] **Step 4: Add container branch in `handlePointerUp`**

Current block (lines 263-278):
```ts
if (pos && didDrag.current && dragging.type === 'plant') {
  try {
    if (dropTarget?.type === 'container') {
      await updatePlantContainer(dragging.id, dropTarget.target.id)
    } else if (dropTarget?.type === 'zone') {
      const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
      await updatePlantGroundZone(dragging.id, dropTarget.target.id, rounded.map_x, rounded.map_y)
    } else {
      const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
      await updatePlantPosition(dragging.id, { map_id: map.id, ...rounded, ground_zone_id: null })
    }
    onPositionUpdate?.()
  } catch (err) {
    console.error('Failed to update position:', err)
  }
}
```

Replace with:
```ts
if (pos && didDrag.current) {
  try {
    if (dragging.type === 'plant') {
      if (dropTarget?.type === 'container') {
        await updatePlantContainer(dragging.id, dropTarget.target.id)
      } else if (dropTarget?.type === 'zone') {
        const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
        await updatePlantGroundZone(dragging.id, dropTarget.target.id, rounded.map_x, rounded.map_y)
      } else {
        const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
        await updatePlantPosition(dragging.id, { map_id: map.id, ...rounded, ground_zone_id: null })
      }
    } else if (dragging.type === 'container') {
      const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
      await updateObjectPosition(dragging.id, rounded)
    }
    onPositionUpdate?.()
  } catch (err) {
    console.error('Failed to update position:', err)
  }
}
```

- [ ] **Step 5: Pass new props to ObjectsLayer**

Find the `<ObjectsLayer ... />` block (around line 440):
```tsx
// Before:
<ObjectsLayer
  objects={objects}
  hoveredContainerId={hoveredContainerId}
  showLabels={showLabels}
  heatmapCells={heatmapCells}
  onObjectTap={(obj) => handleItemSelect('object', obj.id)}
/>

// After:
<ObjectsLayer
  objects={objects}
  hoveredContainerId={hoveredContainerId}
  showLabels={showLabels}
  heatmapCells={heatmapCells}
  onObjectTap={(obj) => handleItemSelect('object', obj.id)}
  onContainerPointerDown={handleContainerPointerDown}
  dragPositions={dragPositions}
/>
```

- [ ] **Step 6: Verify in browser**

Open the map view. Try dragging a container (pot/planter). Confirm it moves smoothly and the new position persists after releasing. Confirm hardscape objects (bench, stepping stone) cannot be dragged.

- [ ] **Step 7: Commit**

```bash
git add groei/frontend/src/components/map/MapView.tsx
git commit -m "feat: extend MapView drag system to container objects"
```

---

### Task 5: Add container creation in MapPage

**Files:**
- Modify: `frontend/src/pages/MapPage.tsx`

**Context:** `MapPage` already has a "+ Plant" button (line 204) that opens a `PlantPickerSheet`. We add a "+ Pot" button next to it. On tap, a small bottom sheet lists `CONTAINER_PRESETS`. Selecting a preset calls `createObject` with the container preset data and positions the new container at the centre of the map's viewbox. After creation, `loadMapData()` refreshes so the container appears immediately.

The map centre comes from parsing `map.viewbox` (format: `"minX minY width height"`):
```ts
const [minX, minY, w, h] = map.viewbox.trim().split(/\s+/).map(Number)
const cx = minX + w / 2
const cy = minY + h / 2
```

- [ ] **Step 1: Add imports**

Find the existing imports block in `MapPage.tsx`. Add:

```ts
import { CONTAINER_PRESETS } from '../hooks/useEditorState'
import type { ObjectPreset } from '../hooks/useEditorState'
import { createObject } from '../api/client'
```

- [ ] **Step 2: Add `showPotPicker` state**

In the component body, near the existing `const [showPlantPicker, setShowPlantPicker] = useState(false)` line, add:

```ts
const [showPotPicker, setShowPotPicker] = useState(false)
```

- [ ] **Step 3: Add `handleCreateContainer` function**

Add this function in the component body, after the state declarations:

```ts
async function handleCreateContainer(preset: ObjectPreset) {
  if (!map) return
  setShowPotPicker(false)
  const parts = map.viewbox.trim().split(/\s+/).map(Number)
  const cx = parts.length === 4 ? parts[0] + parts[2] / 2 : 200
  const cy = parts.length === 4 ? parts[1] + parts[3] / 2 : 200
  await createObject({
    name: preset.label,
    object_type: preset.object_type,
    shape: preset.shape,
    category: preset.category,
    material: preset.material,
    color: preset.color,
    map_id: map.id,
    map_x: Math.round(cx),
    map_y: Math.round(cy),
    ...(preset.diameter_cm != null ? { diameter_cm: preset.diameter_cm } : {}),
    ...(preset.width_cm != null ? { width_cm: preset.width_cm } : {}),
    ...(preset.depth_cm != null ? { depth_cm: preset.depth_cm } : {}),
  })
  await refresh()
}
```

`refresh` comes from `const { remove: mapRemove, duplicate: mapDuplicate, refresh } = mapData` (already in the component — line ~102). It re-fetches plants + objects and updates state.

- [ ] **Step 4: Add "+ Pot" button next to "+ Plant"**

Find the existing "+ Plant" button block (lines 204-210):
```tsx
<button
  onClick={() => setShowPlantPicker(true)}
  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary rounded-full text-sm font-medium hover:bg-primary/30 transition-colors"
>
  <span className="text-lg leading-none">+</span>
  <span>Plant</span>
</button>
```

Add the pot button immediately **before** it (or after — either is fine):
```tsx
<button
  onClick={() => setShowPotPicker(true)}
  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-700 rounded-full text-sm font-medium hover:bg-amber-500/25 transition-colors"
>
  <span className="text-lg leading-none">+</span>
  <span>Pot</span>
</button>
```

- [ ] **Step 5: Add the pot picker bottom sheet**

After the existing `{selectedObject && <ObjectQuickSheet ... />}` block, add:

```tsx
{showPotPicker && (
  <div
    className="fixed inset-0 z-50 flex items-end"
    onClick={() => setShowPotPicker(false)}
  >
    <div
      className="w-full bg-bg rounded-t-2xl border-t border-border p-4 pb-8"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-text">Pot toevoegen</h2>
        <button
          onClick={() => setShowPotPicker(false)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface"
        >
          ×
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {CONTAINER_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handleCreateContainer(preset)}
            className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-surface text-left transition-colors"
          >
            <span
              className="w-8 h-8 rounded-full shrink-0"
              style={{ backgroundColor: preset.color ?? '#888' }}
            />
            <div>
              <div className="text-sm font-semibold text-text">{preset.label}</div>
              <div className="text-xs text-text-muted">
                {preset.shape === 'circle'
                  ? `⌀ ${preset.diameter_cm} cm`
                  : `${preset.width_cm} × ${preset.depth_cm ?? preset.width_cm} cm`}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify end-to-end**

1. Open a map in the view page.
2. Tap "+ Pot" — picker sheet appears with 5 presets.
3. Tap a preset — sheet closes, new container appears at map centre.
4. Drag the container to the desired position — it moves smoothly and persists on refresh.
5. Tap the container — `ObjectQuickSheet` opens (existing behaviour).

- [ ] **Step 7: Commit**

```bash
git add groei/frontend/src/pages/MapPage.tsx
git commit -m "feat: add container creation and drag in map view"
```
