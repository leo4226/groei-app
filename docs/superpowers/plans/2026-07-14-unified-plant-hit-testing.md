# Unified Plant Map Hit-Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every visible plant marker select and move according to one screen-space resolver, with device-appropriate targets and an ambiguity chooser.

**Architecture:** Pure geometry helpers provide the exact positions and radii used by both rendering and hit-testing. `plantHitTesting.ts` builds and projects canonical candidates, then returns a selected, ambiguous, or empty result without React dependencies. `MapView` owns dispatch, chooser state, hover preview, and move-mode routing while existing sheets and drag persistence remain unchanged.

**Tech Stack:** React 19, TypeScript, SVG, Vitest, Vite

## Global Constraints

- Issue #620 only; do not touch calendar or care-schedule code.
- Hardscape and container objects remain non-interactive in normal map view.
- Locking prevents movement, not selection.
- Touch/pen minimum target diameter is 48 CSS px; mouse gets 6 CSS px precision tolerance.
- Ambiguity delta is 8 CSS px for mouse and 12 CSS px for touch/pen.
- Clustering and spiderfying remain out of scope under #455.
- All production behavior changes follow a witnessed failing test before implementation.

---

### Task 1: Share rendered marker geometry

**Files:**
- Create: `frontend/src/components/map/plantMarkerGeometry.ts`
- Create: `frontend/src/components/map/__tests__/plantMarkerGeometry.test.ts`
- Modify: `frontend/src/components/map/PlantMarker.tsx`
- Modify: `frontend/src/components/map/PlantsLayer.tsx`
- Modify: `frontend/src/components/map/ObjectShape.tsx`

**Interfaces:**
- Produces: `topLevelPlantIconRadius(plant: Pick<MapPlant, 'display_radius_cm' | 'is_locked'>): number`
- Produces: `objectShapeBound(object: Pick<MapObject, 'shape' | 'diameter_cm' | 'width_cm' | 'depth_cm'>): number`
- Produces: `containedPlantLayout(count: number, bound: number, shape: MapObject['shape']): Array<{ x: number; y: number; radius: number }>`
- Consumes: existing `PX_PER_CM`, locked radius cap, and `ObjectShape` layout constants.

- [ ] **Step 1: Write failing geometry tests**

```ts
expect(topLevelPlantIconRadius({ display_radius_cm: null, is_locked: false })).toBe(11.9)
expect(topLevelPlantIconRadius({ display_radius_cm: 100, is_locked: true })).toBe(28)
expect(containedPlantLayout(2, 20, 'circle')).toEqual([
  { x: -5.5, y: 0, radius: 8.333333333333334 },
  { x: 5.5, y: 0, radius: 8.333333333333334 },
])
```

- [ ] **Step 2: Run the tests and witness RED**

Run: `cd frontend && npm test -- src/components/map/__tests__/plantMarkerGeometry.test.ts`

Expected: FAIL because `plantMarkerGeometry` does not exist.

- [ ] **Step 3: Implement the pure geometry module**

```ts
export function topLevelPlantIconRadius(plant: RadiusPlant): number {
  const base = plant.display_radius_cm ? plant.display_radius_cm * PX_PER_CM : 14
  const radius = base * 0.85
  return plant.is_locked ? Math.min(radius, 28) : radius
}

export function containedPlantLayout(count: number, bound: number, shape: MapObject['shape']) {
  const radius = count === 1
    ? bound * (shape === 'circle' ? 1 : 0.65)
    : bound / (count <= 2 ? 2.4 : count <= 4 ? 3.2 : 4.2)
  return containedPlantPositions(count, bound * (count === 1 ? 0 : 0.55))
    .map((position) => ({ ...position, radius }))
}
```

- [ ] **Step 4: Replace duplicated rendering calculations**

Use `topLevelPlantIconRadius` from both `PlantMarker` and `PlantsLayer`. Use
`objectShapeBound` and `containedPlantLayout` from `ObjectShape`; delete its
private copies only after the render consumes the shared functions.

- [ ] **Step 5: Run focused tests and build**

Run: `cd frontend && npm test -- src/components/map/__tests__/plantMarkerGeometry.test.ts src/components/map/__tests__/plantMarkerWarnings.test.ts`

Run: `cd frontend && npm run build`

Expected: all focused tests pass and build exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/map/plantMarkerGeometry.ts frontend/src/components/map/__tests__/plantMarkerGeometry.test.ts frontend/src/components/map/PlantMarker.tsx frontend/src/components/map/PlantsLayer.tsx frontend/src/components/map/ObjectShape.tsx
git commit -m "refactor(map): share plant marker geometry (#620)"
```

### Task 2: Build and resolve canonical plant hit candidates

**Files:**
- Create: `frontend/src/utils/plantHitTesting.ts`
- Create: `frontend/src/utils/__tests__/plantHitTesting.test.ts`
- Modify: `frontend/src/constants/fixedPlants.ts` only if a readonly type export is required.

**Interfaces:**
- Produces: `PlantHitCandidate` with `key`, `kind`, SVG `x/y/radius`, `movable`, label/icon, and typed payload.
- Produces: `buildPlantHitCandidates(input: PlantHitCandidateInput): PlantHitCandidate[]`
- Produces: `projectPlantHitCandidates(candidates, matrix): ScreenPlantHitCandidate[]`
- Produces: `resolvePlantHit(point, candidates, pointerType): PlantHitResult`
- Consumes: geometry functions from Task 1 and `resolveDisplayedDragPosition`.

- [ ] **Step 1: Write failing candidate-builder tests**

Cover free-standing, locked, contained, rotated-container, secondary, fixed, and
primary/secondary duplicate-ID instances. Assert locked candidates are selectable
and `movable: false`, while ordinary top-level candidates are movable.

```ts
const keys = buildPlantHitCandidates(input).map((candidate) => candidate.key)
expect(keys).toEqual(['plant-1', 'contained-2-in-10', 'secondary-30', 'fixed-oak'])
expect(result.find((candidate) => candidate.key === 'plant-1')?.movable).toBe(true)
expect(result.find((candidate) => candidate.key === 'plant-9')?.movable).toBe(false)
```

- [ ] **Step 2: Run builder tests and witness RED**

Run: `cd frontend && npm test -- src/utils/__tests__/plantHitTesting.test.ts`

Expected: FAIL because the module and exports do not exist.

- [ ] **Step 3: Implement candidate construction**

Use one loop for top-level plants, one nested loop for contained plants, then
append secondary and fixed instances. Rotate contained local offsets using:

```ts
const radians = (object.rotation ?? 0) * Math.PI / 180
const x = objectX + local.x * Math.cos(radians) - local.y * Math.sin(radians)
const y = objectY + local.x * Math.sin(radians) + local.y * Math.cos(radians)
```

- [ ] **Step 4: Write failing screen-projection and resolver tests**

```ts
expect(projectPlantHitCandidates([candidate], { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 })[0])
  .toMatchObject({ x: 30, y: 40, radius: candidate.radius * 2 })
expect(resolvePlantHit({ x: 21, y: 0 }, closeCandidates, 'mouse').type).toBe('selected')
expect(resolvePlantHit({ x: 0, y: 0 }, tiedCandidates, 'touch').type).toBe('ambiguous')
```

- [ ] **Step 5: Run resolver tests and witness RED**

Expected failures must show missing projection/resolution behavior, not fixture errors.

- [ ] **Step 6: Implement projection and resolution**

Project with the six CTM values and use the mean of the X/Y basis magnitudes for
radius scaling. Effective hit radius is `radius + 6` for mouse and
`Math.max(radius, 24)` for touch/pen. Sort eligible candidates by centre distance,
then key for deterministic ordering. Return ambiguous only when the top two
distance scores differ by no more than the device delta.

- [ ] **Step 7: Run all resolver tests and commit**

```bash
git add frontend/src/utils/plantHitTesting.ts frontend/src/utils/__tests__/plantHitTesting.test.ts frontend/src/constants/fixedPlants.ts
git commit -m "feat(map): resolve all plant marker hits centrally (#620)"
```

### Task 3: Centralize selection dispatch and marker events

**Files:**
- Create: `frontend/src/components/map/plantHitDispatch.ts`
- Create: `frontend/src/components/map/__tests__/plantHitDispatch.test.ts`
- Modify: `frontend/src/components/map/MapView.tsx`
- Modify: `frontend/src/components/map/PlantMarker.tsx`
- Modify: `frontend/src/components/map/PlantsLayer.tsx`
- Modify: `frontend/src/components/map/SecondaryMarkersLayer.tsx`
- Modify: `frontend/src/components/map/FixedPlantsLayer.tsx`

**Interfaces:**
- Produces: `dispatchPlantHit(candidate, handlers): void`
- Consumes: Task 2 candidate builder/projector/resolver.
- Preserves: existing `handleItemSelect`, `onPlantTap`, `onSecondaryMarkerTap`, and `onFixedPlantTap` callbacks.

- [ ] **Step 1: Write failing dispatch tests**

Assert each candidate kind calls exactly its matching handler. Include a locked
top-level plant dispatching through the normal plant handler.

- [ ] **Step 2: Run dispatch tests and witness RED**

Run: `cd frontend && npm test -- src/components/map/__tests__/plantHitDispatch.test.ts`

- [ ] **Step 3: Implement dispatch and MapView candidate memo**

Memoize SVG candidates from `plants`, `objects`, `secondaryMarkers`, fixed plants,
and drag positions. Record `e.pointerType` during container pointer-down in a ref;
at click time project through `svg.getScreenCTM()` and resolve using that recorded
pointer type, falling back to `mouse` only for keyboard/programmatic clicks.

- [ ] **Step 4: Remove bypass click paths**

Make normal plant marker visuals pointer-transparent for click dispatch while
retaining their pointer-down path for movement. Remove direct `onClick` handlers
from secondary/fixed/locked marker groups; central `MapView` click resolution is
authoritative. Add stable `data-map-plant-id` to top-level marker groups.

- [ ] **Step 5: Add a regression model test for the reported case**

Build a free-standing candidate at the yellow position and a contained candidate
at the red position. Assert a click at the red position resolves the contained
candidate independent of array/render order.

- [ ] **Step 6: Run focused tests and commit**

```bash
git add frontend/src/components/map/plantHitDispatch.ts frontend/src/components/map/__tests__/plantHitDispatch.test.ts frontend/src/components/map/MapView.tsx frontend/src/components/map/PlantMarker.tsx frontend/src/components/map/PlantsLayer.tsx frontend/src/components/map/SecondaryMarkersLayer.tsx frontend/src/components/map/FixedPlantsLayer.tsx frontend/src/utils/__tests__/plantHitTesting.test.ts
git commit -m "fix(map): select visible plants through one resolver (#620)"
```

### Task 4: Add accessible ambiguity chooser and hover preview

**Files:**
- Create: `frontend/src/components/map/PlantHitChooser.tsx`
- Create: `frontend/src/components/map/__tests__/plantHitChooserModel.test.ts`
- Create: `frontend/src/components/map/plantHitChooserModel.ts`
- Modify: `frontend/src/components/map/MapView.tsx`
- Modify: `frontend/src/i18n/translations.ts`
- Modify: `frontend/src/i18n/en.ts`
- Modify: `frontend/src/i18n/nl.ts`

**Interfaces:**
- Produces: `chooserLayout(isMobile: boolean): 'popover' | 'sheet'`
- Produces: `PlantHitChooser` props `{ candidates, point, isMobile, onChoose, onClose }`.
- Consumes: ambiguous candidates from Task 2 and dispatch from Task 3.

- [ ] **Step 1: Write failing chooser-model tests**

```ts
expect(chooserLayout(false)).toBe('popover')
expect(chooserLayout(true)).toBe('sheet')
expect(chooserOptions(candidates).map((option) => option.key)).toEqual(['plant-1', 'contained-2-in-8'])
```

- [ ] **Step 2: Run chooser tests and witness RED**

- [ ] **Step 3: Implement the model and component**

Render an accessible `role="dialog"` with candidate buttons. Desktop uses fixed
position near the pointer and a compact card; mobile uses a backdrop and rounded
bottom sheet. Candidate buttons show `resolveIconUrl(iconKey)` when available and
the localized label. Escape and backdrop call `onClose`.

- [ ] **Step 4: Wire chooser and hover preview into MapView**

Ambiguous click stores candidates plus client point. Clear selection dispatches
immediately. Mouse pointer movement updates a lightweight outline for an
unambiguous winner only; touch/pen never sets hover state. Pan, drag, placement,
and active chooser states suppress hover.

- [ ] **Step 5: Run focused tests, React review, and commit**

Review hooks for stable dependencies, avoid repeated candidate scans per render,
use buttons for accessibility, and keep transient pointer state out of expensive
child re-renders where practical.

```bash
git add frontend/src/components/map/PlantHitChooser.tsx frontend/src/components/map/plantHitChooserModel.ts frontend/src/components/map/__tests__/plantHitChooserModel.test.ts frontend/src/components/map/MapView.tsx frontend/src/i18n/translations.ts frontend/src/i18n/en.ts frontend/src/i18n/nl.ts
git commit -m "feat(map): disambiguate overlapping plant taps (#620)"
```

### Task 5: Resolve move-mode pointer-down through the same candidates

**Files:**
- Create: `frontend/src/components/map/__tests__/plantMoveHitTarget.test.ts`
- Create: `frontend/src/components/map/plantMoveHitTarget.ts`
- Modify: `frontend/src/components/map/MapView.tsx`
- Modify: `frontend/src/hooks/useMapInteraction.ts`
- Modify: `frontend/src/components/map/PlantMarker.tsx`

**Interfaces:**
- Produces: `resolveMovablePlantHit(resultCandidates, movePlantId): PlantHitCandidate | null`
- Extends: `handlePlantPointerDown(e, plant, dragElementOverride?: SVGGElement | null)`.

- [ ] **Step 1: Write failing move-target tests**

Cover overlapping top-level plants, a closer locked plant, a closer contained
plant, and targeted one-plant mode. Assert only movable top-level candidates can
win and targeted mode cannot start another plant.

- [ ] **Step 2: Run tests and witness RED**

- [ ] **Step 3: Implement move filtering**

Filter candidates to `kind === 'plant' && movable`, then to `plantId ===
movePlantId` when targeted mode is active. Resolve with the same pointer type and
screen geometry.

- [ ] **Step 4: Route container pointer-down in move mode**

Before pan handling, resolve the movable marker. Find its real group with
`svg.querySelector('[data-map-plant-id="<id>"]')` and pass that group into the
existing drag hook so imperative transforms move the resolved plant, not the DOM
event target. Normal mode continues into existing pan handling.

- [ ] **Step 5: Run focused tests and commit**

```bash
git add frontend/src/components/map/plantMoveHitTarget.ts frontend/src/components/map/__tests__/plantMoveHitTarget.test.ts frontend/src/components/map/MapView.tsx frontend/src/hooks/useMapInteraction.ts frontend/src/components/map/PlantMarker.tsx
git commit -m "fix(map): move the nearest eligible plant (#620)"
```

### Task 6: Full verification and publication

**Files:**
- Verify: all files changed by Tasks 1–5.
- Modify after review: only the exact files named by a validated Critical or Important finding.

**Interfaces:**
- Verifies every acceptance criterion in issue #620 and the approved design.

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npm test`

Expected: all test files and tests pass with zero failures.

- [ ] **Step 2: Run the production frontend build**

Run: `cd frontend && npm run build`

Expected: Vite exits 0. Existing chunk-size warnings are acceptable.

- [ ] **Step 3: Set up and run backend verification**

Create the worktree-local venv when absent, install `backend/requirements.txt`,
then run `cd backend && .venv\\Scripts\\python -m pytest -q`.

Expected: all backend tests pass; documented existing skips/warnings are acceptable.

- [ ] **Step 4: Check scope and request independent review**

Run `git diff --check`, `git status -sb`, and `git diff --name-only origin/master...HEAD`.
Confirm there are no calendar or care-schedule changes. Dispatch a reviewer with
the issue, design, base SHA, and head SHA. Fix every Critical or Important finding
through another witnessed red/green cycle.

- [ ] **Step 5: Push and open a draft PR**

Push `fix/620-unified-plant-hit-testing` and open a draft PR to `master` with
`Closes #620`, root cause, device behavior, verification counts, and explicit
exclusion of #455 clustering and calendar work. Do not merge.
