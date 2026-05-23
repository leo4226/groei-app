# 🌱 Groei — Phase 1 Plan

**Interactive Garden Map App with Plant & Object Placement**

---

## What We're Building

A mobile-first PWA where Leon and Lisbeth can:

1. View their garden as an interactive top-down map (looking out from the house)
2. Place **plants** and **objects** (pots, planters, containers) on the map by dragging
3. Tap any placed item to view details, edit, or log care
4. Track watering schedules with visual status indicators on the map
5. Later: add indoor room maps using the same system

The map is the app. Everything flows from tapping and placing things on the garden.

---

## Tech Stack

| Layer     | Choice                         | Why                                        |
| --------- | ------------------------------ | ------------------------------------------ |
| Frontend  | React 18 + TypeScript + Vite   | Known stack, component model fits map layers |
| Styling   | Tailwind CSS                   | Mobile-first utility classes               |
| Backend   | FastAPI (Python)               | Async, lightweight, already familiar       |
| Database  | SQLite + aiosqlite             | Simple, file-based, no infra               |
| Auth      | Simple user toggle             | Just Leon / Lisbeth, no passwords          |
| Hosting   | Local + Tailscale              | Access from both phones                    |
| PWA       | Vite PWA plugin                | Offline support, installable               |

---

## Two Types of Things on the Map

The map has two kinds of placeable items:

### Plants (🌱)
A living thing with care needs. Has species, watering schedule, care log.
- Rendered as a **colored circle** on the map
- Color = plant type (herb, pepper, flower, etc.) or care status (overdue = red ring)
- Can exist inside a container object or directly in soil

### Objects (🪴)
A physical thing in the garden — pots, planters, raised beds, furniture.
- Rendered as a **shape** on the map: circle (round pot), square, or rectangle
- Has dimensions (diameter or width × depth in cm)
- Can optionally "contain" plants (a pot with a plant in it)
- No care schedule of its own

**Example:** A round terracotta pot (40cm diameter) on the front deck contains a Camellia japonica that needs watering every 7 days. On the map you see the pot shape with the plant dot inside it.

---

## Data Model

### `users`

```sql
CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    avatar      TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `maps`

```sql
CREATE TABLE maps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    svg_file    TEXT NOT NULL,
    viewbox     TEXT NOT NULL,
    scale_info  TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `zones`

```sql
CREATE TABLE zones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id      INTEGER NOT NULL REFERENCES maps(id),
    name        TEXT NOT NULL,
    zone_type   TEXT NOT NULL,
    boundary    TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0
);
```

### `objects`

Pots, planters, containers, furniture — anything physical you place on the map.

```sql
CREATE TABLE objects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    object_type     TEXT NOT NULL,           -- 'pot', 'planter', 'raised_bed', 'furniture'
    shape           TEXT NOT NULL,           -- 'circle', 'square', 'rectangle'
    -- Dimensions in cm (real world)
    diameter_cm     INTEGER,                 -- For circle shapes
    width_cm        INTEGER,                 -- For square/rectangle
    depth_cm        INTEGER,                 -- For rectangle (square uses width for both)
    material        TEXT,                     -- 'terracotta', 'plastic', 'wood', 'corten', 'stone'
    color           TEXT,                     -- Hex color for rendering
    map_id          INTEGER REFERENCES maps(id),
    map_x           REAL,
    map_y           REAL,
    rotation        REAL DEFAULT 0,          -- Degrees, for rectangles at an angle
    notes           TEXT,
    is_active       BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `plants`

```sql
CREATE TABLE plants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    species         TEXT,
    plant_type      TEXT,                    -- 'pot_plant', 'herb', 'pepper', 'tomato', 'flower', etc.
    -- Position: either directly on map OR inside a container
    map_id          INTEGER REFERENCES maps(id),
    map_x           REAL,
    map_y           REAL,
    container_id    INTEGER REFERENCES objects(id),  -- If inside a pot/planter
    photo_path      TEXT,
    acquired_date   DATE,
    pot_size_cm     INTEGER,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Key relationship:** A plant can either have `map_x/map_y` (placed directly on soil) OR a `container_id` (lives inside a pot — inherits the pot's position). Not both.

### `care_schedules`

```sql
CREATE TABLE care_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    care_type       TEXT NOT NULL,
    interval_days   INTEGER NOT NULL,
    season_adjust   TEXT,
    next_due        DATE NOT NULL,
    last_done       DATETIME,
    last_done_by    INTEGER REFERENCES users(id),
    is_active       BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `care_log`

```sql
CREATE TABLE care_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    care_type       TEXT NOT NULL,
    done_by         INTEGER NOT NULL REFERENCES users(id),
    done_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT,
    skipped         BOOLEAN DEFAULT 0
);
```

---

## API Routes

### Maps

```
GET    /api/maps                          → List all maps
GET    /api/maps/{slug}                   → Map detail + zones
GET    /api/maps/{slug}/items             → All plants + objects on this map (with care status)
```

### Objects

```
GET    /api/objects                        → List all objects
GET    /api/objects/{id}                   → Object detail + contained plants
POST   /api/objects                        → Create object
PUT    /api/objects/{id}                   → Update object (name, dimensions, material, etc.)
PUT    /api/objects/{id}/position          → Update position/rotation on map
DELETE /api/objects/{id}                   → Archive object
```

### Plants

```
GET    /api/plants                         → All plants (across all maps)
GET    /api/plants/{id}                    → Plant detail + care schedules + care log
POST   /api/plants                         → Create plant
PUT    /api/plants/{id}                    → Update plant (name, species, type, notes, etc.)
PUT    /api/plants/{id}/position           → Update map position
PUT    /api/plants/{id}/container          → Move plant into/out of a container
DELETE /api/plants/{id}                    → Archive plant
POST   /api/plants/{id}/photo              → Upload photo
```

### Care

```
GET    /api/care/due                       → All overdue/due-today tasks
POST   /api/care/done                      → Mark task done
POST   /api/care/skip                      → Skip task
GET    /api/care/log/{plant_id}            → Care history
```

### Map Items Response Shape

`GET /api/maps/garden/items` returns both plants and objects in one call:

```json
{
  "objects": [
    {
      "id": 1,
      "name": "Terracotta pot",
      "shape": "circle",
      "diameter_cm": 40,
      "material": "terracotta",
      "color": "#B7654B",
      "map_x": 180.0,
      "map_y": 580.0,
      "rotation": 0,
      "contained_plants": [
        {
          "id": 3,
          "name": "Camellia",
          "plant_type": "flower",
          "care_status": "good"
        }
      ]
    }
  ],
  "plants": [
    {
      "id": 5,
      "name": "Pampas grass",
      "species": "Cortaderia selloana",
      "plant_type": "shrub",
      "map_x": 300.0,
      "map_y": 405.0,
      "container_id": null,
      "care_status": "due_today",
      "most_urgent": {
        "care_type": "water",
        "days_overdue": 0
      }
    }
  ]
}
```

---

## Frontend Components

### Pages

```
/                    → Redirects to /map/garden
/map/:slug           → Map view (the core page)
/plants              → Plant list
/plants/:id          → Plant detail
/settings            → User toggle, preferences
```

### Component Tree

```
App
├── BottomNav                          # Tabs: Map | Plants | Settings
│
├── MapPage
│   ├── MapSelector                    # Pills: Garden | Woonkamer (later)
│   ├── MapView                        # THE CORE COMPONENT
│   │   ├── MapBackground              # Static SVG (garden_background.svg)
│   │   ├── ObjectsLayer               # SVG shapes for pots/planters
│   │   │   └── ObjectShape            # Circle/square/rect with dimensions
│   │   ├── PlantsLayer                # SVG circles for plants
│   │   │   └── PlantMarker            # Colored dot + status ring + label
│   │   └── DragGhost                  # Floating element during drag
│   ├── AddBar                         # Bottom drawer with two tabs
│   │   ├── PlantPalette               # Draggable plant type chips
│   │   └── ObjectPalette              # Draggable object presets (round pot, square pot, etc.)
│   └── ItemSheet                      # Bottom sheet when tapping any item
│       ├── PlantSheet                 # Plant details + care + edit
│       └── ObjectSheet                # Object details + contained plants + edit
│
├── PlantDetailPage
│   ├── PlantHeader                    # Photo, name, species
│   ├── ContainerInfo                  # "In: Terracotta pot on front deck"
│   ├── CareSchedules                  # Watering, fertilizing intervals
│   ├── QuickActions                   # [Water now] [Edit] [Move]
│   └── CareHistory                    # Timeline
│
└── SettingsPage
    ├── UserSwitcher
    └── MapManager
```

---

## How Objects Render on the Map

Objects are drawn as SVG shapes scaled to their real-world dimensions using the map's scale (46px = 1m).

```tsx
// ObjectShape.tsx — renders based on shape type
function ObjectShape({ object }: { object: MapObject }) {
  const pxPerCm = 46 / 100; // 0.46px per cm

  switch (object.shape) {
    case 'circle': {
      const r = (object.diameter_cm * pxPerCm) / 2;
      return (
        <g transform={`translate(${object.map_x}, ${object.map_y})`}>
          <circle r={r} fill={object.color + '33'} stroke={object.color} strokeWidth={1.2} />
          {/* Contained plant dot rendered inside */}
        </g>
      );
    }
    case 'square': {
      const size = object.width_cm * pxPerCm;
      return (
        <g transform={`translate(${object.map_x}, ${object.map_y}) rotate(${object.rotation})`}>
          <rect x={-size/2} y={-size/2} width={size} height={size} rx={2}
                fill={object.color + '33'} stroke={object.color} strokeWidth={1.2} />
        </g>
      );
    }
    case 'rectangle': {
      const w = object.width_cm * pxPerCm;
      const d = object.depth_cm * pxPerCm;
      return (
        <g transform={`translate(${object.map_x}, ${object.map_y}) rotate(${object.rotation})`}>
          <rect x={-w/2} y={-d/2} width={w} height={d} rx={2}
                fill={object.color + '33'} stroke={object.color} strokeWidth={1.2} />
        </g>
      );
    }
  }
}
```

**Scale examples at 46px/m:**
- 40cm round pot → 18px diameter circle
- 30×30cm square pot → 14×14px square
- 80×40cm rectangular planter → 37×18px rectangle
- 200×60cm raised bed → 92×28px rectangle

---

## How Plants Render on the Map

Plants placed directly in soil get their own marker at `(map_x, map_y)`. Plants inside containers don't have their own coordinates — they render as a small dot inside the container shape.

```tsx
// PlantMarker.tsx
function PlantMarker({ plant }: { plant: MapPlant }) {
  const typeColor = PLANT_TYPE_COLORS[plant.plant_type];
  const statusColor = CARE_STATUS_COLORS[plant.care_status];

  return (
    <g className="plant-marker" transform={`translate(${plant.map_x}, ${plant.map_y})`}>
      {/* Status ring — pulses when overdue */}
      {plant.care_status === 'overdue' && (
        <circle r={12} fill="none" stroke={statusColor} strokeWidth={2} opacity={0.6}>
          <animate attributeName="r" values="12;15;12" dur="2s" repeatCount="indefinite"/>
        </circle>
      )}
      {plant.care_status === 'due_today' && (
        <circle r={12} fill="none" stroke={statusColor} strokeWidth={1.5} opacity={0.5} />
      )}
      {/* Plant dot */}
      <circle r={8} fill={typeColor + '44'} stroke={typeColor} strokeWidth={1.5} />
      <circle r={3} fill={typeColor} />
      {/* Label */}
      <text y={18} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.7}>
        {plant.name}
      </text>
    </g>
  );
}
```

### Plant Type Colors

```typescript
const PLANT_TYPE_COLORS: Record<string, string> = {
  pot_plant: '#5B9A6F',
  herb:      '#7AAC4A',
  pepper:    '#C1443E',
  tomato:    '#D4A843',
  flower:    '#D4537E',
  climber:   '#2D6A4F',
  shrub:     '#639922',
  grass:     '#9AAA50',
  bulb:      '#B7654B',
  tree:      '#5A3A10',
};

const CARE_STATUS_COLORS = {
  overdue:   '#C1443E',
  due_today: '#D4A843',
  good:      '#5B9A6F',
};
```

---

## Adding Items: The Add Bar

The bottom of the map has a collapsible bar with two tabs:

### 🌱 Plants tab
Horizontal scroll of plant type chips. Drag one onto the map → opens **AddPlantSheet**:
- Name (required)
- Species (optional)
- Container: "In a pot?" → select from existing objects on this map, or "In ground"
- Watering interval (with smart defaults per plant type)
- Photo (camera/gallery upload)

### 🪴 Objects tab
Presets + custom option:

| Preset          | Shape     | Default size | Color     |
| --------------- | --------- | ------------ | --------- |
| Round pot       | circle    | 30cm         | #B7654B (terracotta) |
| Square pot      | square    | 30cm         | #888 (gray) |
| Rectangular planter | rectangle | 80×30cm | #8B6914 (wood) |
| Corten ring     | circle    | 100cm        | #A0522D (rust) |
| Raised bed      | rectangle | 200×80cm     | #8B5A30 (wood) |
| Custom...       | —         | user enters  | user picks |

Drag a preset onto the map → opens **AddObjectSheet**:
- Name (pre-filled from preset)
- Shape (pre-filled)
- Dimensions (pre-filled, editable)
- Material (dropdown)
- Color (picker or presets)
- "Add a plant inside?" → optional quick-add a plant to this container

---

## Editing Items

### Editing a Plant (tap plant → PlantSheet → Edit)

Opens an edit form with all fields:
- Name, species, plant type
- Container assignment (move between pots, or move to ground)
- Watering interval + season adjustments
- Photo (replace/add)
- Notes
- Archive (soft delete for dead/removed plants)

### Editing an Object (tap object → ObjectSheet → Edit)

Opens an edit form:
- Name
- Shape, dimensions (adjusts map rendering live)
- Material, color
- Rotation (slider 0-360°)
- Notes
- Archive

### Moving Items

Two ways to move:
1. **Drag on map** — long-press (300ms) then drag. Position updates optimistically.
2. **"Move" button in sheet** — enters drag mode, tap new location.

---

## Garden Background SVG

The map file is `garden_background.svg` stored in `frontend/public/maps/`.

**Current state:** Clean SVG with structural elements only (decks, zones, walls, fences, shed, tree). No plants, no labels, no dimension lines. viewBox `0 0 680 680`. Perspective: house at bottom, back fence at top.

**Key coordinates (flipped perspective):**

| Element     | Position                                           |
| ----------- | -------------------------------------------------- |
| Back fence  | y ≈ 55-64 (top)                                   |
| Back deck   | y = 55..306                                        |
| Tree        | cx=220, cy=100, r=56                               |
| Shed        | x=346..438, y=55..156                              |
| Middle zone | y = 306..511/557 (planting area)                   |
| Gravel path | x=178..235, y=306..511                             |
| Raised soil | x=162..178, y=306..511                             |
| Front deck  | y = 511/557..626 (diagonal: 305→351, 511→557)     |
| House wall  | y = 626..640 (bottom)                              |
| Left wall   | x = 157..162                                       |
| Right fence | x = 438..442                                       |
| Garden area | x = 162..438 (276px = 6m), scale 46px/m           |

**Swapping maps:** Drop a new SVG in the maps folder, add a row to the `maps` table with the correct viewBox and scale. The `MapView` component renders any map.

---

## File Structure

```
groei/
├── frontend/
│   ├── public/
│   │   ├── maps/
│   │   │   └── garden_background.svg
│   │   ├── manifest.json
│   │   └── icons/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── components/
│   │   │   ├── BottomNav.tsx
│   │   │   ├── map/
│   │   │   │   ├── MapView.tsx
│   │   │   │   ├── MapBackground.tsx
│   │   │   │   ├── PlantsLayer.tsx
│   │   │   │   ├── PlantMarker.tsx
│   │   │   │   ├── ObjectsLayer.tsx
│   │   │   │   ├── ObjectShape.tsx
│   │   │   │   ├── AddBar.tsx
│   │   │   │   ├── PlantPalette.tsx
│   │   │   │   ├── ObjectPalette.tsx
│   │   │   │   └── DragGhost.tsx
│   │   │   ├── sheets/
│   │   │   │   ├── PlantSheet.tsx
│   │   │   │   ├── ObjectSheet.tsx
│   │   │   │   ├── AddPlantSheet.tsx
│   │   │   │   ├── AddObjectSheet.tsx
│   │   │   │   ├── EditPlantSheet.tsx
│   │   │   │   └── EditObjectSheet.tsx
│   │   │   └── shared/
│   │   │       ├── BottomSheet.tsx
│   │   │       ├── ColorPicker.tsx
│   │   │       └── DimensionInput.tsx
│   │   ├── pages/
│   │   │   ├── MapPage.tsx
│   │   │   ├── PlantList.tsx
│   │   │   ├── PlantDetail.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   │   ├── useMapItems.ts
│   │   │   ├── useDragDrop.ts
│   │   │   ├── useItemPosition.ts
│   │   │   └── useActiveUser.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── constants/
│   │   │   ├── plantTypes.ts
│   │   │   └── objectPresets.ts
│   │   ├── utils/
│   │   │   ├── svgCoords.ts
│   │   │   └── careStatus.ts
│   │   └── styles/
│   │       └── globals.css
│   ├── index.html
│   ├── tailwind.config.ts
│   └── vite.config.ts
│
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── routers/
│   │   ├── maps.py
│   │   ├── plants.py
│   │   ├── objects.py
│   │   ├── care.py
│   │   └── users.py
│   ├── services/
│   │   ├── scheduling.py
│   │   └── zones.py
│   ├── photos/
│   ├── groei.db
│   └── requirements.txt
│
├── maps/
│   └── garden_background.svg          # Source reference
├── PLAN.md                            # This file
└── README.md
```

---

## Implementation Steps

### Step 1 — Scaffold + Database (Session 1)
- [ ] Vite + React + TS + Tailwind frontend
- [ ] FastAPI + SQLite backend
- [ ] All tables created (users, maps, zones, objects, plants, care_schedules, care_log)
- [ ] Seed: 2 users, 1 map (garden with viewBox/scale), 4 zones
- [ ] CORS + static file serving for maps directory
- [ ] Verify: API returns empty items list for garden map

### Step 2 — Map Rendering (Session 1)
- [ ] Place `garden_background.svg` in `public/maps/`
- [ ] `MapBackground.tsx`: loads SVG, renders full-width
- [ ] `MapView.tsx`: background + empty overlay SVG with matching viewBox
- [ ] `MapPage.tsx`: fetches map data, renders MapView
- [ ] Routing: `/` → `/map/garden`
- [ ] Verify on phone via Tailscale: map renders, fills screen, is scrollable

### Step 3 — Object Placement (Session 2)
- [ ] `ObjectShape.tsx`: renders circle/square/rectangle at correct scale
- [ ] `ObjectPalette.tsx`: preset chips (round pot, square pot, planter, etc.)
- [ ] Drag from palette → drop on map → opens `AddObjectSheet`
- [ ] `AddObjectSheet`: name, shape, dimensions, material, color
- [ ] `POST /api/objects` → object appears on map
- [ ] Tap object → `ObjectSheet` slides up with details

### Step 4 — Plant Placement (Session 2-3)
- [ ] `PlantMarker.tsx`: colored dot with label
- [ ] `PlantPalette.tsx`: plant type chips
- [ ] Drag from palette → drop on map → `AddPlantSheet`
- [ ] `AddPlantSheet`: name, species, type, watering interval, optional container, photo
- [ ] `POST /api/plants` → marker appears
- [ ] Tap marker → `PlantSheet` with status + quick actions
- [ ] Plants inside containers: render dot inside the object shape

### Step 5 — Editing (Session 3)
- [ ] `EditPlantSheet`: all fields editable, save updates plant
- [ ] `EditObjectSheet`: dimensions, material, color — map shape updates live
- [ ] Container reassignment: move plant between pots or to ground
- [ ] Delete/archive from edit sheets

### Step 6 — Drag to Reposition (Session 3)
- [ ] Long-press (300ms) → enters drag mode for both plants and objects
- [ ] Pointer events with capture for smooth mobile drag
- [ ] `screenToSVG` conversion via `getScreenCTM().inverse()`
- [ ] Optimistic local update + debounced `PUT /api/.../position`
- [ ] Drag off map edge → confirm removal
- [ ] Objects with contained plants: moving the object moves its plants too

### Step 7 — Care System (Session 4)
- [ ] Care schedule creation during plant add (watering interval required)
- [ ] Season adjustment logic (Amsterdam seasons, multiplier per season)
- [ ] `GET /api/care/due` → overdue + due-today plants
- [ ] Status ring colors on plant markers (red=overdue, amber=due, green=good)
- [ ] Overdue markers pulse (CSS animation)
- [ ] "Water now" in PlantSheet → `POST /api/care/done` → ring updates
- [ ] Care log timeline on plant detail

### Step 8 — Plant List + Detail (Session 4)
- [ ] `PlantList.tsx`: all plants, filterable by status/map
- [ ] `PlantDetail.tsx`: full info, schedules, care history, photo
- [ ] Navigation: map tap → sheet → "Details" → detail page
- [ ] Photo upload (camera/gallery)

### Step 9 — Polish + PWA (Session 5)
- [ ] Bottom nav (Map | Plants | Settings)
- [ ] User switcher
- [ ] Tailwind theming: earthy warm palette
- [ ] PWA manifest + service worker
- [ ] Empty states ("Drag a plant onto your garden to get started!")
- [ ] Loading states, error handling
- [ ] Test full flow on both phones

---

## Claude Code Session Starters

### Session 1
```
Read PLAN.md. We're building Groei, a garden plant care app.
Start with Steps 1-2: scaffold the project and render the garden map.
- Frontend: Vite + React + TS + Tailwind in frontend/
- Backend: FastAPI + SQLite in backend/
- Create all database tables from the plan
- Seed users (Leon, Lisbeth), garden map, 4 zones
- Render garden_background.svg as the map view at /map/garden
- Set up routing, CORS, static files
```

### Session 2
```
Read PLAN.md. Continue with Steps 3-4: object and plant placement.
- Build ObjectShape component (circle/square/rectangle)
- Build PlantMarker component
- Add palettes with drag-to-map
- Build AddObjectSheet and AddPlantSheet forms
- Wire up POST endpoints for both
- Plants can be assigned to containers
```

### Session 3
```
Read PLAN.md. Continue with Steps 5-6: editing and repositioning.
- Build EditPlantSheet and EditObjectSheet
- Long-press drag to reposition items on map
- Container reassignment (move plant between pots)
- Pointer events with SVG coordinate conversion
```

---

## Season Adjustment Logic

```python
from datetime import date

def get_season() -> str:
    m, d = date.today().month, date.today().day
    if (3, 21) <= (m, d) <= (6, 20): return "spring"
    if (6, 21) <= (m, d) <= (9, 22): return "summer"
    if (9, 23) <= (m, d) <= (12, 20): return "autumn"
    return "winter"

def effective_interval(base_days: int, season_adjust: dict | None) -> int:
    if not season_adjust: return base_days
    multiplier = season_adjust.get(get_season(), 1.0)
    return max(1, round(base_days * multiplier))
```

---

## Default Care Presets

| Plant Type | Water (days) | Season Adjust              | Fertilize    |
| ---------- | ------------ | -------------------------- | ------------ |
| Pot plant  | 7            | winter: 1.5, summer: 0.7  | 21 days      |
| Herb       | 3            | winter: 2.0, summer: 0.5  | 14 days      |
| Pepper     | 3            | summer: 0.5                | 10 days      |
| Tomato     | 2            | summer: 0.5                | 10 days      |
| Flower     | 5            | winter: 2.0, summer: 0.7  | 14 days      |
| Climber    | 7            | winter: 2.0                | 21 days      |
| Shrub      | 14           | winter: 3.0, summer: 0.7  | 30 days      |
| Grass      | 14           | winter: —                  | 30 days      |
| Tree       | 21           | winter: —                  | seasonal     |

---

## Mobile Interaction Reference

| Action           | Gesture                    | Result                                    |
| ---------------- | -------------------------- | ----------------------------------------- |
| View map         | Open app                   | Garden map fills screen                   |
| Add plant        | Drag chip to map           | Opens add plant form                      |
| Add object       | Drag preset to map         | Opens add object form                     |
| View item        | Tap marker/shape           | Bottom sheet with details                 |
| Edit item        | Tap → Edit button          | Edit form in bottom sheet                 |
| Water plant      | Tap → Water now            | Logs care, updates status ring            |
| Move item        | Long-press → drag          | Repositions on map                        |
| Remove item      | Edit → Archive             | Removed from map                          |
| Switch map       | Tap different map pill     | Swaps map + items                         |

---

## Future Phases

- **Phase 1b**: Indoor maps (woonkamer, slaapkamer SVGs)
- **Phase 2**: Claude AI plant tips + encyclopedia
- **Phase 3**: Growth tracking with photo timeline
- **Phase 4**: Stekjes guides, moestuin harvest tracker
- **Phase 5**: Weather API → dynamic care adjustments
- **Phase 6**: Push notifications for overdue plants
