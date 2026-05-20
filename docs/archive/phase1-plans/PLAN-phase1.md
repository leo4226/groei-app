# 🌱 Groei — Phase 1 Planning Document

**Garden & Plant Care App — Phase 1: Interactive Garden Map + Plant Registry**

Working title: **Groei** (Dutch for "grow")

---

## Goal

A mobile-first PWA where Leon and Lisbeth can:

1. See their garden as an interactive top-down map — the primary view
2. Place, drag, and name plants directly on the map
3. Tap a plant to see its details and care status
4. Track watering schedules and mark care tasks as done
5. Later: add indoor room maps with the same interaction model

The map is the app. Everything flows from tapping and placing things on the garden.

---

## Tech Stack

| Layer        | Choice                | Rationale                                              |
| ------------ | --------------------- | ------------------------------------------------------ |
| Frontend     | React 18 + TypeScript + Vite | Known workflow, component model fits map layers  |
| Styling      | Tailwind CSS          | Fast mobile-first styling, utility classes             |
| Backend      | FastAPI (Python)      | Already used in settlement predictor, async-friendly   |
| Database     | SQLite + aiosqlite    | Simple, no infra needed, file-based backup             |
| Auth         | Lightweight user toggle | No passwords for phase 1, just identify who's who    |
| Hosting      | Local / Tailscale     | Access from both phones via Tailscale                  |
| PWA          | Vite PWA plugin       | Service worker for offline + push notifications        |

---

## Core Concept: Map-First Architecture

The app is built around **location maps** — SVG files that represent physical spaces. Each map is a static background layer with an interactive plant layer on top.

```
┌─────────────────────────────────┐
│         MapView component       │
│                                 │
│  ┌───────────────────────────┐  │
│  │   Static SVG background   │  │  ← garden_map.svg (the one we already have)
│  │   (zones, structures,     │  │
│  │    paths, shed, tree...)  │  │
│  │                           │  │
│  │   ┌─●──┐  ●  ●           │  │  ← Interactive plant markers (React state)
│  │   │    │                  │  │
│  │   ●    │     ●            │  │
│  │        ●                  │  │
│  └───────────────────────────┘  │
│                                 │
│  [ Plant palette / Add bar ]    │  ← Drag from here onto the map
│  [ Bottom nav ]                 │
└─────────────────────────────────┘
```

This same `<MapView>` component will later render indoor maps (woonkamer, slaapkamer) — just a different SVG background and different `map_id` filter on the plants query.

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

Each map is a named SVG file representing a physical space.

```sql
CREATE TABLE maps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,               -- 'Garden', 'Woonkamer', 'Slaapkamer'
    slug        TEXT NOT NULL UNIQUE,         -- 'garden', 'woonkamer', 'slaapkamer'
    svg_file    TEXT NOT NULL,               -- 'garden_map.svg'
    viewbox     TEXT NOT NULL,               -- '0 0 680 680' (parsed for coordinate math)
    scale_info  TEXT,                         -- JSON: {"px_per_meter": 46, "origin_x": 162, "origin_y": 54}
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Why `scale_info`?** The garden SVG uses 46px = 1m. Storing this means we can show real-world distances ("this pot is 2.3m from the house wall") and validate placements ("that's outside the garden boundary").

### `zones`

Clickable regions within a map — for filtering and context.

```sql
CREATE TABLE zones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id      INTEGER NOT NULL REFERENCES maps(id),
    name        TEXT NOT NULL,               -- 'Front deck', 'Middle zone', 'Back deck', 'Shed area'
    zone_type   TEXT NOT NULL,               -- 'deck', 'soil', 'gravel', 'structure'
    sun_exposure TEXT,                       -- 'full_sun', 'partial_shade', 'full_shade'
    boundary    TEXT NOT NULL,               -- JSON polygon: [[162,54],[438,54],[438,123],...]
    color       TEXT,                         -- For hover highlight
    sort_order  INTEGER DEFAULT 0
);
```

### `plants`

The core entity — now with map coordinates.

```sql
CREATE TABLE plants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,            -- 'Big Monstera', 'Lombok peppers'
    species         TEXT,                     -- 'Capsicum annuum'
    map_id          INTEGER REFERENCES maps(id),
    zone_id         INTEGER REFERENCES zones(id),
    map_x           REAL,                     -- SVG x coordinate on the map
    map_y           REAL,                     -- SVG y coordinate on the map
    photo_path      TEXT,
    acquired_date   DATE,
    pot_size_cm     INTEGER,
    last_repotted   DATE,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Key decision:** `map_x` and `map_y` are nullable. A plant can exist without being placed on a map (e.g. you add it from the plant list but haven't decided where it goes yet). But the primary flow is: drag from palette → drop on map → plant is created with coordinates.

### `care_schedules`

```sql
CREATE TABLE care_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    care_type       TEXT NOT NULL,            -- 'water', 'fertilize', 'mist', 'rotate', 'repot_check'
    interval_days   INTEGER NOT NULL,
    season_adjust   TEXT,                     -- JSON: {"winter": 1.5, "summer": 0.7}
    next_due        DATE NOT NULL,
    last_done       DATETIME,
    last_done_by    INTEGER REFERENCES users(id),
    notes           TEXT,
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
GET    /api/maps                     → List all maps
GET    /api/maps/{slug}              → Map detail + SVG file path + zones
GET    /api/maps/{slug}/plants       → All plants on this map (with care status)
```

### Plants

```
GET    /api/plants                   → All plants (across all maps)
GET    /api/plants/{id}              → Plant detail + care schedules + care history
POST   /api/plants                   → Create plant (optionally with map_x, map_y, map_id)
PUT    /api/plants/{id}              → Update plant info
PUT    /api/plants/{id}/position     → Update map position only { map_id, map_x, map_y }
DELETE /api/plants/{id}              → Archive plant (soft delete)
POST   /api/plants/{id}/photo       → Upload plant photo
```

### Care

```
GET    /api/care/due                 → All plants with overdue/due-today tasks (for dashboard overlay)
POST   /api/care/done                → Mark task done { plant_id, care_type, user_id, notes? }
POST   /api/care/skip                → Skip task
GET    /api/care/log/{plant_id}      → Care history for a plant
```

### Users

```
GET    /api/users                    → List users
POST   /api/users/select/{user_id}  → Set active user
```

### Key response: Map plants with care status

`GET /api/maps/garden/plants` returns:

```json
[
  {
    "id": 1,
    "name": "Lombok peppers",
    "species": "Capsicum annuum",
    "type_hint": "pepper",
    "map_x": 280.5,
    "map_y": 310.2,
    "zone": "Middle zone",
    "photo_path": "/photos/lombok.jpg",
    "care_status": "overdue",
    "most_urgent": {
      "care_type": "water",
      "days_overdue": 2,
      "last_done_by": "Lisbeth"
    }
  }
]
```

The `care_status` field drives the marker color on the map:
- `"overdue"` → red ring
- `"due_today"` → amber ring
- `"good"` → green ring (or no ring, just the dot)

---

## Frontend Components

### Pages

```
/                   → Redirects to /map/garden
/map/:slug          → Map view (the core page)
/plants             → Plant list (flat list, for quick overview)
/plants/:id         → Plant detail sheet
/settings           → User toggle, manage maps, preferences
```

### Component Tree

```
App
├── BottomNav                        # Tabs: Map | Plants | Settings
│
├── MapPage                          # /map/:slug
│   ├── MapSelector                  # Horizontal pills: Garden | Woonkamer (later)
│   ├── MapView                      # THE CORE COMPONENT
│   │   ├── MapBackground            # Static SVG rendered as <img> or inline
│   │   ├── PlantsLayer              # SVG <g> with plant markers, rendered by React
│   │   │   └── PlantMarker          # Circle + status ring + label, draggable
│   │   ├── ZoneHighlights           # Semi-transparent zone overlays on hover/filter
│   │   └── DragGhost                # Floating element while dragging from palette
│   ├── PlantPalette                 # Bottom drawer: plant types to drag onto map
│   │   └── PaletteChip             # Draggable chip per plant type
│   ├── CareOverlay                  # Optional: toggle to show care status rings
│   └── PlantQuickSheet              # Slides up when tapping a placed plant
│       ├── PlantPhoto               # Thumbnail
│       ├── CareStatus               # Next due, last watered, who did it
│       ├── QuickActions              # [Water now] [Details] [Move] [Remove]
│       └── → links to PlantDetailPage
│
├── PlantDetailPage                  # /plants/:id
│   ├── PlantHeader                  # Photo, name, species, map location
│   ├── CareScheduleList             # Current schedules with next due dates
│   ├── QuickActions                 # [Water Now] [Fertilize] [Add Note]
│   └── CareHistory                  # Timeline of past care actions
│
├── PlantListPage                    # /plants
│   ├── StatusFilter                 # Pills: All | Needs attention | Healthy
│   ├── MapFilter                    # Pills: All maps | Garden | Woonkamer
│   └── PlantRow                     # Compact row: photo, name, location, status dot
│
└── SettingsPage
    ├── UserSwitcher                 # Toggle between Leon / Lisbeth
    ├── MapManager                   # List maps, (later: add new maps)
    └── NotificationPrefs
```

### MapView — Technical Approach

This is the most important component. Here's how to build it:

**1. Background layer**

The garden SVG (garden_map_v7.svg) is stripped of dimension lines, measurements, and annotations — keep only the structural elements (deck polygons, soil zones, gravel, shed, tree, fences, walls, string lights). This "clean" SVG becomes the static background.

Two options for rendering:
- **Option A (simpler):** Inline the cleaned SVG as JSX. Straightforward, allows CSS variable theming, but makes the component large.
- **Option B (recommended):** Store the SVG as a static file, load it into a `<div>` via `dangerouslySetInnerHTML` or as a background `<img>`. Overlay a transparent `<svg>` element on top for the interactive plants layer. The two SVGs share the same `viewBox` so coordinates align perfectly.

Go with **Option B** — it keeps map content separate from React component logic and makes it trivial to swap maps.

```tsx
// Simplified MapView structure
<div className="map-container" style={{ position: 'relative' }}>
  {/* Background: static garden SVG */}
  <img src={`/maps/${map.svg_file}`} className="w-full" />

  {/* Interactive overlay: same viewBox, positioned on top */}
  <svg
    viewBox={map.viewbox}
    className="absolute inset-0 w-full h-full"
    style={{ pointerEvents: 'none' }}
  >
    <g style={{ pointerEvents: 'all' }}>
      {plants.map(plant => (
        <PlantMarker key={plant.id} plant={plant} onDragEnd={updatePosition} onTap={openQuickSheet} />
      ))}
    </g>
  </svg>
</div>
```

**2. Plant markers**

Each plant is rendered as:
```svg
<g class="plant-marker" transform="translate(280, 310)">
  <!-- Status ring (animated pulse when overdue) -->
  <circle r="14" fill="none" stroke="#C1443E" stroke-width="2" opacity="0.6">
    <animate attributeName="r" values="14;17;14" dur="2s" repeatCount="indefinite"/>
  </circle>
  <!-- Plant dot -->
  <circle r="10" fill="#C1443E33" stroke="#C1443E" stroke-width="1.5"/>
  <circle r="4" fill="#C1443E"/>
  <!-- Label -->
  <text y="22" text-anchor="middle" font-size="9" fill="currentColor">Lombok peppers</text>
</g>
```

The marker color comes from either:
- The `care_status` (red/amber/green), or
- A plant-type color when care status is "good" (so you can distinguish peppers from herbs visually)

**3. Drag and drop**

Use pointer events (not a drag library) for maximum control on mobile:

```tsx
// Pointer event approach — works on mobile and desktop
const handlePointerDown = (e: React.PointerEvent, plantId: number) => {
  e.currentTarget.setPointerCapture(e.pointerId);
  setDragState({ plantId, startX: e.clientX, startY: e.clientY });
};

const handlePointerMove = (e: React.PointerEvent) => {
  if (!dragState) return;
  const svgPoint = screenToSVG(e.clientX, e.clientY);
  updatePlantPosition(dragState.plantId, svgPoint.x, svgPoint.y);
};

const handlePointerUp = (e: React.PointerEvent) => {
  if (!dragState) return;
  // Persist to backend
  api.updatePlantPosition(dragState.plantId, currentPos.x, currentPos.y);
  setDragState(null);
};
```

The `screenToSVG` function uses `svg.getScreenCTM().inverse()` to convert pixel coordinates to SVG coordinate space — this handles any scaling from the responsive `width: 100%`.

**4. Adding new plants from the palette**

The palette sits below the map as a horizontally scrollable row of chips. Dragging a chip onto the map:
1. Shows a ghost element following the finger
2. On drop inside the map bounds → opens a "quick add" sheet with name/species/watering interval
3. Creates the plant via `POST /api/plants` with `map_id`, `map_x`, `map_y`
4. The new marker appears immediately (optimistic update)

**5. Tap to interact**

Tapping a plant marker opens the `PlantQuickSheet` — a bottom sheet with:
- Plant photo + name
- Care status ("needs water — 2 days overdue, last by Lisbeth")
- Quick action buttons: [💧 Water now] [📋 Details] [🗑 Remove]
- "Water now" calls `POST /api/care/done` and updates the marker ring color instantly

**6. Coordinate system notes**

The garden SVG uses: `viewBox="0 0 680 680"`, scale 46px = 1m, garden bounds x=162..438, y=54..625. All plant coordinates are stored in this SVG coordinate space. The `scale_info` JSON on the map record lets us convert to real-world meters if needed later.

For indoor maps, we'll create new SVGs with their own coordinate systems and store those details in the `maps` table.

---

## SVG Cleanup: Garden Map

The current `garden_map_v7.svg` needs to be split into:

**1. `garden_background.svg`** — static, no interaction
Keep: deck polygons, soil zones, gravel path, shed, tree, fences/walls, string lights, stepping stones, raised soil strip.
Remove: all dimension lines, all measurement annotations, all text labels for dimensions (6.0m, 2.5m, etc.), arrow markers for measurements, the `<mask>` element (only needed for dimension line text gaps).
Keep zone labels: "front deck", "back deck", "shed" as subtle text (these help orientation).

**2. Zone boundary data** → seed into `zones` table
Extract the polygon coordinates from the SVG for each zone:
- Front deck: `[[162,54],[438,54],[438,123],[422,123],[321,169],[162,169]]`
- Middle zone: `[[162,169],[321,169],[422,123],[438,123],[438,374],[162,374]]`
- Back deck: `[[162,374],[438,374],[438,625],[162,625]]`
- Shed: `[[346,524],[438,524],[438,625],[346,625]]`

---

## Design Direction

### Map aesthetic
- Warm earthy palette matching the current SVG: deck (#C8A96A), soil (#9B7A3A), gravel (gray)
- Plant markers are colorful dots that pop against the muted background
- Status rings use care colors: 🔴 `#C1443E` overdue, 🟡 `#D4A843` due today, 🟢 `#5B9A6F` good
- Subtle zone highlights on hover/filter (semi-transparent overlay)
- The map should feel like looking down at your garden from above — warm, natural, alive

### Plant type colors (for markers when care status is "good")

| Type     | Color     | Use case                |
| -------- | --------- | ----------------------- |
| Pot      | `#5B9A6F` | Generic potted plants   |
| Herb     | `#7AAC4A` | Basilicum, mint, etc.   |
| Pepper   | `#C1443E` | Lombok and other peppers|
| Tomato   | `#D4A843` | Tomatoes                |
| Flower   | `#D4537E` | Flowering plants        |
| Climber  | `#2D6A4F` | Ivy, jasmine, etc.      |
| Shrub    | `#639922` | Bushes, hedges          |
| Bulb     | `#B7654B` | Tulips, dahlias, etc.   |

### Mobile UX
- The map fills the viewport above the palette/nav
- Pinch-to-zoom on the map (CSS `overflow: auto` + `transform: scale()`, or a simple zoom control)
- Big tap targets on plant markers (minimum 44px touch area via transparent hit region)
- Bottom sheet for plant details (not a new page — keeps map context)
- Palette drawer can be collapsed to maximize map space

---

## File & Folder Structure

```
groei/
├── frontend/
│   ├── public/
│   │   ├── maps/
│   │   │   └── garden_background.svg    # Cleaned garden SVG (no dimensions)
│   │   ├── manifest.json
│   │   └── icons/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts               # Fetch wrapper
│   │   ├── components/
│   │   │   ├── BottomNav.tsx
│   │   │   ├── UserSwitcher.tsx
│   │   │   ├── map/
│   │   │   │   ├── MapView.tsx          # Core: background + plant overlay
│   │   │   │   ├── MapBackground.tsx    # Loads and renders the static SVG
│   │   │   │   ├── PlantsLayer.tsx      # SVG overlay with all plant markers
│   │   │   │   ├── PlantMarker.tsx      # Individual draggable plant marker
│   │   │   │   ├── PlantPalette.tsx     # Drag chips to add plants
│   │   │   │   ├── PaletteChip.tsx      # Single draggable plant type chip
│   │   │   │   ├── DragGhost.tsx        # Floating element during drag
│   │   │   │   ├── ZoneHighlight.tsx    # Semi-transparent zone overlay
│   │   │   │   └── CareOverlay.tsx      # Toggle care status visibility
│   │   │   ├── sheets/
│   │   │   │   ├── PlantQuickSheet.tsx  # Bottom sheet on plant tap
│   │   │   │   └── AddPlantSheet.tsx    # Form when dropping new plant
│   │   │   └── plants/
│   │   │       ├── PlantCard.tsx
│   │   │       └── CareHistory.tsx
│   │   ├── pages/
│   │   │   ├── MapPage.tsx              # /map/:slug — the main page
│   │   │   ├── PlantList.tsx            # /plants — flat list
│   │   │   ├── PlantDetail.tsx          # /plants/:id
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   │   ├── useMapPlants.ts          # Fetch plants for a map
│   │   │   ├── useDragDrop.ts           # Pointer event drag logic
│   │   │   ├── usePlantPosition.ts      # Optimistic position updates
│   │   │   └── useActiveUser.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   ├── svgCoords.ts             # screenToSVG, bounds checking
│   │   │   └── careStatus.ts            # Calculate status from schedules
│   │   └── styles/
│   │       └── globals.css
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
│
├── backend/
│   ├── main.py                          # FastAPI entry
│   ├── database.py                      # SQLite setup, migrations
│   ├── models.py                        # Pydantic models
│   ├── routers/
│   │   ├── maps.py
│   │   ├── plants.py
│   │   ├── care.py
│   │   └── users.py
│   ├── services/
│   │   ├── scheduling.py                # Season-adjusted interval calc
│   │   └── zones.py                     # Point-in-polygon zone detection
│   ├── static/
│   │   └── maps/
│   │       └── garden_background.svg    # Also served by backend for API consumers
│   ├── photos/
│   ├── groei.db
│   └── requirements.txt
│
├── maps/
│   └── garden_map_v7.svg               # Source SVG (with dimensions, for reference)
│
├── PLAN-phase1.md                       # This file
└── README.md
```

---

## Implementation Order

### Step 1 — Project scaffold + database (Session 1)
- [ ] Init Vite + React + TS + Tailwind frontend
- [ ] Init FastAPI backend with SQLite
- [ ] Create all tables (users, maps, zones, plants, care_schedules, care_log)
- [ ] Seed with 2 users, 1 map (garden), 4 zones (front deck, middle, back deck, shed area)
- [ ] Seed plant types as a frontend constant (not a table — just the color/label list)
- [ ] Verify: `GET /api/maps/garden` returns map info, `GET /api/maps/garden/plants` returns `[]`

### Step 2 — Clean the garden SVG (Session 1)
- [ ] Copy `garden_map_v7.svg` → `garden_background.svg`
- [ ] Strip all dimension lines, measurement text, arrow markers, and the mask element
- [ ] Keep: deck polygons, zones, shed, tree, fences, walls, string lights, stepping stones
- [ ] Keep subtle zone labels (front deck, back deck, shed)
- [ ] Verify it renders correctly in the browser
- [ ] Place in `frontend/public/maps/` and `backend/static/maps/`

### Step 3 — MapView with static background (Session 1-2)
- [ ] `MapPage.tsx`: loads map data from API, renders `MapView`
- [ ] `MapBackground.tsx`: loads the SVG file, renders as `<img>` with correct sizing
- [ ] `PlantsLayer.tsx`: transparent SVG overlay with matching viewBox, positioned absolutely on top
- [ ] Verify: map renders full-width, responsive, SVG overlay aligns with background
- [ ] Add basic mobile viewport handling (fills screen above bottom nav)

### Step 4 — Plant markers + tap interaction (Session 2)
- [ ] `PlantMarker.tsx`: renders a plant as colored circles + label at (map_x, map_y)
- [ ] Manually seed 3-4 test plants with coordinates in the database
- [ ] Render markers on the plants layer — verify they appear in the correct map positions
- [ ] Add status ring colors based on care_status
- [ ] Tap a marker → opens `PlantQuickSheet` (bottom sheet with name, status, actions)
- [ ] "Water now" button in quick sheet → calls API → updates marker ring

### Step 5 — Drag and drop from palette (Session 2-3)
- [ ] `PlantPalette.tsx`: horizontal scrollable row of `PaletteChip` components
- [ ] `PaletteChip.tsx`: pointer event handling for drag start
- [ ] `DragGhost.tsx`: follows pointer during drag
- [ ] `useDragDrop.ts` hook: manages drag state, screenToSVG conversion
- [ ] On drop inside map bounds → open `AddPlantSheet` (name, species, watering interval)
- [ ] Submit → `POST /api/plants` with map coordinates → marker appears (optimistic update)
- [ ] Test on phone via Tailscale — verify touch drag works smoothly

### Step 6 — Drag to reposition existing plants (Session 3)
- [ ] Long-press (300ms) or dedicated "move" button in quick sheet → enters drag mode
- [ ] Pointer events on PlantMarker for drag (with pointer capture)
- [ ] `usePlantPosition.ts`: optimistic local update, debounced API call
- [ ] `PUT /api/plants/{id}/position` → persists new coordinates
- [ ] Drag off map edge → confirm removal dialog
- [ ] Test repositioning on mobile

### Step 7 — Care schedules + dashboard overlay (Session 3-4)
- [ ] Care schedule CRUD when adding a plant (at minimum: watering interval)
- [ ] Season adjustment calculation in `services/scheduling.py`
- [ ] `GET /api/care/due` endpoint: all plants needing attention
- [ ] `CareOverlay.tsx`: toggle to show/hide care status rings on all markers
- [ ] Overdue markers pulse gently (CSS animation)
- [ ] `PlantQuickSheet` shows: days until next water, last watered by whom

### Step 8 — Plant list + detail page (Session 4)
- [ ] `PlantList.tsx`: flat list of all plants, sortable by status/map/name
- [ ] `PlantDetail.tsx`: full info, care schedules, care log timeline
- [ ] Navigation: map marker tap → quick sheet → "Details" → detail page
- [ ] Edit plant info from detail page
- [ ] Photo upload (camera/gallery on mobile)

### Step 9 — Polish + PWA (Session 4-5)
- [ ] Bottom nav with active states (Map | Plants | Settings)
- [ ] User switcher in settings (or top bar)
- [ ] Tailwind theming: earthy palette, warm feel
- [ ] PWA manifest + service worker
- [ ] Loading states, empty states ("no plants yet — drag one onto the map!")
- [ ] Error handling and offline resilience
- [ ] Test full flow on both phones

---

## Implementation Notes for Claude Code

### Session 1 starter prompt
```
Read PLAN-phase1.md. We're building Groei, a garden plant care app.
Start with Step 1: scaffold the project.
- Frontend: Vite + React + TS + Tailwind in frontend/
- Backend: FastAPI + SQLite in backend/
- Create all database tables from the plan
- Seed users (Leon, Lisbeth), the garden map, and 4 zones
- Set up CORS, static file serving for maps
- Verify the API starts and returns empty plant list
```

### Key patterns to maintain
- **Optimistic updates**: update React state immediately on drag/tap, sync to backend in background
- **Pointer events over drag libraries**: simpler, works better on mobile, no dependency
- **screenToSVG conversion**: critical utility — wrap `svg.getScreenCTM().inverse()` in a reusable hook
- **Bottom sheets over page navigation**: keeps map context, feels more app-like
- **SVG coordinate space**: all plant positions stored in the SVG viewBox coordinate system (0,0 to 680,680), not screen pixels

### The garden SVG cleanup checklist
Elements to KEEP in `garden_background.svg`:
- House wall rect + door rects (blue overlays)
- Front deck polygon + deck pattern
- Middle zone polygon + soil pattern
- Raised soil strip rect
- Shell/gravel path rect + gravel pattern
- Stepping stones rects
- Back deck rect + deck pattern
- Tree circles (trunk, canopy, dashed ring)
- Shed rect + window rects
- Back fence line
- Left brick wall rect + right fence rect
- String lights line + bulb circles
- Zone labels ("front deck", "back deck", "shed") — keep subtle

Elements to REMOVE:
- All `<line>` elements with `marker-start/marker-end="url(#arrow)"` (dimension lines)
- All `<text>` containing measurements (6.0 m, 2.5 m, 4.45 m, 12.4 m, 1.5 m, 2.2 m, 3.0 m, 3.25 m, etc.)
- The dimension arrow `<marker>` from `<defs>`
- The `<mask>` element (only needed for dimension text gaps)
- The `mask="url(#imagine-text-gaps...)"` attributes from remaining elements
- The verbose inline `style="..."` attributes (use classes or clean CSS vars instead)
- Door opening arc paths (nice detail but not needed for app)
- Labels like "raised soil 0.34 m", "shell path 1.25 m", "diagonal 1.4 m", "8 stones"
- "brick wall" and "fence" rotated text labels
- "back fence (slightly skewed)" text

### Mobile interaction matrix

| Action | Trigger | Result |
|--------|---------|--------|
| View map | Open app | Garden map fills screen |
| Add plant | Drag palette chip to map | Ghost follows finger → drop opens add sheet |
| View plant | Tap marker | Bottom sheet slides up with status + actions |
| Water plant | Tap marker → "Water now" | API call, ring turns green, sheet stays open |
| Move plant | Long-press marker (or "Move" button) | Marker follows finger, drop to place |
| Remove plant | Drag off map edge (or "Remove" in sheet) | Confirm dialog → plant archived |
| Switch map | Tap different map in selector | Map + plants swap |

---

## Season Adjustment Logic

```python
from datetime import date

SEASONS = {
    "spring": (3, 21, 6, 20),
    "summer": (6, 21, 9, 22),
    "autumn": (9, 23, 12, 20),
    "winter_early": (12, 21, 12, 31),
    "winter_late": (1, 1, 3, 20),
}

def get_current_season() -> str:
    today = date.today()
    md = (today.month, today.day)
    if (3, 21) <= md <= (6, 20): return "spring"
    if (6, 21) <= md <= (9, 22): return "summer"
    if (9, 23) <= md <= (12, 20): return "autumn"
    return "winter"

def effective_interval(base_days: int, season_adjust: dict | None) -> int:
    if not season_adjust:
        return base_days
    season = get_current_season()
    multiplier = season_adjust.get(season, 1.0)
    return max(1, round(base_days * multiplier))
```

---

## Default Plant Types & Care Presets

When adding a plant from the palette, pre-fill suggested care intervals:

| Palette Type | Default Water (days) | Season Adjust | Default Fertilize |
|-------------|---------------------|---------------|-------------------|
| Pot plant   | 7                   | winter: 1.5, summer: 0.7 | 21 days (spring/summer only) |
| Herb        | 3                   | winter: 2.0, summer: 0.5 | 14 days |
| Pepper      | 3                   | summer: 0.5 | 10 days |
| Tomato      | 2                   | summer: 0.5 | 10 days |
| Flower      | 5                   | winter: 2.0, summer: 0.7 | 14 days |
| Climber     | 7                   | winter: 2.0 | 21 days |
| Shrub       | 14                  | winter: 3.0, summer: 0.7 | 30 days |
| Bulb        | 10                  | winter: — (dormant) | 21 days (spring only) |

These are suggestions — the user can override when adding.

---

## Future Phases (not in scope)

- **Phase 1b**: Indoor maps (woonkamer SVG, slaapkamer SVG) — same MapView component, new backgrounds
- **Phase 2**: Plant encyclopedia + Claude AI tips integration
- **Phase 3**: Growth tracking with photo timeline per plant
- **Phase 4**: Stekjes / propagation guides, moestuin harvest tracker
- **Phase 5**: Weather API integration (Amsterdam forecast → dynamic care adjustments)
- **Phase 5**: Push notifications for overdue plants
