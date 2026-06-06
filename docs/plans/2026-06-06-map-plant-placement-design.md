# Map Plant Placement — Design Spec

**Date:** 2026-06-06
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** Frontend only. No backend or migration changes.

## Problem

A plant added through the form only lands on a map if the user selects a zone in
the **Placement** card — and that card sits inside the collapsed `{showDetails}`
section of `AddPlant.tsx` (`AddPlant.tsx:640`). A quick add never expands it, so
`map_id` / `map_x` / `map_y` stay null and the plant **never appears on any map**.
There is also no way to place an *already* unplaced plant onto a map after the
fact (Edit has a zone picker, but it isn't discoverable from the map).

Confirmed against production: plant **Venkel** (id 75) has
`map_id = map_x = map_y = location_id = NULL`, yet has full `care_thresholds` and
5 active care schedules — so the *only* real defect is placement, not care data.

## Goals

1. **Add flow** — make placement visible so new plants get placed, while keeping
   it optional (a just-acquired, not-yet-planted plant is a legitimate state).
2. **Recovery** — give unplaced plants a clear, map-side path onto the map.

Non-goals: forcing placement; auto-placing on a guessed map; backend changes;
component-level (jsdom) test coverage.

## Part A — Add flow: surface the zone picker

- In `AddPlant.tsx`, lift the **zone-picker `FormRow`** out of the
  `{showDetails && …}` Placement card so it is always visible in the main form.
  Light measurement and other advanced placement fields stay under "details".
- Behaviour is otherwise unchanged. No zone selected → `placedMap` is `undefined`
  → `map_id`/`map_x`/`map_y` remain undefined → the plant is created **unplaced**
  (now a recoverable state, see Part B). The existing submit path
  (`AddPlant.tsx:318`) already handles both branches; only the picker's position
  in the layout changes.

## Part B — Recovery: "unplaced plants" tray on the map

New component `UnplacedPlantsTray` rendered by `MapPage`, styled to match the
existing glassy floating chrome (same idiom as `MapTopBar` / `MapActionCluster`).

- **Source of truth:** the full household plant list already in the Zustand store,
  filtered to the unplaced, active ones:
  `useFloreren(s => s.plants).filter(p => p.is_active && !p.map_id)`.
  (The map's own `useMapData` plant list is map-scoped and excludes these, so the
  store is the correct source.)
- **UI:** hidden entirely when there are no unplaced plants. Otherwise a compact
  chip — e.g. `🪴 3 niet geplaatst` — that expands to a short list of plant chips
  (icon + name, e.g. *Venkel*).
- **Place action:** tapping a plant calls
  `plantsApi.setPosition(plant.id, { map_id: currentMap.id, map_x, map_y, ground_zone_id: null })`
  (the same `PUT /plants/{id}/position` route the drag-to-reposition flow already
  uses, `useMapInteraction.ts:310`), with a **default position at the centre of
  the current map's viewbox**. On success: call `useMapData.refresh()` (so the map
  re-fetches and renders the plant) and the store `loadPlants()` (so the tray drops
  the now-placed plant). The plant is then draggable to refine its spot via the
  existing interaction.

## Data flow

```
UnplacedPlantsTray  --tap-->  plantsApi.setPosition(id, {map_id, x, y, ground_zone_id:null})
                                   |  (PUT /plants/{id}/position — existing)
                                   v
                              refresh() (useMapData) + loadPlants() (store)
                                   |
                                   v
                       plant now in map's plant set -> PlantsLayer renders it
                                   |
                            (existing drag-to-reposition to refine)
```

## Error handling

- `setPosition` rejects → show an error toast; the plant stays in the tray
  (no optimistic removal until the call succeeds).
- Default position = viewbox centre, guaranteeing the freshly placed plant is
  on-screen before the user drags it. Position is rounded to integers like the
  drag path does.

## Components & boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `AddPlant.tsx` zone-row move | Make the zone picker always visible | existing `ZonePicker`, form state |
| `UnplacedPlantsTray` (new) | List + place unplaced plants from the map | store `plants`, `plantsApi.setPosition`, current map, refresh callbacks |
| `selectUnplacedPlants(plants)` (pure helper) | Derive the unplaced/active subset | — (unit-tested) |
| `viewboxCenter(viewbox)` (pure helper) | Default placement coordinates from a map's viewbox string | — (unit-tested) |

`MapPage` wires the tray in: passes the current map, the store's unplaced plants,
and a place-handler that calls `setPosition` then `refresh()` + `loadPlants()`.

## Testing

- **Unit (vitest, node env — matches repo convention):**
  - `selectUnplacedPlants` — filters by `is_active` and null `map_id`; ignores
    placed/inactive plants.
  - `viewboxCenter` — parses `"x y w h"` and returns the integer centre; handles
    malformed input by returning a safe fallback.
- **Manual (`npm run dev`):** add a plant without a zone → it shows in the tray on
  the map → tap it → it appears at centre and the tray count drops → drag to move →
  reload confirms the position persisted. Also place **Venkel** as the real case.

## Risks & tradeoffs

1. **Tray scope is household-wide, action is current-map.** The tray shows all
   unplaced plants regardless of which map is open; tapping places onto the
   currently-viewed map. This is intended ("drops onto the current map") but means
   the same plant could be placed on an indoor or outdoor map depending on context —
   acceptable, and movable afterwards.
2. **Two refreshes per placement** (`useMapData.refresh()` + store `loadPlants()`).
   Minor extra fetches; keeps the map view and the tray consistent without bespoke
   local state surgery.
3. **No component test for the wiring.** Per repo convention; the manual smoke is
   the safety net. Revisit if tray/refresh wiring regresses.

## Files (anticipated)

| File | Action |
|---|---|
| `frontend/src/pages/AddPlant.tsx` | Move zone-picker row out of `{showDetails}` |
| `frontend/src/components/map/UnplacedPlantsTray.tsx` | Create |
| `frontend/src/components/map/unplacedPlants.ts` (helpers) | Create (`selectUnplacedPlants`, `viewboxCenter`) |
| `frontend/src/components/map/__tests__/unplacedPlants.test.ts` | Create |
| `frontend/src/pages/MapPage.tsx` | Render + wire the tray |
| i18n strings (e.g. `niet geplaatst`) | Add to the existing translation files |
</content>
