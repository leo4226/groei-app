# Editor Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix duplicate room dimension text, show gebouw label above its outer wall, consolidate Tuin/Huis + Deur/Raam into the right sidebar legenda, and make gebouw drag move all rooms/windows inside it.

**Architecture:** Five independent edits across four files. No new files needed. No new state or API changes. TypeScript build is the verification step throughout.

**Tech Stack:** React 19, TypeScript, SVG rendering, Vite (`npm run build` from `frontend/`)

---

## File map

| File | Change |
|------|--------|
| `frontend/src/components/editor/EditorCanvas.tsx` | Task 1 — remove duplicate dimension labels; Task 4 — extend DragState + group-move logic |
| `frontend/src/components/editor/RoomWallRenderer.tsx` | Task 2 — add structure label above top wall |
| `frontend/src/components/editor/EditorLegendPanel.tsx` | Task 3a — add Modus + Plaatsen sections, new props |
| `frontend/src/components/editor/EditorToolbar.tsx` | Task 3b — remove door/window placement buttons |
| `frontend/src/pages/LayoutEditorPage.tsx` | Task 3c — remove Tuin/Huis from header, wire new legend props |

All paths are relative to `Plant APP/groei/`.

---

## Task 1: Remove duplicate dimension text from EditorCanvas

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx:444-464`

`EditorCanvas` renders `{wM}m × {hM}m` for every zone. `RoomWallRenderer` already renders richer text (label + dimensions + area) for rooms. Structures will get their own label in Task 2. The EditorCanvas block is pure duplication for rooms and will be replaced by nothing useful for structures once Task 2 is done.

- [ ] **Step 1: Delete the dimension labels block**

In `EditorCanvas.tsx`, find and remove the entire block (lines 444–464):

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

The lines before this block end with `/>` (closing the last `EditorZoneShape`). The lines after start with `{/* Resize overlay on selected zone */}`. Remove exactly this block and nothing else.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "Plant APP/groei/frontend"
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd "Plant APP/groei"
git add frontend/src/components/editor/EditorCanvas.tsx
git commit -m "fix: remove duplicate dimension text from EditorCanvas"
```

---

## Task 2: Gebouw label above outer wall

**Files:**
- Modify: `frontend/src/components/editor/RoomWallRenderer.tsx`

Structures currently show no text at all (the `{!isStructure && ...}` guard prevents it). Add a label rendered **above** the structure's top outer wall edge, in the canvas space outside the structure.

- [ ] **Step 1: Locate the insertion point**

In `RoomWallRenderer.tsx`, find the block that starts:

```tsx
      {/* Room label + dimensions + area — fits dynamically inside the interior */}
      {!isStructure && (
```

Add the new structure label block **immediately before** this existing block.

- [ ] **Step 2: Add the structure label**

Insert this block before the `{!isStructure && (` line:

```tsx
      {/* Structure label above the top outer wall */}
      {isStructure && w > 40 && (
        <text
          x={x + w / 2}
          y={y - 6}
          textAnchor="middle"
          dominantBaseline="auto"
          fill="#d4b896"
          fontSize={9.5}
          fontWeight={600}
          fontFamily="sans-serif"
          pointerEvents="none"
        >
          {zone.label ? `${zone.label} · ${widthM} × ${heightM} m` : `${widthM} × ${heightM} m`}
        </text>
      )}
```

`widthM` and `heightM` are already computed earlier in the component (lines ~287–288). `zone.label` is a string (may be empty/undefined). `x`, `y`, `w` are destructured from `zone` at the top of the component.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "Plant APP/groei/frontend"
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd "Plant APP/groei"
git add frontend/src/components/editor/RoomWallRenderer.tsx
git commit -m "feat: show gebouw label above outer wall"
```

---

## Task 3a: Unified legenda — EditorLegendPanel

**Files:**
- Modify: `frontend/src/components/editor/EditorLegendPanel.tsx`

Add two new sections: **Modus** (Tuin/Huis toggle) at the top, and **Plaatsen** (Deur/Raam) at the bottom. The Plaatsen section is only visible in house mode.

- [ ] **Step 1: Update the Props interface and imports**

Replace the entire file content with:

```tsx
import type { ZoneStyleType, MapType } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import { ZONE_STYLES, GARDEN_ZONE_TYPES, HOUSE_ZONE_TYPES } from './EditorDefs'
import { ZONE_NL, KAART_TYPE_NL, TOOLBAR_NL } from '../../utils/editorStrings.nl'

interface Props {
  activeZoneType: ZoneStyleType
  activeTool: EditorTool
  mapType: MapType
  onSetZoneType: (type: ZoneStyleType) => void
  onSetTool: (tool: EditorTool) => void
  onSetMapType: (type: MapType) => void
}

export default function EditorLegendPanel({
  activeZoneType,
  activeTool,
  mapType,
  onSetZoneType,
  onSetTool,
  onSetMapType,
}: Props) {
  const zoneTypes = mapType === 'house' ? HOUSE_ZONE_TYPES : GARDEN_ZONE_TYPES

  return (
    <div className="p-3 border-b border-border flex flex-col gap-3">

      {/* ── Modus ── */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Modus
        </p>
        <div className="flex gap-1">
          <button
            onClick={() => onSetMapType('garden')}
            className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
              mapType === 'garden'
                ? 'bg-primary text-white'
                : 'bg-bg text-text-muted border border-border hover:bg-bg/80'
            }`}
          >
            {KAART_TYPE_NL.tuin}
          </button>
          <button
            onClick={() => onSetMapType('house')}
            className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
              mapType === 'house'
                ? 'bg-primary text-white'
                : 'bg-bg text-text-muted border border-border hover:bg-bg/80'
            }`}
          >
            {KAART_TYPE_NL.huis}
          </button>
        </div>
      </div>

      {/* ── Zones tekenen ── */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Zones tekenen
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

      {/* ── Plaatsen (house mode only) ── */}
      {mapType === 'house' && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Plaatsen
          </p>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onSetTool('place_door')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${
                activeTool === 'place_door' ? 'ring-2 ring-primary ring-offset-1' : ''
              }`}
              style={{ backgroundColor: '#2544a033', color: '#2544a0' }}
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
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${
                activeTool === 'place_window' ? 'ring-2 ring-primary ring-offset-1' : ''
              }`}
              style={{ backgroundColor: '#24e34c33', color: '#24e34c' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="4" x2="12" y2="20" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
              {TOOLBAR_NL.raamPlaatsen}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "Plant APP/groei/frontend"
npm run build
```

Expected: build fails with an error about the missing `onSetMapType` prop in `LayoutEditorPage.tsx`. That's fine — it will be fixed in Task 3c.

- [ ] **Step 3: Commit**

```bash
cd "Plant APP/groei"
git add frontend/src/components/editor/EditorLegendPanel.tsx
git commit -m "feat: add Modus and Plaatsen sections to EditorLegendPanel"
```

---

## Task 3b: Remove door/window buttons from EditorToolbar

**Files:**
- Modify: `frontend/src/components/editor/EditorToolbar.tsx`

Remove lines 50–87 (the house-mode door/window section). Keep Select, Draw, and Delete buttons.

- [ ] **Step 1: Remove the door/window section**

In `EditorToolbar.tsx`, delete this entire block (including the leading divider):

```tsx
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
```

After deletion, the `Props` interface still has `mapType` referenced — remove it from the interface and the destructuring too since it's no longer used:

Remove from `interface Props`:
```tsx
  mapType: MapType
```

Remove from the function parameters:
```tsx
  mapType,
```

Remove the import of `MapType`:
```tsx
import type { MapType } from '../../types'
```

Also remove `TOOLBAR_NL.deurPlaatsen` and `TOOLBAR_NL.raamPlaatsen` usage is gone, but `TOOLBAR_NL` is still used for other strings so keep that import.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "Plant APP/groei/frontend"
npm run build
```

Expected: build still fails — two errors remain: (1) missing `onSetMapType` prop on `<EditorLegendPanel>` and (2) unknown `mapType` prop on `<EditorToolbar>`. Both are fixed in Task 3c.

- [ ] **Step 3: Commit**

```bash
cd "Plant APP/groei"
git add frontend/src/components/editor/EditorToolbar.tsx
git commit -m "refactor: remove door/window placement buttons from EditorToolbar"
```

---

## Task 3c: Wire up new legend props in LayoutEditorPage

**Files:**
- Modify: `frontend/src/pages/LayoutEditorPage.tsx`

Remove the Tuin/Huis toggle from the header and pass the two new props to `EditorLegendPanel`.

- [ ] **Step 1: Remove mapType from EditorToolbar call**

In `LayoutEditorPage.tsx`, find the `<EditorToolbar` JSX block and remove the `mapType` prop line:

```tsx
          mapType={editor.mapType}
```

The `EditorToolbar` call should now look like:

```tsx
        <EditorToolbar
          activeTool={editor.activeTool}
          selectedZoneId={editor.selectedZoneId}
          selectedWallElementId={editor.selectedWallElementId}
          onSetTool={editor.setTool}
          onDelete={handleDelete}
        />
```

- [ ] **Step 2: Remove the Tuin/Huis toggle from the header**

Find and delete this block from the header (lines 133–155):

```tsx
        {/* Map type toggle */}
        <div className="flex items-center gap-0.5 shrink-0 bg-bg border border-border rounded-lg p-0.5">
          <button
            onClick={() => editor.setMapType('garden')}
            className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
              editor.mapType === 'garden'
                ? 'bg-primary text-white'
                : 'text-text-muted'
            }`}
          >
            {KAART_TYPE_NL.tuin}
          </button>
          <button
            onClick={() => editor.setMapType('house')}
            className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
              editor.mapType === 'house'
                ? 'bg-primary text-white'
                : 'text-text-muted'
            }`}
          >
            {KAART_TYPE_NL.huis}
          </button>
        </div>
```

- [ ] **Step 3: Add onSetMapType prop to EditorLegendPanel**

Find the `<EditorLegendPanel` JSX and add the new prop:

```tsx
            <EditorLegendPanel
              activeZoneType={editor.activeZoneType}
              activeTool={editor.activeTool}
              mapType={editor.mapType}
              onSetZoneType={editor.setZoneType}
              onSetTool={editor.setTool}
              onSetMapType={editor.setMapType}
            />
```

- [ ] **Step 4: Remove unused KAART_TYPE_NL import**

Find the import line at the top of the file:

```tsx
import { TOOLBAR_NL, OPSLAAN_NL, KAART_TYPE_NL, EDITOR_NL } from '../utils/editorStrings.nl'
```

Remove `KAART_TYPE_NL,` from it:

```tsx
import { TOOLBAR_NL, OPSLAAN_NL, EDITOR_NL } from '../utils/editorStrings.nl'
```

- [ ] **Step 5: Verify TypeScript compiles clean**

```bash
cd "Plant APP/groei/frontend"
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd "Plant APP/groei"
git add frontend/src/pages/LayoutEditorPage.tsx
git commit -m "feat: move Tuin/Huis toggle to legenda sidebar"
```

---

## Task 4: Gebouw group-move — drag moves all contained rooms and wall elements

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`

When dragging a structure zone, compute all zones whose bounding box is fully inside the structure. Store them in `DragState`. During drag, apply the same `(dx, dy)` delta to each child. Wall elements don't need updating — they use a 0–1 position along their zone's edge, so they follow their zone automatically.

- [ ] **Step 1: Extend the DragState interface**

In `EditorCanvas.tsx`, find the `DragState` interface (around line 164):

```tsx
interface DragState {
  zoneId: string; startSvgX: number; startSvgY: number; origX: number; origY: number
}
```

Replace it with:

```tsx
interface DragState {
  zoneId: string
  startSvgX: number
  startSvgY: number
  origX: number
  origY: number
  children: Array<{ zoneId: string; origX: number; origY: number }>
}
```

- [ ] **Step 2: Compute children on drag start**

In `handleZonePointerDown`, find the line that calls `setDragging`:

```tsx
        setDragging({ zoneId, startSvgX: pt.x, startSvgY: pt.y, origX: zone.x, origY: zone.y })
```

Replace it with:

```tsx
        const children: DragState['children'] =
          zone.type === 'structure'
            ? zones
                .filter(
                  (z) =>
                    z.id !== zoneId &&
                    z.x >= zone.x &&
                    z.y >= zone.y &&
                    z.x + z.width <= zone.x + zone.width &&
                    z.y + z.height <= zone.y + zone.height,
                )
                .map((z) => ({ zoneId: z.id, origX: z.x, origY: z.y }))
            : []
        setDragging({ zoneId, startSvgX: pt.x, startSvgY: pt.y, origX: zone.x, origY: zone.y, children })
```

- [ ] **Step 3: Move children during drag**

In `handlePointerMove`, find the `if (dragging)` block. Currently it ends with:

```tsx
        onUpdateZone(dragging.zoneId, { x: Math.round(x), y: Math.round(y) })
```

Add the children update immediately after that line (still inside the `if (zone)` block):

```tsx
        onUpdateZone(dragging.zoneId, { x: Math.round(x), y: Math.round(y) })
        for (const child of dragging.children) {
          const childRawX = Math.max(0, Math.min(CANVAS_W - (zones.find((z) => z.id === child.zoneId)?.width ?? 0), child.origX + dx))
          const childRawY = Math.max(0, Math.min(CANVAS_H - (zones.find((z) => z.id === child.zoneId)?.height ?? 0), child.origY + dy))
          onUpdateZone(child.zoneId, { x: Math.round(childRawX), y: Math.round(childRawY) })
        }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "Plant APP/groei/frontend"
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Manual smoke test**

Start the dev server:
```bash
cd "Plant APP/groei"
npm run dev
```

Open `http://localhost:5173` in a browser. Navigate to a map in edit mode. In house mode:
1. Draw a Gebouw (structure).
2. Draw two Kamer (room) zones inside it.
3. Place a Deur on one of the rooms from the sidebar.
4. Switch to select tool. Click and drag the Gebouw.
5. Verify: both rooms and the door move with the structure.
6. Verify: rooms drawn outside the structure do NOT move.

- [ ] **Step 6: Commit**

```bash
cd "Plant APP/groei"
git add frontend/src/components/editor/EditorCanvas.tsx
git commit -m "feat: gebouw drag moves all contained rooms and wall elements"
```
