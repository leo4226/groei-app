# PLAN: Map Builder — Rooms, Walls, Doors & Windows

## Context

The map builder currently supports tile-based surface types (Deck, Soil, Gravel, Lawn, Wall, Path, Room, Water, Structure). This plan upgrades the builder so it can accurately represent both **garden layouts** and **indoor floor plans**, with proper architectural semantics for rooms, walls, doors and windows.

---

## Scope of Changes

### 1. Room placement auto-generates surrounding walls

**Problem:** Placing a Room tile today gives a bare coloured rectangle with no walls. Rooms without walls are architecturally meaningless and visually confusing.

**Solution:** When a Room element is placed or resized, automatically render a wall border around it.

#### Two wall thickness presets (kept simple for a plant/garden app):

| Wall type | Thickness | Use case |
|-----------|-----------|----------|
| **Exterior wall** | 30 cm (≈ 2 grid cells at 15 cm/cell) | Outer shell of the house footprint |
| **Interior wall** | 15 cm (≈ 1 grid cell) | Dividers between rooms |

The system should **auto-detect** which to use:
- If a Room is placed directly on the canvas background → exterior wall thickness
- If a Room is placed inside an existing Structure/House outline → interior wall thickness

For simplicity we can also expose a toggle in the room properties panel: **Buitenmuur / Binnenmuur**.

#### Implementation notes:
- Store `wallThickness: 'exterior' | 'interior'` on the Room element
- Render wall as a filled border rect (SVG `stroke` or inner rect diff) so the wall is part of the room's own element, not a separate tile
- Wall colour: `#8B7355` (warm grey-brown, matching architectural drawings)
- Room interior fill: light warm white `#F5F0E8`

---

### 2. House Structure ("schil") as a first-class element

**Problem:** There is no way to draw the outer house footprint first and then fill it with rooms. Users have to build room-by-room with no guiding shell.

**Solution:** Introduce a **Structure (Huis)** element that acts as a non-filled outline — the "schil" or house shell.

- Rendered as a thick exterior-wall rectangle with no fill (or very faint fill `rgba(0,0,0,0.03)`)
- Snaps to the grid like all other elements
- When rooms are placed *inside* a Structure, they inherit interior wall thickness automatically
- Dimensions shown live while drawing (e.g. "4.5 × 6.0 m")

This mirrors exactly how the architectural drawings in `Architectentekening_Aanbouw15.pdf` are structured: outer perimeter first, rooms inside.

---

### 3. Door element — placeable on a wall

**New element type: `door`**

A door is not a tile — it is a **wall-segment modifier**. It is placed on an edge of a Room or Wall element.

#### Visual representation (top-down floor plan convention):

```
  ┌──────────────────┐
  │                  │
  │    Room          │
  │                  │
  └──────┐     ╰─────┘
         └── gap in wall (door opening)
             + arc showing swing direction
```

- Door opening width: default **90 cm** (configurable: 80 / 90 / 100 cm)
- Swing arc: quarter-circle arc indicating which way it opens (toggle: inward/outward, left/right)
- Rendered in SVG as: a gap in the wall line + a `<path>` arc

#### Placement UX:
1. Select the Door tool from the toolbar
2. Hover over a wall edge — the nearest wall segment highlights
3. Click to snap the door centre to that position
4. A small handle appears to flip swing direction (4 options: 2 sides × 2 directions)

#### Data model:
```typescript
interface DoorElement {
  type: 'door'
  id: string
  wallId: string           // which Room/Wall element it belongs to
  edge: 'top' | 'right' | 'bottom' | 'left'
  positionAlongEdge: number // 0–1, fraction along that wall edge
  widthCm: number          // default 90
  swingSide: 'left' | 'right'
  swingDirection: 'inward' | 'outward'
}
```

---

### 4. Window element — placeable on a wall

**New element type: `window`**

Like a door, a window is a **wall-segment modifier**.

#### Visual representation (top-down floor plan convention):

```
  ══════════════  ← wall with window shown as double line / gap with lines
```

- Three parallel lines spanning the opening width (standard floor plan symbol)
- Default width: **120 cm** (configurable: 60 / 90 / 120 / 150 / 180 cm)
- No swing arc needed

#### Placement UX:
Same as door — select Window tool, hover wall edge, click to place.

#### Data model:
```typescript
interface WindowElement {
  type: 'window'
  id: string
  wallId: string
  edge: 'top' | 'right' | 'bottom' | 'left'
  positionAlongEdge: number  // 0–1
  widthCm: number            // default 120
}
```

---

## Additional Proposed Improvements

### A. Toolbar reorganisation: Indoor vs Outdoor modes

The current flat toolbar mixes indoor and outdoor tiles. Propose splitting into two contextual groups, switchable by the map's `type`:

| Garden map | House map |
|------------|-----------|
| Deck, Soil, Gravel, Lawn, Path, Water | Room, Wall, Door, Window, Structure |
| Structure (shed, greenhouse) | |

The map already has a name ("House" visible in the screenshot header) — use `map.type: 'garden' | 'house'` to show the right toolbar set. Both can still be accessible via an "advanced" toggle if needed.

### B. Room label

Each Room should display its **name** and optionally its **area** (auto-calculated from grid cells × m²/cell) inside the room fill. Editable on double-click.

Example: `Woonkamer · 28 m²`

This makes the indoor map directly useful for cross-referencing with the architectural drawings.

### C. Snap-to-room-edge for doors/windows

When placing a door or window, snap its centre point to even 15 cm increments along the wall edge, and show a tooltip with the distance from the nearest corner. This matches how doors are specified in architectural drawings (e.g. "150 mm from corner").

### D. Scale indicator

Add a small scale bar to the canvas (e.g. `|————| 2 m`) anchored to bottom-left. This is especially useful when comparing the drawn layout against the architectural PDF.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/types/mapElements.ts` | Add `DoorElement`, `WindowElement` types; extend `RoomElement` with `wallThickness`, `label` |
| `src/components/map/elements/RoomElement.tsx` | Render wall border, interior fill, optional label |
| `src/components/map/elements/DoorElement.tsx` | New component: gap + swing arc SVG |
| `src/components/map/elements/WindowElement.tsx` | New component: three-line window symbol SVG |
| `src/components/map/elements/StructureElement.tsx` | New component: house shell outline |
| `src/components/map/Toolbar.tsx` | Add Door, Window tools; group by map type |
| `src/components/map/MapCanvas.tsx` | Render doors/windows as overlays on room walls; handle door/window placement interaction |
| `src/components/map/PropertiesPanel.tsx` | Add wall thickness toggle, door width, window width, room label |
| `src/hooks/useMapBuilder.ts` | Add placement state machine for door/window (hover-wall → click-to-place) |
| `src/constants/mapDefaults.ts` | Add `WALL_THICKNESS_EXTERIOR_CM`, `WALL_THICKNESS_INTERIOR_CM`, default door/window sizes |

---

## Visual Reference (from architectural drawings)

From `Architectentekening_Aanbouw15.pdf` (Hoofdweg 358):
- Outer house footprint: **6.0 m wide × 11.5 m deep**
- Extension ("uitbouw"): **6.0 m wide × 2.5 m deep** (the glass-roof extension visible in photos)
- Woonkamer: 35 m², Slaapkamer: 18.2 m², Badkamer: 3.3 m², Hal: 4.9 m²
- Doors shown with standard quarter-arc swing symbol
- Windows shown as triple-line wall breaks

These dimensions should be usable as a "starter template" when creating a new House map.

---

## Not in scope (deferred)

- Diagonal walls
- Multi-storey (floor selector)
- Stairs element
- Wall material textures
- Electrical/plumbing symbols

---

## Session Starter Prompt

```
I'm working on a garden/house map builder app (React + TypeScript). 
The map canvas currently supports tile-based elements: Deck, Soil, Gravel, Lawn, 
Wall, Path, Room, Water, Structure.

Please implement the following from PLAN-map-builder-rooms-walls-doors-windows.md:

1. **Room auto-wall**: When a Room element is placed, render a wall border around it.
   Add `wallThickness: 'exterior' | 'interior'` to RoomElement. Exterior = 30cm (2 grid 
   units), Interior = 15cm (1 grid unit). Toggle in properties panel labelled 
   "Buitenmuur / Binnenmuur". Room interior fill: #F5F0E8, wall fill: #8B7355.

2. **Structure (Huis schil)**: A new element type that renders as an exterior-wall-thick 
   outline rectangle with near-transparent fill. Used as the house footprint shell. 
   Rooms placed inside it default to interior wall thickness.

3. **Door element**: Wall-segment modifier. Data model: { type: 'door', wallId, edge, 
   positionAlongEdge, widthCm: 90, swingSide, swingDirection }. Renders as a gap in 
   the wall + quarter-circle swing arc. Placement: select Door tool → hover wall edge 
   (highlight it) → click to snap. Handle to flip swing direction.

4. **Window element**: Wall-segment modifier. Data model: { type: 'window', wallId, 
   edge, positionAlongEdge, widthCm: 120 }. Renders as three parallel lines spanning 
   the opening. Same placement UX as door.

5. **Room label**: Each Room shows its name (editable on double-click) and auto-calculated 
   area in m² (e.g. "Woonkamer · 28 m²") centred in the room fill.

6. **Toolbar grouping**: When map.type === 'house', show: Room, Wall, Door, Window, 
   Structure. When map.type === 'garden', show: Deck, Soil, Gravel, Lawn, Path, Water, 
   Structure.

Keep wall thickness constants in src/constants/mapDefaults.ts:
  WALL_THICKNESS_EXTERIOR_CM = 30
  WALL_THICKNESS_INTERIOR_CM = 15
  DEFAULT_DOOR_WIDTH_CM = 90
  DEFAULT_WINDOW_WIDTH_CM = 120
```
