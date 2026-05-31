# Touch-First Layout Editor — Design Spec

**Date:** 2026-05-31
**Issue:** [#15](https://github.com/leo4226/groei-app/issues/15) — 📱 Editor modus kaart onbruikbaar op mobiel (layout, resize, rotation)
**Status:** Design approved — implementation plan next.

## Problem

The layout editor (`/maps/:id/edit-layout` → `EditorCanvas.tsx`) is unusable on phones,
which are the **primary** platform for this app. Concretely:

- **No pinch-zoom.** Zoom is wheel-only (`handleWheel`); touch devices have no wheel ("zoom raar").
- **Mouse-sized handles.** Resize/select handles are too small to hit with a finger ("resize knoppen te klein").
- **Square, non-full-screen canvas.** Forced `aspectRatio: '1'`; doesn't fill a phone and fights both orientations ("vult niet volledig scherm").
- **No orientation handling.** Rotating the phone doesn't re-layout ("draait niet mee").

The rendering, tools, and state are sound. The gaps are the **input layer** and the
**responsive shell**.

## Goal & scope

**Full editing parity on a phone**, done **touch-first**, as a **single unified editor** —
not a separate mobile codepath. Rationale: the rendering/tools/state are ~90% of the editor
and are shared; only input and shell differ. A second editor would duplicate the 90% to
rewrite the 10%, and tax every future change forever. Figma / Excalidraw / tldraw are all
single touch-first codebases that are excellent on phone *and* desktop.

**In scope:** pinch-zoom + pan, finger-friendly move / resize / draw / place, full-screen
landscape, portrait rotate-prompt, re-layout on device rotation, responsive panel chrome.

**Out of scope:** per-object rotation handle, garden-view rotation.

## Design

### 1. Unified gesture engine

A single gesture controller over the existing SVG canvas (which already uses Pointer Events
with `touch-action: none`), replacing the wheel-only / mouse-centric handlers. Interaction
model (the tldraw / Figma convention):

| Input | Behaviour |
|---|---|
| 1 finger / mouse on an element | drag-move |
| 1 finger / mouse on a handle | resize |
| 1 finger / mouse on empty canvas | **pan**; a tap deselects |
| 1 finger with a draw / place tool | draw / place |
| **2 fingers (any tool)** | **pinch-zoom + pan** — interrupts the 1-finger action |
| mouse wheel / trackpad (desktop) | zoom (kept) |

- Built on **`@use-gesture/react`** for robust multi-touch (pinch, drag, momentum) instead of
  hand-rolling the math.
- Zoom/pan drive the **existing transform-group state** (`scale` / `pan`) — no rendering change.
- A mouse is just a single pointer, so desktop keeps working from the same engine.

### 2. Finger-sized, zoom-invariant handles

- Resize / select handles get **≥44px hit targets** (small visual mark + a larger invisible
  hit area).
- Handle size is **zoom-invariant** — constant on-screen size at any zoom level, so handles
  stay tappable whether zoomed in or out.

### 3. Full-screen + orientation

- The editor **hides app chrome** (BottomNav etc.) and fills the viewport; the
  `aspectRatio: '1'` square constraint is removed so the canvas fills the available space.
- **Landscape** is the editing layout; **portrait** shows a "rotate your phone" prompt overlay.
- On **orientation change**, re-fit the view (fit-to-content) so nothing is stranded off-screen.

### 4. Responsive chrome (one editor, adaptive shell)

- Toolbar, legend, and the properties panels (Zone / Object / Wall / ShadowCaster) reflow for
  touch: larger targets, side-docked in landscape or a bottom-sheet on small screens.
- Same components, responsive placement — no separate mobile build.

### 5. Spike-first (de-risk)

**Phase 0 is a spike**: implement *only* 1-finger move/pan + 2-finger pinch-zoom on the
existing canvas and test it on a real phone (Vercel preview). This validates the riskiest
unknowns — gesture disambiguation (1↔2-finger transitions) and pinch performance on the SVG —
before investing in handles and responsive chrome. If the spike feels good, the rest is mostly
layout work.

## Phasing

0. **Spike** — gesture-model proof (1-finger move/pan, 2-finger pinch-zoom), phone-tested.
1. **Gesture engine** — formalise via `@use-gesture/react`; replace wheel-only zoom; desktop kept working.
2. **Touch handles** — ≥44px, zoom-invariant resize/select handles.
3. **Full-screen + orientation** — hide chrome, remove square aspect, landscape layout, portrait rotate-prompt, orientation re-fit.
4. **Panel touch-polish** — responsive toolbar / legend / properties panels.
5. **Verification** — cross-device pass.

## Verification

- **Primary:** Vercel preview on a real phone (per-PR preview, as used for #16) — every phase phone-tested.
- **Desktop regression:** mouse / trackpad editing must remain fully functional from the same engine.
- **Unit tests:** the pure "pointer events → editor intent" mapping (pointer count + target →
  pan / move / resize / zoom) as a testable function, so the gesture logic has coverage
  independent of the DOM.

## Key risks

- **Gesture disambiguation** — clean 1↔2-finger transitions (e.g. lifting one finger mid-pinch). Mitigated by the spike + `@use-gesture`.
- **Pinch performance** — SVG transform during pinch on low-end phones; measure in the spike.
- **Engine swap** — the new gesture controller must *replace* (not coexist with) the current pointer handlers, to avoid double-handling.

## Decisions made during design

- **1 finger on empty canvas = pan** (not marquee-select) — more natural on touch.
- **Add `@use-gesture/react`** rather than hand-roll multi-touch math.
- **Single editor**, touch-first, with responsive chrome — not a separate mobile editor.
