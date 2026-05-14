# Editor State Invariant Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two editor state bugs — stale interaction state surviving tool changes, and mapType defaulting incorrectly.

**Architecture:** Two independent, localized fixes: a `useEffect` in EditorCanvas clears stale drag/draw/resize state when the tool changes; LayoutEditorPage passes the authoritative `MapInfo.map_type` into `loadCanvasData` so the LOAD action always receives the correct type.

**Tech Stack:** React 18 + TypeScript + useReducer

---

### Task 1: Fix mapType initialization

**Files:**
- Modify: `groei/frontend/src/hooks/useEditorState.ts` (lines 62-72, line 93)
- Modify: `groei/frontend/src/pages/LayoutEditorPage.tsx` (lines 30-34)
- Test: Visual verification

- [ ] **Step 1: Fix initialState.mapType to a valid MapType value**

The current default `'garden'` doesn't match the `MapType = 'outdoor' | 'indoor'` type. Change it to `'outdoor'` (the semantically safest default — maps show zone drawing controls plus sun features when outdoor).

In `useEditorState.ts`, change line 71:
```ts
// Before:
  scalePxPerM: 46,
  mapType: 'garden',
}

// After:
  scalePxPerM: 46,
  mapType: 'outdoor',
}
```

- [ ] **Step 2: Remove the `?? 'garden'` fallback in the LOAD reducer case**

The fallback keeps maps without `mapType` in their saved `canvas_data` on the wrong type. Instead, just use the value from the action payload directly. Since LayoutEditorPage will always pass it (next step), this is safe.

In `useEditorState.ts`, change the LOAD case (around line 87-95):
```ts
// Before:
    zones: action.data.zones,
    wallElements: action.data.wallElements ?? [],
    scalePxPerM: action.data.scale_px_per_m,
    mapType: action.data.mapType ?? 'garden',
    isDirty: false,

// After:
    zones: action.data.zones,
    wallElements: action.data.wallElements ?? [],
    scalePxPerM: action.data.scale_px_per_m,
    mapType: action.data.mapType ?? 'outdoor',
    isDirty: false,
```

- [ ] **Step 3: Pass the authoritative map type from LayoutEditorPage**

`MapInfo.map_type` is the DB field and the authoritative source. Override the parsed `canvas_data.mapType` with it before calling `loadCanvasData`.

In `LayoutEditorPage.tsx`, change lines 29-33:
```ts
// Before:
        if (m.canvas_data) {
          try {
            editor.loadCanvasData(JSON.parse(m.canvas_data) as CanvasData)
          } catch { /* start blank */ }
        }

// After:
        if (m.canvas_data) {
          try {
            const data = JSON.parse(m.canvas_data) as CanvasData
            data.mapType = m.map_type
            editor.loadCanvasData(data)
          } catch { /* start blank */ }
        }
```

- [ ] **Step 4: TypeScript check**

Run: `cd groei/frontend && npx tsc --noEmit`
Expected: No output (clean compile)

---

### Task 2: Clear stale EditorCanvas interaction state on tool change

**Files:**
- Modify: `groei/frontend/src/components/editor/EditorCanvas.tsx` (add useEffect near existing state hooks)

- [ ] **Step 1: Add the cleanup useEffect**

After the existing `useState` declarations and `useCallback` helpers (around line 195, before `handlePointerDown`), add:

```ts
useEffect(() => {
  setDrawing(null)
  setDragging(null)
  setResizing(null)
  setWallElementDragging(null)
  setSnapLines([])
}, [activeTool])
```

Add `useEffect` to the React import at line 1:
```ts
import { useRef, useState, useCallback, useEffect } from 'react'
```

- [ ] **Step 2: TypeScript check**

Run: `cd groei/frontend && npx tsc --noEmit`
Expected: No output (clean compile)

---

### Task 3: Final verification

- [ ] **Step 1: Verify both fixes together**

Run: `cd groei/frontend && npx tsc --noEmit`
Expected: No output

- [ ] **Step 2: Update memory**

In `architecture_proposals.md`, change proposal #5 status to:
```
Status: **done** (2026-05-06) by DEEPSEEK
```
