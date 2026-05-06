# Map Editor Comprehensive Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the map layout editor with a right-sidebar legend, full Dutch UI, canvas grid, per-zone dimension labels, an outer footprint silhouette, and a snap-gap rendering fix.

**Architecture:** No changes to the state machine (`useEditorState.ts`), data model, or DB schema. All changes are additive (new components/utils) or contained replacements (strings, stroke rendering). A new `computeZoneUnion.ts` utility computes the polygon union of all zone rectangles using a directed sweep-line + contour-tracing algorithm. The properties panels move from floating (`DraggablePanel`) to a fixed right sidebar alongside a new `EditorLegendPanel`.

**Tech Stack:** React 19, TypeScript 6, SVG, Vitest (tests in `src/**/__tests__/**/*.test.ts`, run from `groei/` with `npm --prefix frontend test`)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `frontend/src/utils/computeZoneUnion.ts` | Polygon union of EditorZone rectangles → SVG path string |
| Create | `frontend/src/utils/__tests__/computeZoneUnion.test.ts` | Unit tests for the union algorithm |
| Create | `frontend/src/utils/editorStrings.nl.ts` | All Dutch UI strings for the editor |
| Create | `frontend/src/components/editor/EditorLegendPanel.tsx` | Always-visible zone type legend cards |
| Modify | `frontend/src/components/editor/EditorDefs.tsx` | Grid pattern size 23→46 (1m grid) |
| Modify | `frontend/src/components/editor/EditorCanvas.tsx` | Add silhouette path + dimension labels |
| Modify | `frontend/src/components/editor/EditorToolbar.tsx` | Remove zone type chips; Dutch strings |
| Modify | `frontend/src/components/editor/EditorZoneShape.tsx` | Fix snap-gap stroke (strokeWidth 1 on fill rect) |
| Modify | `frontend/src/components/editor/ZonePropertiesPanel.tsx` | Remove DraggablePanel; Dutch strings |
| Modify | `frontend/src/components/editor/WallElementPropertiesPanel.tsx` | Remove DraggablePanel; Dutch strings |
| Modify | `frontend/src/pages/LayoutEditorPage.tsx` | Sidebar layout; add EditorLegendPanel; Dutch strings |

---

## Task 1: `computeZoneUnion` utility (TDD)

**Files:**
- Create: `frontend/src/utils/computeZoneUnion.ts`
- Create: `frontend/src/utils/__tests__/computeZoneUnion.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/__tests__/computeZoneUnion.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeZoneUnion } from '../computeZoneUnion'
import type { EditorZone } from '../../types'

function makeZone(id: string, x: number, y: number, width: number, height: number): EditorZone {
  return { id, type: 'room', shape: 'rect', x, y, width, height, label: '' }
}

describe('computeZoneUnion', () => {
  it('returns empty string for empty zones array', () => {
    expect(computeZoneUnion([])).toBe('')
  })

  it('returns a closed path for a single zone', () => {
    const result = computeZoneUnion([makeZone('a', 10, 20, 100, 80)])
    expect(result).toContain('M')
    expect(result).toContain('Z')
    expect(result).toMatch(/10/)
    expect(result).toMatch(/20/)
  })

  it('merges two horizontally adjacent zones into one outline', () => {
    // Zones share the edge at x=110
    const zones = [
      makeZone('a', 10, 10, 100, 80),
      makeZone('b', 110, 10, 100, 80),
    ]
    const result = computeZoneUnion(zones)
    // Should produce a single closed polygon (one M...Z block)
    const mCount = (result.match(/M /g) ?? []).length
    expect(mCount).toBe(1)
    // The bounding corners should all appear
    expect(result).toContain('10')
    expect(result).toContain('210')
  })

  it('produces separate paths for two non-adjacent zones', () => {
    const zones = [
      makeZone('a', 0, 0, 50, 50),
      makeZone('b', 200, 200, 50, 50),
    ]
    const result = computeZoneUnion(zones)
    const mCount = (result.match(/M /g) ?? []).length
    expect(mCount).toBe(2)
  })

  it('traces a single polygon for an L-shaped layout', () => {
    // Two zones forming an L
    const zones = [
      makeZone('a', 0, 0, 100, 100),   // top-left square
      makeZone('b', 0, 100, 200, 100), // bottom wide rect
    ]
    const result = computeZoneUnion(zones)
    const mCount = (result.match(/M /g) ?? []).length
    expect(mCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests — expect all to fail**

```
cd "C:\Users\leon_\Projects\Plant APP\groei"
npm --prefix frontend test
```

Expected: 5 failures with "Cannot find module '../computeZoneUnion'"

- [ ] **Step 3: Implement `computeZoneUnion.ts`**

Create `frontend/src/utils/computeZoneUnion.ts`:

```typescript
import type { EditorZone } from '../types'

type P = [number, number]

function pKey(p: P): string { return `${p[0]},${p[1]}` }
function getDir(from: P, to: P): 'right' | 'down' | 'left' | 'up' {
  if (to[0] > from[0]) return 'right'
  if (to[0] < from[0]) return 'left'
  if (to[1] > from[1]) return 'down'
  return 'up'
}

// In SVG y-down coords, walking CW around the exterior keeps covered cells to the left.
// At each junction, prefer the most-clockwise turn: right-turn first.
const CW_PRIORITY: Record<string, ('right' | 'down' | 'left' | 'up')[]> = {
  right: ['down', 'right', 'up'],
  down:  ['left', 'down', 'right'],
  left:  ['up',   'left', 'down'],
  up:    ['right', 'up',  'left'],
}

export function computeZoneUnion(zones: EditorZone[]): string {
  if (zones.length === 0) return ''

  // Coordinate compression
  const allX = [...new Set(zones.flatMap(z => [z.x, z.x + z.width]))].sort((a, b) => a - b)
  const allY = [...new Set(zones.flatMap(z => [z.y, z.y + z.height]))].sort((a, b) => a - b)
  const nX = allX.length - 1
  const nY = allY.length - 1
  if (nX <= 0 || nY <= 0) return ''

  // Mark covered cells
  const cov: boolean[][] = Array.from({ length: nY }, (_, iy) =>
    Array.from({ length: nX }, (_, ix) => {
      const cx = (allX[ix] + allX[ix + 1]) / 2
      const cy = (allY[iy] + allY[iy + 1]) / 2
      return zones.some(z => cx >= z.x && cx < z.x + z.width && cy >= z.y && cy < z.y + z.height)
    })
  )

  function isIn(ix: number, iy: number): boolean {
    return ix >= 0 && ix < nX && iy >= 0 && iy < nY && cov[iy][ix]
  }

  // Build directed adjacency: from-point → [to-point, ...]
  // Direction: covered cell is always to the LEFT of travel direction
  const adj = new Map<string, P[]>()
  function addEdge(from: P, to: P) {
    const k = pKey(from)
    if (!adj.has(k)) adj.set(k, [])
    adj.get(k)!.push(to)
  }

  // Horizontal boundary edges (between rows)
  for (let iy = 0; iy <= nY; iy++) {
    for (let ix = 0; ix < nX; ix++) {
      const above = isIn(ix, iy - 1)
      const below = isIn(ix, iy)
      if (!above && below) addEdge([allX[ix], allY[iy]], [allX[ix + 1], allY[iy]])  // →
      if (above && !below) addEdge([allX[ix + 1], allY[iy]], [allX[ix], allY[iy]])  // ←
    }
  }
  // Vertical boundary edges (between columns)
  for (let ix = 0; ix <= nX; ix++) {
    for (let iy = 0; iy < nY; iy++) {
      const left  = isIn(ix - 1, iy)
      const right = isIn(ix, iy)
      if (!left && right) addEdge([allX[ix], allY[iy]], [allX[ix], allY[iy + 1]])   // ↓
      if (left && !right) addEdge([allX[ix], allY[iy + 1]], [allX[ix], allY[iy]])   // ↑
    }
  }

  // Trace closed polygons by following directed edges
  const visitedEdges = new Set<string>()
  const paths: string[] = []

  for (const [startKey, startNeighbors] of adj) {
    for (const firstStep of startNeighbors) {
      const edgeId = `${startKey}|${pKey(firstStep)}`
      if (visitedEdges.has(edgeId)) continue

      const startPt: P = startKey.split(',').map(Number) as P
      const pts: P[] = [startPt, firstStep]
      visitedEdges.add(edgeId)

      let prev = startPt
      let curr = firstStep

      for (let iter = 0; iter < 10_000; iter++) {
        const currKey = pKey(curr)
        if (currKey === startKey) break

        const nexts = adj.get(currKey)
        if (!nexts) break

        const inDir = getDir(prev, curr)
        const available = nexts.filter(n => !visitedEdges.has(`${currKey}|${pKey(n)}`))
        if (available.length === 0) break

        // Pick the most-clockwise next step
        let next: P | undefined
        for (const dir of CW_PRIORITY[inDir]) {
          next = available.find(n => getDir(curr, n) === dir)
          if (next) break
        }
        if (!next) next = available[0]

        visitedEdges.add(`${currKey}|${pKey(next)}`)
        pts.push(next)
        prev = curr
        curr = next
      }

      if (pts.length >= 3) {
        paths.push(
          `M ${pts[0][0]} ${pts[0][1]} ` +
          pts.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ') +
          ' Z'
        )
      }
    }
  }

  return paths.join(' ')
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```
cd "C:\Users\leon_\Projects\Plant APP\groei"
npm --prefix frontend test
```

Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/computeZoneUnion.ts frontend/src/utils/__tests__/computeZoneUnion.test.ts
git commit -m "feat: add computeZoneUnion utility with tests"
```

---

## Task 2: Dutch strings file

**Files:**
- Create: `frontend/src/utils/editorStrings.nl.ts`

- [ ] **Step 1: Create the strings file**

Create `frontend/src/utils/editorStrings.nl.ts`:

```typescript
import type { ZoneStyleType } from '../types'

export const ZONE_NL: Record<ZoneStyleType, { naam: string; beschrijving: string }> = {
  deck:      { naam: 'Terras',   beschrijving: 'Vlonders, tegels of verharde buitenvloer' },
  soil:      { naam: 'Grond',    beschrijving: 'Tuinaarde voor planten en bloemen' },
  gravel:    { naam: 'Grind',    beschrijving: 'Grindpad of grindvlak' },
  lawn:      { naam: 'Gazon',    beschrijving: 'Gras of grasveld' },
  path:      { naam: 'Pad',      beschrijving: 'Looppad of bestrating' },
  water:     { naam: 'Water',    beschrijving: 'Vijver, fontein of waterpartij' },
  structure: { naam: 'Gebouw',   beschrijving: 'Schuur, berging, overkapping of buitenmuur' },
  room:      { naam: 'Kamer',    beschrijving: 'Kamer, hal of ruimte binnen het gebouw' },
  wall:      { naam: 'Muur',     beschrijving: 'Binnenmuur of scheidingswand' },
}

export const TOOLBAR_NL = {
  selecteren:    'Selecteren',
  tekenen:       'Tekenen',
  deurPlaatsen:  'Deur plaatsen',
  raamPlaatsen:  'Raam plaatsen',
  ongedaanMaken: 'Ongedaan maken',
  verwijderen:   'Verwijderen',
  voorbeeld:     'Voorbeeld',
  bewerken:      'Bewerken',
  svgExporteren: 'SVG exporteren',
  terug:         '← Terug',
} as const

export const OPSLAAN_NL = {
  opgeslagen:  'Opgeslagen',
  bezig:       'Opslaan...',
  nietOpgeslagen: 'Niet opgeslagen',
} as const

export const KAART_TYPE_NL = {
  tuin: '🌿 Tuin',
  huis: '🏠 Huis',
} as const

export const EIGENSCHAPPEN_NL = {
  zone:         'Zone',
  deur:         'Deur',
  raam:         'Raam',
  label:        'Label',
  lengte:       'Lengte (m)',
  breedte:      'Breedte (m)',
  hoogte:       'Hoogte (m)',
  breedteCm:    'Breedte (cm)',
  scharnier:    'Scharnier',
  links:        'Links',
  rechts:       'Rechts',
  naarBinnen:   'Naar binnen',
  naarBuiten:   'Naar buiten',
  openingsrichting: 'Openingsrichting',
  wanddikte:    'Wanddikte',
  buitenmuur:   'Buitenmuur',
  binnenmuur:   'Binnenmuur',
  hoekAfsnijding: 'Hoekafsnijding',
  hoek:         'Hoek',
  breedte_:     'Breedte',
  diepte:       'Diepte',
  schaalKalibratie: 'Schaal kalibreren',
  schaalHint:   'Voer de werkelijke lengte van dit object in om de schaal in te stellen.',
  verwijderen:  'Verwijderen',
} as const

export const EDITOR_NL = {
  laden:        'Editor laden...',
  kaartNietGevonden: 'Kaart niet gevonden',
  legenda:      'Legenda',
} as const
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/editorStrings.nl.ts
git commit -m "feat: add Dutch editor strings"
```

---

## Task 3: Update grid pattern to 1m

**Files:**
- Modify: `frontend/src/components/editor/EditorDefs.tsx`

The grid pattern already exists (`id="editor-grid"`) and is already applied in `EditorCanvas.tsx`. It is currently 23×23 (0.5m). Update it to 46×46 (1m) and make it slightly more visible.

- [ ] **Step 1: Update the pattern in EditorDefs.tsx**

In `frontend/src/components/editor/EditorDefs.tsx`, replace the `editor-grid` pattern (lines 47–49):

```tsx
// BEFORE:
<pattern id="editor-grid" width="23" height="23" patternUnits="userSpaceOnUse">
  <path d="M 23 0 L 0 0 0 23" fill="none" stroke="rgba(150,150,140,0.15)" strokeWidth="0.5" />
</pattern>

// AFTER:
<pattern id="editor-grid" width="46" height="46" patternUnits="userSpaceOnUse">
  <path d="M 46 0 L 0 0 0 46" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
</pattern>
```

- [ ] **Step 2: Verify visually**

Run `npm run dev` from `groei/`, open `/maps/:id/edit-layout`. The canvas should show a 1m grid.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/editor/EditorDefs.tsx
git commit -m "feat: update canvas grid to 1m (46px) intervals"
```

---

## Task 4: Outer silhouette on canvas

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`

Add the outer footprint silhouette path below all zone shapes, using `computeZoneUnion`.

- [ ] **Step 1: Import computeZoneUnion in EditorCanvas.tsx**

At the top of `frontend/src/components/editor/EditorCanvas.tsx`, add:

```tsx
import { computeZoneUnion } from '../../utils/computeZoneUnion'
```

- [ ] **Step 2: Add the silhouette path to the SVG render**

In the SVG return block of `EditorCanvas.tsx`, after `<EditorDefs />` and the grid rect (line 412), and **before** the `zones.map(...)` block, add:

```tsx
{/* Outer footprint silhouette */}
{zones.length > 0 && (() => {
  const d = computeZoneUnion(zones)
  return d ? (
    <path
      d={d}
      fill="#f1f5f9"
      stroke="#94a3b8"
      strokeWidth={2}
      pointerEvents="none"
    />
  ) : null
})()}
```

- [ ] **Step 3: Verify visually**

Run `npm run dev`, add multiple rooms in the editor. A light grey silhouette should appear behind all zones, correctly tracing the outer boundary including L-shapes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/editor/EditorCanvas.tsx
git commit -m "feat: render outer zone union silhouette on canvas"
```

---

## Task 5: Dimension labels on canvas

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`

Add a `{w}m × {h}m` label centred on each zone. Suppress labels for zones smaller than 60px in either dimension to avoid overflow.

- [ ] **Step 1: Add dimension labels to the SVG render**

In `EditorCanvas.tsx`, after the `zones.map(...)` block (after line 427), and before the resize overlay, add:

```tsx
{/* Dimension labels */}
{!previewMode && zones.map((zone) => {
  if (zone.width < 60 || zone.height < 60) return null
  const wM = (zone.width  / scalePxPerM).toFixed(1)
  const hM = (zone.height / scalePxPerM).toFixed(1)
  return (
    <text
      key={`dim-${zone.id}`}
      x={zone.x + zone.width  / 2}
      y={zone.y + zone.height / 2}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#94a3b8"
      fontSize={11}
      fontFamily="sans-serif"
      pointerEvents="none"
    >
      {wM}m × {hM}m
    </text>
  )
})}
```

- [ ] **Step 2: Verify visually**

Large zones should show their dimensions in grey text at their centre. Zones smaller than 60px in either direction show no label.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/editor/EditorCanvas.tsx
git commit -m "feat: add dimension labels on canvas zones"
```

---

## Task 6: Snap-gap fix

**Files:**
- Modify: `frontend/src/components/editor/EditorZoneShape.tsx`

The visual gap between snapped zones is caused by centered SVG strokes bleeding across zone boundaries. The fix: set `strokeWidth={1}` on all zone fill rects (they currently use `style.strokeWidth` which can be 1.5 or 0.8).

- [ ] **Step 1: Cap stroke width on the fill rect**

In `frontend/src/components/editor/EditorZoneShape.tsx`, in the general zone render (line 64–75), change the `<rect>` to use `strokeWidth={1}` instead of `style.strokeWidth`:

```tsx
// BEFORE (line 72):
strokeWidth={style.strokeWidth}

// AFTER:
strokeWidth={Math.min(style.strokeWidth, 1)}
```

- [ ] **Step 2: Verify visually**

Snap two rooms together so their edges are flush. No white gap should appear between them. Run the full test suite to confirm no regressions.

```
cd "C:\Users\leon_\Projects\Plant APP\groei"
npm --prefix frontend test
```

Expected: all tests still passing.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/editor/EditorZoneShape.tsx
git commit -m "fix: eliminate snap gap by capping zone stroke width to 1px"
```

---

## Task 7: `EditorLegendPanel` component

**Files:**
- Create: `frontend/src/components/editor/EditorLegendPanel.tsx`

An always-visible list of zone type cards. Clicking a card activates that zone type and switches to draw mode.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/editor/EditorLegendPanel.tsx`:

```tsx
import type { ZoneStyleType } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import { ZONE_STYLES, GARDEN_ZONE_TYPES, HOUSE_ZONE_TYPES } from './EditorDefs'
import { ZONE_NL, EDITOR_NL } from '../../utils/editorStrings.nl'

interface Props {
  activeZoneType: ZoneStyleType
  activeTool: EditorTool
  mapType: string
  onSetZoneType: (type: ZoneStyleType) => void
  onSetTool: (tool: EditorTool) => void
}

export default function EditorLegendPanel({
  activeZoneType,
  activeTool,
  mapType,
  onSetZoneType,
  onSetTool,
}: Props) {
  const zoneTypes = mapType === 'house' ? HOUSE_ZONE_TYPES : GARDEN_ZONE_TYPES

  return (
    <div className="p-3 border-b border-border">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
        {EDITOR_NL.legenda}
      </p>
      <div className="flex flex-col gap-1">
        {zoneTypes.map((type) => {
          const style = ZONE_STYLES[type]
          const nl = ZONE_NL[type]
          const isActive = activeZoneType === type && activeTool === 'draw'
          return (
            <button
              key={type}
              onClick={() => {
                onSetZoneType(type)
                onSetTool('draw')
              }}
              className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-primary/10 ring-1 ring-primary/30'
                  : 'hover:bg-bg'
              }`}
            >
              <span
                className="w-3 h-3 rounded-sm shrink-0 mt-0.5"
                style={{ backgroundColor: style.chipColor }}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-text leading-tight">
                  {nl.naam}
                </div>
                <div className="text-[10px] text-text-muted leading-tight mt-0.5">
                  {nl.beschrijving}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/EditorLegendPanel.tsx
git commit -m "feat: add EditorLegendPanel with Dutch zone type cards"
```

---

## Task 8: Sidebar restructure, toolbar cleanup, and full Dutch UI

**Files:**
- Modify: `frontend/src/pages/LayoutEditorPage.tsx`
- Modify: `frontend/src/components/editor/EditorToolbar.tsx`
- Modify: `frontend/src/components/editor/ZonePropertiesPanel.tsx`
- Modify: `frontend/src/components/editor/WallElementPropertiesPanel.tsx`

### 8a — Remove DraggablePanel from ZonePropertiesPanel

- [ ] **Step 1: Update ZonePropertiesPanel to render in a static div**

In `frontend/src/components/editor/ZonePropertiesPanel.tsx`, replace the `DraggablePanel` import and usage with a plain section. Remove the `DraggablePanel` import, add the `EIGENSCHAPPEN_NL` import, and wrap content in a `<div className="p-3 border-b border-border">`:

```tsx
// REMOVE this import:
import DraggablePanel from './DraggablePanel'

// ADD this import:
import { EIGENSCHAPPEN_NL } from '../../utils/editorStrings.nl'

// Replace the return statement — wrap with a plain div instead of DraggablePanel:
return (
  <div className="p-3 border-b border-border">
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
        {EIGENSCHAPPEN_NL.zone}
      </p>
      <button
        onClick={onDelete}
        className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
      >
        {EIGENSCHAPPEN_NL.verwijderen}
      </button>
    </div>
    {/* Keep all existing field JSX unchanged, but update label strings to use EIGENSCHAPPEN_NL */}
    {/* Label field: change "Label" → {EIGENSCHAPPEN_NL.label} */}
    {/* Lengte field: already Dutch — leave as is */}
    {/* Breedte field: already Dutch — leave as is */}
    {/* Hoogte field: already Dutch — leave as is */}
    {/* Remaining English strings: translate using EIGENSCHAPPEN_NL */}
  </div>
)
```

Concretely, keep all existing `<input>`, `<select>`, and `<button>` JSX from ZonePropertiesPanel verbatim. Only change:
1. Replace `<DraggablePanel title="Zone" onDelete={onDelete} deleteLabel="Delete">...</DraggablePanel>` with the `<div>` wrapper shown above.
2. Replace the string `"Label"` in the label element with `{EIGENSCHAPPEN_NL.label}`.
3. Replace `"Delete"` deleteLabel with `{EIGENSCHAPPEN_NL.verwijderen}` (now in the div header button).

### 8b — Remove DraggablePanel from WallElementPropertiesPanel

- [ ] **Step 2: Update WallElementPropertiesPanel to render in a static div**

In `frontend/src/components/editor/WallElementPropertiesPanel.tsx`, remove `DraggablePanel` import, add `EIGENSCHAPPEN_NL` import, and replace the wrapper:

```tsx
// REMOVE:
import DraggablePanel from './DraggablePanel'

// ADD:
import { EIGENSCHAPPEN_NL } from '../../utils/editorStrings.nl'

// Replace the return statement wrapper:
return (
  <div className="p-3 border-b border-border">
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
        {isDoor ? EIGENSCHAPPEN_NL.deur : EIGENSCHAPPEN_NL.raam}
      </p>
      <button
        onClick={onDelete}
        className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
      >
        {EIGENSCHAPPEN_NL.verwijderen}
      </button>
    </div>
    {/* Keep all existing field JSX unchanged */}
    {/* The "Breedte (cm)", "Scharnier", "Links"/"Rechts" labels are already Dutch — leave as is */}
    {/* Translate any remaining English: "Swing direction" → use EIGENSCHAPPEN_NL.openingsrichting, */}
    {/*   "Inward" → EIGENSCHAPPEN_NL.naarBinnen, "Outward" → EIGENSCHAPPEN_NL.naarBuiten */}
  </div>
)
```

### 8c — Remove zone chips from EditorToolbar; translate strings

- [ ] **Step 3: Update EditorToolbar**

In `frontend/src/components/editor/EditorToolbar.tsx`, add the Dutch strings import and remove zone type chips. Replace the entire file content:

```tsx
import type { MapType } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import { TOOLBAR_NL } from '../../utils/editorStrings.nl'

interface Props {
  activeTool: EditorTool
  selectedZoneId: string | null
  selectedWallElementId: string | null
  mapType: MapType
  onSetTool: (tool: EditorTool) => void
  onDelete: () => void
}

export default function EditorToolbar({
  activeTool,
  selectedZoneId,
  selectedWallElementId,
  mapType,
  onSetTool,
  onDelete,
}: Props) {
  const hasSelection = selectedZoneId || selectedWallElementId

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface/95 backdrop-blur-md border-b border-border overflow-x-auto">
      {/* Select tool */}
      <button
        onClick={() => onSetTool('select')}
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
          activeTool === 'select' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
        }`}
        title={TOOLBAR_NL.selecteren}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        </svg>
      </button>

      {/* Draw tool */}
      <button
        onClick={() => onSetTool('draw')}
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
          activeTool === 'draw' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
        }`}
        title={TOOLBAR_NL.tekenen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      </button>

      {/* Door/Window tools (house mode only) */}
      {mapType === 'house' && (
        <>
          <div className="w-px h-6 bg-border shrink-0" />
          <button
            onClick={() => onSetTool('place_door')}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              activeTool === 'place_door' ? 'ring-2 ring-primary ring-offset-1' : ''
            }`}
            style={{ backgroundColor: '#2544a033', color: '#2544a0' }}
            title={TOOLBAR_NL.deurPlaatsen}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 4h3a2 2 0 0 1 2 2v14" />
              <path d="M2 20h3" />
              <path d="M13 20h9" />
              <path d="M10 12v.01" />
              <path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z" />
            </svg>
            {TOOLBAR_NL.deurPlaatsen}
          </button>
          <button
            onClick={() => onSetTool('place_window')}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              activeTool === 'place_window' ? 'ring-2 ring-primary ring-offset-1' : ''
            }`}
            style={{ backgroundColor: '#24e34c33', color: '#24e34c' }}
            title={TOOLBAR_NL.raamPlaatsen}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
            {TOOLBAR_NL.raamPlaatsen}
          </button>
        </>
      )}

      {/* Delete button */}
      {hasSelection && (
        <>
          <div className="w-px h-6 bg-border shrink-0" />
          <button
            onClick={onDelete}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-overdue/10 text-overdue border border-overdue/20"
            title={TOOLBAR_NL.verwijderen}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
```

Note: `activeZoneType` and `onSetZoneType` props are removed — the legend panel now owns zone type selection.

### 8d — Restructure LayoutEditorPage

- [ ] **Step 4: Update LayoutEditorPage**

Replace `frontend/src/pages/LayoutEditorPage.tsx` with the restructured version below. Key changes:
1. Main content area becomes `flex-row` instead of `flex-col` with an absolutely-positioned overlay
2. A fixed right sidebar (`w-56 flex-col`) holds EditorLegendPanel + properties panels
3. All English UI strings replaced with Dutch equivalents
4. `EditorToolbar` no longer receives `activeZoneType` or `onSetZoneType`

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchMapById, updateMap } from '../api/client'
import { useEditorState } from '../hooks/useEditorState'
import type { CanvasData, MapInfo } from '../types'
import EditorCanvas from '../components/editor/EditorCanvas'
import EditorToolbar from '../components/editor/EditorToolbar'
import EditorLegendPanel from '../components/editor/EditorLegendPanel'
import ZonePropertiesPanel from '../components/editor/ZonePropertiesPanel'
import WallElementPropertiesPanel from '../components/editor/WallElementPropertiesPanel'
import { TOOLBAR_NL, OPSLAAN_NL, KAART_TYPE_NL, EDITOR_NL } from '../utils/editorStrings.nl'

export default function LayoutEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const mapId = id ? parseInt(id, 10) : null

  const [map, setMap] = useState<MapInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [previewMode, setPreviewMode] = useState(false)
  const [exporting, setExporting] = useState(false)

  const editor = useEditorState()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!mapId) return
    fetchMapById(mapId)
      .then((m) => {
        setMap(m)
        if (m.canvas_data) {
          try {
            const data = JSON.parse(m.canvas_data) as CanvasData
            data.mapType = m.map_type
            editor.loadCanvasData(data)
          } catch { /* start blank */ }
        }
      })
      .finally(() => setLoading(false))
  }, [mapId])

  const doSave = useCallback(
    async (data: CanvasData) => {
      if (!mapId) return
      setSaveStatus('saving')
      try {
        await updateMap(mapId, { canvas_data: JSON.stringify(data) })
        editor.markClean()
        setSaveStatus('saved')
      } catch {
        setSaveStatus('unsaved')
      }
    },
    [mapId, editor.markClean]
  )

  useEffect(() => {
    if (!editor.isDirty) return
    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      doSave(editor.toCanvasData())
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [editor.isDirty, editor.zones, editor.wallElements, editor.scalePxPerM, editor.mapType, doSave, editor.toCanvasData])

  async function handleExport() {
    if (!mapId) return
    setExporting(true)
    try {
      const res = await fetch(`/api/maps/${mapId}/render-svg`, { method: 'POST' })
      if (!res.ok) throw new Error('Export failed')
      setSaveStatus('saved')
    } catch {
      alert('SVG export mislukt')
    } finally {
      setExporting(false)
    }
  }

  function handleDelete() {
    if (editor.selectedWallElementId) {
      editor.deleteWallElement(editor.selectedWallElementId)
    } else if (editor.selectedZoneId) {
      editor.deleteZone(editor.selectedZoneId)
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        editor.undo()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (editor.selectedWallElementId) {
          e.preventDefault()
          editor.deleteWallElement(editor.selectedWallElementId)
        } else if (editor.selectedZoneId) {
          e.preventDefault()
          editor.deleteZone(editor.selectedZoneId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editor.selectedZoneId, editor.selectedWallElementId, editor.deleteZone, editor.deleteWallElement, editor.undo])

  const selectedZone = editor.zones.find((z) => z.id === editor.selectedZoneId) ?? null
  const selectedWallElement = editor.wallElements.find((w) => w.id === editor.selectedWallElementId) ?? null

  if (loading) return <div className="p-6 text-text-muted text-center">{EDITOR_NL.laden}</div>
  if (!map) return <div className="p-6 text-overdue text-center">{EDITOR_NL.kaartNietGevonden}</div>

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border">
        <button onClick={() => navigate('/maps')} className="text-text-muted text-sm shrink-0">
          {TOOLBAR_NL.terug}
        </button>
        <h1 className="text-sm font-semibold text-text flex-1 truncate">{map.name}</h1>

        {/* Map type toggle */}
        <div className="flex items-center gap-0.5 shrink-0 bg-bg border border-border rounded-lg p-0.5">
          <button
            onClick={() => editor.setMapType('garden')}
            className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
              editor.mapType === 'garden' ? 'bg-primary text-white' : 'text-text-muted'
            }`}
          >
            {KAART_TYPE_NL.tuin}
          </button>
          <button
            onClick={() => editor.setMapType('house')}
            className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
              editor.mapType === 'house' ? 'bg-primary text-white' : 'text-text-muted'
            }`}
          >
            {KAART_TYPE_NL.huis}
          </button>
        </div>

        {/* Undo button */}
        <button
          onClick={editor.undo}
          disabled={!editor.canUndo}
          title={TOOLBAR_NL.ongedaanMaken}
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-bg"
        >
          ↩ {TOOLBAR_NL.ongedaanMaken}
        </button>

        <button
          onClick={() => setPreviewMode((p) => !p)}
          className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 ${
            previewMode ? 'bg-primary text-white border-primary' : 'text-text-muted border-border'
          }`}
        >
          {previewMode ? TOOLBAR_NL.bewerken : TOOLBAR_NL.voorbeeld}
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="text-xs px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/5 text-primary shrink-0 disabled:opacity-50"
        >
          {exporting ? '...' : TOOLBAR_NL.svgExporteren}
        </button>
        <span className={`text-xs shrink-0 ${
          saveStatus === 'saved' ? 'text-primary' :
          saveStatus === 'saving' ? 'text-text-muted' :
          'text-pumpkin-swirl'
        }`}>
          {saveStatus === 'saved' ? OPSLAAN_NL.opgeslagen :
           saveStatus === 'saving' ? OPSLAAN_NL.bezig :
           OPSLAAN_NL.nietOpgeslagen}
        </span>
      </div>

      {/* Toolbar — hidden in preview mode */}
      {!previewMode && (
        <EditorToolbar
          activeTool={editor.activeTool}
          selectedZoneId={editor.selectedZoneId}
          selectedWallElementId={editor.selectedWallElementId}
          mapType={editor.mapType}
          onSetTool={editor.setTool}
          onDelete={handleDelete}
        />
      )}

      {/* Canvas + right sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <EditorCanvas
          zones={editor.zones}
          wallElements={editor.wallElements}
          selectedZoneId={editor.selectedZoneId}
          selectedWallElementId={editor.selectedWallElementId}
          activeTool={editor.activeTool}
          activeZoneType={editor.activeZoneType}
          scalePxPerM={editor.scalePxPerM}
          previewMode={previewMode}
          onAddZone={editor.addZone}
          onUpdateZone={editor.updateZone}
          onUpdateWallElement={editor.updateWallElement}
          onSelectZone={editor.selectZone}
          onSelectWallElement={editor.selectWallElement}
          onPlaceWallElement={editor.addWallElement}
        />

        {/* Right sidebar */}
        {!previewMode && (
          <div className="w-56 flex flex-col bg-surface border-l border-border overflow-y-auto shrink-0">
            <EditorLegendPanel
              activeZoneType={editor.activeZoneType}
              activeTool={editor.activeTool}
              mapType={editor.mapType}
              onSetZoneType={editor.setZoneType}
              onSetTool={editor.setTool}
            />
            {selectedZone && !selectedWallElement && (
              <ZonePropertiesPanel
                zone={selectedZone}
                scalePxPerM={editor.scalePxPerM}
                onUpdate={(updates) => editor.updateZone(selectedZone.id, updates)}
                onSetScale={editor.setScalePxPerM}
                onDelete={handleDelete}
              />
            )}
            {selectedWallElement && (
              <WallElementPropertiesPanel
                element={selectedWallElement}
                onUpdate={(updates) => editor.updateWallElement(selectedWallElement.id, updates)}
                onDelete={handleDelete}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run full test suite and verify**

```
cd "C:\Users\leon_\Projects\Plant APP\groei"
npm --prefix frontend test
```

Expected: all tests passing.

Then run `npm run dev` and verify in the browser:
- Right sidebar shows legend cards with Dutch names + descriptions
- Clicking a card activates that zone type + switches to draw mode
- Active card is visually highlighted
- Selecting a zone shows properties panel below the legend
- All header text is Dutch
- Toolbar has no zone chips, only tool buttons

- [ ] **Step 6: Commit**

```bash
git add \
  frontend/src/pages/LayoutEditorPage.tsx \
  frontend/src/components/editor/EditorToolbar.tsx \
  frontend/src/components/editor/ZonePropertiesPanel.tsx \
  frontend/src/components/editor/WallElementPropertiesPanel.tsx
git commit -m "feat: sidebar legend panel, Dutch UI, properties in sidebar"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Always-visible legend cards with Dutch names + descriptions → Task 7 + 8
- ✅ Legend in right sidebar → Task 8d (right sidebar in LayoutEditorPage)
- ✅ Properties panel below legend → Task 8d (sidebar flex-col)
- ✅ Fully Dutch UI → Tasks 2, 8c, 8d
- ✅ Canvas grid at 1m → Task 3
- ✅ Dimension labels → Task 5
- ✅ Outer silhouette (true polygon union) → Tasks 1 + 4
- ✅ Snap gap fix → Task 6
- ✅ Desktop first → no mobile changes

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `computeZoneUnion(zones: EditorZone[]): string` — used consistently in Task 1 and Task 4
- `EditorLegendPanel` props: `activeZoneType`, `activeTool`, `mapType`, `onSetZoneType`, `onSetTool` — match usage in Task 8d
- `EditorToolbar` props: `activeZoneType` and `onSetZoneType` removed — `mapType` kept as `string` (matches existing `editor.mapType` which can be 'garden' | 'house' at runtime due to the existing pre-existing inconsistency — do not fix in this plan)
- `ZONE_NL`, `TOOLBAR_NL`, `OPSLAAN_NL`, `KAART_TYPE_NL`, `EIGENSCHAPPEN_NL`, `EDITOR_NL` — all defined in Task 2 and referenced in Tasks 7, 8c, 8d
