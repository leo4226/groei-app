# Editor Canvas Pan, Zoom & Dimension Arrows + MapView Zoom Controls

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Two independent features: (A) EditorCanvas pan/drag + zoom + dimension arrows, (B) MapView zoom controls. Both improve navigation and visual feedback.

**Architecture:** EditorCanvas uses a `<g transform="translate(panX, panY) scale(zoom)">` wrapper around all canvas content (zones, walls, shadow casters, snap lines, draw previews) to keep coordinate math unchanged. `screenToSVG()` via `getScreenCTM()` automatically handles the transform — no pointer math changes needed. MapView uses internal `zoom` state + dynamic viewBox computation for pinch-free zoom via buttons.

**Tech Stack:** React 19, TypeScript, SVG (no libraries), Tailwind

---

## A — EditorCanvas Pan + Zoom (editor mode, `/maps/:id/edit-layout`)

### Task A1: Add pan state + pan-to-drag on empty canvas

**Objective:** User can drag the canvas when `activeTool === 'select'` and they press on empty SVG area (not on a zone, wall, resize handle, or shadow caster).

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`

**Step 1: Add state**

```
import { useRef, useState, useCallback } from 'react'
```

Add after `const [snapLines, setSnapLines] = useState<SnapLine[]>([])` (line 258):

```typescript
const [pan, setPan] = useState({ x: 0, y: 0 })
const [panning, setPanning] = useState<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null)
```

**Step 2: Modify `handlePointerDown` to start pan**

Replace the `else` branch (lines 283-287):

```typescript
    } else if (activeTool === 'select') {
      // Start pan mode on empty canvas area
      setPanning({ startX: pt.x, startY: pt.y, origPanX: pan.x, origPanY: pan.y })
      onSelectZone(null)
      onSelectWallElement(null)
      onSelectShadowCaster(null)
    } else {
      onSelectZone(null)
      onSelectWallElement(null)
      onSelectShadowCaster(null)
    }
```

**Step 3: Add pan update in `handlePointerMove`**

In `handlePointerMove`, after all the existing drag/draw/resize branches (before the function's implicit end), add:

```typescript
    if (panning) {
      const dx = pt.x - panning.startX
      const dy = pt.y - panning.startY
      setPan({ x: panning.origPanX + dx, y: panning.origPanY + dy })
      return
    }
```

**Step 4: End pan in `handlePointerUp`**

In `handlePointerUp`, add at the end:

```typescript
    if (panning) setPanning(null)
```

**Step 5: Wrap all canvas content in `<g transform>`**

In the JSX, wrap everything INSIDE the `<svg>` tag (lines 608-754) in a `<g>`:

```tsx
<g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
  {/* all existing content: EditorDefs, grid rect, zones, walls, shadow casters, resize overlay, wall placement, snap lines, draw previews, perimeter polygon */}
</g>
```

The content that goes inside the transform `<g>`:
- `<EditorDefs />`
- `<rect width={CANVAS_W} ...>` (grid)
- All shadow caster `<rect>`/`<circle>` elements
- All zones (ZoneShape + RoomWallRenderer)
- `<EditorResizeOverlay />`
- `<WallElementPlacementOverlay />`
- Snap lines (`snapLines.map(...)`)
- Draw preview rects (drawRect, wallDrawRect, shadowCasterDrawRect)
- Perimeter polygon

Everything outside the `<g>` is the SVG container itself (which stays in viewBox-space).

**Step 6: Verify**

- Run `npm run dev:frontend`
- Navigate to `/maps/:id/edit-layout`, select the select tool
- Click and drag on empty canvas area → canvas should follow drag direction
- Clicking a zone still selects it (zone's own onPointerDown stops propagation)
- Dragging a zone still works correctly

### Task A2: Add zoom state + zoom controls (+/−/reset buttons)

**Objective:** Zoom in/out buttons overlaid on the editor canvas, plus scroll-wheel zoom.

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`

**Step 1: Add zoom state**

```typescript
const [zoom, setZoom] = useState(1)
```

Next to the pan state (after line 258 area).

**Step 2: Add zoom constants**

```typescript
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25
```

**Step 3: Add zoom controls component**

After the closing `</svg>` tag and before the closing `</div>`, add a floating zoom control group:

```tsx
{/* Zoom controls */}
<div className="absolute bottom-3 right-3 flex items-center gap-1 bg-surface/90 border border-border rounded-lg shadow-md backdrop-blur-sm p-1">
  <button
    onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
    className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-sm font-bold"
    title="Zoom uit"
  >−</button>
  <span className="text-xs text-text-muted font-medium w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
  <button
    onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
    className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-sm font-bold"
    title="Zoom in"
  >+</button>
</div>
```

**Step 4: Add scroll-wheel zoom on the SVG**

Add `onWheel={handleWheel}` to the `<svg>` element. Add handler:

```typescript
function handleWheel(e: React.WheelEvent) {
  if (e.deltaY === 0) return
  e.preventDefault()
  const dir = e.deltaY < 0 ? 1 : -1  // scroll up = zoom in
  const factor = dir * ZOOM_STEP
  setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + factor).toFixed(2))))
}
```

Note: Since the SVG uses `touchAction: 'none'`, wheel/trackpad zoom won't conflict with two-finger scroll.

**Step 5: Reset button (optional)**

Add a reset button in the zoom controls:

```tsx
<button
  onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1) }}
  className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-xs border-l border-border ml-0.5 pl-1.5"
  title="Reset"
>⟲</button>
```

**Step 6: Verify**

- Zoom buttons change the zoom percentage display
- Content scales around (0,0) in SVG space
- Scroll-wheel zooms in/out
- Pan still works at any zoom level
- Float rounding: `+(value).toFixed(2)` to avoid floating-point drift

---

### Task A3: Pan + zoom constraints

**Objective:** Prevent panning too far past canvas edges and prevent zoom from making canvas too small or too large.

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`

**Step 1: Add pan constraints**

Replace the pan delta in `handlePointerMove`:

```typescript
    if (panning) {
      const dx = pt.x - panning.startX
      const dy = pt.y - panning.startY
      const rawX = panning.origPanX + dx
      const rawY = panning.origPanY + dy
      const margin = CANVAS_W * (1 / zoom) * 0.3  // allow 30% overscroll
      setPan({
        x: Math.min(margin, Math.max(-CANVAS_W * (1 / zoom) + CANVAS_W + margin, rawX)),
        y: Math.min(margin, Math.max(-CANVAS_H * (1 / zoom) + CANVAS_H + margin, rawY)),
      })
      return
    }
```

**Rationale:** `margin` allows 30% overscroll past both edges so users can see zone edges clearly. The `-CANVAS_W / zoom + CANVAS_W + margin` min clamp ensures the right edge of the scaled canvas doesn't go too far past the viewport right edge (allowing 30% overscroll on that side too).

**Step 2: Verify**

- Pan to extremes: should stop at ~30% past canvas edges
- At 4× zoom: the visible area is 170×170px of SVG space, pan range is correspondingly narrow
- At 0.25× zoom: the visible area is 2720×2720, pan range is wide

---

## B — EditorCanvas Dimension Arrows

### Task B1: Create `<DimensionArrows>` component

**Objective:** Add measurement lines along the top and left edges of the editor canvas showing total width and height in meters. Only in editor mode (not `previewMode`).

**Files:**
- Create: `frontend/src/components/editor/DimensionArrows.tsx`
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`

**Step 1: Create the component**

`frontend/src/components/editor/DimensionArrows.tsx`:

```tsx
interface Props {
  canvasW: number       // CANVAS_W constant (680)
  canvasH: number       // CANVAS_H constant (680)
  pxPerM: number        // scalePxPerM
}

export default function DimensionArrows({ canvasW, canvasH, pxPerM }: Props) {
  const wM = pxPerM > 0 ? (canvasW / pxPerM).toFixed(1) : '?'
  const hM = pxPerM > 0 ? (canvasH / pxPerM).toFixed(1) : '?'
  const MARGIN = 14     // gap between canvas edge and dimension line
  const ARROW_L = 6     // arrow head length
  const ARROW_INSET = 6 // arrow inset from canvas corners

  return (
    <g pointerEvents="none" opacity={0.45} style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* ── Top dimension line (horizontal, width) ── */}
      {/* End arrows */}
      <path d={`M ${ARROW_INSET} ${-MARGIN} l ${ARROW_L} ${-ARROW_L} M ${ARROW_INSET} ${-MARGIN} l ${ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none" />
      <path d={`M ${canvasW - ARROW_INSET} ${-MARGIN} l ${-ARROW_L} ${-ARROW_L} M ${canvasW - ARROW_INSET} ${-MARGIN} l ${-ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none" />
      {/* Dimension line */}
      <line x1={ARROW_INSET + ARROW_L} y1={-MARGIN} x2={canvasW - ARROW_INSET - ARROW_L} y2={-MARGIN}
        stroke="currentColor" strokeWidth={1} />
      {/* Tick marks at edges */}
      <line x1={ARROW_INSET + ARROW_L} y1={-MARGIN - 3} x2={ARROW_INSET + ARROW_L} y2={-MARGIN + 3}
        stroke="currentColor" strokeWidth={1} />
      <line x1={canvasW - ARROW_INSET - ARROW_L} y1={-MARGIN - 3} x2={canvasW - ARROW_INSET - ARROW_L} y2={-MARGIN + 3}
        stroke="currentColor" strokeWidth={1} />
      {/* Label */}
      <text x={canvasW / 2} y={-MARGIN - 3} textAnchor="middle" dominantBaseline="baseline"
        fill="currentColor" fontSize={10} fontWeight={500}>
        {wM} m
      </text>

      {/* ── Left dimension line (vertical, height) ── */}
      {/* End arrows */}
      <path d={`M ${-MARGIN} ${ARROW_INSET} l ${-ARROW_L} ${ARROW_L} M ${-MARGIN} ${ARROW_INSET} l ${ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none" />
      <path d={`M ${-MARGIN} ${canvasH - ARROW_INSET} l ${-ARROW_L} ${-ARROW_L} M ${-MARGIN} ${canvasH - ARROW_INSET} l ${ARROW_L} ${-ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none" />
      {/* Dimension line */}
      <line x1={-MARGIN} y1={ARROW_INSET + ARROW_L} x2={-MARGIN} y2={canvasH - ARROW_INSET - ARROW_L}
        stroke="currentColor" strokeWidth={1} />
      {/* Tick marks */}
      <line x1={-MARGIN - 3} y1={ARROW_INSET + ARROW_L} x2={-MARGIN + 3} y2={ARROW_INSET + ARROW_L}
        stroke="currentColor" strokeWidth={1} />
      <line x1={-MARGIN - 3} y1={canvasH - ARROW_INSET - ARROW_L} x2={-MARGIN + 3} y2={canvasH - ARROW_INSET - ARROW_L}
        stroke="currentColor" strokeWidth={1} />
      {/* Label */}
      <text x={-MARGIN - 3} y={canvasH / 2} textAnchor="middle" dominantBaseline="central"
        fill="currentColor" fontSize={10} fontWeight={500}
        transform={`rotate(-90, ${-MARGIN - 3}, ${canvasH / 2})`}>
        {hM} m
      </text>
    </g>
  )
}
```

**Step 2: Import and render in EditorCanvas**

Import at top:
```typescript
import DimensionArrows from './DimensionArrows'
```

Render inside the `<g transform={...}>` (before any other content, so arrows are behind zones):

```tsx
{!previewMode && <DimensionArrows canvasW={CANVAS_W} canvasH={CANVAS_H} pxPerM={scalePxPerM} />}
```

**Step 3: Verify**

- Run dev server, open editor
- Top and left dimension lines visible with "X.X m" labels
- NOT visible in preview mode
- Only visible in the editor canvas (not in map view pages)

---

## C — MapView Zoom Controls

### Task C1: Add zoom state and floating zoom buttons to MapView

**Objective:** Zoom in/out/reset buttons floating over the map view. Adjusts the viewBox to create a zoom effect around the viewport center.

**Files:**
- Modify: `frontend/src/components/map/MapView.tsx`

**Step 1: Add zoom state**

```typescript
const [zoom, setZoom] = useState(1)
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
```

After existing hooks (after `const isHouseMap = ...` line 63).

**Step 2: Compute effective viewBox**

Replace the current `viewBox` prop (lines 167-171):

```typescript
viewBox={computeZoomViewBox(
  isHouseMap ? map.viewbox : gardenViewBox || map.viewbox || '0 0 680 680',
  zoom
)}
```

Add a helper function before the `return`:

```typescript
function computeZoomViewBox(baseViewBox: string, z: number): string {
  if (z === 1) return baseViewBox  // no transform needed at 1×
  const parts = baseViewBox.trim().split(/\s+/).map(Number)
  if (parts.length !== 4) return baseViewBox
  const [vx, vy, vw, vh] = parts
  // Zoom around the center of the current viewBox
  const cx = vx + vw / 2
  const cy = vy + vh / 2
  const nw = vw / z
  const nh = vh / z
  return `${(cx - nw / 2).toFixed(2)} ${(cy - nh / 2).toFixed(2)} ${nw.toFixed(2)} ${nh.toFixed(2)}`
}
```

**Step 3: Add zoom controls UI**

After the `</svg>` closing tag and before `</div>`, add:

```tsx
{/* Zoom controls */}
<div className="absolute bottom-3 right-3 flex flex-col gap-0.5 bg-surface/90 border border-border rounded-lg shadow-md backdrop-blur-sm p-1">
  <button
    onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z * 1.25).toFixed(2)))}
    className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-sm font-bold"
    title="Zoom in"
  >+</button>
  <button
    onClick={() => setZoom(1)}
    className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-xs border-y border-border/50"
    title="Reset zoom"
  >{Math.round(zoom * 100)}%</button>
  <button
    onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z / 1.25).toFixed(2)))}
    className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-sm font-bold"
    title="Zoom uit"
  >−</button>
</div>
```

The zoom controls need to be positioned inside the outermost div of MapView (the one with `className="relative w-full h-full"`). Place them just after the closing `</div>` of the SVG wrapper (line 305).

**Step 4: Handle zoom with externally provided gardenViewBox**

When `gardenViewBox` is provided externally (by SunControls), zoom should compose on top. The `computeZoomViewBox` function already handles this by using the effective base viewBox and zooming around its center.

**Step 5: Verify**

- Open any map page (`/map/garden`)
- Zoom in and out with +/- buttons
- Reset zoom works (percent display goes to 100%)
- Sun mode viewBox (`gardenViewBox` from `useSunVisualization`) still works — zoom composes on top
- Compass, labels, plants, objects all display at correct zoom level
- Pointer interaction (plant drag, object tap) still works at zoomed levels (screenToSVG handles it via getScreenCTM)
- On mobile: zoom controls are accessible via the existing touch-anywhere interaction; no pinch-zoom yet

---

## Execution order

1. A1 (pan) — standalone, minimal risk
2. A2 (zoom in editor) — builds on A1's transform group
3. A3 (constraints) — polish for A1+A2
4. B1 (dimension arrows) — independent of A
5. C1 (map zoom) — independent of A and B
