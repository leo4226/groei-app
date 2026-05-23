# PLAN: Sun Heatmap Polish

Follow-up to `PLAN-sun-heatmap.md` after first implementation. Heatmap works directionally (east-west gradient correct, seasonal variation visible, apartment block blocking morning sun) but needs fixes and visual polish.

## Known-good baseline

Confirmed working:
- Apartment block shadow caster fully blocks morning sun in Amsterdam until ~10-11am in summer — correct for a ~13m block ~12m east of the garden
- East-west gradient matches lived experience (north/left side sunniest afternoon, south/right side permanently shaded by tall fence+hedge)
- Tree shadow visible and roughly correct
- Seasonal difference (April vs August) visible in the right direction

## Issues to fix

### 1. Shed not casting shadow
Screenshot at April 14:15 shows direct sun on the ground immediately *north* of the shed (top-left of the shed rectangle in SVG coords). Sun is in the SW at that hour; shed should be casting a NE-pointing shadow. The shed is modeled as an obstacle for plant placement but not as a shadow-casting structure.

**Fix:** add the shed to the array of shadow casters used by the heatmap/shadow-polygon calculation. Use the shed's existing footprint from `gardenStructures.ts`. Height: **2.2m** (approximate flat-roof shed in the photos — check against `garden_background.svg` if a height is already defined there, otherwise use 2.2m).

### 2. Back fence not casting shadow
The back fence (east side, top of map) is ~2m tall. It's a minor contributor compared to the apartment block behind it, but it still catches the low morning sun in the narrow window before the apartment block starts blocking, and it catches very-low winter sun. Worth adding for accuracy.

**Fix:** add a thin shadow-casting line/strip along the back fence footprint. Height: **2.0m**. Width in footprint: just use the fence line at its current SVG coords with a nominal thickness (e.g. 5cm / 0.05m SVG units if the SVG is in meters, or a proportional pixel thickness).

### 3. North + south side fences
Also 1.5m tall according to user. Low enough that their effect is mostly minor during shoulder hours, but they should also be added for completeness and consistency with the other fences.

**Check first:** user believes these "are already in the app." Before adding, grep/read the shadow-casters array and confirm whether the N/S fences are included. If yes, skip this step. If no, add them with height 1.5m.

## Visual polish

### 4. CSS-rotate the map to landscape

The garden is stored as 6m (x) × 12.4m (y) — portrait in the DB. The user wants it displayed landscape for better screen space utilization, **without changing any underlying coordinates, sun math, or pointer logic.**

**Approach:** apply a CSS `transform: rotate(-90deg)` (or `rotate(90deg)` depending on which way reads more naturally) to the *rendered* SVG container only. Everything inside stays in native coordinates.

**Critical constraints:**
- Pointer events: `getScreenCTM().inverse()` already handles CSS transforms correctly, so drag/tap coordinates will continue to work. Verify this by testing a plant drag after the rotation is applied.
- The parent container needs to have its width/height swapped to accommodate the rotated SVG. Easiest: wrap the SVG in a div whose dimensions are `{ width: svgHeight, height: svgWidth }`, apply `transform-origin: center`, apply the rotation to the inner SVG.
- Text labels inside the SVG (plant names, object names) will rotate with the map. They'll end up sideways. **Counter-rotate text elements** with `transform: rotate(90deg)` on each `<text>` so labels stay readable.
- Sun arrow / direction indicators: same counter-rotation treatment if they should stay compass-accurate rather than visually-accurate.

**Compass labels:** now that the map is landscape, add small compass markers on the four edges: N (now left), E (now top), S (now right), W (now bottom). This will prevent disorientation since the SVG's "top" no longer visually corresponds to the top of the user's screen. Small text labels in `text-text-muted`, ~10px font, in each corner or along edge midpoints.

### 5. Auto-scale color ramp per month

Currently `sunHoursToColor()` maps 0-8h fixed across the ramp. In April the max observed sun hours in the garden is probably ~5h, so the 5-8h range of the color ramp is never used, compressing all the real variation into the left half of the scale.

**Fix:**
- After calculating the cell grid for the current month, compute `minHours` and `maxHours` across all cells (or use 0 and `ceil(maxHours)` — 0 as the floor feels more honest since "0 hours" is a meaningful value).
- Pass these bounds to `sunHoursToColor(hours, minBound, maxBound)` so the color is computed as `(hours - minBound) / (maxBound - minBound)`.
- Update the `HeatmapLegend` to show the dynamic bounds. Label format: `0u` on the left, `{maxHours.toFixed(0)}u+` on the right.
- Keep a small textual hint somewhere indicating the scale is month-adaptive, e.g. "Schaal aangepast per maand" below the legend in small muted text.

### 6. Switch to perceptually uniform ramp

Current ramp (navy → teal → green → amber) has a big visual jump in the green midpoint and compresses the high end. Replace with **Viridis** (or Magma if a warmer palette is preferred — Viridis is better for colorblind accessibility, Magma looks warmer/more garden-like).

**Viridis stops (hex, from 0 → 1):**
```
#440154  (dark purple)
#3B528B  (blue-purple)
#21908C  (teal)
#5DC863  (green)
#FDE725  (yellow)
```

**Magma stops (hex, from 0 → 1):**
```
#000004  (near-black)
#3B0F70  (dark purple)
#8C2981  (magenta)
#DE4968  (coral)
#FE9F6D  (orange)
#FCFDBF  (pale yellow)
```

Implementation: interpolate linearly between adjacent stops based on normalized hours. Use Magma for the warmer feel of a garden planning app — matches the existing amber accent color in `SunControls`.

**Keep `sunHoursToColor` as the single source of truth.** Both `SunHeatmap` cells and `HeatmapLegend` stops call the same function with the same bounds.

### 7. Improve suitability filter visual

When a plant-sun-profile chip is active (e.g. "Schaduw"), the suitable cells are currently highlighted with a `fillOpacity={0.25}` overlay in the profile's color. On top of an already-colored heatmap, this is nearly invisible.

**New behavior when a profile is active:**
- Dim the base heatmap to `opacity={0.3}` instead of `0.72`.
- Render suitable cells at full `opacity={0.9}` with the heatmap color (not the profile color).
- Add a **bright outline** around the suitable cells using the profile color: `stroke={profile.color}`, `strokeWidth={1.2}`, `strokeOpacity={0.85}`, no fill beyond what the heatmap already provides.
- Optional: animate the outline subtly with a 2s `stroke-dasharray` pulse to draw the eye.

This makes the suitable cells **pop** against the dimmed base while preserving the underlying sun-hours color information in those cells.

### 8. Dynamic legend labels per profile

When a profile is selected, visually mark the profile's suitable range on the legend (e.g. a bracket or colored underline from `profile.minHours` to `profile.maxHours`). This connects the chips to the legend and makes "why is this cell highlighted" self-evident.

## Files to touch

Expected changes:
- `frontend/src/utils/heatmapCalc.ts` — `sunHoursToColor()` signature (add bounds), Magma palette
- `frontend/src/utils/gardenStructures.ts` — add shed + back fence (+ maybe N/S fences) as shadow casters
- `frontend/src/components/map/SunHeatmap.tsx` — pass bounds to color fn, dim when profile active
- `frontend/src/components/map/PlantSuitabilityLayer.tsx` — outline-based highlight, no fill
- `frontend/src/components/map/HeatmapLegend.tsx` — dynamic bounds, optional profile bracket
- `frontend/src/components/map/MapView.tsx` (or wherever the SVG is rendered) — CSS rotation wrapper, compass labels
- `frontend/src/components/map/SunControls.tsx` — pass month-observed max to legend

Test checklist after changes:
- [ ] Drag a plant after rotation — position still lands where the finger/cursor is
- [ ] Shed in April at 14:15 casts shadow to the NE (upper-left of map in rotated landscape view)
- [ ] June 8am still shows ~full shade everywhere (apartment block unchanged)
- [ ] Color variation visible across the middle zone in April
- [ ] Selecting "Schaduw" clearly shows the right-side strip highlighted, left side dimmed
- [ ] Compass labels readable in their new positions
- [ ] Text labels inside map (plant names) readable not sideways

## Claude Code session starter prompt

> Read `PLAN-sun-heatmap-polish.md`. It covers 8 fixes/improvements to the existing sun heatmap: shed shadow, back fence shadow, N/S fence check, CSS map rotation, auto-scale color ramp, Magma palette, suitability filter visual, and dynamic legend. Work through sections 1-8 in order. After each section, summarize what you changed and flag anything that surprised you before continuing. Before starting, read the current `gardenStructures.ts`, `heatmapCalc.ts`, `SunHeatmap.tsx`, `PlantSuitabilityLayer.tsx`, `HeatmapLegend.tsx`, `SunControls.tsx`, and the map rendering component to confirm file structure matches the plan.

