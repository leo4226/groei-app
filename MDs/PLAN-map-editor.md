# 🌱 Groei — Feature Plan: In-App Map Layout Editor

**Goal:** Let users create new garden or indoor maps from scratch inside Groei, without needing external tools. The editor lives at a new route and produces SVGs that drop directly into the existing maps system.

---

## Where It Lives in the App

### Navigation
- A **"Maps"** section is added to the main nav/menu
- Tapping it shows a list of existing maps (garden, future indoor rooms, mum's garden, etc.)
- Each map has a **"View"** button (goes to existing plant map view) and an **"Edit layout"** button
- A **"+ New map"** button opens the layout editor

### Routes
```
/maps                  → Map list screen
/maps/new              → Layout editor (blank canvas)
/maps/:id/edit-layout  → Layout editor (edit existing map's zones)
/map/:id               → Existing plant placement view (unchanged)
```

---

## Database Changes

### Maps table additions
The existing `maps` table already has `svg_file`, `viewbox`, and `scale_info`. Add:

```sql
ALTER TABLE maps ADD COLUMN canvas_data TEXT; 
-- Stores the editable zone data as JSON so the editor can re-open and modify it
-- Format: {"zones": [...], "scale_px_per_m": 46.1, "canvas_w": 680, "canvas_h": 680}
```

The `svg_file` continues to be the rendered output. `canvas_data` is the editable source of truth for maps created in the editor (maps imported as raw SVG, like the current garden, won't have `canvas_data`).

### Zone data structure (stored in canvas_data.zones)
```json
{
  "id": "zone_1",
  "type": "deck",
  "shape": "rect",
  "x": 162, "y": 511,
  "width": 276, "height": 115,
  "label": "Front deck",
  "real_w_m": 6.0,
  "real_h_m": 2.5
}
```

Supported shapes initially: `rect` only. Polygons in a later iteration.

---

## Zone Types & Visual Style

These match the patterns already defined in `garden_background.svg`:

| Type         | Fill                    | Stroke                  | Use for                        |
|--------------|-------------------------|-------------------------|--------------------------------|
| `deck`       | `#C8A96A` + deckp       | `rgba(222,220,209,0.3)` | Wooden decking, patios         |
| `soil`       | `#9B7A3A` + soilp       | `rgba(222,220,209,0.15)`| Planting beds, borders         |
| `gravel`     | `#ccc` + gravelp        | `rgba(222,220,209,0.15)`| Gravel paths, shell paths      |
| `lawn`       | `#7A9E5A` opacity 0.4   | `rgba(222,220,209,0.2)` | Grass areas                    |
| `wall`       | `#262624`               | `rgba(222,220,209,0.4)` | House walls, brick walls       |
| `path`       | `#D4C9A8` opacity 0.6   | none                    | Stepping stone paths           |
| `room`       | `#E8E0D0` opacity 0.5   | `rgba(100,80,60,0.2)`   | Indoor rooms (for house maps)  |
| `water`      | `#3B8BD4` opacity 0.4   | `rgba(60,130,200,0.3)`  | Pond, water feature            |
| `structure`  | `#C8A060` stroke #8a6030| 1.2px                   | Shed, greenhouse, pergola      |

The same `<defs>` patterns from `garden_background.svg` are included in every exported SVG.

---

## Scale System

### How scale works
- The canvas is always `680 × 680` viewBox units (matching the existing garden SVG)
- Scale is stored as `px_per_m` — how many SVG units = 1 real-world meter
- The existing garden uses ~46.1 px/m (confirmed: 310cm = 143px → 46.1px/m)
- Default for new maps: 46 px/m

### Setting scale in the editor
Two methods:

**Method A — Enter real dimensions directly**
After drawing a zone, a small panel asks: "How wide is this in reality?" Enter e.g. `6m`. The editor calculates `px_per_m = zone_width_px / 6` and locks the scale for the whole map. All subsequent zones show their real dimensions live.

**Method B — Scale bar tool**
A dedicated tool lets you draw a line on the canvas and enter its real length. Sets `px_per_m` for the whole canvas.

Once scale is set, a **scale bar** renders in the bottom-left corner of the canvas and the exported SVG, e.g. `|——| 2m`.

### Real-dimension display
Every zone shows its real dimensions as a subtle label while in edit mode:
`Front deck · 6.0 × 2.5m`

---

## Editor UI

### Layout
```
┌─────────────────────────────────────────────────┐
│  ← Back    "New map"              [Preview] [💾] │
├──────────┬──────────────────────────────────────┤
│          │                                       │
│  TOOLS   │                                       │
│  ──────  │         CANVAS (680×680 SVG)          │
│  □ Draw  │                                       │
│  ✕ Delete│         [zones appear here]           │
│  ↔ Scale │                                       │
│          │                                       │
│  TYPES   │                                       │
│  ──────  │                                       │
│  ▪ Deck  │                                       │
│  ▪ Soil  │                                       │
│  ▪ Gravel│                                       │
│  ▪ Lawn  │                                       │
│  ▪ Wall  │                                       │
│  ▪ Room  │                                       │
│  + more  │                                       │
│          │         ├──────┤ 2m (scale bar)       │
└──────────┴──────────────────────────────────────┘
```

On mobile: tools panel becomes a bottom sheet or a floating toolbar strip above the canvas.

### Canvas interactions
- **Draw mode**: tap+drag on empty canvas area to draw a rectangle. On release, zone is created with the currently selected type.
- **Select mode** (default after drawing): tap a zone to select it. Shows handles.
- **Move**: drag the center of a selected zone.
- **Resize**: drag corner/edge handles (uses the existing resize handle system from PLAN-map-resize-and-edit.md).
- **Delete**: tap selected zone → delete button, or swipe off canvas.
- **Snap to grid**: optional toggle. Grid is 23px (~0.5m at default scale).

### Zone properties panel
Tapping a zone opens a small floating panel (not a full bottom sheet — keep it lightweight):
```
┌─────────────────────┐
│ Label: [Front deck] │
│ Type:  [Deck ▾]     │
│ Size:  6.0 × 2.5m   │
│              [✕ Del]│
└─────────────────────┘
```

### Map settings panel (top-right gear icon)
- Map name
- Scale (px/m) — shown and editable
- Canvas orientation note ("house wall = bottom")
- Delete map button

---

## Save & Export Flow

### Saving
- **Auto-save** to `canvas_data` column as the user edits (debounced 1s)
- The `svg_file` is re-generated on save and written to `public/maps/`

### SVG generation (backend)
A new endpoint:
```
POST /maps/:id/render-svg
```
The backend reads `canvas_data`, builds the SVG string with:
1. The standard `<defs>` block (deckp, soilp, gravelp patterns)
2. One `<rect>` or `<polygon>` per zone with correct fill/stroke
3. Zone labels as `<text>` elements (optional, toggled per map)
4. Scale bar in bottom-left
5. A metadata comment block at the top:
   ```xml
   <!-- groei-map: Garden -->
   <!-- scale: 46.1px/m -->
   <!-- canvas: 680x680 -->
   ```
Writes file to `frontend/public/maps/{map_slug}.svg` and updates `maps.svg_file`.

### New map creation flow
1. User taps **"+ New map"**
2. Prompted: map name + type (Garden / Indoor room)
3. Canvas opens blank
4. User draws zones, sets scale
5. Taps **Save** → SVG rendered, map appears in list
6. Tapping the map goes to `/map/:id` — the normal plant placement view

---

## Implementation Sessions

### Session A — Map list screen + routing
```
Read PLAN.md and PLAN-map-editor.md.
Add the Maps section to the app:
- /maps route showing all maps in a list (name, thumbnail of SVG, Edit layout / View buttons)
- + New map button that navigates to /maps/new
- DB migration: add canvas_data column to maps table
- Basic map creation form (name + type, no canvas yet)
```

### Session B — Editor canvas core
```
Read PLAN.md and PLAN-map-editor.md.
Build the layout editor canvas at /maps/new and /maps/:id/edit-layout:
- 680×680 SVG canvas with light grid background (23px grid = ~0.5m)
- Draw tool: click+drag creates a rect zone with selected type
- Zone types panel on left (deck, soil, gravel, lawn, wall, room, structure)
- Zones render with correct fill patterns matching garden_background.svg style
- Select + move zones by dragging
- Delete selected zone
- Auto-save canvas_data to backend (debounced)
```

### Session C — Resize handles + zone properties
```
Read PLAN.md, PLAN-map-editor.md, and PLAN-map-resize-and-edit.md.
Add to the layout editor:
- Corner + edge resize handles on selected zones (reuse logic from map resize plan)
- Zone properties floating panel (label, type dropdown, real dimensions)
- Scale setting: enter real width for a zone to set px_per_m
- Scale bar renders on canvas once scale is set
- Real dimensions shown in zone properties panel
```

### Session D — SVG export + maps integration
```
Read PLAN.md and PLAN-map-editor.md.
Wire up SVG generation and map integration:
- POST /maps/:id/render-svg endpoint
- Generates SVG with correct defs, zone shapes, scale bar, metadata comment
- Writes SVG to frontend/public/maps/
- Updates maps.svg_file in DB
- New maps created in editor appear in /maps list and work in /map/:id plant view
- Preview mode in editor (hides handles, shows final look)
```

---

## Future Iterations (out of scope for now)

- **Polygon tool** — for diagonal edges like the front deck diagonal
- **Undo/redo** stack
- **Duplicate map** — start from an existing layout
- **Import JPG/PNG as background** — trace over a photo (Option C from earlier discussion)
- **Rotation** — for irregular plot shapes
- **Share map** — export for Lisbeth or mum to import into their own Groei instance
