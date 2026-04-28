# 🌡️ Groei — Feature Plan: Sun Hours Heatmap & Seasonal Planting Zones

**Depends on:** `PLAN-sun-position.md` (Phase 1) must be fully implemented first.

**Goal:** Show which parts of the garden receive how many hours of direct sunlight per day, for any chosen month. Rendered as a color gradient overlay on the garden map. Use this data to recommend optimal planting zones for specific plant types.

---

## What the Feature Looks Like

A new mode within the Sun tab called **"Sun Map"** (toggle alongside the existing real-time shadow view).

When active:
1. **Heatmap overlay** — the garden floor is divided into a grid of cells, each colored by daily sun hours for the selected month. Deep blue/purple = full shade, warm yellow/orange = full sun.
2. **Legend** — a color scale bar: `0h ── 2h ── 4h ── 6h ── 8h+`
3. **Month selector** — same month tabs from Phase 1, now driving the heatmap calculation
4. **Plant suitability toggle** — overlay icons or zone outlines showing where specific plant types can thrive based on their sun requirements
5. **Tap a cell** — shows exact hours for that spot: "This spot gets ~4.2h direct sun in July"

---

## Architecture

### New files to create

```
frontend/src/
├── components/
│   └── sun/
│       ├── SunHeatmap.tsx           # Renders the colored grid overlay
│       ├── HeatmapLegend.tsx        # Color scale bar
│       ├── PlantSuitabilityLayer.tsx # Zone outlines for plant types
│       └── SunModeToggle.tsx        # Toggle between Live and Heatmap modes
├── hooks/
│   └── useSunHeatmap.ts            # Computes heatmap data for a given month
├── utils/
│   └── heatmapCalc.ts              # Core grid calculation logic
└── constants/
    └── plantSunRequirements.ts      # Sun hour requirements per plant category
```

### Existing files to modify

```
frontend/src/
├── components/sun/
│   └── SunControls.tsx             # Add Live/Heatmap toggle
├── pages/
│   └── MapPage.tsx                 # Render SunHeatmap when heatmap mode active
```

---

## Core Calculation: How the Heatmap Works

The heatmap is computed **once per month selection** and cached. It does not update in real time.

### Algorithm

For a given month M:

1. **Pick a representative day** — use the 15th of the month (e.g. July 15)
2. **Sample sun positions** — compute sun altitude + azimuth every 10 minutes from sunrise to sunset (~80–100 samples for a summer day)
3. **Divide the garden floor into a grid** — e.g. 30×75 cells at 20cm × 20cm resolution
4. **For each time sample × each grid cell:**
   - Compute shadow polygons for all structures (reuse `shadowGeometry.ts` from Phase 1)
   - Check if this cell's center point falls inside any shadow polygon
   - If not in shadow → cell accumulates +10 minutes of sun
5. **Result:** each cell has a value 0–N hours of direct sun for that representative day
6. **Render** as a colored rectangle for each cell

### Performance

With ~90 time samples × ~2250 grid cells = ~202,500 point-in-polygon checks per month calculation. This is fast enough to run synchronously in ~100–300ms on a modern phone. If it feels slow, run it in a `useEffect` with a loading spinner, or use a Web Worker.

```ts
// utils/heatmapCalc.ts

export interface HeatmapCell {
  x: number;        // SVG x of cell top-left
  y: number;        // SVG y of cell top-left
  width: number;    // cell width in px
  height: number;   // cell height in px
  sunHours: number; // 0–14
}

export function computeHeatmap(
  month: number,              // 1–12
  gardenBoundary: [number, number][],  // SVG polygon of garden floor
  shadowCasters: ShadowCaster[],
  gridResolutionM: number = 0.2,       // 20cm grid
  svgScale: number = 46,
): HeatmapCell[]
```

### Sampling interval trade-off

| Interval | Samples (summer) | Calc time (est.) | Accuracy |
|----------|-----------------|------------------|----------|
| 30 min   | ~30             | ~50ms            | Rough    |
| 10 min   | ~90             | ~150ms           | Good     |
| 5 min    | ~180            | ~300ms           | Excellent|

Start with 10-minute intervals. Add a quality setting in Phase 2b if needed.

---

## Color Scale

Map sun hours to a perceptually uniform color scale:

```ts
// utils/heatmapCalc.ts

export function sunHoursToColor(hours: number, maxHours: number): string {
  const t = Math.min(hours / maxHours, 1); // 0–1
  // Interpolate through: deep blue → teal → green → yellow → orange
  // Use a 5-stop gradient matching garden/nature aesthetics
}
```

Suggested color stops (matches the garden's natural tones):

| Hours | Color | Label |
|-------|-------|-------|
| 0h    | `#1a2744` deep navy | Full shade |
| 2h    | `#2d5a6b` teal-dark | Deep shade |
| 4h    | `#4a8c6f` sage green | Partial shade |
| 6h    | `#c8a830` warm gold | Partial sun |
| 8h+   | `#f0a020` deep amber | Full sun |

These colors layer naturally over the brown/green garden SVG without clashing.

---

## `SunHeatmap.tsx` Component

```tsx
export function SunHeatmap({ month }: { month: number }) {
  const { cells, isCalculating } = useSunHeatmap(month);

  if (isCalculating) return <HeatmapLoadingOverlay />;

  const maxHours = Math.max(...cells.map(c => c.sunHours));

  return (
    <g className="heatmap-layer" style={{ pointerEvents: 'none' }}>
      {cells.map((cell, i) => (
        <rect
          key={i}
          x={cell.x}
          y={cell.y}
          width={cell.width}
          height={cell.height}
          fill={sunHoursToColor(cell.sunHours, maxHours)}
          opacity={0.72}
        />
      ))}
    </g>
  );
}
```

The opacity of 0.72 lets the garden structure lines (paths, zones, plant markers) show through underneath.

---

## `useSunHeatmap.ts` Hook

```ts
export function useSunHeatmap(month: number) {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    setIsCalculating(true);
    // Run in next tick so loading state renders first
    setTimeout(() => {
      const result = computeHeatmap(month, GARDEN_BOUNDARY, SHADOW_CASTERS);
      setCells(result);
      setIsCalculating(false);
    }, 0);
  }, [month]);

  return { cells, isCalculating };
}
```

Cache results per month in a `Map<number, HeatmapCell[]>` so switching back to a previously viewed month is instant.

---

## Plant Suitability Layer

### Sun requirement categories

```ts
// constants/plantSunRequirements.ts

export interface PlantSunProfile {
  id: string;
  label: string;
  emoji: string;
  minHours: number;   // minimum direct sun hours per day
  maxHours: number;   // maximum before stress (some plants dislike scorching)
  color: string;      // outline color for zone display
}

export const PLANT_SUN_PROFILES: PlantSunProfile[] = [
  {
    id: 'full_sun',
    label: 'Full sun',
    emoji: '☀️',
    minHours: 6,
    maxHours: 14,
    color: '#f0a020',
    // Examples: peppers, tomatoes, lavender, rosemary
  },
  {
    id: 'partial_sun',
    label: 'Partial sun',
    emoji: '⛅',
    minHours: 3,
    maxHours: 6,
    color: '#7ab87a',
    // Examples: lettuce, spinach, herbs, geranium
  },
  {
    id: 'partial_shade',
    label: 'Partial shade',
    emoji: '🌤️',
    minHours: 1,
    maxHours: 4,
    color: '#4a8c9f',
    // Examples: ferns, hostas, impatiens
  },
  {
    id: 'full_shade',
    label: 'Full shade',
    emoji: '🌑',
    minHours: 0,
    maxHours: 2,
    color: '#2d4a6b',
    // Examples: ivy, moss, some ferns
  },
];
```

### `PlantSuitabilityLayer.tsx`

When a user selects a plant profile (e.g. "Show me where I can grow peppers"), outline all cells that fall within that profile's sun range:

```tsx
export function PlantSuitabilityLayer({
  cells,
  profile,
}: {
  cells: HeatmapCell[];
  profile: PlantSunProfile;
}) {
  const suitableCells = cells.filter(
    c => c.sunHours >= profile.minHours && c.sunHours <= profile.maxHours
  );

  // Merge adjacent cells into a single outline polygon for clean rendering
  // (simple approach: just render with a colored border, no fill)
  return (
    <g className="suitability-layer" style={{ pointerEvents: 'none' }}>
      {suitableCells.map((cell, i) => (
        <rect
          key={i}
          x={cell.x} y={cell.y}
          width={cell.width} height={cell.height}
          fill={profile.color}
          fillOpacity={0.25}
          stroke={profile.color}
          strokeWidth={0.5}
          strokeOpacity={0.6}
        />
      ))}
    </g>
  );
}
```

---

## UI Flow

```
Sun tab active
  │
  ├─ [Live ●] [Sun Map]   ← toggle in SunControls
  │
  └─ Sun Map mode:
       │
       ├─ Month tabs: [Jan][Feb]...[Dec]
       │
       ├─ Garden map with heatmap overlay
       │
       ├─ "Show zones for:" dropdown or chip row:
       │    [☀️ Full sun] [⛅ Partial] [🌑 Shade]
       │    → activates PlantSuitabilityLayer
       │
       └─ Tap any cell → tooltip: "~4.2h sun · July 15"
```

---

## Integration with Existing Plant Data

Phase 2b (optional): Cross-reference the heatmap with plants already placed on the map.

- For each plant marker, look up its sun requirement from `plantTypes.ts`
- Compare to the heatmap cell it sits on
- If mismatch → show a small warning indicator on the plant marker: "⚠️ This pepper is getting only 3.1h sun"
- If well-matched → show a subtle ✓

This turns the heatmap from a planning tool into an ongoing diagnostic tool.

---

## Garden Boundary Definition

The heatmap only fills the actual garden floor (soil + deck areas), not the house or structures. Define the garden boundary as an SVG polygon that Claude Code extracts from `garden_background.svg`:

```ts
// constants/gardenStructures.ts (addition)

export const GARDEN_FLOOR_BOUNDARY: [number, number][] = [
  // SVG polygon points tracing the outer edge of all walkable/plantable garden area
  // Claude Code: extract these from the existing garden_background.svg zones
];
```

Cells outside this boundary are skipped entirely during computation.

---

## Claude Code Session Starter

```
Read PLAN-sun-heatmap.md. Phase 1 (PLAN-sun-position.md) is already implemented.

We're adding the Sun Hours Heatmap feature to the Groei garden app.

Start with Steps 1–3:
1. Create heatmapCalc.ts — implement computeHeatmap() using the existing 
   shadowGeometry.ts and gardenStructures.ts from Phase 1
2. Create useSunHeatmap hook with per-month caching
3. Create SunHeatmap.tsx component and wire it into MapPage behind the 
   existing Sun mode toggle (add a Live/Map sub-toggle to SunControls)

Test by selecting July — the back of the garden (east, near shed) should 
show the most sun hours. The area immediately in front of the house wall 
(west side) should show the least, especially in winter months.

Do not modify any Phase 1 sun overlay files. Extend only, never replace.
```

---

## Expected Results by Season

Based on the garden orientation (east-facing, house wall to west):

| Zone | June | December |
|------|------|----------|
| Back bed (east, near shed) | 7–9h | 2–3h |
| Middle bed (center) | 5–7h | 1–2h |
| Front deck (near house wall) | 2–4h | 0–1h |
| Left strip (north fence) | 4–6h | 1–2h |
| Gravel area | 5–7h | 1–2h |

These estimates account for the house wall blocking western sun and the big tree casting moving shade through the day. The heatmap should broadly confirm these numbers — if it doesn't, the shadow caster coordinates or heights need adjustment.

---

## Phase 2b Ideas (Future)

- **Annual sun report** — total sun hours per zone across the full year, downloadable as a simple summary
- **Best planting date advisor** — "Your pepper zone will get 6h+ sun from May 10 onwards"
- **Shadow animation** — play back a full day's shadow movement as a time-lapse on the map
- **Compare years** — sun hours this month vs same month last year (not meaningful unless user changes structures, but useful after e.g. pruning the big tree)
