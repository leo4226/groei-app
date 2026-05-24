# Floreren — Plant Care PWA

Mobile-first PWA for Leon & Lisbeth (Amsterdam) to track plants, log care, and visualise their garden and indoor spaces. Built to eventually support other users with their own gardens.

## Dev

All commands run from the repo root:

```
npm run dev          # starts both frontend (port 5173) and backend (port 8000)
npm run dev:frontend
npm run dev:backend
```

Verify features in a desktop browser. Mobile testing not required during development.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| State | Zustand — `useFloreren` (FlorerStore) |
| Backend | FastAPI + Python + asyncpg (prod: PostgreSQL, dev: SQLite) |
| PWA | vite-plugin-pwa |

## Project structure

```
Floreren/
  frontend/src/
    pages/          # route-level components
    components/
      map/          # map view (read-only garden/indoor display)
      editor/       # layout editor (draw zones, rooms, walls)
      sheets/       # bottom sheet panels
      sun/          # sun position + heatmap overlays
    store/          # useFloreren.ts (Zustand)
    utils/          # coordinate math, sun calc, shadow geometry
    hooks/
  backend/
    routers/        # FastAPI route modules
    models.py       # Pydantic response models
    main.py
    groei.db        # local SQLite (dev only)
```

## Routes

| Path | Page |
|---|---|
| `/maps` | Map list |
| `/maps/:id/edit-layout` | Layout editor |
| `/map/:slug` | Garden/indoor map view |
| `/dashboard` | Daily care overview |
| `/plants` | Plant list |
| `/calendar` | Planning calendar |
| `/settings` | Settings |

## Map system

### Map types

Every map has a `type: 'outdoor' | 'indoor'`:

- **garden** — outdoor space. Has `lat`, `lon`, compass `bearing` (direction the map's "up" points), and real-world dimensions. Sun overlay and shadow simulation apply.
- **indoor** — floor plan with rooms, walls, doors, windows. No GPS, no sun features.

### SVG canvas

- The SVG `viewBox` comes from `map.viewbox` in the DB — never hardcode it.
- The SVG scales to fill its container using `preserveAspectRatio="xMidYMid meet"` (letterbox, no rotation).
- On mobile, the SVG container uses a 90° CSS rotation (`rotate(-90deg) translateX(-100%)`) to present landscape maps in portrait. `screenToSVG()` handles this via `getScreenCTM()` — no manual rotation math needed.
- Scale is `PX_PER_M = 46` (46 px = 1 m). This will become per-map; do not assume it is fixed.

### Coordinate system

SVG coordinates are the source of truth. `screenToSVG()` converts pointer events to SVG space. Do not apply manual rotation transforms when computing coordinates.

### Shadow casters

Shadow casters are derived per-map from canvas data via `deriveAllShadowCasters()` in `utils/gardenFromCanvas.ts`. The function combines fence casters, structure casters (both computed from zones), and per-map `shadowCasters` stored in canvas data. The editor supports adding/editing/deleting shadow casters per map. `GARDEN_CLIP` in `gardenStructures.ts` is still hardcoded to Leon's garden and used by the sun overlay components (`SunDebugOverlay`, `SunDirectionArrow`, `SunHeatmap`, `DebugSvfOverlay`) for viewbox/centering — this is the last remaining hardcoded garden constant and will need to become per-Map when the second outdoor Map is added.

## New garden onboarding

When a user creates a new garden, the minimum required fields are:
- Name
- Dimensions (width × depth in metres)
- GPS location (lat/lon) — for sun position
- Compass bearing of the map's "up" direction

Indoor maps only need a name and dimensions.

## Users

Leon & Lisbeth only — simple household toggle, no authentication, no multi-tenancy in Phase 1.

Leon's garden: Amsterdam, 52.3715°N 4.8499°E.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`leo4226/groei-app`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
