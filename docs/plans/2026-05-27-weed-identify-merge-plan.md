# Weed-identify merge — plan

**Date:** 2026-05-27
**Status:** Approved, in implementation.

## Goal

Collapse the two camera-driven flows (`/identify` and `/weeds/identify`)
into one. After BioCLIP/PlantNet returns a species, check the weed catalog
client-side and surface a weed strip on matching candidates. No backend
changes.

The product win is *discovery*: a user photographing "a plant" learns it's
also a known weed and can log a sighting in place, without choosing between
two camera buttons up-front.

## Scope (in)

- `IdentifyResults.tsx` fetches the weed catalog and, per candidate,
  shows a weed strip when:
  - `latin_name` matches a catalog entry (case-insensitive exact match), and
  - overall result confidence is not `low` (false-positive cost is higher
    for weeds — "go dig this up" is harsher than "maybe Monstera").
- Weed strip content (matching the data the catalog currently exposes,
  not the richer mockup): badge `🌿 Bekend onkruid`, `common_name_nl`,
  `places`, and a `📍 Log sighting` button.
- `IdentifyPlant.tsx` gains a `sighting` step that renders
  `WeedSightingSheet` inline. Route state `{ mapId?, mapSlug? }` is
  forwarded so the sheet can preselect the map.
- Privacy ack (`groei.identify.privacy_ack` in localStorage) moves from
  page-load gate to just-before-save inside `WeedSightingSheet`. Plant-ID
  users no longer see a weed-privacy popup they don't need.
- `MapPage.tsx`: both `/weeds/identify` links now route to `/identify`
  with the same route state.
- `Dashboard.tsx`: drop the `🌿 Onkruid herkennen` card. The existing
  `Foto-identificatie` card is the single entry point.
- `App.tsx`: drop `/weeds/identify` route + `IdentifyWeedPage` lazy import.
- Delete `pages/IdentifyWeedPage.tsx` and
  `components/identify/IdentifyWeedResults.tsx`. `WeedSightingSheet` stays.

## Scope (out)

- No weed-catalog API expansion (removal_advice, difficulty, edible, tip
  fields). The richer mockup is a follow-up, gated on the catalog actually
  having those columns and Leon filling them in.
- No fuzzy matching beyond exact `latin_name`. PlantNet returns
  `scientificNameWithoutAuthor` and BioCLIP returns plain Latin, so the
  exact-match case covers ~all current cases. If genus-only matches show
  up in practice, address separately.
- i18n strings: the new "weed strip" reuses existing `t.weeds.*` keys
  where possible. No new translation work.

## File-by-file changes

| File | Change |
|---|---|
| `frontend/src/components/identify/IdentifyResults.tsx` | Fetch weed catalog. For each candidate, render a weed strip below the row when matched and confidence != `low`. Hook for `onLogSighting(weedId, weedName)`. |
| `frontend/src/pages/IdentifyPlant.tsx` | Add `sighting` step; read `mapId`/`mapSlug` from `useLocation().state`; pass `onLogSighting` to `IdentifyResults`; render `WeedSightingSheet` for the sighting step. |
| `frontend/src/components/identify/WeedSightingSheet.tsx` | Gate `handleConfirm()` on the privacy ack: if not acked, show a tiny confirm-and-store inline before submitting. |
| `frontend/src/pages/MapPage.tsx` | `navigate('/weeds/identify', …)` → `navigate('/identify', …)` (2 call sites). |
| `frontend/src/pages/Dashboard.tsx` | Remove the `/weeds/identify` Link/card. |
| `frontend/src/App.tsx` | Remove `IdentifyWeedPage` lazy import and `/weeds/identify` route. |
| `frontend/src/pages/IdentifyWeedPage.tsx` | Delete. |
| `frontend/src/components/identify/IdentifyWeedResults.tsx` | Delete. |

## Verification

- `npm run dev`, manually:
  - Dashboard shows one identify card.
  - `/identify` from Dashboard: photograph a plant, no weed match → unchanged behaviour.
  - `/identify` from Dashboard: photograph a weed (e.g. dandelion) at decent confidence → weed strip appears; "Log sighting" opens the sheet; map picker shows outdoor maps.
  - MapPage outdoor map → 🌿 button: opens `/identify`, sighting flow preselects this map.
  - Privacy ack appears once (before first save), then no longer.
- No build/type errors in the frontend.
