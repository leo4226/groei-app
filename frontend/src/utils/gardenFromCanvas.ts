import type { EditorZone, CanvasData, ShadowCaster } from '../types'

// Surface + boundary zones: everything that defines the garden footprint.
// NOTE: fences are NOT included here — they're only used for shadow casting,
// NOT for the garden perimeter polygon (sun heatmap grid).
const GARDEN_ZONE_TYPES = new Set(['deck', 'soil', 'gravel', 'lawn', 'path', 'water', 'fence', 'raised_bed'])

// Surface zones only (no fences) — used for auto-detected garden boundary
const SURFACE_ZONE_TYPES = new Set(['deck', 'soil', 'gravel', 'lawn', 'path', 'water', 'raised_bed'])

// ── Convex hull (Andrew's monotone chain) ─────────────────────────────────────

/**
 * Compute the convex hull of a set of 2D points.
 * Returns the hull in clockwise order. Uses Andrew's monotone chain algorithm.
 */
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points.slice()
  
  // Sort by x, then y
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  
  // Lower hull
  const lower: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  
  // Upper hull
  const upper: [number, number][] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  
  // Remove last point of each half (duplicate of first of other half)
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/**
 * Compute the garden perimeter from surface zones using convex hull.
 * Convex hull creates a clean polygon that wraps all zones tightly —
 * no jagged edges, no gaps between disconnected zones.
 * Returns null when there are fewer than 3 points (no meaningful perimeter).
 */
function computeSurfacePerimeter(zones: EditorZone[]): [number, number][] | null {
  const surface = zones.filter(z => SURFACE_ZONE_TYPES.has(z.type))
  if (surface.length === 0) return null
  
  // Collect all 4 corners of every surface zone
  const points: [number, number][] = []
  for (const z of surface) {
    points.push([z.x, z.y])
    points.push([z.x + z.width, z.y])
    points.push([z.x + z.width, z.y + z.height])
    points.push([z.x, z.y + z.height])
  }
  
  const hull = convexHull(points)
  if (hull.length < 3) return null
  return hull
}

// ── Garden boundary helpers ────────────────────────────────────────

function perimeterToBounds(perimeter: [number, number][]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (perimeter.length === 0) return { minX: 0, minY: 0, maxX: 680, maxY: 680 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of perimeter) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Derive the garden perimeter polygon.
 *
 * Fences are intentionally excluded — they only cast shadows and define
 * the garden edge visually, but should NOT be used as the sun polygon
 * (otherwise the heatmap grid collapses to just the fence strips).
 *
 * Priority:
 * 1. Surface zones → convex hull of all zone corners (clean auto-detected boundary)
 * 2. Nothing → null (no masking; full canvas)
 */
export function deriveGardenPerimeter(zones: EditorZone[]): [number, number][] | null {
  return computeSurfacePerimeter(zones)
}

/**
 * Garden bounds (bounding box) for heatmap grid computation.
 *
 * Fences intentionally excluded (same reasoning as deriveGardenPerimeter).
 *
 * Priority:
 * 1. Surface zones → bounding box of convex hull
 * 2. Nothing → null
 */
export function deriveGardenBounds(zones: EditorZone[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const hull = computeSurfacePerimeter(zones)
  if (hull) return perimeterToBounds(hull)
  return null
}

// ── Shadow casters ───────────────────────────────────────────────────────────

export function deriveFenceCasters(zones: EditorZone[], scalePxPerM: number): ShadowCaster[] {
  return zones
    .filter(z => z.type === 'fence')
    .map((z): ShadowCaster => {
      const heightM = z.fenceHeightM ?? 2.0
      const isBrick = z.fenceMaterial === 'brick'
      return {
        id: `fence-${z.id}`,
        label: z.label || 'Hek',
        type: 'rect',
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        heightCm: Math.round(heightM * 100),
        opacity: isBrick ? 1.0 : 0.7,
      }
    })
}

export function deriveStructureCasters(zones: EditorZone[], _scalePxPerM: number): ShadowCaster[] {
  return zones
    .filter(z => z.type === 'structure')
    .map((z): ShadowCaster => {
      const heightM = z.structureHeightM ?? z.roomHeightM ?? 2.5
      return {
        id: `structure-${z.id}`,
        label: z.label || 'Gebouw',
        type: 'rect',
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        heightCm: Math.round(heightM * 100),
        opacity: 1.0,
      }
    })
}

export function deriveRaisedBedCasters(zones: EditorZone[], _scalePxPerM: number): ShadowCaster[] {
  return zones
    .filter(z => z.type === 'raised_bed')
    .map((z): ShadowCaster => {
      const heightM = z.raisedBedHeightM ?? 0.5
      return {
        id: `raised-bed-${z.id}`,
        label: z.label || 'Verhoogd bed',
        type: 'rect',
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        heightCm: Math.round(heightM * 100),
        opacity: 0.35,
      }
    })
}

export function deriveAllShadowCasters(canvasData: CanvasData): ShadowCaster[] {
  return [
    ...deriveFenceCasters(canvasData.zones, canvasData.scale_px_per_m),
    ...deriveStructureCasters(canvasData.zones, canvasData.scale_px_per_m),
    ...deriveRaisedBedCasters(canvasData.zones, canvasData.scale_px_per_m),
    ...(canvasData.shadowCasters ?? []),
  ]
}

// ── Map view utilities ───────────────────────────────────────────────────────

export function deriveViewBoxString(zones: EditorZone[], canvasW: number, canvasH: number): string {
  const surface = zones.filter(z => GARDEN_ZONE_TYPES.has(z.type) || z.type === 'structure')
  const allZones = surface.length > 0 ? surface : zones
  if (allZones.length === 0) return `0 0 ${canvasW} ${canvasH}`

  const pad = 20
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const z of allZones) {
    if (z.x < minX) minX = z.x
    if (z.y < minY) minY = z.y
    if (z.x + z.width > maxX) maxX = z.x + z.width
    if (z.y + z.height > maxY) maxY = z.y + z.height
  }
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
}

export function isInsideGarden(point: { x: number; y: number }, perimeter: [number, number][]): boolean {
  if (perimeter.length < 3) return true
  let inside = false
  for (let i = 0, j = perimeter.length - 1; i < perimeter.length; j = i++) {
    const xi = perimeter[i][0], yi = perimeter[i][1]
    const xj = perimeter[j][0], yj = perimeter[j][1]
    if ((yi > point.y) !== (yj > point.y) &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}
