import { getSunPosition, getSunTimes, GARDEN_LAT, GARDEN_LNG } from './sunCalc'
import { SHADOW_CASTERS, GARDEN_FLOOR, PX_PER_M, PX_PER_CM } from './gardenStructures'
import type { ShadowCaster } from './gardenStructures'
import { computeShadowRegions, getSunFraction } from './shadowGeometry'
import { computeSkyOpenness } from './skyViewFactor'
import type { Obstruction } from './skyViewFactor'

export interface HeatmapCell {
  x: number          // SVG x of cell top-left
  y: number          // SVG y of cell top-left
  w: number          // cell width in px
  h: number          // cell height in px
  sunMinutes: number // total minutes of direct sun
  sunHours: number   // sunMinutes / 60
  skyOpenness: number // cosine-weighted SVF, 0.0 (enclosed) → 1.0 (open sky)
}

/**
 * Convert the 2-D ShadowCaster list to 3-D Obstruction geometry for SVF ray-casting.
 * All casters are treated as fully opaque for Phase 1 (canopy density deferred).
 * zMax = heightCm × PX_PER_CM keeps the vertical scale consistent with x/y.
 */
export function shadowCastersToObstructions(casters: ShadowCaster[]): Obstruction[] {
  return casters.map((c): Obstruction => {
    const zMax = c.heightCm * PX_PER_CM
    if (c.type === 'rect') {
      return { type: 'box', xMin: c.x, xMax: c.x + c.width, yMin: c.y, yMax: c.y + c.height, zMin: 0, zMax }
    } else if (c.type === 'polygon') {
      const xs = c.points.map(p => p[0])
      const ys = c.points.map(p => p[1])
      return { type: 'box', xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys), zMin: 0, zMax }
    } else {
      return { type: 'cylinder', cx: c.cx, cy: c.cy, radius: c.radius, zMin: 0, zMax }
    }
  })
}

/** Color stops for the sun-hours heatmap (Magma-inspired): hours → color */
const COLOR_STOPS: [number, string][] = [
  [0, '#1a2744'],   // deep navy — full shade
  [2, '#2d5a6b'],   // teal — deep shade
  [4, '#4a8c6f'],   // sage green — partial shade
  [6, '#c8a830'],   // warm gold — partial sun
  [8, '#f0a020'],   // deep amber — full sun
]

/** Color stops for the sky-openness heatmap (Viridis palette): SVF 0→1 → color */
const VIRIDIS_STOPS: [number, string][] = [
  [0.00, '#440154'],  // dark purple  — fully enclosed
  [0.25, '#31688e'],  // ocean blue   — mostly blocked
  [0.50, '#35b779'],  // teal-green   — half open
  [0.75, '#90d743'],  // lime         — mostly open
  [1.00, '#fde725'],  // yellow       — open sky
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function stopsToColor(stops: [number, string][], value: number): string {
  const v = Math.max(stops[0][0], Math.min(value, stops[stops.length - 1][0]))
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i]
    const [v1, c1] = stops[i + 1]
    if (v >= v0 && v <= v1) {
      const t = (v - v0) / (v1 - v0)
      const [r0, g0, b0] = hexToRgb(c0)
      const [r1, g1, b1] = hexToRgb(c1)
      return `rgb(${Math.round(lerp(r0, r1, t))},${Math.round(lerp(g0, g1, t))},${Math.round(lerp(b0, b1, t))})`
    }
  }
  return stops[stops.length - 1][1]
}

/** Map sun hours (0–8+) to a Magma-inspired colour. */
export function sunHoursToColor(hours: number): string {
  return stopsToColor(COLOR_STOPS, hours)
}

/** Map sky openness / SVF (0.0–1.0) to a Viridis colour. */
export function skyOpennessToColor(svf: number): string {
  return stopsToColor(VIRIDIS_STOPS, svf)
}

/** Check if a point is inside the garden floor boundary (simple rect check). */
function isInGarden(px: number, py: number): boolean {
  const [tl, tr, br, bl] = GARDEN_FLOOR
  return px >= tl[0] && px <= tr[0] && py >= tl[1] && py <= bl[1]
}

/**
 * Compute the sun hours heatmap for a given month.
 *
 * Samples sun position every `intervalMin` minutes from sunrise to sunset on the 15th
 * of the month. For each grid cell, counts how many samples have direct sun (not in shadow).
 *
 * @param month 1-12
 * @param gridResM Grid cell size in meters (default 0.3m = ~14px)
 * @param intervalMin Sampling interval in minutes (default 10)
 */
export function computeHeatmap(
  month: number,
  gridResM: number = 0.3,
  intervalMin: number = 10,
): HeatmapCell[] {
  const year = new Date().getFullYear()
  const day = new Date(year, month - 1, 15)

  // Get sunrise/sunset
  const times = getSunTimes(day, GARDEN_LAT, GARDEN_LNG)
  const sunrise = times.sunrise.getTime()
  const sunset = times.sunset.getTime()
  const intervalMs = intervalMin * 60 * 1000

  // Pre-compute all shadow regions for each time sample (direct sun hours)
  const samples: { time: Date; regions: ReturnType<typeof computeShadowRegions> }[] = []
  for (let t = sunrise; t <= sunset; t += intervalMs) {
    const date = new Date(t)
    const sun = getSunPosition(date)
    if (!sun.isUp) continue
    samples.push({ time: date, regions: computeShadowRegions(sun, SHADOW_CASTERS) })
  }

  // Pre-compute 3-D obstructions for SVF (time-independent — computed once per map).
  // SVF is only invalidated when shadow-caster geometry changes, not when month changes.
  const obstructions = shadowCastersToObstructions(SHADOW_CASTERS)

  // Build grid
  const cellPx = gridResM * PX_PER_M
  const [tl, , , ] = GARDEN_FLOOR
  const minX = tl[0]
  const minY = tl[1]
  const maxX = GARDEN_FLOOR[1][0]
  const maxY = GARDEN_FLOOR[3][1]

  const cols = Math.ceil((maxX - minX) / cellPx)
  const rows = Math.ceil((maxY - minY) / cellPx)
  const cells: HeatmapCell[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = minX + col * cellPx + cellPx / 2 // cell center
      const cy = minY + row * cellPx + cellPx / 2
      if (!isInGarden(cx, cy)) continue

      // Direct sun hours (time-dependent, sampled across the day)
      let sunCredit = 0
      for (const sample of samples) {
        // getSunFraction returns 0.0 (full shade) to 1.0 (full sun)
        // Dappled structures contribute fractional sun credit
        sunCredit += getSunFraction(cx, cy, sample.regions)
      }

      // Sky openness / SVF (time-independent, computed once per cell)
      const skyOpenness = computeSkyOpenness({ x: cx, y: cy, z: 0 }, obstructions)

      const sunMinutes = sunCredit * intervalMin
      cells.push({
        x: minX + col * cellPx,
        y: minY + row * cellPx,
        w: cellPx,
        h: cellPx,
        sunMinutes,
        sunHours: sunMinutes / 60,
        skyOpenness,
      })
    }
  }

  return cells
}

const _heatmapCache = new Map<number, HeatmapCell[]>()

function getCachedCells(month: number): HeatmapCell[] {
  if (!_heatmapCache.has(month)) {
    _heatmapCache.set(month, computeHeatmap(month))
  }
  return _heatmapCache.get(month)!
}

function findCell(cells: HeatmapCell[], x: number, y: number): HeatmapCell | undefined {
  return cells.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h)
}

/** Return sun hours at SVG position (x, y) for the given month (1-12). */
export function getSunHoursAtPosition(x: number, y: number, month: number): number {
  return findCell(getCachedCells(month), x, y)?.sunHours ?? 0
}

/**
 * Return sky openness (cosine-weighted SVF) at SVG position (x, y).
 * SVF is time-independent, so month only matters for cache warming.
 * Use month=1 if you just want SVF without triggering a full month re-compute.
 */
export function getSkyOpennessAtPosition(x: number, y: number, month: number): number {
  return findCell(getCachedCells(month), x, y)?.skyOpenness ?? 0
}
