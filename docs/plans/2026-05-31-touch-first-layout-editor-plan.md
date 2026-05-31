# Touch-First Layout Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the garden layout editor (`/maps/:id/edit-layout`) fully usable on a phone with touch — pinch-zoom/pan, finger-sized handles, full-screen landscape, portrait rotate-prompt — without forking a separate mobile editor.

**Architecture:** Keep the existing SVG renderer, tools, and state. Add one unified gesture model (1 finger = active tool, 2 fingers = pinch-zoom+pan) on top of the canvas, make handles touch-sized and zoom-invariant, and make the editor shell full-screen + orientation-aware. De-risk the gesture model with a spike before the rest.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind; SVG canvas with Pointer Events; `@use-gesture/react` (new) for multi-touch; vitest for unit tests; Vercel per-PR preview for on-device verification.

**Design spec:** `docs/plans/2026-05-31-touch-first-layout-editor-design.md`
**Issue:** [#15](https://github.com/leo4226/groei-app/issues/15)

---

## Working setup (do this once)

This is one issue → one branch → one PR. Work in an isolated worktree off the latest master,
following `docs/agents/how-we-work.md`:

```bash
bash scripts/agent-worktree.sh new 15 touch-editor   # ../floreren-15 on fix/15-touch-editor
cd ../floreren-15/frontend && npm install             # per-worktree deps (§5 of the guide)
```

Each task ends by committing and pushing to the PR branch so the **Vercel preview rebuilds** —
that preview URL on a real phone is the primary check for every touch/visual change. Run
`npx tsc --noEmit` and `npx vitest run` before each commit; CI re-checks on the PR.

Reference symbols already in the code (don't re-invent):
- `frontend/src/components/editor/EditorCanvas.tsx` — state `pan`, `zoom`, `MIN_ZOOM=0.25`,
  `MAX_ZOOM=4`, `panning`; `screenToSVG()`, `getSvgPoint()`; `handleWheel`; transform group
  `<g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>`; SVG style
  `{ aspectRatio: '1', touchAction: 'none' }`.
- `frontend/src/components/editor/EditorResizeOverlay.tsx` — `HANDLE_R = 5`, handles are
  `<circle r={HANDLE_R}>` rendered *inside* the zoomed group.
- `frontend/src/hooks/useIsMobile.ts` — `useIsMobile()`.
- `frontend/src/pages/LayoutEditorPage.tsx` — editor page shell.
- `frontend/src/App.tsx` — global chrome; route flags `isMapPage` etc. (pattern to copy).

---

## Task 1: Spike — prove the gesture model on a phone

**Goal:** Before investing in handles/layout, prove that two-finger pinch-zoom can coexist with
the existing one-finger pointer handlers without double-handling, and that it performs on a real
phone. This is exploratory — **no TDD**; the output is a decision + a thin working prototype.

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`
- Add dep: `@use-gesture/react`

- [ ] **Step 1: Add the dependency**

```bash
cd frontend && npm install @use-gesture/react
```

- [ ] **Step 2: Add a minimal pinch handler to the canvas**

In `EditorCanvas.tsx`, import and attach a pinch gesture to the SVG that drives the existing
`zoom`/`pan` state. Anchor zoom on the pinch midpoint so it zooms toward the fingers.

```tsx
import { usePinch } from '@use-gesture/react'
// inside the component, after pan/zoom state:
usePinch(
  ({ origin: [ox, oy], movement: [ms], memo }) => {
    const base = memo ?? { zoom, pan }
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, base.zoom * ms))
    // keep the point under the fingers fixed while scaling
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect) {
      const cx = ox - rect.left
      const cy = oy - rect.top
      const k = next / base.zoom
      setPan({
        x: cx - (cx - base.pan.x) * k,
        y: cy - (cy - base.pan.y) * k,
      })
    }
    setZoom(+next.toFixed(3))
    return base
  },
  { target: svgRef, eventOptions: { passive: false }, scaleBounds: { min: MIN_ZOOM, max: MAX_ZOOM } },
)
```

> Note: `usePinch` with `target: svgRef` attaches native non-passive listeners, so it can
> `preventDefault` the browser's own pinch — the same reason the camera fix used native
> listeners. The existing single-pointer `onPointerDown/Move/Up` handlers stay as-is for this
> spike; `usePinch` only fires on 2+ pointers.

- [ ] **Step 3: Verify it builds**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Deploy to the preview and test on a phone**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/editor/EditorCanvas.tsx
git commit -m "spike(editor): two-finger pinch-zoom on the canvas (#15)"
git push -u origin HEAD
gh pr create --fill --base master    # body: "Spike for #15 — do not merge yet"
```

Open the PR's Vercel preview on a phone → a map → edit-layout. Check, and record findings in a
PR comment:
1. Does **two-finger pinch** zoom smoothly toward the fingers?
2. Does **one-finger drag** still pan / move / draw as before (no double-handling, no jank)?
3. Does lifting one finger mid-pinch transition cleanly (no jump)?
4. Frame rate acceptable on the device?

- [ ] **Step 5: Decision gate**

- **If pinch coexists cleanly with the pointer handlers** → proceed to Task 2 keeping this
  structure (`usePinch` for 2-finger, existing handlers for 1-finger).
- **If there's contention** (double-handling, jumps) → the gesture model must own *all* pointers:
  in Task 3 route single-pointer logic through `useGesture`'s `onDrag` too. Note which path the
  spike chose in the PR comment; Task 3 below covers both.

Do **not** merge the spike PR; it continues as the feature branch through the tasks below.

---

## Task 2: Gesture-intent pure function (TDD)

**Goal:** Extract the "given the tool + what's under the pointer(s), what should a drag do?"
decision into a pure, testable function — the core of the gesture model, independent of the DOM.

**Files:**
- Create: `frontend/src/components/editor/gestureIntent.ts`
- Test: `frontend/src/components/editor/gestureIntent.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// gestureIntent.test.ts
import { describe, it, expect } from 'vitest'
import { gestureIntent } from './gestureIntent'

describe('gestureIntent', () => {
  it('two or more pointers always pinch, regardless of tool/target', () => {
    expect(gestureIntent({ pointers: 2, tool: 'select', target: 'zone' })).toBe('pinch')
    expect(gestureIntent({ pointers: 2, tool: 'draw', target: 'empty' })).toBe('pinch')
    expect(gestureIntent({ pointers: 3, tool: 'place_object', target: 'empty' })).toBe('pinch')
  })

  it('select tool: handle resizes, element moves, empty pans', () => {
    expect(gestureIntent({ pointers: 1, tool: 'select', target: 'handle' })).toBe('resize')
    expect(gestureIntent({ pointers: 1, tool: 'select', target: 'zone' })).toBe('move')
    expect(gestureIntent({ pointers: 1, tool: 'select', target: 'object' })).toBe('move')
    expect(gestureIntent({ pointers: 1, tool: 'select', target: 'empty' })).toBe('pan')
  })

  it('draw and shadow_caster tools draw on one finger', () => {
    expect(gestureIntent({ pointers: 1, tool: 'draw', target: 'empty' })).toBe('draw')
    expect(gestureIntent({ pointers: 1, tool: 'shadow_caster', target: 'empty' })).toBe('draw')
  })

  it('place tools place on one finger', () => {
    expect(gestureIntent({ pointers: 1, tool: 'place_object', target: 'empty' })).toBe('place')
    expect(gestureIntent({ pointers: 1, tool: 'place_door', target: 'zone' })).toBe('place')
    expect(gestureIntent({ pointers: 1, tool: 'place_window', target: 'zone' })).toBe('place')
  })

  it('no pointers is none', () => {
    expect(gestureIntent({ pointers: 0, tool: 'select', target: 'empty' })).toBe('none')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/editor/gestureIntent.test.ts`
Expected: FAIL — `gestureIntent` is not defined.

- [ ] **Step 3: Implement the function**

```ts
// gestureIntent.ts
export type ActiveTool =
  | 'select' | 'draw' | 'shadow_caster'
  | 'place_object' | 'place_door' | 'place_window'

export type TargetKind =
  | 'empty' | 'zone' | 'handle' | 'wallElement' | 'shadowCaster' | 'object'

export type Intent = 'pinch' | 'resize' | 'move' | 'pan' | 'draw' | 'place' | 'none'

/** Decide what a drag should do, given how many pointers are down, the active
 *  tool, and what is under the (first) pointer. Tap-to-deselect is handled by the
 *  caller on pointer-up with no movement; this returns the *drag* intent. */
export function gestureIntent(input: {
  pointers: number
  tool: ActiveTool
  target: TargetKind
}): Intent {
  const { pointers, tool, target } = input
  if (pointers >= 2) return 'pinch'
  if (pointers < 1) return 'none'
  if (tool === 'draw' || tool === 'shadow_caster') return 'draw'
  if (tool === 'place_object' || tool === 'place_door' || tool === 'place_window') return 'place'
  // select tool
  if (target === 'handle') return 'resize'
  if (target === 'empty') return 'pan'
  return 'move'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/editor/gestureIntent.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/gestureIntent.ts frontend/src/components/editor/gestureIntent.test.ts
git commit -m "feat(editor): pure gesture-intent function with tests (#15)"
```

---

## Task 3: Wire the gesture engine into the canvas

**Goal:** Replace the ad-hoc input handling with the unified model: keep `usePinch` (Task 1) for
2-finger zoom, and route the 1-finger branch through `gestureIntent` so the tool decision is
centralised. Keep `handleWheel` for desktop.

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx`

- [ ] **Step 1: Add a target classifier**

At the top of `handlePointerDown`, classify what's under the pointer into a `TargetKind` and call
`gestureIntent({ pointers: e.isPrimary ? 1 : 2, tool: activeTool, target })`. Use the result to
branch instead of the current ad-hoc `if (activeTool === ...)` ladder. Map existing behaviour:
`'resize'` → existing resize start, `'move'` → existing drag start, `'pan'` → existing
`setPanning(...)`, `'draw'` → existing `setDrawing(...)`, `'place'` → existing placement path,
`'pinch'` → ignore here (handled by `usePinch`).

Concretely, derive `target` from the element the pointer hit (the zone/handle/object handlers
already receive their ids — pass a `TargetKind` through them, defaulting to `'empty'` for the bare
SVG). Keep the existing per-element `onPointerDown` handlers; have them set the target kind.

- [ ] **Step 2: Suppress single-pointer actions during a pinch**

Track active pointer count (increment on `pointerdown`, decrement on `pointerup`/`pointercancel`).
When count ≥ 2, cancel any in-progress `drawing`/`dragging`/`resizing`/`panning` so a second
finger cleanly switches to pinch (this is the "lift one finger mid-pinch" case from the spike).

```tsx
const pointersDown = useRef(0)
// in handlePointerDown: pointersDown.current++
// in handlePointerUp/cancel: pointersDown.current = Math.max(0, pointersDown.current - 1)
// when pointersDown.current >= 2: setDrawing(null); setDragging(null); setResizing(null); setPanning(null)
```

- [ ] **Step 3: Verify build + existing behaviour**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: exit 0; gestureIntent tests still pass.

- [ ] **Step 4: Commit + phone-verify**

```bash
git add frontend/src/components/editor/EditorCanvas.tsx
git commit -m "feat(editor): route input through unified gesture model (#15)"
git push
```

On the Vercel preview (phone): one-finger select/move/draw/place all work; two-finger pinch-zoom
works; switching between them is clean. On desktop: mouse + wheel still work.

---

## Task 4: Touch-sized, zoom-invariant resize handles

**Goal:** Resize handles must be big enough for a finger and stay a constant on-screen size at any
zoom (currently `r=5` inside the zoom group → tiny, and shrinks further when zoomed out).

**Files:**
- Modify: `frontend/src/components/editor/EditorResizeOverlay.tsx`
- Modify: `frontend/src/components/editor/EditorCanvas.tsx` (pass `zoom` down)

- [ ] **Step 1: Pass `zoom` to the overlay**

In `EditorCanvas.tsx`, where `<EditorResizeOverlay zone=... onHandlePointerDown=... />` is
rendered, add `zoom={zoom}`.

- [ ] **Step 2: Make handles zoom-invariant with a large hit area**

In `EditorResizeOverlay.tsx`, accept `zoom: number`. Render each handle as two circles: a small
**visual** dot and a larger transparent **hit** circle, both sized in screen pixels by dividing by
`zoom` (because they live inside the `scale(zoom)` group).

```tsx
type Props = { zone: EditorZone; zoom: number; onHandlePointerDown: (e: React.PointerEvent, h: ResizeHandle) => void }

const VISUAL_PX = 7   // on-screen radius of the visible dot
const HIT_PX = 22     // on-screen radius of the (invisible) touch target ≈ 44px diameter

// inside map():
const rVis = VISUAL_PX / zoom
const rHit = HIT_PX / zoom
return (
  <g key={id}>
    <circle cx={hx} cy={hy} r={rHit} fill="transparent" style={{ cursor: cursorMap[id] }}
      onPointerDown={(e) => onHandlePointerDown(e, id)} />
    <circle cx={hx} cy={hy} r={rVis} fill="#fff" stroke="#4A90D9" strokeWidth={1.5 / zoom}
      pointerEvents="none" />
  </g>
)
```

Remove the old `HANDLE_R`/single-circle render.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit + phone-verify**

```bash
git add frontend/src/components/editor/EditorResizeOverlay.tsx frontend/src/components/editor/EditorCanvas.tsx
git commit -m "feat(editor): touch-sized, zoom-invariant resize handles (#15)"
git push
```

Phone: select a zone, drag each corner/edge handle with a finger — comfortable to grab at any
zoom level. Desktop: handles look right and still resize.

---

## Task 5: Full-screen + orientation

**Goal:** The editor fills the phone screen, is optimised for landscape, prompts to rotate in
portrait, and re-fits on rotation. Remove the square-canvas constraint.

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.tsx` (drop `aspectRatio:'1'`)
- Modify: `frontend/src/pages/LayoutEditorPage.tsx` (full-screen shell, portrait prompt, re-fit)
- Modify: `frontend/src/App.tsx` (hide BottomNav on the editor route)

- [ ] **Step 1: Drop the square constraint**

In `EditorCanvas.tsx`, remove `aspectRatio: '1'` from the SVG `style` and let the SVG fill its
container (`className="max-w-full max-h-full ..."` → ensure container is full-size). The container
`<div className="flex-1 flex ...">` already exists; ensure the editor page gives it the full
viewport (Step 2).

- [ ] **Step 2: Full-screen editor shell + portrait prompt**

In `LayoutEditorPage.tsx`, when `useIsMobile()` is true, render the editor in a full-viewport
container (`fixed inset-0` style, like the camera overlay) and, when the device is in **portrait**,
show a centered "Draai je telefoon" (rotate your phone) prompt instead of the cramped canvas.
Detect orientation with a small hook:

```ts
// frontend/src/hooks/useOrientation.ts
import { useEffect, useState } from 'react'
export function useOrientation(): 'portrait' | 'landscape' {
  const get = () => (window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait')
  const [o, setO] = useState(get)
  useEffect(() => {
    const onResize = () => setO(get())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return o
}
```

- [ ] **Step 3: Hide app chrome on the editor route**

In `App.tsx`, add `const isEditorPage = location.pathname.includes('/edit-layout')` and gate the
BottomNav block (and `HelpAssistant`) with `&& !isEditorPage`, mirroring the existing
`!isLoginPage && !isAdminPage` pattern.

- [ ] **Step 4: Re-fit the view on rotation**

In `EditorCanvas.tsx`, add an effect that, when orientation/size changes, resets `pan`/`zoom` to a
fit-to-content of `zoneBbox` (already computed) so nothing is stranded off-screen. Extract a
`fitToContent()` helper that sets `zoom`/`pan` from `zoneBbox` and the current SVG client rect, and
call it on mount and on a debounced `resize`.

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit + phone-verify**

```bash
git add frontend/src/components/editor/EditorCanvas.tsx frontend/src/pages/LayoutEditorPage.tsx \
        frontend/src/App.tsx frontend/src/hooks/useOrientation.ts
git commit -m "feat(editor): full-screen landscape, portrait rotate-prompt, orientation re-fit (#15)"
git push
```

Phone: editor fills the screen, no app nav; portrait shows the rotate prompt; rotating to landscape
shows the fitted canvas; rotating back and forth re-fits cleanly. Desktop unchanged.

---

## Task 6: Responsive panel chrome

**Goal:** Toolbar, legend, and properties panels are comfortable on touch in the landscape
full-screen layout.

**Files:**
- Modify: `frontend/src/components/editor/EditorToolbar.tsx`
- Modify: `frontend/src/components/editor/EditorLegendPanel.tsx`
- Modify: the properties panels as needed (`ZonePropertiesPanel.tsx`, `ObjectPropertiesPanel.tsx`,
  `WallElementPropertiesPanel.tsx`, `ShadowCasterPropertiesPanel.tsx`)

- [ ] **Step 1: Touch-size the controls (mobile only)**

Gate on `useIsMobile()`. Ensure tap targets are ≥44px, the toolbar docks compactly (e.g. a
vertical strip on the leading edge in landscape), and properties panels open as a side drawer /
bottom-sheet rather than a small floating panel. Reuse the existing `DraggablePanel` where possible;
prefer Tailwind responsive classes over new components.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit + phone-verify**

```bash
git add frontend/src/components/editor/EditorToolbar.tsx frontend/src/components/editor/EditorLegendPanel.tsx \
        frontend/src/components/editor/ZonePropertiesPanel.tsx frontend/src/components/editor/ObjectPropertiesPanel.tsx \
        frontend/src/components/editor/WallElementPropertiesPanel.tsx frontend/src/components/editor/ShadowCasterPropertiesPanel.tsx
git commit -m "feat(editor): touch-friendly responsive panels (#15)"
git push
```

Phone: every tool is reachable and tappable; selecting a zone/object opens a usable properties
panel; nothing overlaps the canvas controls.

---

## Task 7: Cross-device verification + finish

**Files:** none (verification)

- [ ] **Step 1: Full checks**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: exit 0; all tests pass.

- [ ] **Step 2: Phone pass (Vercel preview)** — run the full editing flow on a real phone:
  draw a zone, move it, resize it (handles easy to grab), place an object, place a door/window,
  add a shadow caster, pinch-zoom and pan throughout, rotate the device. Everything works.

- [ ] **Step 3: Desktop regression** — mouse drag/select/resize, wheel zoom, all panels work as before.

- [ ] **Step 4: Hand back to Leon** — comment on the PR summarising what to test, and let Leon do
  the final phone check and merge (`Closes #15`). Do not self-merge.

---

## Self-review (coverage)

| Spec requirement | Task |
|---|---|
| Unified gesture engine (1-finger tool / 2-finger pinch-zoom) | Task 1 (spike) + Task 2 (intent fn) + Task 3 (integration) |
| Built on `@use-gesture/react` | Task 1 |
| Finger-sized, zoom-invariant handles | Task 4 |
| Full-screen, no square aspect | Task 5 |
| Landscape layout + portrait rotate-prompt | Task 5 |
| Re-fit on device rotation | Task 5 |
| Responsive panel chrome | Task 6 |
| Spike-first de-risk | Task 1 |
| Desktop kept working | Tasks 3, 7 (regression) |
| Verification = phone preview + unit tests | every task + Task 2 (vitest) + Task 7 |
| Out of scope: object rotation, garden-view rotation | not implemented (correct) |

## Notes for the executor

- **The spike (Task 1) may adjust Tasks 3+.** That's its purpose — record the chosen integration
  path in the PR before continuing. The pinch code in Task 1 is the starting point, not gospel.
- **Visual/touch behaviour can't be unit-tested** — the `gestureIntent` function (Task 2) is the
  testable core; everything else is verified on the **Vercel preview on a real phone**. Don't fake
  tests for layout; phone-verify instead.
- Keep each task on the single `fix/15-touch-editor` branch / PR; commit per step, push per task.
