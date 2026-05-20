# 🌱 Groei — Feature Plan: Map Resize & Inline Editing

**Goal:** Make objects and plants editable directly on the map — resize by dragging corners, edit names/properties inline — without needing to open a separate sheet.

---

## What We're Adding

Two new interaction modes on the map:

1. **Resize handles** — tap an object (pot, planter, raised bed), corner/edge handles appear. Drag them to change dimensions. Works like resizing a photo.
2. **Inline editing** — tap an object or plant label to edit its name directly on the map. Tap the shape itself to get a compact floating toolbar for quick property changes (material, color, shape type).

These complement the existing interactions (drag to move, tap for bottom sheet) rather than replacing them.

---

## Interaction Model

### Current (keep as-is)
| Gesture | Result |
|---|---|
| Tap item | Bottom sheet opens with full details |
| Long-press + drag | Reposition item on map |
| Drag from palette | Add new item |

### New
| Gesture | Result |
|---|---|
| Tap item | Item enters **selected state** — shows resize handles + edit toolbar |
| Tap elsewhere / tap ✕ | Deselect, back to normal |
| Drag corner handle | Resize the object (updates dimensions in cm) |
| Drag edge handle | Resize in one axis only (width OR depth) |
| Double-tap label | Inline text editing of the name |
| Toolbar button | Quick-change color, material, shape |
| Long-press + drag | Still repositions (unchanged) |

**Important UX decision:** Currently "tap" opens the bottom sheet. We need to change this so that:
- **Single tap** → selects the item (shows handles + toolbar)
- **Tap the "details" button on toolbar** → opens the full bottom sheet
- **Tap away** → deselects

This is a better flow because it means you can do quick edits (resize, rename) without the bottom sheet getting in the way, but still access full details when needed.

---

## Feature 1: Resize Handles

### How It Works

When an object is selected, render SVG handle elements at its corners and edges:

```
For a RECTANGULAR object (planter, raised bed):

    ○─────────────○        ○ = corner handle (drag diagonally)
    │             │        ─ = edge handle (drag one axis)
    ○             ○
    │             │
    ○─────────────○

For a CIRCULAR object (round pot):

         ○                 ○ = cardinal handles
    ○    ●    ○            Drag any handle to change radius
         ○

For a SQUARE object (square pot):

    ○────○────○            Same as rectangle but constrained
    │         │            to keep width === depth
    ○         ○
    │         │
    ○────○────○
```

### Handle Behavior

**Corner handles (rectangles):**
- Drag freely → changes both width and depth
- The opposite corner stays anchored
- Minimum size: 10cm × 10cm (prevent zero-size objects)
- Shift-drag (or toggle): constrain aspect ratio

**Edge handles (rectangles):**
- Drag horizontally → changes width only
- Drag vertically → changes depth only

**Cardinal handles (circles):**
- Drag outward/inward → changes diameter
- All four handles move symmetrically (center stays fixed)

**Square constraint:**
- Corner handles keep width === depth (always square)
- Drag amount = average of x and y delta

### Visual Design

```
Handle appearance:
- Small circles (r=5px, or ~6dp on mobile for touch targets)
- Hit area: invisible rect 20×20px around each handle (44dp minimum touch)
- Fill: white with 1px border matching object color
- On drag: handle fills with accent color
- Cursor: nwse-resize / nesw-resize / ew-resize / ns-resize

Selection indicator:
- Dashed border around selected object (1px, object color, dasharray 4 2)
- Slight scale-up pulse animation on selection (100ms, 1.02x)
```

### Dimension Feedback

While dragging a resize handle, show a live dimension label:

```
    ○─── 85 cm ───○
    │              │
  30 cm            │
    │              │
    ○──────────────○
```

- Labels appear on the edges being changed
- Format: `{value} cm` — rounded to nearest cm
- Small pill-shaped background (semi-transparent dark)
- Disappear after drag ends (with 1s fade)

### Implementation

**New components:**
```
components/map/
  SelectionOverlay.tsx      # Wraps selected item with handles
  ResizeHandle.tsx           # Individual draggable handle
  DimensionLabel.tsx         # Live size label during resize
```

**New hook:**
```
hooks/
  useResize.ts               # Resize logic, pointer events, constraints
```

**`SelectionOverlay.tsx`** renders as a sibling `<g>` element in the SVG, positioned on top of the selected object. It reads the object's current shape/dimensions and renders the appropriate handles.

**`useResize.ts`** handles:
1. `onPointerDown` on a handle → capture pointer, record start position + start dimensions
2. `onPointerMove` → calculate delta in SVG coordinates, apply constraints (min size, shape type), update local state
3. `onPointerUp` → release pointer, fire `onResizeEnd(newWidth, newDepth)` which PUTs to the API
4. During drag: local state drives the SVG rendering (optimistic), API call on release

**SVG coordinate math:**
```typescript
// Convert screen pixel delta to SVG units using the map's scale
const svgPoint = svgRef.current.createSVGPoint();
svgPoint.x = event.clientX;
svgPoint.y = event.clientY;
const ctm = svgRef.current.getScreenCTM().inverse();
const svgCoords = svgPoint.matrixTransform(ctm);

// Convert SVG px delta to real-world cm
const deltaCm = deltaSvgPx / SCALE_PX_PER_M * 100;
```

**API:**
```
PUT /api/objects/{id}/dimensions
Body: { width_cm: number, depth_cm?: number, diameter_cm?: number }
```

This is a separate endpoint from position updates to keep concerns clean. The response returns the updated object so the map can reconcile.

---

## Feature 2: Inline Editing

### Toolbar

When an item is selected, a compact floating toolbar appears above it:

```
For objects:
┌──────────────────────────────────┐
│  🎨  ▫️  📐  📝  ⓘ  ✕           │
│ color shape rotate notes details close│
└──────────────────────────────────┘

For plants:
┌──────────────────────────────────┐
│  💧  🏷️  📝  ⓘ  ✕              │
│ water type notes details close   │
└──────────────────────────────────┘
```

**Toolbar behavior:**
- Floats above the selected item (positioned in screen space, not SVG space)
- Auto-repositions if near viewport edge (flip below if too close to top)
- Compact: icon buttons only, with tooltips on long-press
- Semi-transparent background with backdrop-blur

**Toolbar actions (objects):**
| Button | Action |
|---|---|
| 🎨 Color | Opens a small inline color picker (6-8 preset swatches) |
| ▫️ Shape | Cycles through: circle → square → rectangle |
| 📐 Rotate | +90° rotation per tap (or opens a rotation slider) |
| 📝 Notes | Opens a small text input overlay |
| ⓘ Details | Opens the full bottom sheet |
| ✕ Close | Deselects the item |

**Toolbar actions (plants):**
| Button | Action |
|---|---|
| 💧 Water | Quick "water now" action |
| 🏷️ Type | Cycles through plant types (changes color) |
| 📝 Notes | Small text input overlay |
| ⓘ Details | Opens the full bottom sheet |
| ✕ Close | Deselects |

### Inline Name Editing

Double-tap the label text on any item → label becomes an editable text input:

```
Before:  Camellia japonica
After:   [Camellia japonica|]     ← cursor, editable, with a small underline
```

**Implementation:**
- Replace the SVG `<text>` element with a positioned HTML `<input>` overlaid on the SVG
- Use `foreignObject` or an absolutely positioned input above the SVG
- Auto-size the input to fit the text
- On blur or Enter → save via `PUT /api/plants/{id}` or `PUT /api/objects/{id}`
- Escape → cancel, revert to original text

**Why HTML input over SVG text editing?**
SVG doesn't have native text editing. `foreignObject` works but has mobile quirks. The cleanest approach is an absolutely positioned `<input>` element in a React portal, positioned using `getBoundingClientRect()` of the SVG text element. This gives us native keyboard behavior, autocorrect, etc.

### Quick Color Picker

When the color button is tapped:

```
┌─────────────────┐
│ ● ● ● ● ● ● ●  │   ← preset swatches
│ ●               │
└─────────────────┘
```

- 8-12 preset colors relevant to the item type
- For objects: terracotta, gray stone, wood brown, corten, black, white, green
- For plants: the plant type colors from the palette
- Tap a swatch → instant color change (optimistic update)
- Small popover anchored to the toolbar

**New components:**
```
components/map/
  MapToolbar.tsx             # Floating toolbar above selected item
  InlineNameEditor.tsx       # Positioned <input> for name editing
  QuickColorPicker.tsx       # Small swatch popover
```

---

## State Management

### Selection State

```typescript
interface MapSelectionState {
  selectedId: string | null;          // "plant-3" or "object-7"
  selectedType: 'plant' | 'object' | null;
  mode: 'selected' | 'resizing' | 'editing-name' | null;
  resizeHandle: string | null;        // "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"
}
```

Managed via `useReducer` in `MapView.tsx` and passed down via context or props.

### Interaction Priority

When multiple gestures could conflict:

1. **Resize handle drag** beats **item drag** — if pointer is on a handle, it's a resize
2. **Double-tap on label** beats **single tap select** — use a 300ms timer to distinguish
3. **Tap on empty space** always deselects
4. **Pinch-to-zoom** beats everything — if two pointers, it's a zoom, cancel any drag/resize

---

## Implementation Order

### Session 1: Selection + Resize Handles
```
Read PLAN-map-resize-and-edit.md.
We're adding resize handles to map objects in the Groei app.

1. Add selection state to MapView (useReducer with selectedId, selectedType, mode)
2. Change tap behavior: single tap = select (not bottom sheet). Add a "details" way to open sheet.
3. Create SelectionOverlay.tsx — renders dashed border + handles around selected object
4. Create ResizeHandle.tsx — draggable SVG circles at corners/edges
5. Create useResize.ts hook — pointer capture, SVG coordinate math, dimension constraints
6. Show live DimensionLabel.tsx during drag
7. On drag end: PUT /api/objects/{id}/dimensions
8. Test with all three shapes: circle, square, rectangle
```

### Session 2: Toolbar + Inline Edit
```
Read PLAN-map-resize-and-edit.md.
We're adding the floating toolbar and inline editing.

1. Create MapToolbar.tsx — floating above selected item, positioned in screen space
2. Add toolbar buttons for objects: color, shape cycle, rotate, notes, details, close
3. Add toolbar buttons for plants: water, type cycle, notes, details, close
4. Create QuickColorPicker.tsx — small swatch popover
5. Wire toolbar actions to API calls (optimistic updates)
6. Create InlineNameEditor.tsx — positioned HTML input over SVG text
7. Double-tap label → inline edit mode → save on blur/Enter
8. Test on mobile: toolbar positioning, touch targets, keyboard behavior
```

### Session 3: Polish
```
Read PLAN-map-resize-and-edit.md.
Polish the resize and inline edit features.

1. Add minimum size constraints (10cm) and visual feedback when hitting min
2. Handle edge cases: resize while zoomed, resize near map boundary
3. Animate handle appearance (fade in, 100ms)
4. Add haptic feedback on mobile (navigator.vibrate) for selection and resize snap
5. Keyboard shortcuts: Delete key to archive, Escape to deselect
6. Undo last resize (Ctrl+Z or shake gesture)
7. Test the full flow: add object → resize → rename → change color → move → done
```

---

## Technical Notes

### Touch Target Sizes
All interactive elements must be at least 44×44dp. The SVG handles are 10px visible circles, but their hit area should be 20×20px invisible rects. The toolbar buttons are 40×40px with 4px gaps.

### Performance
- Resize is local state only during drag — no API calls until `pointerUp`
- Use `requestAnimationFrame` for smooth resize rendering
- The dimension labels use CSS transforms (not SVG attribute changes) for smooth positioning
- Toolbar position is calculated once on selection and recalculated on scroll/zoom only

### Mobile Considerations
- **iOS Safari:** `touch-action: none` on resize handles to prevent scroll
- **Keyboard:** When inline edit is active, the viewport may shift. Use `visualViewport` API to keep the input visible
- **Double-tap zoom:** Disable the browser's double-tap-to-zoom on the map container (`touch-action: manipulation`)

### Accessibility
- Selected state announced via `aria-selected`
- Resize handles have `aria-label="Resize northwest corner"`
- Toolbar buttons have `aria-label` for screen readers
- Inline edit input has `aria-label="Edit name"`

---

## API Changes

### New Endpoint
```
PUT /api/objects/{id}/dimensions
Body: {
  width_cm?: number,
  depth_cm?: number,
  diameter_cm?: number
}
Response: updated object
```

### Modified Behavior
- `PUT /api/objects/{id}` and `PUT /api/plants/{id}` already handle name/color/material updates — no new endpoints needed for inline edits
- Consider adding a `PATCH` variant that only updates provided fields (avoid overwriting other fields during quick edits)

---

## Dependency on Existing Code

This plan assumes these things already exist:
- `ObjectShape.tsx` rendering objects as SVG shapes (circle, rect) with correct dimensions
- `PlantMarker.tsx` rendering plants as colored circles with labels
- `useMapItems.ts` fetching objects and plants for a map
- `screenToSVG()` coordinate conversion utility
- Bottom sheet infrastructure (`BottomSheet.tsx`, `PlantSheet.tsx`, `ObjectSheet.tsx`)
- Object and plant CRUD API endpoints

If any of these don't exist yet, build them first before starting this plan.
