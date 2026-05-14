# Resume: Dashboard/Home Page Redesign — Groei Plant APP

## What this is

Complete redesign of the Dashboard page (`/dashboard`) to serve as the main landing/home screen. Replaces a simple care-task list with a rich scrollable page: hero greeting, map previews, care tasks, and a "did you know" plant fact section. Home is now the first tab in bottom nav (was Maps).

## What's done

### Frontend — Dashboard page (major redesign)
- **Hero section**: Dutch greeting + user name in Playfair Display, Dutch date, ambient SVG plant icon scatter background, 3-stat pill row (Te laat / Vandaag / Binnenkort)
- **Maps section**: Horizontal scroll of map cards with thumbnail, name, Buiten/Binnen badge, "Nieuwe tuin" add card. Links to `/maps` for empty state.
- **Care tasks section**: Grouped by urgency (Te laat / Vandaag / Binnenkort) with Dutch labels. "Alle planten blij" empty state with peacelily SVG. Surgical optimistic updates on "Gedaan" click (no full reload).
- **Plant fact section**: "Wist je dat..." card pulled from `/api/plant-fact`, with plant icon, link to plant detail.
- **Helper components**: `StatPill`, `SectionHeader`, `Badge`, `TaskGroup`, `SectionDivider`, `IconScatter`
- **Styling**: Inline styles + Tailwind mix. Design colors: `#d64e2e` (terracotta red), `#160572` (deep navy), `#24e34c` (green), `#e29675` (terracotta light). Playfair Display for headings, Inter for UI text.

### Frontend — Other changes
- **App.tsx**: `/` now redirects to `/dashboard` (was `/maps`)
- **BottomNav.tsx**: First tab is now "Home" (house icon) → `/dashboard` (was "Maps" → `/maps`). Maps moved to second tab.
- **index.css**: Added `@keyframes wave` for the greeting emoji animation
- **API client (`api/client.ts`)**: Refactored from ~50 individual fetch functions into a generic `api<T>()` wrapper. Added `fetchPlantFact()`.
- **Store (`useGroeiStore.ts`)**: Added `plantFact` state, `loadPlantFact()` action, `createMap()`/`deleteMap()` actions, surgical dashboard task removal (no full reload on markDone/skipCare)
- **Types (`types/index.ts`)**: Added `PlantFactOut` interface

### Backend
- **`backend/database.py` deleted** → replaced with `backend/database/` package (`__init__.py`, `schema.py`, `migrations.py`, `seeds.py`). The FastAPI dependency is now `db_dep` imported from `database`.
- **`backend/models.py`**: Added `PlantFactOut` Pydantic model
- **All routers updated**: Changed from `get_db()` async context manager to `Depends(db_dep)` pattern
- **Dashboard router**: Updated to new DB pattern
- **New files**: `backend/seed_common_plants.py`, `backend/tests/test_db_seam.py`

### Backend (confirmed wired up)
- **Plant fact endpoint**: `GET /api/plant-fact` in `backend/routers/dashboard.py:70` — picks a random plant with species facts, returns `PlantFactOut`
- **Maps static files**: `/api/maps-static` mounted in `backend/main.py:43` via `StaticFiles`

## What still needs verification

1. **TypeScript type-check** — Run `npx tsc --noEmit` in `groei/frontend` to verify no type errors from the refactored API client.

2. **Backend tests** — `backend/tests/test_db_seam.py` exists but hasn't been run. Run `cd groei/backend && python -m pytest tests/`

3. **App smoke test** — `npm run dev` and verify the dashboard loads, greeting shows, map thumbnails render, care tasks display, and plant fact card appears.

4. **CSS cleanup** — The new dashboard uses many hardcoded inline color/style values. May want to extract into Tailwind config or CSS custom properties later.

5. **Mobile scroll** — Verify the map horizontal scroll works on mobile (`.no-scrollbar` class).

## Design decisions to preserve

- **Dutch UI**: All user-facing text is Dutch (greetings, labels, buttons, date format)
- **Home-first navigation**: Dashboard is the default landing, not Maps
- **Surgical updates**: Care task done/skip removes the task from dashboard state directly instead of full reload
- **Icon scatter**: Each section has its own set of ambient SVG icons (define in `HERO_ICONS`, `MAPS_ICONS`, etc.) — organic garden feel
- **No Tailwind-only**: The new dashboard uses inline `style={{}}` for typography/colors and Tailwind for layout/spacing. Follow this pattern if extending.
- **Generic API client**: All API calls go through the `api<T>()` wrapper in `client.ts`

## Key files

| File | Change |
|------|--------|
| `frontend/src/pages/Dashboard.tsx` | Complete rewrite (main work) |
| `frontend/src/api/client.ts` | Refactored to generic `api<T>()` |
| `frontend/src/store/useGroeiStore.ts` | Added plantFact, map CRUD, surgical updates |
| `frontend/src/types/index.ts` | Added `PlantFactOut` |
| `frontend/src/App.tsx` | `/` → `/dashboard` |
| `frontend/src/components/BottomNav.tsx` | Home tab first |
| `frontend/src/index.css` | Wave keyframes |
| `backend/models.py` | Added `PlantFactOut` |
| `backend/database/` | New package (replaces `database.py`) |
| All `backend/routers/*.py` | Updated to `Depends(db_dep)` |
