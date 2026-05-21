import type { EditorZone, CanvasData, ShadowCaster } from '../types'

// Surface + boundary zones: everything that defines the garden footprint.
// Fences are included so the union perimeter follows fence edges rather than
// stopping at the nearest surface zone.
const GARDEN_ZONE_TYPES = new Set(['deck', 'soil', 'gravel', 'lawn', 'path', 'water', 'fence'])

// Surface zones only (no fences) — used for auto-detected garden boundary
const SURFACE_ZONE_TYPES = new Set(['deck', 'soil', 'gravel', 'lawn', 'path', 'water'])

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

// ── Garden boundary (zone union: surface + fence) ────────────────────────────

/**
 * Compute the union polygon of all garden-defining zone rectangles
 * (surface types + fences). Uses a grid-based approach: partition by all
 * unique zone edge coordinates, mark cells that overlap any zone, then
 * trace the outer boundary.
 *
 * Returns the garden perimeter polygon with a small outward margin.
 */
export function computeZoneUnion(zones: EditorZone[], marginPx = 10): [number, number][] {
  const surface = zones.filter(z => GARDEN_ZONE_TYPES.has(z.type))
  if (surface.length === 0) return [
    [0, 0], [680, 0], [680, 680], [0, 680],
  ]

  // Collect all unique x and y split lines from zone edges
  const xs = new Set<number>()
  const ys = new Set<number>()
  for (const z of surface) {
    xs.add(z.x)
    xs.add(z.x + z.width)
    ys.add(z.y)
    ys.add(z.y + z.height)
  }

  const xSorted = [...xs].sort((a, b) => a - b)
  const ySorted = [...ys].sort((a, b) => a - b)

  // Build a boolean grid: grid[row][col] = is inside any surface zone
  const rows = ySorted.length - 1
  const cols = xSorted.length - 1
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false))

  for (let r = 0; r < rows; r++) {
    const cellTop = ySorted[r]
    const cellBottom = ySorted[r + 1]
    for (let c = 0; c < cols; c++) {
      const cellLeft = xSorted[c]
      const cellRight = xSorted[c + 1]
      grid[r][c] = surface.some(z =>
        cellLeft < z.x + z.width && cellRight > z.x &&
        cellTop < z.y + z.height && cellBottom > z.y
      )
    }
  }

  // Find the top-left-most filled cell to start tracing
  let startR = -1, startC = -1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c]) { startR = r; startC = c; break }
    }
    if (startR >= 0) break
  }
  if (startR < 0) return []

  // Trace the outer boundary clockwise
  // Directions: 0=right, 1=down, 2=left, 3=up
  const perimeter: [number, number][] = []
  let r = startR, c = startC, dir = 0
  const visited = new Set<string>()
  const MAX_STEPS = 10000
  let steps = 0

  function cellRight(col: number) { return xSorted[col + 1] }
  function cellLeft(col: number) { return xSorted[col] }
  function cellTop(row: number) { return ySorted[row] }
  function cellBottom(row: number) { return ySorted[row + 1] }

  // Walk the perimeter
  while (steps < MAX_STEPS) {
    steps++
    const stateKey = `${r},${c},${dir}`
    if (visited.has(stateKey)) break
    visited.add(stateKey)

    // Determine: is there a filled cell ahead?
    let aheadR = r, aheadC = c
    switch (dir) {
      case 0: aheadC++; break  // right
      case 1: aheadR++; break  // down
      case 2: aheadC--; break  // left
      case 3: aheadR--; break  // up
    }
    const aheadFilled = aheadR >= 0 && aheadR < rows && aheadC >= 0 && aheadC < cols && grid[aheadR][aheadC]

    // Determine: is there a filled cell to the right (relative to direction)?
    const rightDir = (dir + 1) % 4
    let rightR = r, rightC = c
    switch (rightDir) {
      case 0: rightC++; break
      case 1: rightR++; break
      case 2: rightC--; break
      case 3: rightR--; break
    }
    const rightFilled = rightR >= 0 && rightR < rows && rightC >= 0 && rightC < cols && grid[rightR][rightC]

    if (rightFilled) {
      // Turn right
      dir = rightDir
      // Record corner at the outer edge
      switch (dir) {
        case 0: perimeter.push([cellRight(c), cellTop(r)]); break
        case 1: perimeter.push([cellRight(c), cellBottom(r)]); break
        case 2: perimeter.push([cellLeft(c), cellBottom(r)]); break
        case 3: perimeter.push([cellLeft(c), cellTop(r)]); break
      }
      // Move to the right neighbor
      r = rightR; c = rightC
    } else if (aheadFilled) {
      // Move ahead
      r = aheadR; c = aheadC
    } else {
      // Turn left
      dir = (dir + 3) % 4
      // Record corner
      switch (dir) {
        case 0: perimeter.push([cellLeft(c), cellTop(r)]); break
        case 1: perimeter.push([cellRight(c), cellTop(r)]); break
        case 2: perimeter.push([cellRight(c), cellBottom(r)]); break
        case 3: perimeter.push([cellLeft(c), cellBottom(r)]); break
      }
    }
  }

  // Apply margin: expand outward
  if (marginPx !== 0 && perimeter.length >= 3) {
    return expandPolygon(perimeter, marginPx)
  }

  return perimeter
}

function expandPolygon(poly: [number, number][], margin: number): [number, number][] {
  const n = poly.length
  const result: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i + n - 1) % n]
    const curr = poly[i]
    const next = poly[(i + 1) % n]

    // Inward normals of the two edges meeting at curr
    const edge1x = curr[0] - prev[0], edge1y = curr[1] - prev[1]
    const edge2x = next[0] - curr[0], edge2y = next[1] - curr[1]

    // Outward normal of edge1 (rotate counter-clockwise edge direction by -90°)
    const len1 = Math.sqrt(edge1x * edge1x + edge1y * edge1y) || 1
    const n1x = -edge1y / len1, n1y = edge1x / len1

    // Outward normal of edge2
    const len2 = Math.sqrt(edge2x * edge2x + edge2y * edge2y) || 1
    const n2x = -edge2y / len2, n2y = edge2x / len2

    // Average the two outward normals for the corner offset
    const nx = (n1x + n2x) / 2
    const ny = (n1y + n2y) / 2
    const nLen = Math.sqrt(nx * nx + ny * ny) || 1

    result.push([
      curr[0] + (nx / nLen) * margin,
      curr[1] + (ny / nLen) * margin,
    ])
  }
  return result
}

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
 * Priority:
 * 1. Fence zones → union of fence rectangles (exact drawn boundary)
 * 2. No fences → convex hull of all surface zones (clean auto-detected boundary)
 * 3. Nothing → null (no masking; full canvas)
 */
export function deriveGardenPerimeter(zones: EditorZone[]): [number, number][] | null {
  const fenceZones = zones.filter(z => z.type === 'fence')
  if (fenceZones.length > 0) {
    return computeZoneUnion(fenceZones, 5)
  }
  return computeSurfacePerimeter(zones)
}

/**
 * Garden bounds (bounding box) for heatmap grid computation.
 *
 * Priority:
 * 1. Fence zones → bounding box of fence union
 * 2. No fences → bounding box of surface zone convex hull
 * 3. Nothing → null
 */
export function deriveGardenBounds(zones: EditorZone[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const fenceZones = zones.filter(z => z.type === 'fence')
  if (fenceZones.length > 0) {
    return deriveGardenBoundsFromUnion(fenceZones)
  }
  const hull = computeSurfacePerimeter(zones)
  if (hull) return perimeterToBounds(hull)
  return null
}

/** Internal: derive bounds from zones using the grid union (for fence zones) */
function deriveGardenBoundsFromUnion(zones: EditorZone[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const perimeter = computeZoneUnion(zones, 10)
  return perimeterToBounds(perimeter)
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

export function deriveAllShadowCasters(canvasData: CanvasData): ShadowCaster[] {
  return [
    ...deriveFenceCasters(canvasData.zones, canvasData.scale_px_per_m),
    ...deriveStructureCasters(canvasData.zones, canvasData.scale_px_per_m),
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
