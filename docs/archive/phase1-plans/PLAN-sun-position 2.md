# 🌞 Groei — Feature Plan: Sun Position & Shadow Overlay

**Goal:** Add a Sun tab to the garden map that shows, in real time or at any chosen date/time, where the sun is and which parts of the garden are in shade — calculated for the exact garden location in Amsterdam.

---

## Context

- **Garden location:** 52.3715°N, 4.8499°E (Amsterdam, Hoofdweg 358)
- **Garden orientation:** Garden faces **east** (slight tilt toward northeast). The house wall is to the west. The back fence is to the east.
- **Garden dimensions:** ~6m wide × ~14.9m deep (from architect drawings)
- **Key shadow casters:** House/extension wall (west), skylight roof extension (northwest corner of front deck), poplar tree (top-left/northwest corner of garden), shed (northeast corner, back-right), left fence (north), right fence (south), neighbor's tall tree (outside south fence, ~7-8m from fence line)
- **Scale in SVG:** 46px per meter (from existing map constants)

All sun math runs **purely in the browser** — no API needed. The SunCalc algorithm is a well-known open-source JS library (~3KB) that computes solar position from lat/lng + datetime.

---

## What the Feature Looks Like

A new tab in the bottom nav: **☀️ Sun** (or toggle button within MapPage).

When active, the map gains:
1. **Sun direction indicator** — an arrow or radial glow at the edge of the map showing where the sun is coming from (azimuth)
2. **Shadow polygons** — semi-transparent dark overlays on the map showing shaded areas from each structure
3. **Time slider** — horizontal scrubber at the bottom: 06:00 → 21:00 (Amsterdam summer range)
4. **Date picker** — month tabs or a date input (Jan–Dec) to jump to any season
5. **"Now" button** — snaps to current real time and date
6. **Sun arc indicator** — small compass/arc widget in the corner showing today's sun path (rise azimuth → culmination → set azimuth)

---

## Architecture

### New files to create

```
frontend/src/
├── components/
│   └── sun/
│       ├── SunOverlay.tsx          # Main overlay component, renders on MapView
│       ├── ShadowLayer.tsx         # SVG polygons for each structure's shadow
│       ├── SunDirectionArrow.tsx   # Animated arrow showing sun azimuth
│       ├── SunArcWidget.tsx        # Small compass showing today's sun path
│       └── SunControls.tsx         # Time slider + date picker + Now button
├── hooks/
│   └── useSunPosition.ts          # Computes sun altitude+azimuth reactively
├── utils/
│   └── sunCalc.ts                 # Pure SunCalc algorithm (no external lib needed)
│   └── shadowGeometry.ts          # Converts sun position → shadow polygon coords
└── constants/
    └── gardenStructures.ts        # Dimensions + positions of each shadow caster
```

### Existing files to modify

```
frontend/src/
├── pages/
│   └── MapPage.tsx                # Add SunOverlay + SunControls when sun mode active
├── components/
│   └── BottomNav.tsx              # Add Sun tab icon
├── types/
│   └── index.ts                   # Add SunState type
```

---

## Implementation Steps

### Step 1 — Install SunCalc & create `sunCalc.ts`

Install the `suncalc` npm package (or copy the ~150-line algorithm directly into `sunCalc.ts` to avoid a dependency).

```ts
// utils/sunCalc.ts
export interface SunPosition {
  azimuth: number;   // radians from south, clockwise. 0=S, π/2=W, π=N, -π/2=E
  altitude: number;  // radians above horizon. 0=horizon, π/2=zenith
}

export function getSunPosition(date: Date, lat: number, lng: number): SunPosition
export function getSunTimes(date: Date, lat: number, lng: number): { sunrise: Date, sunset: Date, solarNoon: Date }
```

Use the existing suncalc library or implement the core math directly. The azimuth from suncalc is measured from south, clockwise — convert to compass bearing (from north) for display.

**Garden constants (hardcode these):**
```ts
export const GARDEN_LAT = 52.3715;
export const GARDEN_LNG = 4.8499;
```

---

### Step 2 — `useSunPosition.ts` hook

```ts
// hooks/useSunPosition.ts
export function useSunPosition(date: Date) {
  // Returns { azimuth, altitude, isAboveHorizon, azimuthDeg, altitudeDeg }
  // Recomputes whenever date changes
  // azimuthDeg: 0=North, 90=East, 180=South, 270=West
}
```

---

### Step 3 — `gardenStructures.ts` — define shadow casters

Each structure needs:
- Its position in SVG coordinates (px)
- Its height in meters (for shadow length calculation)
- Its footprint polygon

```ts
// constants/gardenStructures.ts

export interface ShadowCaster {
  id: string;
  label: string;
  heightM: number;                   // real-world height in meters
  footprint: [number, number][];     // SVG polygon points [x, y][]
  isOutsideGarden?: boolean;         // true for structures outside the garden boundary
  distanceFromFenceM?: number;       // for outside structures: distance from garden fence
}

export const SHADOW_CASTERS: ShadowCaster[] = [
  {
    id: 'house_wall',
    label: 'House wall + extension',
    // From architect drawings: extension roof at exactly +3200mm above peil
    // This is the dominant evening shadow caster — blocks all western/sunset sun
    heightM: 3.2,
    footprint: [/* SVG coords of the full back wall of house+extension — read from garden_background.svg */],
  },
  {
    id: 'skylight_roof',
    label: 'Skylight roof extension',
    // The angled glass skylight sits on the NW corner of the front deck
    // Its apex is at the same roof level as the extension (~3.2m)
    // Casts shadow into the gravel/middle zone in the morning
    heightM: 3.2,
    footprint: [/* angled skylight footprint — read from garden_background.svg */],
  },
  {
    id: 'own_apartment',
    label: 'Own apartment building',
    // 4 storeys: ground floor ~3.2m (extension level) + 3 upper floors × 2.8m = ~11.6m
    // Sits directly behind/above the house wall — relevant for blocking high summer sun
    // in the late afternoon when sun arc is still high but moving west
    heightM: 12,
    footprint: [/* same x-extent as house wall, but this is the full building above — 
                   treat as same footprint as house_wall for shadow projection purposes */],
  },
  {
    id: 'poplar_tree',
    label: 'Own poplar tree (NW corner)',
    // ~70-year-old poplar, confirmed 24m tall
    // Located in the TOP-LEFT (northwest) corner of the garden in SVG coords
    // IMPORTANT: because the sun travels east→south→southwest (top→right→bottom-right 
    // in SVG), this tree mostly casts shadow OUTSIDE the garden or along the north 
    // fence. Its impact on the main garden area is minimal. Include it but don't 
    // expect it to be a major factor.
    heightM: 24,
    footprint: [/* circle around trunk, radius ~1.5m — read trunk position from garden_background.svg */],
  },
  {
    id: 'shed',
    label: 'Shed',
    // Sits in the TOP-RIGHT (northeast) corner, flush against back and right fences
    // Casts shadow westward into the back deck in the morning
    heightM: 2.3,
    footprint: [/* shed rectangle — read from garden_background.svg */],
  },
  {
    id: 'left_fence',
    label: 'North fence',
    // Left side of garden in SVG = north in real world
    // Confirmed height: 1.5m
    heightM: 1.5,
    footprint: [/* fence line along left/north edge — read from garden_background.svg */],
  },
  {
    id: 'right_fence',
    label: 'South fence',
    // Right side of garden in SVG = south in real world
    // Confirmed height: 1.5m
    heightM: 1.5,
    footprint: [/* fence line along right/south edge — read from garden_background.svg */],
  },
  {
    id: 'neighbor_tree_south',
    label: "Neighbor's tree (south, outside garden)",
    // Large tree in the garden DIRECTLY TO THE SOUTH (right side in SVG)
    // NOT the neighbor to the east — this is the neighbor sharing the right/south fence
    // Confirmed ~19m tall, located roughly in the middle of their garden
    // Their garden is approximately the same size as ours (~15m deep)
    // So the trunk is ~7-8m from our shared south fence
    // 
    // This is a KEY afternoon shadow caster: as the sun moves from east → south → 
    // southwest, this tree intercepts the sun and casts shadow northward into our 
    // garden from roughly midday onward, coming in from the RIGHT side of the SVG map.
    //
    // Shadow behavior: shadow falls LEFT (northward, SVG left) when sun is in the south
    heightM: 19,
    isOutsideGarden: true,
    distanceFromFenceM: 7.5,   // ~middle of neighbor's ~15m garden
    // Position the footprint just outside the right/south fence at mid-garden depth
    footprint: [/* point/small circle just outside right fence, at mid-depth of garden 
                   in SVG coords — Claude Code: calculate this from fence position + 
                   7.5m offset converted to SVG pixels (7.5 × 46 = 345px outside fence) */],
  },
  {
    id: 'eastern_building',
    label: 'Eastern apartment building (behind back fence)',
    // 4-storey building, same height as own building (~12m)
    // Located behind neighbor's garden to the east:
    //   our garden (~15m) + shared fence + neighbor's garden (~15m) = ~30m from our back fence
    // At 30m distance, this building only casts shadow into our garden when sun altitude
    // is below ~22°, which in Amsterdam only occurs in the first ~45min after sunrise
    // and similarly before sunset. Nearly irrelevant for most of the day/year.
    // Include for completeness but shadow impact will be minimal.
    heightM: 12,
    isOutsideGarden: true,
    distanceFromFenceM: 30,
    footprint: [/* line/rectangle beyond back/east fence at 30m offset */],
  },
];
```

**Important:** The SVG coordinates for all structures inside the garden come from the existing `garden_background.svg`. Claude Code must read the SVG first to extract exact coordinates rather than guessing. For outside structures (`isOutsideGarden: true`), calculate their SVG position by taking the fence edge coordinate and adding `distanceFromFenceM × svgScale` pixels in the appropriate direction.

---

### Step 4 — `shadowGeometry.ts` — compute shadow polygons

This is the core math. For each shadow caster:

1. Convert sun azimuth to a 2D direction vector on the ground plane
2. Shadow length = `heightM / tan(altitude)` — when sun is low, shadows are long
3. Project each vertex of the footprint polygon by `shadowLength` in the shadow direction
4. Union the footprint + projected polygon = the shadow shape
5. Clip to the garden boundary so shadows don't extend outside

```ts
// utils/shadowGeometry.ts

export function computeShadowPolygon(
  caster: ShadowCaster,
  sunAzimuthDeg: number,   // 0=N, 90=E, 180=S, 270=W
  sunAltitudeDeg: number,  // degrees above horizon
  svgScale: number,        // px per meter (46)
): [number, number][] | null {
  // Returns null if sun is below horizon (no shadow)
  // Returns SVG polygon points
}
```

**Shadow direction:** The shadow falls *opposite* to the sun direction. If sun is at azimuth 90° (east), shadow falls west (270°).

**Key formula:**
```
shadowLengthMeters = heightM / Math.tan(altitudeRad)
shadowLengthPx = shadowLengthMeters * svgScale
shadowDirX = -Math.sin(azimuthRad)   // opposite of sun direction
shadowDirY = Math.cos(azimuthRad)    // in SVG space (y increases downward)
```

Note the SVG y-axis is inverted — adjust the direction vector accordingly.

---

### Step 5 — `ShadowLayer.tsx`

```tsx
// components/sun/ShadowLayer.tsx

export function ShadowLayer({ sunPosition }: { sunPosition: SunPosition }) {
  if (sunPosition.altitude <= 0) return null; // night

  const shadows = SHADOW_CASTERS.map(caster => ({
    id: caster.id,
    polygon: computeShadowPolygon(caster, sunPosition.azimuthDeg, sunPosition.altitudeDeg, SVG_SCALE),
  })).filter(s => s.polygon !== null);

  return (
    <g className="shadow-layer" style={{ pointerEvents: 'none' }}>
      {shadows.map(s => (
        <polygon
          key={s.id}
          points={s.polygon!.map(([x,y]) => `${x},${y}`).join(' ')}
          fill="rgba(15, 25, 40, 0.45)"
          style={{ transition: 'all 0.3s ease' }}  // smooth as slider moves
        />
      ))}
    </g>
  );
}
```

The shadows transition smoothly as the time slider moves — this is what makes it feel alive.

---

### Step 6 — `SunDirectionArrow.tsx`

A decorative compass indicator at the top of the map (or overlaid on the map edge) showing:
- Current sun azimuth as a yellow arrow pointing FROM the sun toward the garden center
- Labeled with the current time and altitude ("☀️ 15:42 — 40° above horizon")

```tsx
// Simple SVG arc + arrow, placed in the top-right corner of the map
// Rotates as azimuth changes
```

---

### Step 7 — `SunControls.tsx`

Bottom control panel, appears when Sun mode is active. Sits above the bottom nav.

```
┌─────────────────────────────────────────┐
│  [Jan][Feb][Mar][Apr][May][Jun]...       │  ← month tabs (scrollable)
│  ━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━  │  ← time slider 06:00–21:00
│  06:00        12:00              21:00   │
│                        [NOW]            │
└─────────────────────────────────────────┘
```

State: `{ month: number, day: number, hour: number, minute: number }`

The "NOW" button sets state to `new Date()` values. Otherwise the user can scrub freely.

---

### Step 8 — Wire into `MapPage.tsx`

```tsx
// MapPage.tsx additions

const [sunMode, setSunMode] = useState(false);
const [sunTime, setSunTime] = useState(new Date());
const sunPosition = useSunPosition(sunTime);

// In the SVG map render:
{sunMode && <ShadowLayer sunPosition={sunPosition} />}
{sunMode && <SunDirectionArrow sunPosition={sunPosition} />}

// Below the map:
{sunMode && <SunControls time={sunTime} onChange={setSunTime} />}
```

Add a sun toggle button in the MapPage toolbar (next to existing controls):
```tsx
<button onClick={() => setSunMode(v => !v)} className={sunMode ? 'active' : ''}>
  ☀️
</button>
```

---

## Garden Orientation Notes for Claude Code

The garden's orientation in the SVG coordinate system:

- **SVG top** = garden back = **East** (back fence, shed)
- **SVG bottom** = house wall = **West**  
- **SVG left** = North fence
- **SVG right** = South fence

This means:
- Morning sun (east/SVG top) shines INTO the garden from the back — minimal house shadow
- Afternoon sun moves to south/southwest — house wall starts casting shadow into garden from SVG bottom
- Evening sun (west) is blocked entirely by the house wall

The shadow direction vector must account for this rotation. When converting sun azimuth to SVG space:
```ts
// Sun at azimuth 90° (east, SVG top) → shadow falls west (SVG bottom, positive Y)
// Sun at azimuth 180° (south, SVG right) → shadow falls north (SVG left, negative X)
// SVG north = left, east = top, south = right, west = bottom
const svgShadowDirX = Math.sin(azimuthRad);   // east=top means x maps to sin
const svgShadowDirY = -Math.cos(azimuthRad);  // adjust for SVG y-inversion + rotation
```

Claude Code should verify this by testing: at 09:00 in summer (sun ~SE, azimuth ~120°), the house shadow should fall INTO the garden (toward SVG top). At 15:00 (sun ~SW, azimuth ~230°), the shadow from the left/north fence should fall into the main bed.

---

## npm dependency

```bash
npm install suncalc
npm install --save-dev @types/suncalc
```

Or copy the suncalc source directly into `utils/sunCalc.ts` to avoid the external dependency.

---

## Claude Code Session Starter

```
Read PLAN-sun-position.md carefully, paying attention to the structure heights and 
positions section.

We're adding a Sun Position & Shadow Overlay feature to the existing Groei garden app.

Garden orientation: faces east (house wall is west/SVG bottom, back fence is east/SVG top)
Garden location: 52.3715°N, 4.8499°E

Key structure facts (all confirmed, hardcode these):
- House wall + extension: 3.2m (from architect drawings)
- Own apartment building above: 12m (4 storeys)
- Own poplar tree: 24m tall, TOP-LEFT corner of SVG — minimal garden impact
- Shed: 2.3m, TOP-RIGHT corner of SVG
- North fence (SVG left): 1.5m
- South fence (SVG right): 1.5m  
- Neighbor's tree (SOUTH, outside right fence): 19m tall, ~7.5m outside the south fence
  at mid-depth — this is the main afternoon shadow caster, NOT the east neighbor
- Eastern building (behind back fence): 12m tall, ~30m away — minimal impact

Start with Steps 1–3:
1. Install suncalc (or inline the algorithm in utils/sunCalc.ts)
2. Create useSunPosition hook
3. Create gardenStructures.ts — read garden_background.svg first to extract exact SVG
   coordinates for all internal structures. For outside structures (neighbor tree, 
   eastern building), calculate position from fence edge + distance offset in SVG pixels.

Do not touch any existing map functionality. All new code goes in new files.
Confirm the coordinate extraction before moving to shadow geometry.
```

---

## Phase 2 (optional, later)

- **Sun hours heatmap:** For a chosen month, show which garden zones get N hours of direct sun per day (averaged) — rendered as a color gradient overlay (deep green = full shade, bright yellow = full sun). Very useful for deciding where to plant vegetables.
- **Seasonal comparison:** Side-by-side summer vs winter shadow overlay.
- **Optimal planting zones:** Highlight areas that get 6+ hours of sun (suitable for peppers, tomatoes) vs partial shade zones.
