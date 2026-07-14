# Unified Plant Map Hit-Testing Design

**Issue:** #620  
**Date:** 2026-07-14  
**Status:** Approved in conversation

## Problem

The map renders several kinds of plant markers but does not resolve them through
one interaction model. Free-standing unlocked plants use nearest-centre
selection. Contained plants are rendered inside a non-interactive object and are
not selectable. Locked plants are omitted from proximity selection. Secondary
and fixed markers use independent SVG click targets. Move mode still starts from
the topmost overlapping SVG hit circle.

As a result, a pointer can visibly land on one plant while a nearby eligible
plant opens instead. Dense overlaps also provide no way to select a hidden or
near-tied plant.

## Goals

- Resolve every visible plant instance through one screen-space hit-testing
  model: free-standing, contained, locked, secondary, and fixed.
- Keep ordinary hardscape and container objects non-interactive in the normal
  map view.
- Make locking prevent movement only; a locked plant remains selectable.
- Use pointer-appropriate target sizes for mouse and touch.
- Use the same nearest-movable resolution when move mode starts.
- Ask the user when two or more candidates are genuinely ambiguous instead of
  silently using render or array order.
- Preserve map pan, pinch, zoom, landscape, placement, label, warning, and care
  sheet behavior.

## Non-goals

- Low-zoom clustering or spiderfying. That remains issue #455.
- Moving plants out of containers by dragging; the existing explicit release
  flow remains authoritative.
- Making hardscape objects editable from the normal map view.
- Re-anchoring or migrating stored `map_x` / `map_y` coordinates.
- Calendar, care schedule, or backend changes.

## Architecture

### 1. Shared marker geometry

Extract the contained-plant layout geometry currently private to
`ObjectShape.tsx` into a pure helper. Rendering and hit-testing must consume the
same `getShapeBound` and `getContainedPositions` calculations so their positions
cannot drift.

Top-level plant radii must use the same display-radius calculation as
`PlantMarker`. Secondary and fixed marker radii must match their rendered
circles.

### 2. Canonical plant hit candidates

Create a pure `plantHitTesting.ts` module. A candidate represents one visible
marker instance, not merely one database plant:

```ts
type PlantHitKind = 'plant' | 'contained' | 'secondary' | 'fixed'

interface PlantHitCandidate {
  key: string
  kind: PlantHitKind
  x: number
  y: number
  radius: number
  movable: boolean
  plantId: number | null
  label: string
  iconKey: string | null
  payload: MapPlant | SecondaryMarker | FixedPlant
}
```

Contained candidates are transformed from object-local layout positions through
the object's rotation into map SVG coordinates. Locked plants remain selectable
but have `movable: false`. Secondary placements get a unique key per placement.

### 3. Screen-space resolution

At pointer time, project candidate centres and radii through the SVG screen CTM.
This uses the browser's actual zoom, pan, preserve-aspect-ratio, letterboxing,
and landscape transform instead of duplicating scale math.

Resolution uses the rendered centre distance in CSS pixels:

- Mouse effective radius: rendered radius plus 6 px precision tolerance.
- Touch/pen effective radius: at least 24 px, producing a 48 px minimum target
  diameter rather than the current 44 px radius / 88 px diameter.
- The closest centre wins when it is clearly closer.
- If the closest two eligible candidates are both hit and their centre-distance
  scores differ by at most 8 px for mouse or 12 px for touch/pen, the result is
  ambiguous.
- No candidate in range means an empty-map tap and preserves deselection.

The resolver returns `none`, `selected`, or `ambiguous`; it does not invoke React
callbacks and is fully unit-testable.

### 4. Selection dispatch

`MapView` owns one candidate list and dispatches a selected candidate according
to its kind:

- `plant`: existing `handleItemSelect` path.
- `contained`: open the contained `MapPlant` directly.
- `secondary`: existing secondary-placement callback.
- `fixed`: existing fixed-plant callback.

Direct marker `onClick` handlers for locked, secondary, and fixed markers must no
longer bypass the resolver. Their visuals remain pointer-transparent in normal
selection mode so SVG order cannot decide the target.

### 5. Ambiguity chooser

Add a compact accessible chooser:

- Desktop: a small fixed popover anchored near the click.
- Touch/pen: a bottom sheet with a backdrop and full-width candidate buttons.
- Each choice shows the plant icon when available and its display name.
- Escape/backdrop closes it without changing selection.
- Choosing an item dispatches the exact candidate instance.

The chooser appears only for a close score, not every ordinary overlap.

### 6. Move targeting

When move mode is active, pointer-down resolves the same candidate list filtered
to `movable` markers. The resolved plant's actual SVG group is identified through
a stable `data-map-plant-id` attribute and passed to the existing imperative drag
path. This prevents a different overlapping group's transparent circle from
moving while retaining the current performant DOM transform during drag.

Contained, locked, secondary, and fixed markers are never movable through this
path. Targeted one-plant move mode additionally filters to the requested ID.

## Interaction Details

### Desktop

- Mouse movement previews the clear resolver winner with a lightweight outline.
- Click selects immediately when clear.
- Ambiguous clicks open the anchored chooser.
- Empty clicks deselect as before.

### Touch and pen

- No hover state.
- A 48 px minimum target diameter provides reachable markers without selecting
  plants from a 44 px radius.
- Ambiguous taps open the bottom-sheet chooser.
- Existing pan and pinch gestures retain priority after their movement threshold.

## Error and Edge Handling

- Missing SVG CTM: treat the interaction as empty rather than guessing.
- A contained object without plants creates no candidates.
- More contained plants than expected continue using the existing deterministic
  2-column layout.
- Duplicate plant IDs across a primary and secondary placement remain separate
  candidates through unique keys.
- Candidate labels fall back to the existing localized plant display-name helper.
- Closing the chooser does not open or deselect another marker.

## Testing

Pure tests must cover:

- projection through translation, scale, and rotation matrices;
- clear nearest selection independent of candidate order;
- mouse versus touch effective radii;
- ambiguous score thresholds;
- no-hit behavior;
- locked selectability versus movability;
- contained positions including rotated containers;
- primary and secondary instances sharing a plant ID.

Component/model tests must cover:

- building candidates from all rendered marker categories;
- dispatching every candidate kind;
- move filtering and targeted move mode;
- chooser desktop/mobile layout and exact-choice dispatch;
- no direct marker click path bypassing central resolution.

Final verification is the complete frontend test suite and production Vite build.
The repository-required backend suite also runs before publication even though
this issue has no backend changes.

