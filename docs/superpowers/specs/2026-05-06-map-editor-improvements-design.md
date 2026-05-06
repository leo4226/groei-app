# Map Editor Comprehensive Improvements

**Date:** 2026-05-06
**Project:** Groei — Plant Care PWA
**Scope:** Map editor UX improvements, visual polish, and Dutch localisation

---

## Overview

A focused improvement to the existing map editor (`/maps/:id/edit-layout`) targeting three areas: visual clarity (grid, silhouette, dimension labels), layout restructure (right sidebar legend), and full Dutch localisation. No changes to the data model, state machine, or database schema.

---

## Decisions

| Topic | Decision |
|---|---|
| Platform | Desktop first |
| Language | Fully Dutch throughout the editor |
| Zone type picker | Always-visible legend cards in right sidebar |
| Sidebar layout | Legend top, properties panel below when selection active |
| Snap gap fix | Inset stroke rendering in EditorZoneShape + RoomWallRenderer |
| Grid | SVG pattern at 46px × 46px (1m × 1m), light grey |
| Dimension labels | Per-zone centered SVG text, `{w}m × {h}m` |
| Outer silhouette | True polygon union via pure JS algorithm, rendered as SVG path |
| Polygon union approach | Pure JS rectangle union (Approach B) — no external dependencies |
| Polyline walls | Deferred to backlog |
| Zoom/pan | Out of scope |

---

## Architecture

Six isolated changes — no state machine or DB schema changes:

| # | Change | Files affected |
|---|---|---|
| 1 | New `EditorLegendPanel` component | `components/editor/EditorLegendPanel.tsx` (new) |
| 2 | Right sidebar restructure | `pages/LayoutEditorPage.tsx` |
| 3 | Grid overlay | `components/editor/EditorDefs.tsx`, `EditorCanvas.tsx` |
| 4 | Dimension labels | `components/editor/EditorCanvas.tsx` |
| 5 | Outer silhouette | `utils/computeZoneUnion.ts` (new), `EditorCanvas.tsx` |
| 6 | Snap gap fix | `components/editor/EditorZoneShape.tsx`, `RoomWallRenderer.tsx` |
| 7 | Dutch strings | `utils/editorStrings.nl.ts` (new), all editor components |

---

## Section 1 — Right Sidebar & Legend Panel

### Current state
- Zone type picker: chips row inside `EditorToolbar` (top of page)
- Properties panels: appear on right only when a zone/wall element is selected

### New layout
- `EditorLegendPanel` always renders in the right sidebar
- Below the legend: `ZonePropertiesPanel` / `WallElementPropertiesPanel` when selection is active
- `EditorToolbar` retains only: tool mode buttons (Selecteren / Tekenen / Deur plaatsen / Raam plaatsen) + undo button. Zone type chips removed.

### EditorLegendPanel spec
- Renders one card per zone type available for the current `mapType`
  - Outdoor: 8 zone types
  - Indoor: 3 zone types
- Each card contains:
  - Coloured swatch (matches existing zone fill colour)
  - Dutch zone type name (from `editorStrings.nl.ts`)
  - One-line Dutch description of when to use this type
  - Active state highlight when this is the selected `activeZoneType`
- Clicking a card: sets `activeZoneType` + dispatches `SET_TOOL('draw')`
- Width: fixed right sidebar width (same as existing properties panels)

---

## Section 2 — Canvas Features

Canvas layer order (back to front):

```
1. Grid pattern (background)
2. Outer silhouette path
3. Zone shapes (existing)
4. Dimension labels
5. Wall elements / doors / windows (existing)
6. Selection / resize overlay (existing)
7. Placement overlay (existing)
```

### Grid
- Defined as an SVG `<pattern id="editor-grid">` in `EditorDefs.tsx`
- Pattern size: 46px × 46px (= 1m × 1m at current scale)
- Lines: `stroke="#e5e7eb"` (Tailwind grey-200), `strokeWidth={0.5}`
- Applied via a full-canvas `<rect fill="url(#editor-grid)">` as the first child of the canvas SVG

### Outer Silhouette
- Computed by `computeZoneUnion(zones: EditorZone[]): string`
  - Returns an SVG path string (`d` attribute) representing the polygon union of all zone rectangles
  - Pure function — no side effects, recomputed on every render
  - Algorithm: axis-aligned rectangle union via sweep-line (handles L-shapes, T-shapes, U-shapes, overlapping zones)
  - Returns empty string when `zones` is empty
- Rendered as `<path d={...} fill="#f8fafc" stroke="#94a3b8" strokeWidth={2} />`
- Positioned above the grid, below all zone shapes

### Dimension Labels
- One `<text>` element per zone, centred on the zone rectangle
- Content: `{(zone.w / scalePxPerM).toFixed(1)}m × {(zone.h / scalePxPerM).toFixed(1)}m`
- Style: `fontSize={11}`, `fill="#94a3b8"`, `textAnchor="middle"`, `dominantBaseline="middle"`
- Suppressed when zone is smaller than ~60px in either dimension (label would overflow)
- Rendered above zones, below the selection overlay

---

## Section 3 — Snap Gap Fix

### Root cause
SVG strokes are centred on the path boundary by default. Two adjacent zones each bleed half their stroke width into the shared edge, creating a visible gap even when zone coordinates are flush.

### Fix
In `EditorZoneShape.tsx` and `RoomWallRenderer.tsx`: reduce boundary stroke width to 1px for interior/shared edges. Outer wall faces retain their existing stroke weight. This is achieved by detecting which edges are exterior (touching no other zone) versus interior (shared with a neighbour) and applying different stroke widths per edge using explicit `<line>` elements rather than a single rect stroke.

If per-edge detection adds excessive complexity, fallback: set all zone strokes to `strokeWidth={1}` — eliminates the gap with minimal visual regression.

---

## Section 4 — Dutch Localisation

### Approach
Single file `src/utils/editorStrings.nl.ts` exporting a typed const object. No i18n library. Two users, one language.

### Coverage

```typescript
// Zone type names + legend descriptions
zoneTypes: {
  [ZoneType]: { naam: string; beschrijving: string }
}

// Toolbar buttons
tools: {
  selecteren: string   // "Selecteren"
  tekenen: string      // "Tekenen"
  deurPlaatsen: string // "Deur plaatsen"
  raamPlaatsen: string // "Raam plaatsen"
  ongedaanMaken: string// "Ongedaan maken"
  opslaan: string      // "Opslaan"
}

// Properties panel labels
eigenschappen: {
  naam: string           // "Naam"
  wanddikte: string      // "Wanddikte"
  hoekAfsnijding: string // "Hoekafsnijding"
  zijde: string          // "Zijde"
  // ...etc
}

// Save state
opslaan: {
  opgeslagen: string         // "Opgeslagen"
  opslaanBezig: string       // "Wijzigingen opslaan..."
  fout: string               // "Opslaan mislukt"
}
```

All editor components import from this file. Existing hardcoded English strings are replaced.

---

## Out of Scope

- Polyline/freeform wall drawing (backlog)
- Zoom and pan
- Plant/object placement bug (tracked separately in CLAUDE.md)
- Hardcoded shadow geometry (tracked separately)
- Mobile support

---

## Success Criteria

1. Right sidebar shows legend cards at all times; clicking a card activates that zone type
2. Properties panel appears below the legend when a zone or wall element is selected
3. All visible editor text is in Dutch
4. Grid is visible on the canvas at 1m intervals
5. Dimension labels appear on each zone large enough to display them
6. Outer silhouette renders correctly for rectangular, L-shaped, and U-shaped layouts
7. No visible white gap between zones that are snapped flush to each other
8. Existing undo/redo, auto-save, and snap behaviour are unaffected
