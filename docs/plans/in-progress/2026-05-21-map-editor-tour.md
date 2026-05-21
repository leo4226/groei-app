# Map Editor Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided step-by-step tour to the layout editor that auto-starts on first open and is replayable via a `?` button, with different steps for outdoor (4: welcome → zones → shadow casters → compass) vs indoor (3: welcome → rooms → doors/windows).

**Architecture:** A `useEditorTour` hook owns all tour state and localStorage persistence. An `EditorTour` component renders the overlay and card, using `data-tour-id` attributes to locate and highlight target elements. `LayoutEditorPage` mounts both, triggers auto-start after canvas loads if empty, and adds the `?` replay button to the header.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, `localStorage`

**Spec:** `groei/docs/specs/in-progress/2026-05-21-map-editor-tour-design.md`

---

## File Map

| Action | Path |
|---|---|
| Create | `groei/groei/frontend/src/hooks/useEditorTour.ts` |
| Create | `groei/groei/frontend/src/hooks/__tests__/useEditorTour.test.ts` |
| Create | `groei/groei/frontend/src/components/editor/EditorTour.tsx` |
| Modify | `groei/groei/frontend/src/i18n/translations.ts` — add `tour` type to `editor` |
| Modify | `groei/groei/frontend/src/i18n/nl.ts` — add NL tour strings |
| Modify | `groei/groei/frontend/src/i18n/en.ts` — add EN tour strings |
| Modify | `groei/groei/frontend/src/components/editor/EditorToolbar.tsx` — add `data-tour-id` |
| Modify | `groei/groei/frontend/src/components/editor/EditorLegendPanel.tsx` — add `data-tour-id` |
| Modify | `groei/groei/frontend/src/pages/LayoutEditorPage.tsx` — mount tour, auto-trigger, `?` button |

---

## Task 1: i18n — add tour type and strings

**Files:**
- Modify: `groei/groei/frontend/src/i18n/translations.ts` (after line 219, inside `editor`)
- Modify: `groei/groei/frontend/src/i18n/nl.ts` (inside `editor`, after `bottom`)
- Modify: `groei/groei/frontend/src/i18n/en.ts` (inside `editor`, after `bottom`)

- [ ] **Step 1.1 — Add tour type block to `translations.ts`**

  In `groei/groei/frontend/src/i18n/translations.ts`, find `bottom: string // "Onder" / "Bottom"` inside the `editor` block. Add after it (before the closing `}`):

  ```ts
      tour: {
        skip: string
        next: string
        done: string
        goToSettings: string
        skipSettings: string
        step: string
        of: string
        outdoor: {
          step1: { title: string; body: string }
          step2: { title: string; body: string }
          step3: { title: string; body: string }
          step4: { title: string; body: string }
        }
        indoor: {
          step1: { title: string; body: string }
          step2: { title: string; body: string }
          step3: { title: string; body: string }
        }
      }
  ```

- [ ] **Step 1.2 — Add NL tour strings to `nl.ts`**

  In `groei/groei/frontend/src/i18n/nl.ts`, find `bottom: 'Onder',` inside the `editor` block. Add after it (before the closing `},`):

  ```ts
      tour: {
        skip: 'Overslaan',
        next: 'Volgende →',
        done: 'Klaar',
        goToSettings: 'Ga naar Instellingen →',
        skipSettings: 'Nu overslaan',
        step: 'Stap',
        of: 'van',
        outdoor: {
          step1: { title: 'Welkom in de editor', body: 'Hier teken je de indeling van je tuin. Voeg zones toe, plaats objecten en definieer schaduwen.' },
          step2: { title: 'Zones tekenen', body: 'Kies een zonetype in de zijbalk (grond, gazon, terras…) en klik op het canvas om de vorm te tekenen.' },
          step3: { title: 'Schaduw objecten', body: 'Voeg gebouwen of bomen toe die buiten je tuin staan maar wel schaduw werpen. Dit voedt de zonnekaart — hoe nauwkeuriger, hoe beter de heatmap.' },
          step4: { title: 'Kompas instellen', body: 'Voor een correcte zonnekaart geef je aan welke richting "omhoog" is op jouw kaart. Stel dit in via Kaartinstellingen → Kompasrichting.' },
        },
        indoor: {
          step1: { title: 'Welkom in de editor', body: 'Hier teken je de plattegrond van je huis. Voeg kamers toe, plaats muren, deuren en ramen.' },
          step2: { title: 'Kamers tekenen', body: 'Kies een kamertype in de zijbalk en teken elke ruimte op het canvas.' },
          step3: { title: 'Deuren & ramen', body: 'Klik op een muur om een deur of raam te plaatsen. Dit helpt bij het bijhouden van licht per kamer.' },
        },
      },
  ```

- [ ] **Step 1.3 — Add EN tour strings to `en.ts`**

  In `groei/groei/frontend/src/i18n/en.ts`, find `bottom: 'Bottom',` inside the `editor` block. Add after it (before the closing `},`):

  ```ts
      tour: {
        skip: 'Skip',
        next: 'Next →',
        done: 'Done',
        goToSettings: 'Go to Settings →',
        skipSettings: 'Skip for now',
        step: 'Step',
        of: 'of',
        outdoor: {
          step1: { title: 'Welcome to the editor', body: 'Here you draw the layout of your garden. Add zones, place objects, and define shadow sources.' },
          step2: { title: 'Drawing zones', body: 'Pick a zone type from the sidebar (soil, lawn, deck…) and click on the canvas to draw its shape.' },
          step3: { title: 'Shadow objects', body: 'Add buildings or trees outside your garden that cast shadows onto it. This feeds the sun heatmap — the more accurate, the better.' },
          step4: { title: 'Set the compass', body: 'For an accurate sun map, tell us which direction is "up" on your map. Set this in Map Settings → Compass bearing.' },
        },
        indoor: {
          step1: { title: 'Welcome to the editor', body: 'Here you draw your indoor floor plan. Add rooms, walls, doors, and windows.' },
          step2: { title: 'Drawing rooms', body: 'Pick a room type from the sidebar and draw each space on the canvas.' },
          step3: { title: 'Doors & windows', body: 'Click on a wall to place a door or window. This helps track light per room.' },
        },
      },
  ```

- [ ] **Step 1.4 — Verify TypeScript is happy**

  Run from `groei/groei/frontend/`:
  ```bash
  npx tsc --noEmit 2>&1 | grep "tour\|translations"
  ```
  Expected: no output (no errors related to tour or translations).

- [ ] **Step 1.5 — Commit**

  ```bash
  git add groei/groei/frontend/src/i18n/translations.ts groei/groei/frontend/src/i18n/nl.ts groei/groei/frontend/src/i18n/en.ts
  git commit -m "feat(editor-tour): add tour i18n strings for outdoor and indoor maps"
  ```

---

## Task 2: `data-tour-id` attributes on toolbar elements

**Files:**
- Modify: `groei/groei/frontend/src/components/editor/EditorToolbar.tsx`
- Modify: `groei/groei/frontend/src/components/editor/EditorLegendPanel.tsx`

- [ ] **Step 2.1 — Add `data-tour-id` to draw and shadow_caster buttons in `EditorToolbar.tsx`**

  In `EditorToolbar.tsx`, find the draw tool button (the one with `onSetTool('draw')`) and add `data-tour-id="tool-draw"`:

  ```tsx
  <button
    data-tour-id="tool-draw"
    onClick={() => onSetTool('draw')}
    className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
      activeTool === 'draw' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
    }`}
    title={t.editor.toolbar.draw}
  >
  ```

  Then find the shadow_caster button (the one with `onSetTool('shadow_caster')`) and add `data-tour-id="tool-shadow-caster"`:

  ```tsx
  <button
    data-tour-id="tool-shadow-caster"
    onClick={() => onSetTool('shadow_caster')}
    className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
      activeTool === 'shadow_caster' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
    }`}
    title="Schaduw object"
  >
  ```

- [ ] **Step 2.2 — Add `data-tour-id` to place_door and place_window buttons in `EditorLegendPanel.tsx`**

  In `EditorLegendPanel.tsx`, inside the indoor `place` section, find the `place_door` button and add `data-tour-id="tool-place-door"`:

  ```tsx
  <button
    data-tour-id="tool-place-door"
    onClick={() => onSetTool('place_door')}
    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${
      activeTool === 'place_door' ? 'ring-2 ring-primary ring-offset-1' : ''
    }`}
    style={{ backgroundColor: '#2544a033', color: '#2544a0' }}
  >
  ```

  Find the `place_window` button and add `data-tour-id="tool-place-window"`:

  ```tsx
  <button
    data-tour-id="tool-place-window"
    onClick={() => onSetTool('place_window')}
    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${
      activeTool === 'place_window' ? 'ring-2 ring-primary ring-offset-1' : ''
    }`}
    style={{ backgroundColor: '#24e34c33', color: '#24e34c' }}
  >
  ```

- [ ] **Step 2.3 — Commit**

  ```bash
  git add groei/groei/frontend/src/components/editor/EditorToolbar.tsx groei/groei/frontend/src/components/editor/EditorLegendPanel.tsx
  git commit -m "feat(editor-tour): add data-tour-id attributes to toolbar elements"
  ```

---

## Task 3: `useEditorTour` hook + tests

**Files:**
- Create: `groei/groei/frontend/src/hooks/useEditorTour.ts`
- Create: `groei/groei/frontend/src/hooks/__tests__/useEditorTour.test.ts`

- [ ] **Step 3.1 — Write the test file first**

  Create `groei/groei/frontend/src/hooks/__tests__/useEditorTour.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, vi } from 'vitest'
  import { shouldAutoStart, getSteps } from '../useEditorTour'

  // localStorage is not available in node test environment — stub it
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
  })

  const MAP_ID = 999

  beforeEach(() => localStorage.clear())

  describe('shouldAutoStart', () => {
    it('returns true when the tour has not been seen', () => {
      expect(shouldAutoStart(MAP_ID)).toBe(true)
    })

    it('returns false when the tour has been marked as seen', () => {
      localStorage.setItem(`groei_editor_tour_seen_${MAP_ID}`, '1')
      expect(shouldAutoStart(MAP_ID)).toBe(false)
    })
  })

  describe('getSteps', () => {
    it('returns 4 steps for outdoor maps', () => {
      expect(getSteps('outdoor')).toHaveLength(4)
    })

    it('returns 3 steps for indoor maps', () => {
      expect(getSteps('indoor')).toHaveLength(3)
    })

    it('outdoor step 3 targets the shadow-caster tool', () => {
      expect(getSteps('outdoor')[2].tourTargetId).toBe('tool-shadow-caster')
    })

    it('outdoor step 2 targets the draw tool', () => {
      expect(getSteps('outdoor')[1].tourTargetId).toBe('tool-draw')
    })

    it('outdoor step 4 has settings action', () => {
      expect(getSteps('outdoor')[3].action).toBe('settings')
    })

    it('indoor steps have no settings action', () => {
      expect(getSteps('indoor').every(s => !s.action)).toBe(true)
    })

    it('all outdoor steps carry correct i18nGroup', () => {
      expect(getSteps('outdoor').every(s => s.i18nGroup === 'outdoor')).toBe(true)
    })

    it('all indoor steps carry correct i18nGroup', () => {
      expect(getSteps('indoor').every(s => s.i18nGroup === 'indoor')).toBe(true)
    })
  })
  ```

- [ ] **Step 3.2 — Run tests, confirm they fail (module not found)**

  Run from `groei/groei/frontend/`:
  ```bash
  npm test -- --reporter=verbose 2>&1 | grep -E "useEditorTour|FAIL|PASS|Cannot"
  ```
  Expected: error like `Cannot find module '../useEditorTour'`

- [ ] **Step 3.3 — Write `useEditorTour.ts`**

  Create `groei/groei/frontend/src/hooks/useEditorTour.ts`:

  ```ts
  import { useState, useCallback } from 'react'

  export interface TourStep {
    id: string
    tourTargetId?: string
    action?: 'settings'
    i18nGroup: 'outdoor' | 'indoor'
    i18nKey: 'step1' | 'step2' | 'step3' | 'step4'
  }

  export function getSteps(mapType: string): TourStep[] {
    if (mapType === 'indoor') {
      return [
        { id: 'indoor-welcome', i18nGroup: 'indoor', i18nKey: 'step1' },
        { id: 'indoor-rooms', tourTargetId: 'tool-draw', i18nGroup: 'indoor', i18nKey: 'step2' },
        { id: 'indoor-doors', tourTargetId: 'tool-place-door', i18nGroup: 'indoor', i18nKey: 'step3' },
      ]
    }
    return [
      { id: 'outdoor-welcome', i18nGroup: 'outdoor', i18nKey: 'step1' },
      { id: 'outdoor-zones', tourTargetId: 'tool-draw', i18nGroup: 'outdoor', i18nKey: 'step2' },
      { id: 'outdoor-shadows', tourTargetId: 'tool-shadow-caster', i18nGroup: 'outdoor', i18nKey: 'step3' },
      { id: 'outdoor-compass', action: 'settings', i18nGroup: 'outdoor', i18nKey: 'step4' },
    ]
  }

  export function shouldAutoStart(mapId: number): boolean {
    return !localStorage.getItem(`groei_editor_tour_seen_${mapId}`)
  }

  export interface UseEditorTourReturn {
    isActive: boolean
    currentStep: number
    steps: TourStep[]
    start: () => void
    next: () => void
    skip: () => void
  }

  export function useEditorTour(mapId: number, mapType: string): UseEditorTourReturn {
    const [isActive, setIsActive] = useState(false)
    const [currentStep, setCurrentStep] = useState(0)
    const steps = getSteps(mapType)

    const start = useCallback(() => {
      setCurrentStep(0)
      setIsActive(true)
      localStorage.setItem(`groei_editor_tour_seen_${mapId}`, '1')
    }, [mapId])

    const skip = useCallback(() => {
      setIsActive(false)
      localStorage.setItem(`groei_editor_tour_seen_${mapId}`, '1')
    }, [mapId])

    const next = useCallback(() => {
      setCurrentStep(s => {
        const nextStep = s + 1
        if (nextStep >= steps.length) {
          setIsActive(false)
          return 0
        }
        return nextStep
      })
    }, [steps.length])

    return { isActive, currentStep, steps, start, next, skip }
  }
  ```

- [ ] **Step 3.4 — Run tests, confirm they pass**

  Run from `groei/groei/frontend/`:
  ```bash
  npm test -- --reporter=verbose 2>&1 | grep -E "useEditorTour|✓|×|FAIL|PASS"
  ```
  Expected: all 8 tests pass.

- [ ] **Step 3.5 — Commit**

  ```bash
  git add groei/groei/frontend/src/hooks/useEditorTour.ts groei/groei/frontend/src/hooks/__tests__/useEditorTour.test.ts
  git commit -m "feat(editor-tour): add useEditorTour hook with step definitions and auto-start logic"
  ```

---

## Task 4: `EditorTour` component

**Files:**
- Create: `groei/groei/frontend/src/components/editor/EditorTour.tsx`

- [ ] **Step 4.1 — Create `EditorTour.tsx`**

  Create `groei/groei/frontend/src/components/editor/EditorTour.tsx`:

  ```tsx
  import { useEffect } from 'react'
  import type { UseEditorTourReturn } from '../../hooks/useEditorTour'
  import { useT } from '../../context/LanguageContext'

  interface Props {
    tour: UseEditorTourReturn
    onNavigateToSettings: () => void
  }

  const HIGHLIGHT_CLASSES = ['ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg']

  export default function EditorTour({ tour, onNavigateToSettings }: Props) {
    const t = useT()
    const step = tour.steps[tour.currentStep]

    // Add highlight ring to the target element for the current step
    useEffect(() => {
      if (!tour.isActive || !step?.tourTargetId) return
      const el = document.querySelector(`[data-tour-id="${step.tourTargetId}"]`)
      if (!el) return
      el.classList.add(...HIGHLIGHT_CLASSES)
      return () => el.classList.remove(...HIGHLIGHT_CLASSES)
    }, [tour.isActive, step?.tourTargetId])

    if (!tour.isActive || !step) return null

    const isLastStep = tour.currentStep === tour.steps.length - 1
    const isSettingsStep = step.action === 'settings'

    // Access step strings via i18nGroup + i18nKey
    const groupStrings = t.editor.tour[step.i18nGroup] as Record<string, { title: string; body: string }>
    const stepStrings = groupStrings[step.i18nKey]

    function handleSettings() {
      tour.skip()
      onNavigateToSettings()
    }

    return (
      <>
        {/* Dimming overlay — pointer-events none so the highlighted element remains clickable */}
        <div className="fixed inset-0 bg-black/50 z-40 pointer-events-none" />

        {/* Tour card */}
        <div className="fixed bottom-4 left-4 right-4 z-50 bg-surface border border-primary rounded-xl shadow-2xl p-4 max-w-md mx-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-primary uppercase tracking-wide">
              {`${t.editor.tour.step} ${tour.currentStep + 1} ${t.editor.tour.of} ${tour.steps.length}`}
            </span>
            <button
              onClick={tour.skip}
              className="text-xs text-text-muted hover:text-text"
            >
              {t.editor.tour.skip}
            </button>
          </div>

          <h3 className="font-semibold text-text mb-1">{stepStrings.title}</h3>
          <p className="text-sm text-text-muted mb-4">{stepStrings.body}</p>

          {isSettingsStep ? (
            <div className="flex gap-2 justify-end">
              <button
                onClick={tour.skip}
                className="text-xs text-text-muted px-3 py-1.5 rounded-lg border border-border hover:bg-bg"
              >
                {t.editor.tour.skipSettings}
              </button>
              <button
                onClick={handleSettings}
                className="text-xs text-white bg-primary px-3 py-1.5 rounded-lg font-semibold"
              >
                {t.editor.tour.goToSettings}
              </button>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                onClick={isLastStep ? tour.skip : tour.next}
                className="text-xs text-white bg-primary px-3 py-1.5 rounded-lg font-semibold"
              >
                {isLastStep ? t.editor.tour.done : t.editor.tour.next}
              </button>
            </div>
          )}
        </div>
      </>
    )
  }
  ```

- [ ] **Step 4.2 — Verify TypeScript**

  ```bash
  cd groei/groei/frontend && npx tsc --noEmit 2>&1 | grep "EditorTour\|tour"
  ```
  Expected: no output.

- [ ] **Step 4.3 — Commit**

  ```bash
  git add groei/groei/frontend/src/components/editor/EditorTour.tsx
  git commit -m "feat(editor-tour): add EditorTour overlay component"
  ```

---

## Task 5: Wire tour into `LayoutEditorPage`

**Files:**
- Modify: `groei/groei/frontend/src/pages/LayoutEditorPage.tsx`

- [ ] **Step 5.1 — Add imports at the top of `LayoutEditorPage.tsx`**

  Add after the existing imports:

  ```tsx
  import EditorTour from '../components/editor/EditorTour'
  import { useEditorTour, shouldAutoStart } from '../hooks/useEditorTour'
  ```

- [ ] **Step 5.2 — Instantiate the hook and add autoStartTourRef**

  Inside the component, after `const editor = useEditorState()`, add:

  ```tsx
  const tour = useEditorTour(mapId ?? 0, editor.mapType)
  // Defer tour auto-start until after loadCanvasData has re-rendered with the correct mapType.
  // Calling tour.start() synchronously inside the Promise callback would capture the stale
  // editor.mapType (before loadCanvasData's setState has flushed), giving indoor maps outdoor steps.
  const autoStartTourRef = useRef(false)
  ```

- [ ] **Step 5.3 — Add auto-trigger: mark intent in data-load effect, fire after render**

  **Part A** — inside the `.then(([m, objs]) => { ... })` callback, replace the existing `if (m.canvas_data)` block with:

  ```tsx
  if (m.canvas_data) {
    try {
      const data = JSON.parse(m.canvas_data) as CanvasData
      const raw = (data.mapType as string) || m.map_type
      data.mapType = (raw === 'indoor' || raw === 'house') ? 'indoor' : 'outdoor'
      editor.loadCanvasData(data)
      const hasZones = (data.zones?.length ?? 0) > 0
      if (!hasZones && shouldAutoStart(mapId)) autoStartTourRef.current = true
    } catch {
      if (shouldAutoStart(mapId)) autoStartTourRef.current = true
    }
  } else {
    if (shouldAutoStart(mapId)) autoStartTourRef.current = true
  }
  ```

  **Part B** — add a new `useEffect` after the existing loading effect (`useEffect(() => { setSaveStatus(...) }, [editor.isDirty])`):

  ```tsx
  // Fire after loading completes so editor.mapType has settled to the correct value,
  // ensuring useEditorTour picks up the right step list before tour.start() is called.
  useEffect(() => {
    if (loading || !autoStartTourRef.current) return
    autoStartTourRef.current = false
    tour.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])
  ```

- [ ] **Step 5.4 — Add `?` replay button to the header**

  In the header `<div>`, add the `?` button between the Undo button and the Preview button:

  ```tsx
  {/* Undo button */}
  <button
    onClick={editor.undo}
    disabled={!editor.canUndo}
    title="Ctrl+Z"
    className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-bg"
  >
    ↩ {t.editor.toolbar.undo}
  </button>

  {/* Tour replay button */}
  <button
    onClick={tour.start}
    title="Rondleiding"
    className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 hover:bg-bg"
  >
    ?
  </button>

  <button
    onClick={() => setPreviewMode((p) => !p)}
    ...
  ```

- [ ] **Step 5.5 — Mount `<EditorTour>` in the JSX**

  At the very end of the returned JSX, just before the final closing `</div>` of the root element, add:

  ```tsx
      <EditorTour
        tour={tour}
        onNavigateToSettings={() => navigate(`/maps/${mapId}/settings`)}
      />
    </div>
  ```

- [ ] **Step 5.6 — Verify TypeScript**

  ```bash
  cd groei/groei/frontend && npx tsc --noEmit 2>&1 | grep -v "node_modules"
  ```
  Expected: no errors.

- [ ] **Step 5.7 — Commit**

  ```bash
  git add groei/groei/frontend/src/pages/LayoutEditorPage.tsx
  git commit -m "feat(editor-tour): wire tour into LayoutEditorPage with auto-trigger and ? button"
  ```

---

## Task 6: Manual verification

- [ ] **Step 6.1 — Start dev server**

  From `groei/`:
  ```bash
  npm run dev
  ```
  Open `http://localhost:5173` (or `http://localhost:1414`).

- [ ] **Step 6.2 — Test outdoor tour auto-start**

  1. Open any outdoor map's editor (a map with an empty canvas, or clear `groei_editor_tour_seen_<id>` from localStorage via DevTools)
  2. Tour should appear at step 1 of 4: "Welkom in de editor"
  3. Click Volgende → step 2: "Zones tekenen" — draw tool button in toolbar should have a white ring
  4. Click Volgende → step 3: "Schaduw objecten" — shadow caster button has ring
  5. Click Volgende → step 4: "Kompas instellen" — two buttons: "Nu overslaan" and "Ga naar Instellingen →"
  6. Click "Ga naar Instellingen →" — navigates to map settings page
  7. Navigate back to editor — tour does NOT re-appear

- [ ] **Step 6.3 — Test `?` replay button**

  1. The `?` button appears in the editor header
  2. Clicking it restarts the tour from step 1 regardless of seen state

- [ ] **Step 6.4 — Test outdoor tour skip**

  1. Clear seen key from localStorage, reload editor
  2. Tour appears — click "Overslaan"
  3. Tour closes immediately, canvas is interactive

- [ ] **Step 6.5 — Test indoor tour**

  1. Open an indoor map's editor (clear seen key first)
  2. Tour appears at step 1 of 3: "Welkom in de editor"
  3. Step 2: "Kamers tekenen" — draw tool has ring
  4. Step 3: "Deuren & ramen" — place_door button has ring (only visible when sidebar is open and indoor legend is expanded)
  5. No compass step appears

- [ ] **Step 6.6 — Test existing maps with content**

  Open an outdoor map that already has zones. Tour should NOT auto-start (canvas not empty).
