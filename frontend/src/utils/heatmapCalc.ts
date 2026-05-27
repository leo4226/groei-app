import { getSunPosition, getSunTimes, GARDEN_LAT, GARDEN_LNG } from './sunCalc'
import { PX_PER_M, PX_PER_CM } from './gardenStructures'
import type { ShadowCaster } from './gardenStructures'
import { computeShadowRegions, getSunFraction } from './shadowGeometry'
import { computeSkyOpenness } from './skyViewFactor'
import type { Obstruction } from './skyViewFactor'
import { pointInPolygon } from './svgCoords'

export interface GardenBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

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
  return casters
    .filter(c => !c.excludeSelf)  // raised beds etc. — plants sit on top, so the structure doesn't block sky rays
    .map((c): Obstruction => {
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

/** Check if a point is inside the garden boundary (simple rect check). */
function isInGarden(px: number, py: number, bounds?: GardenBounds): boolean {
  if (bounds) {
    return px >= bounds.minX && px <= bounds.maxX && py >= bounds.minY && py <= bounds.maxY
  }
  return true
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
  gridResM: number = 0.15,
  intervalMin: number = 10,
  lat?: number,
  lon?: number,
  bearing?: number,
  shadowCasters?: ShadowCaster[],
  gardenBounds?: GardenBounds,
  gardenPerimeter?: [number, number][],
): HeatmapCell[] {
  const year = new Date().getFullYear()
  const day = new Date(year, month - 1, 15)

  const useLat = lat ?? GARDEN_LAT
  const useLon = lon ?? GARDEN_LNG
  const useBearing = bearing ?? 0
  const useCasters = shadowCasters ?? []

  // Get sunrise/sunset
  const times = getSunTimes(day, useLat, useLon)
  const sunrise = times.sunrise.getTime()
  const sunset = times.sunset.getTime()
  const intervalMs = intervalMin * 60 * 1000

  // Pre-compute all shadow regions for each time sample (direct sun hours)
  const samples: { time: Date; regions: ReturnType<typeof computeShadowRegions> }[] = []
  for (let t = sunrise; t <= sunset; t += intervalMs) {
    const date = new Date(t)
    const sun = getSunPosition(date, useLat, useLon)
    if (!sun.isUp) continue
    samples.push({ time: date, regions: computeShadowRegions(sun, useCasters, useBearing) })
  }

  // Pre-compute 3-D obstructions for SVF (time-independent — computed once per map).
  const obstructions = shadowCastersToObstructions(useCasters)

  // Build grid
  const cellPx = gridResM * PX_PER_M
  const minX = gardenBounds?.minX ?? 0
  const minY = gardenBounds?.minY ?? 0
  const maxX = gardenBounds?.maxX ?? 680
  const maxY = gardenBounds?.maxY ?? 680

  const cols = Math.ceil((maxX - minX) / cellPx)
  const rows = Math.ceil((maxY - minY) / cellPx)
  const cells: HeatmapCell[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellLeft = minX + col * cellPx
      const cellTop = minY + row * cellPx
      const cx = cellLeft + cellPx / 2 // cell center
      const cy = cellTop + cellPx / 2
      if (gardenPerimeter && gardenPerimeter.length >= 3) {
        // Only render cell if all four corners are inside the perimeter
        const tl = pointInPolygon(cellLeft, cellTop, gardenPerimeter)
        const tr = pointInPolygon(cellLeft + cellPx, cellTop, gardenPerimeter)
        const br = pointInPolygon(cellLeft + cellPx, cellTop + cellPx, gardenPerimeter)
        const bl = pointInPolygon(cellLeft, cellTop + cellPx, gardenPerimeter)
        if (!tl || !tr || !br || !bl) continue
      } else if (!isInGarden(cx, cy, gardenBounds)) {
        continue
      }

      // Direct sun hours (time-dependent, sampled across the day)
      let sunCredit = 0
      for (const sample of samples) {
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

  // Trim incomplete rows/columns at the edges
  const trimmed = trimRaggedEdges(cells)
  return trimmed
}

/** Remove rows/columns with significantly fewer cells than the full count — cleans up ragged perimeter edges. */
function trimRaggedEdges(cells: HeatmapCell[], threshold = 0.75): HeatmapCell[] {
  if (cells.length === 0) return cells

  // Count cells per row (unique y)
  const rowCounts = new Map<number, number>()
  for (const c of cells) {
    rowCounts.set(c.y, (rowCounts.get(c.y) ?? 0) + 1)
  }
  const maxRow = Math.max(...rowCounts.values())
  const keepY = new Set<number>()
  for (const [y, count] of rowCounts) {
    if (count >= maxRow * threshold) keepY.add(y)
  }

  // Count cells per column (unique x)
  const colCounts = new Map<number, number>()
  for (const c of cells) {
    if (!keepY.has(c.y)) continue
    colCounts.set(c.x, (colCounts.get(c.x) ?? 0) + 1)
  }
  const maxCol = Math.max(...colCounts.values())
  const keepX = new Set<number>()
  for (const [x, count] of colCounts) {
    if (count >= maxCol * threshold) keepX.add(x)
  }

  return cells.filter(c => keepY.has(c.y) && keepX.has(c.x))
}

