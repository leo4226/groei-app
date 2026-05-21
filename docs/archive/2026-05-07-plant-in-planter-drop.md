# 🌱 Groei — Feature Plan: Drop Plant Into Planter

**Goal:** When dragging a plant marker on the map, if you release it over a planter/pot object, the plant is automatically assigned as "contained in" that planter — visually nested inside it, and linked in the database.

---

## User Experience

1. User long-presses a plant marker to start dragging it
2. As they drag over a planter/pot object, the planter highlights (glow/border pulse)
3. On release:
   - If dropped **inside a planter**: plant is assigned `container_id = planter.id`, its position becomes `null` (inherits from container), and it renders nested inside the planter shape
   - If dropped **outside any planter**: plant is placed normally at that map coordinate with `container_id = null`
4. A brief toast confirms: *"Ficus moved into terracotta pot"*

---

## Visual Behavior

### During Drag
- The dragged plant marker becomes slightly translucent (`opacity: 0.7`)
- Any planter the marker hovers over gets a pulsing highlight ring:
  ```css
  box-shadow: 0 0 0 3px var(--color-primary), 0 0 12px var(--color-primary-light);
  animation: pulse 0.8s ease infinite;
  ```
- Show a small "drop here" indicator inside the highlighted planter

### After Drop Into Planter
- Plant marker renders **inside** the planter shape (centered, or offset if multiple plants share the container)
- Plant label appears below/inside the planter, not floating freely
- A small connecting dot or indent shows it belongs to the planter
- The planter shows a subtle fill or badge indicating it has a plant in it

### Multiple Plants in One Planter
- Plants stack as small dots inside the shape, like a cluster
- Tapping the planter opens a sheet showing all plants within it
- Layout: up to 4 plants fit; if more, show "+2" badge

---

## Data Model Changes

### Current `plants` table (assumed)
```sql
id          TEXT PRIMARY KEY
map_id      TEXT
name        TEXT
x           REAL   -- absolute map coordinates
y           REAL
...
```

### After This Feature
```sql
id            TEXT PRIMARY KEY
map_id        TEXT
name          TEXT
x             REAL NULL    -- null if inside a container
y             REAL NULL    -- null if inside a container
container_id  TEXT NULL REFERENCES objects(id)  -- ← NEW
...
```

**Rules:**
- If `container_id IS NOT NULL`, ignore `x`/`y` for positioning — derive position from the parent object
- If `container_id IS NULL`, use `x`/`y` as before

### Migration
```sql
ALTER TABLE plants ADD COLUMN container_id TEXT REFERENCES objects(id);
```

---

## API Changes

### `PATCH /api/plants/{id}` — update containment

Add to existing update endpoint (no new endpoint needed):

```typescript
interface PlantPatchBody {
  container_id?: string | null   // set to object id, or null to remove from container
  x?: number | null
  y?: number | null
  // ...other existing fields
}
```

When `container_id` is set, the server should also set `x = null` and `y = null`.
When `container_id` is cleared (set to `null`), the server should expect `x` and `y` to be provided.

---

## Frontend Implementation

### 1. Hit Testing — `isInsidePlanter(point, objects)`

During drag, on every `onPointerMove`, check if the current cursor position falls inside any planter object:

```typescript
function isInsidePlanter(
  point: { x: number; y: number },  // in SVG/map coordinates
  objects: MapObject[]
): MapObject | null {
  for (const obj of objects) {
    if (obj.shape === 'circle') {
      const dx = point.x - obj.x;
      const dy = point.y - obj.y;
      const r = obj.diameter_cm / 2 * SCALE;
      if (dx * dx + dy * dy <= r * r) return obj;
    } else {
      // rect / planter
      const hw = (obj.width_cm * SCALE) / 2;
      const hh = (obj.depth_cm * SCALE) / 2;
      if (
        point.x >= obj.x - hw && point.x <= obj.x + hw &&
        point.y >= obj.y - hh && point.y <= obj.y + hh
      ) return obj;
    }
  }
  return null;
}
```

> `SCALE` = pixels per cm at the current zoom level, same constant used for rendering

### 2. Drag State

Extend the existing drag state to track the hovered planter:

```typescript
const [dragState, setDragState] = useState<{
  plantId: string;
  currentX: number;
  currentY: number;
  hoveredPlanter: MapObject | null;   // ← NEW
} | null>(null);
```

### 3. Pointer Events on Plant Markers

```typescript
// PlantMarker.tsx
<g
  onPointerDown={(e) => onDragStart(plant.id, e)}
  style={{ cursor: 'grab', touchAction: 'none' }}
>
  <circle ... />
  <text ...>{plant.name}</text>
</g>
```

### 4. Global Pointer Move/Up Handlers

In `MapView.tsx` (or whichever SVG container holds the map):

```typescript
const handlePointerMove = (e: PointerEvent) => {
  if (!dragState) return;

  const svgPoint = screenToSVG(e.clientX, e.clientY);
  const hovered = isInsidePlanter(svgPoint, objects);

  setDragState(prev => ({
    ...prev!,
    currentX: svgPoint.x,
    currentY: svgPoint.y,
    hoveredPlanter: hovered,
  }));
};

const handlePointerUp = async () => {
  if (!dragState) return;

  if (dragState.hoveredPlanter) {
    // Drop into planter
    await api.patch(`/plants/${dragState.plantId}`, {
      container_id: dragState.hoveredPlanter.id,
      x: null,
      y: null,
    });
    showToast(`Moved into ${dragState.hoveredPlanter.name}`);
  } else {
    // Drop onto map ground
    await api.patch(`/plants/${dragState.plantId}`, {
      container_id: null,
      x: dragState.currentX,
      y: dragState.currentY,
    });
  }

  setDragState(null);
  refetchPlants();
};
```

### 5. Rendering Contained Plants

In `MapObject.tsx` (or wherever planters are rendered), look up plants that have `container_id === obj.id` and render them inside the shape:

```typescript
// Get plants in this container
const containedPlants = allPlants.filter(p => p.container_id === obj.id);

// Render dots inside the planter shape
containedPlants.map((plant, i) => {
  const offset = getPlantOffset(i, containedPlants.length, obj); // spread them inside
  return (
    <g key={plant.id} transform={`translate(${obj.x + offset.x}, ${obj.y + offset.y})`}>
      <circle r={5} fill={plant.color ?? '#4a7c59'} />
    </g>
  );
});
```

**`getPlantOffset` logic:**
- 1 plant → centered (0, 0)
- 2 plants → side by side (-6, 0) and (6, 0)
- 3 plants → triangle
- 4+ plants → grid, with "+N" badge for overflow

### 6. Planter Highlight During Drag

In the SVG renderer for objects, add conditional ring:

```typescript
{dragState?.hoveredPlanter?.id === obj.id && (
  <circle
    cx={obj.x}
    cy={obj.y}
    r={(obj.diameter_cm / 2 * SCALE) + 4}
    fill="none"
    stroke="var(--color-primary)"
    strokeWidth={2.5}
    className="planter-hover-ring"  // pulse animation in CSS
  />
)}
```

---

## Remove From Planter

Needed for when a user wants to take a plant out of its container.

**Option A — Drag out:** If a plant that has a `container_id` is dragged and dropped outside any planter, it's automatically removed from the container and placed at the dropped coordinates. This is automatic if you implement the drop logic above correctly.

**Option B — Edit sheet toggle:** In the plant edit sheet, show the current container (if any) with an "×" button to remove it. Tapping × sets `container_id = null` and prompts the user to place it on the map.

Implement **both** — dragging out is the most intuitive, but the edit sheet is a good fallback.

---

## Edge Cases

| Case | Behavior |
|---|---|
| Plant already in a container, dragged to a different container | Reassign `container_id` to new container |
| Plant dragged but dropped back roughly in place | If no planter hit, keep existing position (or use original coords if container_id was null) |
| Planter is full (e.g. > 6 plants) | Allow drop but show overflow badge; don't block |
| Planter deleted while plants are inside | On delete, set `container_id = null` for all contained plants, place them at the planter's last position |
| Touch drag on mobile | Use `onPointerDown/Move/Up` with `touch-action: none` — works for both touch and mouse |

---

## Claude Code Session Plan

### Session 1 — Database + API
**Prompt:**
> Add a `container_id` column to the `plants` table (nullable FK to `objects`). Update `PATCH /api/plants/{id}` to accept `container_id`, `x`, and `y`. When `container_id` is set, nullify `x` and `y`. Run the migration. Update the Plant TypeScript type to include `container_id: string | null`.

### Session 2 — Drag Hit Testing + Drop Logic  
**Prompt:**
> In `MapView.tsx`, extend the existing plant drag logic. On `pointerMove`, call `isInsidePlanter(svgPoint, objects)` and store the result in drag state. On `pointerUp`, if a planter was hovered, PATCH the plant with `container_id` set and `x/y` nulled; otherwise PATCH with `container_id: null` and the dropped map coordinates. Show a toast on success.

### Session 3 — Visual: Highlight + Nested Rendering
**Prompt:**
> When a plant is being dragged over a planter, show a pulsing highlight ring around that planter. For plants with a non-null `container_id`, render them as small colored dots inside their parent planter shape using `getPlantOffset()`. Show a "+N" badge if more than 4 plants share a container. Add a CSS `@keyframes pulse` animation for the hover ring.

### Session 4 — Remove From Container
**Prompt:**
> In the plant edit bottom sheet, if the plant has a `container_id`, show a row: "Contained in: [Planter Name] ×". Tapping × calls PATCH to set `container_id: null` and then prompts the user to tap a map location to place the plant. Also ensure that dragging a contained plant off its planter and dropping it on empty ground correctly clears `container_id` and sets the new x/y.

---

## Dependency Checklist

Before starting, confirm these exist:
- [ ] `objects` table with `id`, `x`, `y`, `shape`, `width_cm`, `depth_cm`, `diameter_cm`
- [ ] `plants` table with `id`, `map_id`, `x`, `y`, `name`, `color`
- [ ] `screenToSVG()` coordinate conversion utility
- [ ] Plant drag/move already works (long-press to drag)
- [ ] `PATCH /api/plants/{id}` endpoint exists
- [ ] Object shapes render correctly on map with correct scale

If plant drag doesn't exist yet, build basic plant move-on-map first, then layer this feature on top.
