# 🌱 Groei — Feature Plan: Viewport Fit + Landscape Garden Orientation

**Goal:** Make the app feel native to the browser — no scrolling, no overflow. The garden map should fill the available space and be rotated so the 12.4m length runs left-to-right (landscape), which is more natural for a widescreen browser.

---

## What We're Changing

1. **App layout** — the whole page fills the browser window with no overflow/scroll
2. **Map orientation** — garden is rotated 90° so 12.4m is the horizontal axis, 6m is vertical
3. **Map scaling** — the map SVG/canvas scales to fill its container while preserving aspect ratio
4. **Sidebar/panels** — right-side panel (Plants list, Object button) stays fixed, map gets the remaining space

---

## Target Layout

```
┌─────────────────────────────────────────┬──────────────┐
│                                         │  + Object    │
│                                         │              │
│         MAP (landscape, fills space)    │  PLANTS      │
│         ← 12.4m →                       │  • Monstera  │
│                                         │  • Tomatoes  │
│                                         │  • Basil     │
│                                         │              │
├────────────┬────────────┬───────────────┴──────────────┤
│    Map     │   Plants   │      +        │   Settings   │
└────────────┴────────────┴───────────────┴──────────────┘
```

The map area = full viewport height minus bottom nav height, minus any top bar.
The sidebar = fixed width (~220px), sits to the right.

---

## 1. App Shell — Fill Viewport

### `index.html` or root CSS
```css
html, body, #root {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;   /* critical — no page scroll */
}
```

### App layout container
```css
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;   /* map + sidebar, no scroll */
  min-height: 0;      /* important for flex children to shrink */
}

.map-area {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-width: 0;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  border-left: 1px solid var(--color-border);
  padding: 16px;
}

.bottom-nav {
  height: 64px;
  flex-shrink: 0;
  display: flex;
  border-top: 1px solid var(--color-border);
}
```

**React structure:**
```tsx
<div className="app-shell">
  <div className="app-body">
    <div className="map-area">
      <MapView />
    </div>
    <div className="sidebar">
      <PlantsPanel />
    </div>
  </div>
  <BottomNav />
</div>
```

---

## 2. Garden Orientation — Rotate 90°

The garden is 6m wide × 12.4m deep. In portrait it's too tall. Rotating it means:
- **Width** = 12.4m (horizontal)
- **Height** = 6m (vertical)

This gives an aspect ratio of **12.4 : 6 = ~2.07 : 1**, which fits perfectly in a landscape browser window.

### Option A — Swap width/height in the coordinate system (recommended)

Change the garden's SVG `viewBox` so it treats the garden as 12.4m × 6m from the start. All existing x/y coordinates in the database need to be transposed:

```
new_x = old_y
new_y = garden_width_m - old_x   (to keep orientation correct, not mirror)
```

This is a **one-time data migration** that swaps all plant and object x/y values.

**Migration script (run once):**
```typescript
const GARDEN_WIDTH_M = 6;

// For each plant and object:
const new_x = old_y;
const new_y = GARDEN_WIDTH_M - old_x;

await db.run(
  'UPDATE plants SET x = ?, y = ? WHERE id = ?',
  [new_x, new_y, plant.id]
);
await db.run(
  'UPDATE objects SET x = ?, y = ? WHERE id = ?',
  [new_x, new_y, obj.id]
);
```

Update garden dimensions in the DB/config:
```typescript
// Before: width = 6, height = 12.4
// After:  width = 12.4, height = 6
await db.run(
  "UPDATE maps SET width_m = 12.4, height_m = 6 WHERE id = ?",
  [gardenId]
);
```

### Option B — CSS transform rotate (simpler but hacky)

Add `transform: rotate(90deg)` to the map SVG. This is quick but causes issues with hit testing (pointer coordinates are wrong), dragging, and labels appearing sideways. **Avoid this.**

→ **Use Option A.**

---

## 3. Map SVG Scaling — Fill Container

The map SVG should always fill its container while preserving aspect ratio.

```tsx
// MapView.tsx
const MapView = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(containerRef.current!);
    return () => observer.disconnect();
  }, []);

  const gardenAspect = garden.width_m / garden.height_m; // 12.4 / 6 ≈ 2.07
  const containerAspect = size.width / size.height;

  let svgWidth, svgHeight;
  if (containerAspect > gardenAspect) {
    // Container is wider than garden — fit by height
    svgHeight = size.height;
    svgWidth = size.height * gardenAspect;
  } else {
    // Container is taller than garden — fit by width
    svgWidth = size.width;
    svgHeight = size.width / gardenAspect;
  }

  const scale = svgWidth / garden.width_m; // pixels per meter

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${garden.width_m} ${garden.height_m}`}
        style={{ display: 'block' }}
      >
        <GardenBackground />
        {objects.map(obj => <MapObject key={obj.id} obj={obj} />)}
        {plants.map(plant => <PlantMarker key={plant.id} plant={plant} />)}
      </svg>
    </div>
  );
};
```

By using a `viewBox` with real-world meters and letting SVG handle scaling, you never need a manual `SCALE` constant — SVG units **are** meters. Objects sized at `diameter_cm / 100` in SVG units automatically scale correctly.

---

## 4. Coordinate System After the Change

| Axis | Represents | Garden |
|---|---|---|
| SVG x | distance from left (west) fence | 0 → 12.4m |
| SVG y | distance from house (south) wall | 0 → 6m |

So the house/deck is at the **left** of the map, the back fence (north) is at the **right**. This matches the intuitive garden layout when standing in the house looking out.

Update `screenToSVG()` if it uses hardcoded dimensions:
```typescript
function screenToSVG(clientX: number, clientY: number, svgEl: SVGSVGElement) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
}
```
This works correctly regardless of garden orientation because it uses the SVG's own transform matrix.

---

## 5. Sidebar on Mobile (Responsive)

On narrow screens (phone), the sidebar should collapse and be accessible via the Plants tab in the bottom nav instead:

```css
@media (max-width: 768px) {
  .sidebar {
    display: none;  /* Hidden on mobile — Plants tab shows this content */
  }
}
```

---

## Claude Code Session Plan

### Session 1 — App Shell Layout
**Prompt:**
> Update the app layout so it fills the full browser viewport with no scrolling. The structure should be: full-height flex column with a body row (map area + right sidebar of 220px) and a bottom nav of 64px. Set `overflow: hidden` on html, body, #root, and the body row. The map area should take all remaining space. Use CSS flexbox, not absolute positioning.

### Session 2 — Coordinate Migration + Garden Dimensions
**Prompt:**
> Write and run a one-time migration script that rotates the garden coordinate system 90°. For every plant and object, set `new_x = old_y` and `new_y = (6 - old_x)`. Then update the garden/map record to `width_m = 12.4, height_m = 6`. Print before/after values for each item so I can verify.

### Session 3 — SVG Viewport Scaling
**Prompt:**
> Update `MapView` to use a `ResizeObserver` on its container div. Compute `svgWidth` and `svgHeight` to fill the container while preserving the garden's aspect ratio (12.4 / 6). Set the SVG `viewBox` to `"0 0 12.4 6"` so SVG units are meters. Remove any hardcoded pixel-per-meter `SCALE` constant and replace with SVG's natural scaling. Center the SVG in the container with flexbox.

---

## Summary of Changes

| What | How |
|---|---|
| App fills browser | `overflow: hidden` on root + flex layout |
| Garden rotated | One-time x/y swap in DB (Option A) |
| Map scales to fit | `ResizeObserver` + aspect-ratio-preserving SVG |
| Sidebar | Fixed 220px right panel, hidden on mobile |
| Coordinate math | Uses SVG `getScreenCTM().inverse()` — works after rotation |
