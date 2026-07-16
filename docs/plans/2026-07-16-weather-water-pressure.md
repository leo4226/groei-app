# Map-aware Weather Water Pressure Implementation Plan

> **For Hermes:** Execute with red-green-refactor TDD. This issue is read-only: no schedule mutation.

**Goal:** Add a map-local, explainable Water outlook that recommends an earlier moisture-check date when heat/evaporation outpaces effective rain, while preserving every saved Water deadline.

**Architecture:** Consolidate Open-Meteo access in a coordinate-keyed service and keep the pressure calculation pure. The API joins active Water schedules to plants/maps, evaluates each plant independently, and returns map-level summaries. Calendar renders the summaries as informational context, never as completable care events.

**Rules:**

- `next_due` is authoritative and is never changed.
- `recommended_check_date <= next_due` always.
- Missing coordinates/weather returns neutral pressure and the saved due date.
- Outdoor: recent rain + forecast rain reduce extra pressure; ET₀ and heat raise it.
- Containers capture less rain and dry faster than rooted ground.
- Indoor: rain is ignored; outdoor temperature is a lower-weight, explicitly-labelled proxy.
- The pressure engine is deterministic and bilingual.

---

## Task 1: Pure pressure engine

- Add RED tests for hot/dry container, wet rooted ground, warm indoor, forecast-rain suppression, missing data and never-later invariant.
- Implement a pure typed service returning level, score, recommended date, factors and NL/EN reasons.
- Keep coefficients named and documented so behavior is auditable.

## Task 2: Coordinate-keyed forecast service

- Add RED tests for rounded coordinate cache keys, independent maps, TTL and graceful stale fallback.
- Fetch seven historical + seven forecast days with precipitation, temperature and FAO ET₀.
- Do not fall back to Amsterdam when an outdoor map lacks coordinates.

## Task 3: Household Water outlook API

- Add authenticated endpoint tests for household isolation and environment behavior.
- Join active Water schedules to active plants/maps and aggregate by map.
- Return source freshness and neutral results when weather is unavailable.

## Task 4: Calendar context UI

- Add typed API model and client method.
- Add bilingual Water outlook card in Calendar’s existing weather/seasonal context area.
- Show map, pressure, check date and concise explanation; no complete/skip controls.
- Verify loading/error/empty states and NL/EN rendering.

## Task 5: Verification

- Full backend and frontend suites.
- i18n lint, exact TypeScript gate and Vite build.
- Live dev-Neon API and browser QA without schedule writes.
- Independent review, commit, push, PR with `Closes #664`.

### Completed gates

- Backend: `637 passed`.
- Frontend: `366 passed`; i18n lint reported 0 errors.
- `npx tsc -b --force` and `npm run build` passed.
- Live Open-Meteo: 14 normalized pressure days, 7 backward-compatible public days, today at index 0, ET₀ present.
- Dev Neon: 2 maps / 26 plants; all recommendations on or before saved deadlines; 61 Water schedule rows unchanged before and after the request.
- Desktop browser: outlook above agenda, Garden/House filters and indoor proxy label verified.
