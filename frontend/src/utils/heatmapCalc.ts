import { getSunPosition, getSunTimes } from './sunCalc'
import { PX_PER_M, PX_PER_CM } from './gardenStructures'
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

export interface GardenBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Convert the 2-D ShadowCaster list to 3-D Obstruction geometry for SVF ray-casting.
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
  [0, '#1a2744'],
  [2, '#2d5a6b'],
  [4, '#4a8c6f'],
  [6, '#c8a830'],
  [8, '#f0a020'],
]

/** Color stops for the sky-openness heatmap (Viridis palette): SVF 0→1 → color */
const VIRIDIS_STOPS: [number, string][] = [
  [0.00, '#440154'],
  [0.25, '#31688e'],
  [0.50, '#35b779'],
  [0.75, '#90d743'],
  [1.00, '#fde725'],
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

export function sunHoursToColor(hours: number): string {
  return stopsToColor(COLOR_STOPS, hours)
}

export function skyOpennessToColor(svf: number): string {
  return stopsToColor(VIRIDIS_STOPS, svf)
}

/**
 * Compute the sun hours heatmap for a given month.
 *
 * Samples sun position every `intervalMin` minutes from sunrise to sunset on the 15th
 * of the month. For each grid cell, counts how many samples have direct sun (not in shadow).
 */
export function computeHeatmap(
  month: number,
  gridResM: number,
  intervalMin: number,
  lat: number,
  lng: number,
  bearing: number,
  shadowCasters: ShadowCaster[],
  bounds: GardenBounds,
): HeatmapCell[] {
  const year = new Date().getFullYear()
  const day = new Date(year, month - 1, 15)

  const times = getSunTimes(day, lat, lng)
  const sunrise = times.sunrise.getTime()
  const sunset = times.sunset.getTime()
  const intervalMs = intervalMin * 60 * 1000

  const samples: { regions: ReturnType<typeof computeShadowRegions> }[] = []
  for (let t = sunrise; t <= sunset; t += intervalMs) {
    const date = new Date(t)
    const sun = getSunPosition(date, lat, lng)
    if (!sun.isUp) continue
    samples.push({ regions: computeShadowRegions(sun, shadowCasters, bearing) })
  }

  const obstructions = shadowCastersToObstructions(shadowCasters)

  const cellPx = gridResM * PX_PER_M
  const { minX, minY, maxX, maxY } = bounds
  const cols = Math.ceil((maxX - minX) / cellPx)
  const rows = Math.ceil((maxY - minY) / cellPx)
  const cells: HeatmapCell[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = minX + col * cellPx + cellPx / 2
      const cy = minY + row * cellPx + cellPx / 2
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue

      let sunCredit = 0
      for (const sample of samples) {
        sunCredit += getSunFraction(cx, cy, sample.regions)
      }

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
