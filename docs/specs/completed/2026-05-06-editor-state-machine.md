# Editor state machine — invariant enforcement

**Status:** approved design, pending implementation

**Proposal:** #5 from architecture deepening candidates

**Date:** 2026-05-06

**By:** DEEPSEEK

## Problem

The editor state machine (`useEditorState` reducer + `EditorCanvas` local state) allows invalid state combinations:

1. **mapType defaults to `'garden'`** — `initialState` hardcodes it, and the `LOAD` action falls back with `?? 'garden'`. But `MapType` is `'outdoor' | 'indoor'`, so the default is both a type mismatch and semantically wrong (a house map without `mapType` in its saved `canvas_data` would render as outdoor after load).

2. **Stale interaction state after tool change** — `EditorCanvas` manages `drawing`, `dragging`, `resizing`, and `wallElementDragging` as local `useState`. If a user starts a drag/resize then switches tools via the toolbar, these states persist and stale pointer handlers keep firing. The tool has changed but the interaction hasn't been cancelled.

3. **Components carry defensive checks** (implied by the above) — defensive logic accumulates around these mismatches instead of being eliminated at the source.

## Approach chosen

**Option A — Minimal fixes.** Keep interaction state local to EditorCanvas; add a `useEffect` that clears it when `activeTool` changes. Fix `mapType` by passing it from the authoritative `MapInfo.map_type` field. Smallest diff, least risk, addresses the root causes directly.

Alternatives considered:
- **Option B (move state into reducer)**: Larger refactor that spreads ephemeral pointer-coordinate state into the global state machine — adds complexity without proportional benefit, since interaction state doesn't need undo.
- **Option C (guarded render checks)**: Keeps stale state alive and adds defensive conditions — doesn't fix the root cause.

## Changes

### 1. Fix `mapType` initialization

**Files:** `useEditorState.ts`, `LayoutEditorPage.tsx`, `CanvasData`

- `LayoutEditorPage` passes the map type from `MapInfo.map_type` (the authoritative DB field) to `loadCanvasData` alongside the parsed `canvas_data`
- `loadCanvasData` signature gains a `mapType: MapType` parameter; the `LOAD` action sets this value directly without fallback
- The `SET_MAP_TYPE` reducer guard remains unchanged
- `CanvasData.mapType` becomes non-optional (or the fallback is removed from the reducer)

### 2. Clear stale interaction state on tool change

**File:** `EditorCanvas.tsx`

Add a `useEffect` with `activeTool` as dependency:

```
useEffect(() => {
  setDrawing(null)
  setDragging(null)
  setResizing(null)
  setWallElementDragging(null)
  setSnapLines([])
}, [activeTool])
```

This ensures that any in-progress interaction is cancelled when the user switches tools through any path (toolbar button, keyboard shortcut, programmatic dispatch).

### 3. Remove defensive checks (if any found)

Review `EditorCanvas.tsx` and `LayoutEditorPage.tsx` for defensive conditions that guarded against stale interaction state. If the `useEffect` eliminates the possibility of stale state, those guards can be removed.

## Testing

- Unit test: LOAD action correctly sets `mapType` from the action payload
- Unit test: initialState has no mapType (or starts as null/undefined until LOAD)
- Visual verification: start dragging a zone, switch to draw tool, verify drag preview disappears and draw preview behaves correctly

## Files changed

- `groei/frontend/src/hooks/useEditorState.ts`
- `groei/frontend/src/pages/LayoutEditorPage.tsx`
- `groei/frontend/src/components/editor/EditorCanvas.tsx`
- `groei/frontend/src/types/index.ts` (if `CanvasData.mapType` is made non-optional)
