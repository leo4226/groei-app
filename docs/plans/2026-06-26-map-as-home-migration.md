# Map as Home — Migration Plan

**Date:** 2026-06-26  
**Status:** Approved, not started  
**Author:** Leon + Claude (claude-opus-4-8)

---

## The Problem

The Dashboard (`/dashboard`) is a junk-drawer. It aggregates six things — greeting, map cards, care triage, logbook, weather, plant fact — but every one of them has a better natural home elsewhere in the app. Meanwhile, the Map page is Floreren's real differentiator: a to-scale spatial garden twin with live sun simulation and shadow casting that no competitor has. It's buried behind a tab.

The Dashboard also duplicates work. The care signals section re-implements (in a different data shape) what `MapBottomSheet` already shows. The map cards re-present what the Maps tab already holds. The logbook re-presents what `/log` already holds.

**Goal:** Make the map the landing page. Dissolve the dashboard by moving each piece to the place where it belongs. Drop the app from 5 nav tabs to 4.

---

## Strategic Constraints

1. **Don't lose the daily triage loop.** The retention engine is "what needs me today?". The dashboard is the only place that shows care needs *across all maps* in one view. The Map bottom sheet currently only covers the *current* map. This cross-map aggregation must survive the migration — it moves into the map bottom sheet as a global mode.

2. **New-user first run must still work.** A user with no maps must land on a welcoming empty state with a clear "create your garden" call to action, not a blank map view. This was fixed in PR #281 — the `MapRedirect` component already handles this.

3. **Keep each step independently shippable.** Every phase below can be merged and deployed on its own. No phase requires the next one to be complete.

4. **One reversal point.** Phase 0 (repoint `/`) is a one-line change and can be undone instantly if anything feels wrong before later phases are complete.

---

## Architecture Overview

### Current flow

```
/ → /dashboard (home tab)
/maps → MapRedirect → /map/:slug  (maps tab)
BottomNav: Home | Plants | Maps | Calendar | Settings
```

### Target flow

```
/ → /maps → MapRedirect → /map/:slug  (home tab)
BottomNav: Map | Plants | Calendar | Settings
/dashboard → still exists as a route but no longer linked from nav
            → can be fully removed in Phase 6
```

### Data sources — critical distinction

The current care system uses **two different data shapes** for care needs:

| Source | Used by | Data | Scope |
|---|---|---|---|
| `GET /api/warning-summary` | Dashboard `CareWarningsSection` | `WarningSummaryOut` with `.buckets.nu`, `.vandaag`, `.komende_week` (each is `BucketPlantOut[]` with `map_name`, `plant_id`, `care_type`, `days_overdue`, `top_warning`) | **All maps, cross-household** |
| `GET /api/maps/:id/plants` | MapPage → `CareNeedsList` | `MapPlant[]` with `.warnings[]` / `.top_warning` | **Single map only** |

Phase 1 solves this gap by making the map bottom sheet optionally drive off the global `WarningSummaryOut` instead of the per-map `MapPlant[]` list.

---

## Phase 0 — Repoint the Root Route

**Effort:** 10 minutes, 2 files  
**Risk:** Very low — one-line change in `App.tsx`, fully reversible

### What changes

**`frontend/src/App.tsx`** — change the root redirect:

```tsx
// Before
<Route path="/" element={<Navigate to={getToken() ? '/dashboard' : '/login'} replace />} />

// After
<Route path="/" element={<Navigate to={getToken() ? '/maps' : '/login'} replace />} />
```

That's it. Users now land on the map. Everything else still works. The dashboard is still reachable at `/dashboard` by typing the URL — it just isn't the default anymore.

**`frontend/src/components/BottomNav.tsx`** — the Home tab already points to `/dashboard`. For Phase 0, don't change BottomNav yet (doing it alongside Phase 0 would confuse users if the home tab suddenly means "map"). Leave the home tab as `/dashboard` until Phase 1 is complete and the bottom sheet is globally aware.

### Acceptance

- Navigating to `/` as a logged-in user lands on the primary garden map
- Navigating to `/` as a new user (no maps) lands on the empty-state (MapRedirect already handles this)
- The `/dashboard` route still works and still has the Home tab pointing to it

---

## Phase 1 — Globalize the Map Bottom Sheet

**Effort:** 3–5 days, several files  
**Risk:** Medium — touches MapPage and introduces a new component  
**Gate for:** Phases 3 and 5 (those can proceed independently, but this is the biggest UX change)

This is the core work. The goal: the Map bottom sheet's "care" tab shows needs across *all* the user's maps, not just the one currently displayed.

### New component: `GlobalCareSheet`

Create `frontend/src/components/map/GlobalCareSheet.tsx`.

This component does what `Dashboard.tsx > CareWarningsSection` does, but:
- Smaller / more compact for the sheet context (no `SectionHeader`, no section padding)
- Keeps the "nu / vandaag / deze week" bucket structure
- Keeps the per-map grouping (so you see "Tuin · 2 plants" / "Huis · 1 plant")
- Keeps the Done / Skip buttons with the same `markCareDone` / `skipCare` store calls
- Keeps the toast confirmation
- Does **not** replicate the "collapsible toggle row" wrapper — the bottom sheet itself is the expand/collapse affordance

**Data source:** `useFloreren((s) => s.warningSummary)` — already in the Zustand store, already loaded on app boot by `App.tsx > load()`.

```tsx
// frontend/src/components/map/GlobalCareSheet.tsx

interface Props {
  onPlantTap?: (plantId: number) => void   // optional: pan map to plant
}

export default function GlobalCareSheet({ onPlantTap }: Props) {
  const { warningSummary, loadWarningSummary, markCareDone, skipCare } = useFloreren()
  // ...
  // Render buckets using same buildMapGroups() logic from Dashboard
  // Each BucketPlantOut has .plant_id, .care_type, .map_name, .days_overdue, .top_warning
  // Done button calls markCareDone(plant_id, care_type)
  // Skip button calls skipCare(plant_id, care_type)
}
```

**Why not reuse `CareWarningsSection` directly?** It has styling (padding, section headers) that assumes it's embedded in the dashboard scroll. Better to extract the shared grouping/sorting logic into a utility (`careWarningsModel.ts` alongside `careNeedsListModel.ts`) and have both components consume it. This avoids copy-paste drift.

### Refactor: extract shared grouping logic

Create `frontend/src/components/map/careWarningsModel.ts` (or `frontend/src/utils/careGrouping.ts`):

- Extract `buildMapGroups()` from `Dashboard.tsx` lines 266–282
- Extract `buildBucketItems()` from `Dashboard.tsx` lines 299–330
- Export both so `Dashboard.tsx` and `GlobalCareSheet.tsx` can import them

### Wire up: MapPage changes

**`frontend/src/pages/MapPage.tsx`** — the bottom sheet currently receives `attentionCount` (per-map) and `careContent` (`<CareNeedsList>`). Add a `globalCount` fallback:

```tsx
// In MapPage — load warningSummary for the global peek count
const { warningSummary, loadWarningSummary } = useFloreren()
useEffect(() => {
  if (!warningSummary) loadWarningSummary()
}, [])

// Global attention count (cross-map) — used when the sheet is in global mode
const globalAttentionCount = useMemo(() => {
  if (!warningSummary) return attentionCount   // fall back to per-map while loading
  return (warningSummary.buckets.nu.length + warningSummary.buckets.vandaag.length)
}, [warningSummary, attentionCount])
```

The bottom sheet's peek label then reads from `globalAttentionCount`. The expanded content switches:

```tsx
<MapBottomSheet
  mode={sheetMode}
  attentionCount={globalAttentionCount}
  careContent={
    warningSummary
      ? <GlobalCareSheet onPlantTap={...} />
      : <CareNeedsList plants={plants} objects={objects} onPlantTap={handlePlantTap} />
  }
  sunContent={<SunControls ... />}
  autoExpand={sun.active && isOutdoor}
/>
```

Keep `CareNeedsList` as the fallback while `warningSummary` loads (first render). Once it arrives, the global view takes over.

### MapBottomSheet peek label update

`frontend/src/components/map/MapBottomSheet.tsx` — the peek label currently says "● N need attention". Make the label show the garden context when the count is global:

```
// Before
● 3 need attention

// After (global mode)  
● 3 plants need care across your gardens
  (or: ● 2 nu · 1 vandaag)
```

Add a translation key: `t.mapPage.sheetGlobalAttention(n: number)`.

### `onPlantTap` in global mode — panning across maps

When the user taps a plant in `GlobalCareSheet`, the plant might be on a *different* map from the one currently shown. The tap handler in `MapPage` needs to check:

```tsx
function handleGlobalPlantTap(plantId: number, mapName: string) {
  const targetMap = maps.find(m => m.name === mapName)
  if (targetMap && targetMap.slug !== slug) {
    // Navigate to that map, passing plantId in location.state to auto-open its sheet
    navigate(`/map/${targetMap.slug}`, { state: { focusPlantId: plantId } })
  } else {
    // Same map — tap as normal
    const plant = plants.find(p => p.id === plantId)
    if (plant) handlePlantTap(plant)
  }
}
```

This is a nice-to-have for Phase 1. Acceptable to leave as a no-op (just close the sheet) for the first ship and refine in Phase 1b.

### Acceptance

- Bottom sheet peek shows total care needs across all the user's gardens
- Expanded sheet lists plants grouped by garden, with Done / Skip that actually work
- Plants in the current garden are tappable (pan to them)
- Plants in other gardens navigate to their garden on tap
- Per-map `CareNeedsList` renders correctly while `warningSummary` is loading

---

## Phase 2 — Weather Moves to the Map

**Effort:** 1 day, 2 files  
**Risk:** Low — additive only  
**Depends on:** Nothing (can ship any time after Phase 0)

Weather is about *your garden right now* — temperature, rain, sun position. It belongs on the spatial view of your outdoor space, not on a card stack.

### New component: `WeatherPill`

Create `frontend/src/components/map/WeatherPill.tsx`.

A floating pill in the top-right of the outdoor MapPage (below `MapActionCluster`), showing:

```
☀ 06:12 — 21:45 · 18°C  ↑ slight rain expected
```

Same data as `DashboardHeader`'s weather line (uses `useWeather(lat, lon)` hook — already in the codebase at `frontend/src/hooks/useWeather.ts`).

Tap behavior: expand to a compact forecast (reuse `WeatherCard` from `frontend/src/components/dashboard/WeatherCard.tsx` as a floating modal or popover, or navigate to `/calendar` which already shows planting suitability).

Placement: positioned absolutely below `MapActionCluster`, top-right, same frosted-glass treatment as MapTopBar.

Only visible on outdoor maps (`map.map_type === 'outdoor'` and `map.lat != null`). Hides automatically in landscape-mobile (`landscape-mobile-hide` class like BottomNav).

### MapPage changes

In `frontend/src/pages/MapPage.tsx`, add `<WeatherPill>` to the floating layer:

```tsx
{isOutdoor && mapLat && (
  <div className="absolute top-14 right-3 z-20">
    <WeatherPill lat={mapLat} lon={mapLon!} />
  </div>
)}
```

### Dashboard cleanup (deferred to Phase 6)

Don't remove `WeatherCard` from Dashboard in this phase — wait until the Dashboard is retired entirely. The card is also useful on desktop breakpoints where the sidebar still has space.

### Acceptance

- Outdoor map shows a weather pill with current temp + sun times
- Tapping the pill shows a 7-day forecast (popover or navigation)
- Indoor maps show no weather pill
- Map without GPS (no lat/lon) shows no weather pill

---

## Phase 3 — Logbook Recent Feed Moves to Plants

**Effort:** Half a day, 2 files  
**Risk:** Low  
**Depends on:** Nothing

The logbook feed on Dashboard shows the last N care log entries. This is plant care history — it belongs with plants, not with a map overview.

### Plants page

In `frontend/src/pages/Plants.tsx`, add a "Recent care" collapsible section at the bottom (below the plant list, above the padding):

```tsx
<RecentCareSection />
```

This renders the same `LogboekSection` component from `Dashboard.tsx` lines 815–845. Extract it to `frontend/src/components/plants/RecentCareSection.tsx` so both Dashboard (during the transition) and Plants can import it.

Data source: `dashboardV2.recent_log` from Zustand. Load it in Plants page if not already loaded:

```tsx
useEffect(() => {
  if (!dashboardV2) loadDashboardV2()
}, [])
```

### `/log` page promotion

The full logbook at `/log` already exists but isn't discoverable. Add a "View full logbook →" link from the Plants page header or the Plants settings menu. This is the long-term home for care history.

### Acceptance

- Plants page shows a "Recent care" section at the bottom, collapsible
- Tapping any entry navigates to that plant's detail page
- The `/log` route is linked from Plants

---

## Phase 4 — Plant Fact Moves to Plants/Discovery

**Effort:** 30 minutes, 2 files  
**Risk:** Very low  
**Depends on:** Nothing

The "did you know" `CareTipCard` from the Dashboard sidebar belongs in the learning/discovery pillar.

### Plants page

Add `CareTipCard` to the top of `Plants.tsx` (above the plant list, below the search bar) as a compact dismissable card. Only show it once per session (localStorage key `floreren-fact-dismissed-date`).

Or: move it to `frontend/src/pages/DiscoveryCard.tsx` which already exists at `/plants/discovery`. The Discovery route already exists but isn't prominent — this gives it useful content.

Extract `CareTipCard` component from `Dashboard.tsx` lines 847–875 into `frontend/src/components/plants/PlantFactCard.tsx`.

### Acceptance

- A plant fact appears at the top of the Plants page or on the Discovery page
- Dashboard `CareTipCard` still renders there during the transition (uses the same extracted component)

---

## Phase 5 — WelcomeChecklist Moves to Map

**Effort:** 1 day, 2 files  
**Risk:** Low  
**Depends on:** Phase 0 complete (so new users actually land on the map)

Currently `WelcomeChecklist` is embedded in Dashboard. After Phase 0, new users land on the map — so the checklist needs to be visible there.

### First-run overlay

Create `frontend/src/components/map/FirstRunOverlay.tsx`.

Shown on top of the map (inside MapPage) when any of these are true and `hasLoaded` is true:
- User has no plants yet
- User has only one map and no zones drawn yet (canvas_data is empty/null)

The overlay is a bottom sheet or modal that shows the 2–3 key first steps:
1. Draw your garden layout (links to edit-layout)
2. Add your first plant (links to `/plants/add`)
3. Optional: invite a household member

Dismiss condition: user completes all steps OR explicitly dismisses. Dismissed state stored in localStorage keyed by `account_id`.

### Remove from Dashboard

Remove `<WelcomeChecklist>` from `Dashboard.tsx` lines 77–85. The component (`frontend/src/components/WelcomeChecklist.tsx`) can be kept for reference but the Dashboard render is removed.

### Acceptance

- New user (no plants, empty map) sees the first-run steps as an overlay on the map
- Returning user who has completed setup never sees the overlay
- Dismissed state persists across sessions

---

## Phase 6 — Retire Dashboard + Finalize Nav

**Effort:** 1 day, 4 files  
**Risk:** Low if phases 1–5 are complete  
**Depends on:** All previous phases shipped and stable for ≥ 1 week

### Remove Dashboard from nav

**`frontend/src/components/BottomNav.tsx`** — remove the Home tab, replace with Map tab pointing to `/maps`:

```tsx
const tabs = [
  { to: '/maps', label: t.nav.map, icon: mapIcon },       // was: Home → /dashboard
  { to: '/plants', label: t.nav.plants, icon: plantIcon },
  { to: '/calendar', label: t.nav.calendar, icon: calIcon },
  { to: '/settings', label: t.nav.settings, icon: gearIcon },
]
```

Add a translation key `t.nav.map` (nl: "Kaart", en: "Map").

Note: The `/maps` tab (third tab, currently) effectively becomes the first/home tab. Its icon already exists. Remove the old third tab entry.

### Remove Dashboard route (optional, keep for safety)

In `frontend/src/App.tsx`, you can keep the `/dashboard` route alive but redirecting to `/maps`, so bookmarks and any external links don't 404:

```tsx
<Route path="/dashboard" element={<Navigate to="/maps" replace />} />
```

Or remove it entirely and let it 404. The redirect is safer.

### Remove Dashboard components from build

Once `/dashboard` no longer renders, these can be tree-shaken by Vite automatically. Optionally delete:
- `frontend/src/pages/Dashboard.tsx` (or archive it)
- `frontend/src/components/dashboard/WeatherCard.tsx` (if WeatherPill fully replaces it)
- `frontend/src/components/WelcomeChecklist.tsx` (if FirstRunOverlay replaced it)

Don't rush the deletions — keep them for one release cycle to verify nothing else imports them.

### Translation cleanup

Add any missing nav keys to `frontend/src/i18n/nl.ts` and `en.ts`.

### Acceptance

- BottomNav shows 4 tabs: Map · Plants · Calendar · Settings
- `/` → Map (for logged-in users)
- `/dashboard` redirects to `/maps`
- No broken links in the app
- `npm run build` passes without unused import warnings

---

## Files Changed — Full Reference

| Phase | File | Change |
|---|---|---|
| 0 | `frontend/src/App.tsx` | `/` redirect: `/dashboard` → `/maps` |
| 1 | `frontend/src/components/map/GlobalCareSheet.tsx` | **new** — cross-map care list |
| 1 | `frontend/src/utils/careGrouping.ts` | **new** — extracted grouping logic from Dashboard |
| 1 | `frontend/src/components/map/MapBottomSheet.tsx` | Update peek label i18n |
| 1 | `frontend/src/pages/MapPage.tsx` | Load warningSummary; switch careContent to GlobalCareSheet |
| 1 | `frontend/src/pages/Dashboard.tsx` | Import grouping from shared util |
| 2 | `frontend/src/components/map/WeatherPill.tsx` | **new** — compact weather display |
| 2 | `frontend/src/pages/MapPage.tsx` | Render WeatherPill for outdoor maps |
| 3 | `frontend/src/components/plants/RecentCareSection.tsx` | **new** — extracted log feed |
| 3 | `frontend/src/pages/Plants.tsx` | Render RecentCareSection |
| 3 | `frontend/src/pages/Dashboard.tsx` | Import RecentCareSection |
| 4 | `frontend/src/components/plants/PlantFactCard.tsx` | **new** — extracted fact card |
| 4 | `frontend/src/pages/Plants.tsx` or `DiscoveryCard.tsx` | Render PlantFactCard |
| 4 | `frontend/src/pages/Dashboard.tsx` | Import PlantFactCard |
| 5 | `frontend/src/components/map/FirstRunOverlay.tsx` | **new** — onboarding overlay |
| 5 | `frontend/src/pages/MapPage.tsx` | Render FirstRunOverlay for new users |
| 5 | `frontend/src/pages/Dashboard.tsx` | Remove WelcomeChecklist |
| 6 | `frontend/src/components/BottomNav.tsx` | 5 tabs → 4 tabs |
| 6 | `frontend/src/App.tsx` | `/dashboard` → redirect |
| 6 | `frontend/src/i18n/nl.ts` + `en.ts` + `translations.ts` | `nav.map` key |
| 6 | `frontend/src/pages/Dashboard.tsx` | Archive or delete |

---

## Translation Keys Needed

```typescript
// translations.ts additions

nav: {
  map: string     // "Kaart" / "Map"
}

mapPage: {
  sheetGlobalAttention: (n: number) => string
  // nl: n === 1 ? '1 plant heeft aandacht nodig' : `${n} planten hebben aandacht nodig`
  // en: n === 1 ? '1 plant needs attention' : `${n} plants need attention`
  sheetAllGoodGlobal: string
  // nl: 'Alles goed in je tuinen'
  // en: 'All gardens on schedule'
}
```

---

## What Stays on the Dashboard (during transition)

During the transition period (Phase 0 complete, Phase 6 not yet), the dashboard remains accessible and still functional at `/dashboard`. Users who bookmarked it can still reach it. The Home tab in BottomNav continues pointing there until Phase 6.

This is intentional — we are running a shadow period where both exist, so we can monitor whether the map as home actually covers the daily-triage use case adequately before we retire the dedicated page.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| User with 4 maps + 60 plants finds triage harder on the map than on a list | Add "list view" toggle on the GlobalCareSheet (same data, just displayed as a plain list without map context) |
| `warningSummary` takes time to load → bottom sheet shows wrong count on first render | Fall back to per-map `attentionCount` while loading; show a loading indicator in the sheet |
| `GlobalCareSheet` Done/Skip crosses map boundary — plant is on map B but user is viewing map A | Works correctly because `markCareDone`/`skipCare` use `plant_id` globally; the map view just doesn't visually update the dot until the user navigates to that map |
| First-run overlay annoys returning users | localStorage dismiss keyed by `account_id` ensures it only shows once; also only shows when garden is genuinely empty |
| Removing `/dashboard` breaks Framer/motion previews or any external preview tools | Keep the redirect in Phase 6 rather than deleting the route |

---

## Success Metrics

After Phase 6 ships, we expect:
- Time-to-first-care-action drops (user sees the triage immediately on landing instead of navigating)
- Plants page becomes a richer destination (log + fact card justify visiting it beyond care)
- The Map tab becomes the most-tapped nav item (currently it's probably second or third)
- New-user setup completion rate stays flat or improves (FirstRunOverlay is more contextual than the old checklist)
