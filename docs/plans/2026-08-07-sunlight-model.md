# Sunlight Model — Audit Findings & Decision (2026-08-07)

Status: decided (improved 4-bucket, not full DLI)
Supersedes: #443 (closed umbrella), the "6-8h vs 3-4h" label mismatch
Closes: #812 (design-doc deliverable)

## 1. Why this exists

The sunlight calculator (frontend `utils/sunCalc.ts`, `shadowGeometry.ts`,
`heatmapCalc.ts`, `skyViewFactor.ts`, `lightQuality.ts`) computes per-cell sun
hours and sky-openness, then buckets a spot into one of four light qualities:
full sun (≥4h direct), partial (2–4h), bright shade (SVF ≥ 0.5), deep shade
(SVF < 0.5). The bucket drives plant-suitability rings, spot-inspector advice,
and (since #800) the water-pressure model via per-plant exposure.

Issue #443 wanted to move from these four buckets to a continuous DLI-based
light availability. This document records the audit and the decision: keep the
4-bucket system, upgrade its core unit from *minutes of direct sun* to
*intensity-weighted sun*, and add cloud cover as a light-quality signal.

## 2. Audit findings (verified in code)

What the calculator does today:

1. Sun position per sample: `getSunPosition` (suncalc) returns azimuth,
   altitude, isUp — altitude is available but **unused**.
2. Shadow regions: `computeShadowRegions` (2-D polygons, convex hull,
   excludeSelf punching) determine per-cell direct-sun samples.
3. Sun hours: `computeHeatmap` samples the **15th of the month** every 10
   minutes, counts minutes of direct sun, exposes `sunMinutes`/`sunHours`.
4. Sky openness: `computeSkyOpenness` — cosine-weighted hemisphere raycasting
   (Fibonacci lattice, box/cylinder obstructions) — computed once per cell.
5. Buckets: `lightQuality.ts` combines sunHours + skyOpenness into 4 buckets.

What underperforms:

- **Hours ≠ light.** A minute of direct sun counts the same regardless of sun
  altitude. Noon sun in June is ~4× the PAR of low morning sun in March, but
  both count as "1 sun hour". This is the "6-8h label vs 3-4h reality" issue:
  the label overstates the light a spot actually receives.
- **One representative day.** The heatmap samples only the 15th of the month;
  a spot's month rating is a single day's sun path.
- **No canopy/transmissivity.** All casters are fully opaque; dappled shade
  under a tree does not exist in the model.
- **No weather.** Cloud cover is never fetched; a sunny July and an overcast
  one are identical to the model.

## 3. Decision: improved 4-bucket, not full DLI

Full DLI (mol/m²/day with cloud, albedo, canopy transmission) is the
scientifically complete target but buys maybe 15% additional accuracy over the
intensity-weighted upgrade for a home gardener, at real complexity: a new data
source (solar flux), a new calibration, and new UI semantics.

The intensity-weighted 4-bucket path captures ~80% of DLI's value:

- **Direct sun is weighted by `sin(altitude)`** — the first-order PAR proxy
  (irradiance ≈ constant × sin(elevation) for clear sky). A minute of sun at
  60° counts ~1.7× a minute at 30°, and a low winter sun counts little.
- **Cloud cover is fetched** (Open-Meteo `cloud_cover_mean`, free, same API
  already in use) so the model can distinguish a sunny from an overcast month
  and surface that signal in the UI.
- Bucket thresholds (4h / 2h / SVF 0.5) stay **as-is** — the labels now mean
  *intensity-weighted* hours, which is what users experience as "bright".

## 4. Implementation

### 4.1 Intensity-weighted sun hours (frontend, `heatmapCalc.ts`)

- In the sample loop, weight each direct-sun sample by `sin(altitudeRad)`
  before accumulating `sunCredit`.
- Keep the existing `sunMinutes`/`sunHours` **field names** (consumers:
  SunHeatmap, PlantMarker, PlantQuickSheet, GrowHereSheet, spot inspector) but
  their meaning becomes "intensity-weighted hours". The 4h/2h thresholds in
  `lightQuality.ts` and `plantSunRequirements.ts` need **no change**.
- Expose a `weighted: true` marker on `HeatmapCell` so callers can label the
  unit honestly ("zonlicht (gewogen)" vs "zonlicht") in i18n.
- Verification: a full-sun cell in June must score higher than the same cell
  in March; a cell with 6h of low morning sun must land below the full-sun
  threshold. Pure-function vitest (node env), no DOM.

### 4.2 Cloud cover (backend, `weather_forecast.py`)

- Add `cloud_cover_mean` to `_DAILY_FIELDS` and `_EMPTY_DAILY`; surface it in
  the normalized `days` array as `cloud_cover_mean_pct`.
- No Water-pressure change: ET0 already reflects cloudiness via FAO ET0.
- Frontend surfaces it where light matters (spot inspector / sun mode):
  "meestal bewolkt" vs "meestal zonnig" this week, i18n NL/EN.

### 4.3 Deferred (explicitly not in scope)

- Canopy transmissivity / dappled shade (would need per-caster opacity).
- Per-season heatmap sampling (more than one representative day per month).
- Full DLI with mol/m²/day units.

## 5. Open items already tracked

- #800: per-plant shade wired into water pressure — **done**, merged (#849,
  #852). Exposure derived from `measured_sun_hours` (4h/2h thresholds).
- #798: humidity/soil-moisture inputs to water pressure — claimed, in progress
  elsewhere; **do not touch** `_DAILY_FIELDS` semantics it depends on beyond
  appending `cloud_cover_mean`.

## 6. Verification plan

- Frontend: `npx tsc --noEmit`, `npm run build`, `npm run lint:i18n`,
  `vitest run` (weighted-hours unit tests + full suite).
- Backend: `pytest tests/` — cloud cover is additive; existing forecast tests
  must pass unchanged.
- Manual: garden map sun mode — June vs March heatmap visibly different;
  spot inspector shows weekly cloud signal.
