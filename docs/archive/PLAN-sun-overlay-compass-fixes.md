# PLAN: Sun Debug Overlay & Compass Fixes

**Status:** Small follow-up to `PLAN-sun-model-correction.md`. Targets
three visualization bugs discovered during photo-match validation on
2026-04-23 after the landscape migration landed.

**Scope:** UI/overlay fixes only. No changes to shadow math, casters,
or plant positions. The underlying physics model was validated correct
by the 13:15 test.

## Validation context (for grounding)

After the landscape migration, loading the app at
`?debug=sun` with the timeline set to 19 Apr 13:15 produced this
picture:

- Shadow polygons on the map fall correctly: wooden fence shadow
  extends northward (toward brick wall), back fence shadow extends
  westward (toward house), poplar shadow extends house-ward. This is
  physically correct for sun at az=171° alt=48°.
- **But:** the debug overlay's own yellow sun arrow reports
  `az=291° alt=0°` (sunset) and the grey shadow arrow matches that
  stale position. The arrows do not agree with the shadow polygons
  beneath them.
- The overlay's corner compass rose shows N pointing straight up,
  ignoring the fact that true north is 22° anticlockwise of SVG-top.
- The app's main `GardenCompass` widget (top-right of the map) has
  the E and W labels swapped — a separate pre-existing bug surfaced by
  this cross-check.

None of these invalidate the migration. They're visualization wiring
errors.

## Fix 1 — `SunDebugOverlay` reads from the wrong sun-position source

**Symptom:** Timeline slider drives the shadow polygons correctly but
leaves the debug arrows stuck at "now" (roughly az=291° alt=0° at the
time of the screenshot).

**Likely cause:** the overlay calls something like
`SunCalc.getPosition(new Date(), lat, lon)` directly, instead of
subscribing to the same store/context/hook that `ShadowLayer` uses.
The timeline's simulated timestamp isn't reaching the overlay.

**Fix:**
1. Open `src/components/SunDebugOverlay.tsx`. Find where it derives
   its sun position.
2. Identify the sun-position source used by `ShadowLayer` (probably
   a hook like `useSunPosition()` in `src/hooks/` or a context
   provider, or a zustand/redux slice). Grep for where `ShadowLayer`
   gets its `shadows` prop from — follow the chain back to the
   timestamp source.
3. Replace the overlay's direct `SunCalc` call with the same source,
   so both paths observe the same `(date, az, alt)` triple.
4. Verify: move the timeline slider; the overlay arrows should now
   update in real time and always agree with the shadow polygons.

Include the `az` and `alt` values in the overlay's text label so the
agreement is visible numerically, not just angularly.

## Fix 2 — Debug overlay compass ignores `GARDEN_SVG_TOP_AZIMUTH`

**Symptom:** The "N top" compass rose in the overlay's top-left corner
has N pointing straight up. With `GARDEN_SVG_TOP_AZIMUTH = 22`, true
north is 22° anticlockwise of SVG-up, so N should tilt that far
anticlockwise.

**Fix:** In `SunDebugOverlay.tsx`, find the `<g>` (or equivalent)
that renders the compass rose. Apply a rotation:

```tsx
import { GARDEN_SVG_TOP_AZIMUTH } from '../utils/gardenStructures'

// Around the compass rose group, rotate so N points at compass north,
// not SVG-top. Rotating by -GARDEN_SVG_TOP_AZIMUTH around the compass's
// centre takes SVG-up → true north.
<g transform={`rotate(${-GARDEN_SVG_TOP_AZIMUTH} ${cx} ${cy})`}>
  {/* N arrow, cardinal labels */}
</g>
```

Cardinal labels (N/E/S/W) should ride the rotation, not counter-rotate
— the point is that N visually indicates true north on the map.

Sanity check: after the fix, with `GARDEN_SVG_TOP_AZIMUTH = 22`, N
should tilt ~22° anticlockwise from vertical (pointing up-and-slightly-
left), and E should appear in the lower-right of the rose, 90° CW from
N.

## Fix 3 — App `GardenCompass` has E and W swapped

**Symptom:** The compass widget in the top-right of the map shows the
east label where west should be and vice versa. The tilt direction
(anticlockwise to indicate NNE) is correct, only the E/W letters are
flipped.

**Likely cause:** a sign error in the angle used to position the
cardinal labels — e.g. using `+90` instead of `-90`, or the cardinals
being arranged clockwise in one place and anticlockwise in another.

**Fix:**
1. Open `src/components/GardenCompass.tsx` (or wherever the widget
   lives — grep for "GardenCompass" usage).
2. Find where E and W are positioned. It's probably a table like
   `[{ label: 'N', angle: 0 }, { label: 'E', angle: 90 }, ...]` or a
   loop that positions them at `cos(angle), sin(angle)`.
3. If the letters are swapped in the data, fix that. If the angle
   convention is off (e.g. SVG y-axis points down, so a naive
   `sin(angle)` produces a mirrored compass), fix the sign.
4. Spot-check: after the fix, with `GARDEN_SVG_TOP_AZIMUTH = 22`,
   the widget should show N up-and-slightly-left, E in the lower-right
   (toward the back fence in the garden layout), S down-and-slightly-
   right, W in the upper-left (toward the house).

Note: fix 2 and fix 3 should produce compass widgets that agree with
each other. That's the strongest visual regression check.

## Validation

After all three fixes, open the app at
`?debug=sun&t=2026-04-19T13:14:52+02:00`. Expected:

- Timeline reads `13:15 / 48° boven horizon`.
- Overlay label reads `az=171° alt=48°` (not 291°/0°).
- Yellow sun arrow points **toward the lower-right of the map** (sun
  is at 171° compass, very slightly east of south; in the landscape
  frame with top=22°, that direction is 149° CW from SVG-up → lower-
  right quadrant).
- Grey shadow arrow opposite: **toward the upper-left** (toward the
  brick wall with a slight pull toward the house).
- Shadow polygons on the map match: wooden-fence shadow extends toward
  brick wall, back-fence shadow extends toward house, poplar shadow
  extends toward house with a slight southward component.
- Both compass widgets (overlay's top-left rose, app's top-right
  widget) show N up-and-slightly-left, E lower-right, S down-and-
  slightly-right, W upper-left. They should look visually identical in
  orientation.

Capture a screenshot and compare with the 19 Apr 13:15 reference photo
in `docs/sun-calibration.md`. The shadow direction on the deck in the
photo and the grey-arrow direction on the overlay should align.

## Out of scope

- The overlay's near-horizon arrow-length clamping (arrow stretches
  across the whole map when alt ≈ 0°). Working as designed; aesthetic
  improvement only. Skip unless it becomes a nuisance.
- Refactoring the sun-position data flow into a single source of truth
  if the code currently has multiple. Fix 1 just wires the overlay
  into whichever source is already driving the shadow polygons; a
  broader consolidation is a future refactor.

---

## Claude Code session starter prompt

```
Please implement PLAN-sun-overlay-compass-fixes.md.

Three small bugs to fix, all visualization-only. The underlying
shadow math was validated correct during the landscape-migration
session — do not touch shadowGeometry.ts, gardenStructures.ts, or
any caster/plant coordinates.

Work in order:

1. Fix 1: SunDebugOverlay reads stale sun position. Grep for how
   ShadowLayer gets its shadows prop, follow back to the sun-position
   source, and make SunDebugOverlay use the same source. Verify by
   moving the timeline slider and watching the overlay arrows update.

2. Fix 2: SunDebugOverlay's compass rose is N-up. Rotate it by
   -GARDEN_SVG_TOP_AZIMUTH (22°) so N points at true compass north.

3. Fix 3: GardenCompass has E and W swapped. Find and fix the sign
   error or the data-table error. After the fix, E should appear in
   the lower-right of the rose (toward the back fence direction).

After all three fixes, load the app at
?debug=sun&t=2026-04-19T13:14:52+02:00 and screenshot. Expected:
overlay shows az=171° alt=48°, yellow arrow lower-right, grey arrow
upper-left, both compass widgets visually identical in orientation
with N up-and-slightly-left. Post the screenshot in the report back.

If any of the fixes reveal something structural (e.g. there isn't a
single source of truth for sun position), stop and describe what you
found before making more invasive changes.
```
