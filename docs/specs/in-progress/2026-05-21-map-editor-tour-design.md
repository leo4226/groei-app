# Map Editor Tour — Design Spec

**Date:** 2026-05-21  
**Status:** Approved, pending implementation

## Overview

New users opening the layout editor for the first time have no guidance on non-obvious features: the shadow caster tool (which powers the sun heatmap) and the compass bearing setting (which tells the sun simulation which direction the map faces). This spec adds a guided step-by-step tour that auto-starts on first open and can be replayed via a persistent `?` button.

## Trigger conditions

The tour auto-starts when ALL of the following are true at editor load:
1. The canvas is empty — `editor.zones.length === 0` after data loads
2. The tour has not been seen for this map — `localStorage.getItem('groei_editor_tour_seen_<mapId>')` is falsy

Once started (or skipped), the key is written to `localStorage` and the auto-trigger never fires again for that map.

The `?` button in the editor header is always visible and replays the tour from step 1 regardless of seen state.

## Step definitions

Steps are derived from `mapType` at runtime. The `EditorTour` component receives the steps array from `useEditorTour`.

### Outdoor map — 4 steps

| Step | Title (NL) | Spotlight target | Notes |
|---|---|---|---|
| 1 | Welkom in de editor | None (introductory) | Brief overview: draw zones, place objects, add shadows |
| 2 | Zones tekenen | Draw tool button in toolbar | Explain zone types in sidebar legend |
| 3 | Schaduw objecten | `shadow_caster` toolbar button | Explain how shadow casters feed the sun heatmap |
| 4 | Kompas instellen | None (links away) | Explain bearing → "Ga naar Instellingen" button navigates to `MapSettingsPage` |

### Indoor map — 3 steps

| Step | Title (NL) | Spotlight target | Notes |
|---|---|---|---|
| 1 | Welkom in de editor | None | Brief overview: draw rooms, place doors and windows |
| 2 | Kamers tekenen | Draw tool button in toolbar | Explain room zone types |
| 3 | Deuren & ramen | Sidebar place_door / place_window buttons | Explain placement on walls |

No compass or shadow steps appear for indoor maps.

## Tour UI

### Overlay

A `position: fixed; inset: 0` semi-transparent overlay (`rgba(0,0,0,0.65)`) with `z-index: 100` sits above the canvas. It is non-blocking — pointer events pass through except on the tour card itself.

### Spotlight

When a step has a target element, that element is elevated above the overlay by adding a temporary CSS class (`ring-2 ring-white/60 shadow-2xl relative z-[200]`) via a `ref`-based callback or a `data-tour-id` attribute + `querySelector`. The ring draws the user's eye without covering the element.

### Tour card

A floating card anchored to `position: fixed; bottom: 1rem; left: 1rem; right: 1rem` (or centered on large screens). Card anatomy:

```
┌────────────────────────────────────┐
│  Stap 3 van 4           [Overslaan]│
│  ─────────────────────────────     │
│  Schaduw objecten                  │
│  Voeg gebouwen of bomen toe die…   │
│                                    │
│                       [Volgende →] │
└────────────────────────────────────┘
```

- Step counter: `Stap {n} van {total}` in accent colour (`text-primary`)
- Skip: right-aligned text button, always visible; marks tour as seen and closes
- Final step Next becomes **Klaar** (or **Ga naar Instellingen →** for the outdoor compass step)

### Compass step special case

Step 4 of the outdoor tour has no spotlight. The card renders a small inline compass preview (needle showing current bearing) and two buttons:
- **Nu overslaan** — marks tour done, stays in editor
- **Ga naar Instellingen →** — marks tour done, navigates to `/maps/:id/settings`

Returning from settings does not re-trigger the tour (seen key is already written).

### `?` replay button

Placed in the editor header bar, between the Undo button and the Preview button:

```tsx
<button onClick={tour.start} title="Rondleiding" className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted hover:bg-bg">
  ?
</button>
```

## Components

### `useEditorTour.ts` (new hook)

```ts
interface TourStep {
  id: string
  title: string          // from i18n
  body: string           // from i18n
  tourTargetId?: string  // matches data-tour-id on DOM element
  action?: 'settings'    // triggers navigation on primary button
}

interface UseEditorTourReturn {
  isActive: boolean
  currentStep: number    // 0-indexed
  steps: TourStep[]
  start: () => void
  next: () => void
  skip: () => void
}
```

- Accepts `mapId: number` and `mapType: 'outdoor' | 'indoor'`
- Builds the `steps` array from `mapType`
- `start()` sets `isActive = true`, `currentStep = 0`, writes localStorage
- `next()` increments step; on last step calls `skip()`
- `skip()` sets `isActive = false`, writes `localStorage.setItem('groei_editor_tour_seen_<mapId>', '1')`

### `EditorTour.tsx` (new component)

```tsx
<EditorTour
  tour={tour}               // UseEditorTourReturn
  onNavigateToSettings={() => navigate(`/maps/${mapId}/settings`)}
/>
```

Renders nothing when `!tour.isActive`. When active: overlay div + tour card. Reads `data-tour-id` from DOM to position spotlight ring.

### `LayoutEditorPage.tsx` (modified)

- Import and mount `useEditorTour(mapId, editor.mapType)`
- After canvas data loads: if `editor.zones.length === 0` and not seen → call `tour.start()`
- Render `<EditorTour tour={tour} onNavigateToSettings={...} />` inside the page
- Add `?` button to header

### `data-tour-id` attributes (modified)

Add to targeted elements in `EditorToolbar.tsx`:
- Draw tool button: `data-tour-id="tool-draw"`
- Shadow caster button: `data-tour-id="tool-shadow-caster"`

Add to sidebar section in `EditorLegendPanel.tsx`:
- Place door/window buttons: `data-tour-id="tool-place-door"` / `data-tour-id="tool-place-window"`

## i18n

New key block added to both `nl.ts` and `en.ts` under `editor`:

The step counter (`Stap 3 van 4`) is built inline in the component as a template literal — the existing i18n system has no interpolation support. All other strings are static keys.

```ts
editor: {
  // ...existing keys...
  tour: {
    skip: 'Overslaan',
    next: 'Volgende →',
    done: 'Klaar',
    goToSettings: 'Ga naar Instellingen →',
    skipSettings: 'Nu overslaan',
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
}
```

## State management

No backend or Zustand changes. State lives entirely in:
- `useEditorTour` local React state (active, currentStep)
- `localStorage` for persistence across sessions (`groei_editor_tour_seen_<mapId>`)

## Out of scope

- No per-step "did you try it?" validation — the tour moves forward on button click only
- No analytics / tour completion tracking
- No changes to MapSettingsPage itself (the compass picker and its hint text are already clear)
