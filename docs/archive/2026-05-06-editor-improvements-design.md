# Editor Improvements — Design Spec
**Date:** 2026-05-06  
**Status:** Approved

## Summary

Five improvements to the layout editor (`/maps/:id/edit-layout`):

1. Remove duplicate room dimension text
2. Move gebouw (structure) label above the outer wall
3. Unify Tuin/Huis toggle + door/window placement into a redesigned right sidebar legenda
4. Gebouw acts as a container — dragging it moves all rooms and wall elements inside it
5. Strip the topbar to only essential controls

---

## 1. Remove duplicate dimension text

**Problem:** `EditorCanvas.tsx:444–464` renders `{wM}m × {hM}m` for *every* zone, including rooms. `RoomWallRenderer.tsx:424–469` already renders richer text (label + dimensions + area) inside rooms. This causes duplicate overlapping text on room zones.

**Fix:** Remove the generic dimension-label block from `EditorCanvas.tsx` entirely. Room text is fully handled by `RoomWallRenderer`. Structure (gebouw) text is handled by the new label-above-wall approach (see §2).

No change to `RoomWallRenderer` — its label + `L × W m` + `m²` rendering stays as-is.

---

## 2. Gebouw label above the outer wall

**Problem:** Structures don't have interior text (the `{!isStructure}` guard in `RoomWallRenderer`). After §1, structures would show no text at all. Previously, the EditorCanvas dimension text appeared at the structure center — directly under any rooms placed inside.

**New behaviour:** Render the structure's name and dimensions as a text element *above* the structure's top outer wall edge, outside the structure bounds. This never overlaps rooms.

**Implementation:** In `RoomWallRenderer`, when `isStructure`:
- Render a `<text>` at `x = zone.x + zone.width/2`, `y = zone.y - 6` (6px above the top edge).
- Content: `{zone.label || 'Gebouw'} · {widthM} × {heightM} m`
- Style: `fill="#d4b896"`, `fontSize=9.5`, `fontWeight=600`, `textAnchor="middle"`, `dominantBaseline="auto"`.
- Only render when zone is wide enough (`zone.width > 40`).

---

## 3. Unified legenda — right sidebar redesign

**Problem:** Three UI controls currently live in three different places:
- Tuin/Huis toggle → `LayoutEditorPage.tsx` header (lines 133–155)
- Zone type selector → `EditorLegendPanel.tsx` right sidebar
- Deur/Raam plaatsen → `EditorToolbar.tsx` (lines 54–85)

**New layout:**

`EditorLegendPanel.tsx` becomes the single right-sidebar panel with three sections, separated by dividers:

| Section | Content |
|---------|---------|
| **Modus** | Tuin / Huis toggle buttons (moved from header) |
| **Zones tekenen** | Colour chip + label per zone type, click to activate draw tool (existing behaviour) |
| **Plaatsen** | 🚪 Deur plaatsen + 🪟 Raam plaatsen buttons (moved from toolbar, only visible in Huis mode) |

**Topbar (`LayoutEditorPage.tsx`):** Remove the Tuin/Huis buttons. Keep: map name, undo button, preview toggle, save status. This declutters the header.

**`EditorToolbar.tsx`:** Remove only the door/window placement buttons (lines 51–87). Keep the Select, Draw, and Delete buttons — the toolbar stays. The door/window divider (`<div className="w-px h-6 bg-border" />`) before them is also removed.

Props added to `EditorLegendPanel`:
- `mapType: MapType`
- `onSetMapType: (type: MapType) => void`
- `activeTool: EditorTool`
- `onSetTool: (tool: EditorTool) => void`

These props are already available at the `LayoutEditorPage` level and can be threaded through.

---

## 4. Gebouw as container — group move

**Problem:** Dragging a structure (gebouw) only moves that zone. Rooms and wall elements placed inside remain in their original positions, breaking the layout.

**Definition of "inside":** A zone is considered inside a structure if its bounding box is fully contained within the structure's bounding box at the time the drag begins:
```
child.x >= struct.x &&
child.y >= struct.y &&
child.x + child.width  <= struct.x + struct.width &&
child.y + child.height <= struct.y + struct.height
```

**Implementation in `EditorCanvas.tsx`:**

When a drag begins on a structure zone (type `'structure'`):
1. Compute the set of "children": all zones whose bounding box is fully within the structure's bounding box (`isContainedIn(child, structure)`).
2. Collect all `wallElements` whose `zoneId` is one of those child zone IDs.
3. Store children and their original positions in `DragState` alongside the structure's original position.

During drag (`onPointerMove`):
- Apply the same `(dx, dy)` delta to the structure and all children simultaneously via `onUpdateZone`.
- Wall elements move implicitly because they are positioned relative to their zone (edge + 0–1 position), so no wall element updates are needed.

On drag end: no extra work — all positions are already updated.

**`DragState` extension:**
```ts
interface DragState {
  zoneId: string
  startSvgX: number
  startSvgY: number
  origX: number
  origY: number
  // New:
  children: Array<{ zoneId: string; origX: number; origY: number }>
}
```

**Edge case:** If a child zone is also a structure, its own children are *not* recursively moved (one level only, unless the inner structure is also in the `children` set because it is contained within the outer structure — in that case it is already included).

---

## 5. Topbar cleanup

Remove from `LayoutEditorPage.tsx` header:
- Tuin/Huis toggle buttons (moved to sidebar)

Keep:
- Map name
- Undo button
- Preview toggle
- Save status indicator

---

## Files affected

| File | Change |
|------|--------|
| `EditorCanvas.tsx` | Remove dimension label block (§1); extend DragState + group-move logic (§4) |
| `RoomWallRenderer.tsx` | Add structure label above top wall (§2) |
| `EditorLegendPanel.tsx` | Add Modus section + Plaatsen section; accept new props (§3) |
| `EditorToolbar.tsx` | Remove door/window placement buttons only; keep Select/Draw/Delete (§3) |
| `LayoutEditorPage.tsx` | Remove Tuin/Huis buttons from header; pass new props to EditorLegendPanel; remove EditorToolbar if eliminated (§3, §5) |

---

## Out of scope

- Recursive multi-level container nesting beyond one level
- Snap behaviour for group-moved rooms (snapping only applies to the dragged structure)
- Any changes to RoomWallRenderer interior room text rendering
