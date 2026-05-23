# Weed Detection Feature — Design Spec

**Date:** 2026-05-21
**Status:** Approved

---

## Goal

Let users photograph something in their garden and find out whether it is a known weed, then optionally log its location on a map.

---

## Architecture

### New files

| File | Responsibility |
|---|---|
| `frontend/src/pages/IdentifyWeedPage.tsx` | Route `/weeds/identify` — owns state machine, reuses `IdentifyCamera` + `identifyPlant()` API |
| `frontend/src/components/identify/IdentifyWeedResults.tsx` | Results screen: Pl@ntNet candidates with weed-catalog match badges + removal info |
| `frontend/src/components/identify/WeedSightingSheet.tsx` | "Log sighting" bottom sheet — map picker (if no pre-selected map) → tap-to-pin → POST `/weed-sightings` |

### Modified files

| File | Change |
|---|---|
| `frontend/src/api/client.ts` | Add `fetchWeedCatalog()`, `createWeedSighting()` |
| `frontend/src/i18n/translations.ts` / `nl.ts` / `en.ts` | Add `weeds.*` translation keys |
| `frontend/src/pages/Dashboard.tsx` | Add "Onkruid herkennen" entry-point card |
| `frontend/src/pages/MapPage.tsx` | Add weed-identify toolbar button (outdoor maps only) |
| `frontend/src/App.tsx` (or router file) | Register `/weeds/identify` route |

---

## State machine (`IdentifyWeedPage`)

```
privacy → camera → identifying → results → [sighting sheet] → done
                              → error
```

States mirror `IdentifyPlantPage` with one additional transition:

- `results` → `sighting`: user taps "Log sighting" on a matched result
- `sighting` → `done`: POST succeeds → navigate back

The page accepts optional route state `{ mapId: number, mapSlug: string }` passed by MapPage so the sighting sheet can skip the map-picker step.

---

## Data flow

1. `IdentifyCamera` captures a photo blob + dataUrl
2. `identifyPlant(blob)` → Pl@ntNet returns `PlantIdCandidate[]` with `scientific_name` + `score`
3. `IdentifyWeedResults` mounts → fetches `GET /weed-catalog` once (no query params — full list, small payload)
4. Each candidate's `scientific_name` is matched case-insensitively against `latin_name` in the catalog
5. Matched candidates: show "Known weed" badge + `common_name_nl` + `removal_difficulty`
6. Unmatched candidates: show "Not in weed catalog" label (still displayed so user can retry or dismiss)
7. User taps "Log sighting" on any matched candidate → `WeedSightingSheet` opens
8. User selects map (if not pre-selected) → taps location on mini-canvas → POST `/weed-sightings`
9. On success: navigate to `/map/:slug` (or back if arrived from MapPage)

---

## `IdentifyWeedResults` component

Props:
```ts
interface IdentifyWeedResultsProps {
  candidates: PlantIdCandidate[]
  thumbnail: string
  onLogSighting: (weedId: number, weedName: string) => void
  onRetry: () => void
  onDismiss: () => void
}
```

Renders:
- Thumbnail at top
- Per-candidate card: scientific name, score bar, weed badge or "not a known weed" note
- "Log sighting" button only on matched candidates
- "Opnieuw proberen" + "Sluiten" buttons at bottom

The weed catalog fetch happens inside this component via a local `useEffect`. Loading state shows a spinner on the badge column only — candidates render immediately.

---

## `WeedSightingSheet` component

Props:
```ts
interface WeedSightingSheetProps {
  weedId: number
  weedName: string
  preselectedMapId?: number
  preselectedMapSlug?: string
  onSaved: (mapSlug: string) => void
  onCancel: () => void
}
```

Steps:
1. **Map picker** (skipped if `preselectedMapId` set): list of outdoor maps from `useFloreren` — user taps one
2. **Pin placement**: simplified read-only SVG canvas at the selected map's aspect ratio (viewbox from store). Background is a solid rectangle. User taps → red dot appears at tap coordinates. Confirm button enabled after a pin is placed.
3. On confirm: POST `/weed-sightings` with `{ weed_id, map_id, map_x, map_y, sighted_at: new Date().toISOString() }`
4. On success: call `onSaved(mapSlug)` — caller navigates to `/map/:slug`

SVG coordinate conversion uses `screenToSVG()` from `utils/svgCoords.ts` (same as editor).

---

## API additions (`client.ts`)

```ts
export async function fetchWeedCatalog(): Promise<WeedSpeciesListItem[]>
export async function createWeedSighting(body: WeedSightingCreate): Promise<WeedSightingOut>
```

New types added to `types/index.ts`:
```ts
interface WeedSpeciesListItem {
  id: number
  slug: string
  common_name_nl: string
  latin_name: string
  family: string | null
  flower_color: string | null
  places: string[]
}

interface WeedSightingCreate {
  weed_id: number
  map_id: number
  map_x: number
  map_y: number
  notes?: string
  sighted_at: string  // ISO 8601
}

interface WeedSightingOut extends WeedSightingCreate {
  id: number
  weed_name: string
  weed_slug: string
  latin_name: string
  removal_difficulty: string | null
  created_at: string
}
```

---

## Entry points

### Dashboard card

Placed alongside the existing `📷 Foto-identificatie` card:

```tsx
<Link to="/weeds/identify">
  <ActionCard icon="🌿" title={t.weeds.identifyCard.title} subtitle={t.weeds.identifyCard.subtitle} />
</Link>
```

### MapPage toolbar (outdoor maps only)

A new toolbar button rendered only when `map.type === 'outdoor'`. Tapping it navigates to `/weeds/identify` with route state `{ mapId: map.id, mapSlug: map.slug }`.

---

## i18n keys

```ts
weeds: {
  identifyCard: {
    title: 'Onkruid herkennen'
    subtitle: 'Maak een foto en identificeer onkruid'
  }
  privacy: {
    notice: 'Je foto wordt gedeeld met Pl@ntNet voor herkenning. Er worden geen persoonlijke gegevens opgeslagen.'
    ack: 'Akkoord, verder'
  }
  identifying: 'Onkruid herkennen...'
  noMatch: {
    retry: 'Opnieuw proberen'
    dismiss: 'Sluiten'
  }
  knownWeed: 'Bekend onkruid'
  notAWeed: 'Niet in onkruidcatalogus'
  logSighting: 'Locatie vastleggen'
  sightingSheet: {
    title: 'Waar zit het?'
    pickMap: 'Kies een tuin'
    pinInstruction: 'Tik op de plek in de tuin'
    confirm: 'Opslaan'
    cancel: 'Annuleren'
    saved: 'Opgeslagen!'
  }
  errorService: 'Kon de herkenningsdienst niet bereiken.'
}
```

---

## Privacy

The weed identify flow reuses the same `PRIVACY_ACK_KEY` (`groei.identify.privacy_ack`) as the plant identify flow — one acknowledgement covers both. No separate consent gate needed.

---

## Error handling

| Error | Handling |
|---|---|
| Offline at page load | Show `t.identify.errorOffline` (reuse existing key) |
| Pl@ntNet 502/503 | Show `t.weeds.errorService` with retry + dismiss buttons |
| Weed catalog fetch fails | Show "?" badge on all candidates; "Log sighting" button hidden (no `weed_id` available) |
| POST `/weed-sightings` fails | Show inline error in sheet; sheet stays open |

---

## Out of scope

- Showing existing weed sightings on the map (separate feature)
- Removing/editing sightings
- Weed-specific care advice
- Offline catalog caching
