import type { SunPosition } from './sunCalc'
import type { ShadowCaster } from './gardenStructures'
import { PX_PER_CM } from './gardenStructures'

export interface ShadowPolygon {
  id: string
  pathD: string
  opacity: number
  fillRule?: 'evenodd'
}

const MAX_SHADOW_FACTOR = 6 // clamp shadow length for very low sun

/**
 * Convert compass azimuth to SVG shadow direction.
 *
 * SVG-top points toward the map's compass bearing (stored per-map in MapInfo.bearing).
 * Subtracting that bearing aligns the compass frame with the SVG frame, after which:
 *   sin → SVG-X component, cos → SVG-Y component (standard SVG convention).
 * Shadow falls opposite to the sun direction.
 */
function getShadowVector(azimuthDeg: number, altitudeDeg: number, heightCm: number, bearing: number): { dx: number; dy: number } | null {
  if (altitudeDeg <= 0) return null

  const altRad = altitudeDeg * Math.PI / 180
  const shadowFactor = Math.min(1 / Math.tan(altRad), MAX_SHADOW_FACTOR)
  const shadowLenPx = heightCm * PX_PER_CM * shadowFactor

  const svgAngleRad = (azimuthDeg - bearing) * Math.PI / 180

  // Shadow falls opposite to sun direction
  const dx = -shadowLenPx * Math.sin(svgAngleRad)
  const dy = shadowLenPx * Math.cos(svgAngleRad)

  return { dx, dy }
}

/**
 * Compute convex hull of a set of points using Graham scan.
 */
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 3) return points

  // Find bottom-most (then left-most) point
  let pivot = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i][1] > points[pivot][1] || (points[i][1] === points[pivot][1] && points[i][0] < points[pivot][0])) {
      pivot = i
    }
  }
  [points[0], points[pivot]] = [points[pivot], points[0]]
  const p0 = points[0]

  // Sort by polar angle from pivot
  const sorted = points.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a[1] - p0[1], a[0] - p0[0])
    const angleB = Math.atan2(b[1] - p0[1], b[0] - p0[0])
    if (angleA !== angleB) return angleA - angleB
    // Same angle: closer point first
    const distA = (a[0] - p0[0]) ** 2 + (a[1] - p0[1]) ** 2
    const distB = (b[0] - p0[0]) ** 2 + (b[1] - p0[1]) ** 2
    return distA - distB
  })

  const hull: [number, number][] = [p0]
  for (const pt of sorted) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2]
      const b = hull[hull.length - 1]
      const cross = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0])
      if (cross <= 0) hull.pop()
      else break
    }
    hull.push(pt)
  }
  return hull
}

function pointsToPath(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  return `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`
}


function computeRectShadow(caster: Extract<ShadowCaster, { type: 'rect' }>, dx: number, dy: number): ShadowPolygon {
  const { x, y, width, height } = caster
  // 4 corners of the rect
  const corners: [number, number][] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]
  // 4 projected corners (shadow tips)
  const projected: [number, number][] = corners.map(([cx, cy]) => [cx + dx, cy + dy])
  // When excludeSelf is set (e.g. raised beds), compute the full shadow sweep
  // (caster + projected) and punch out the caster's own area as a hole.
  // This way the shadow only appears AROUND the raised bed's border — not
  // inside it — because plants sit ON TOP of the raised bed.
  if (caster.excludeSelf) {
    const allPoints: [number, number][] = [...corners, ...projected]
    const outerHull = convexHull(allPoints)
    // Hole path: caster's rect in reverse winding order (for evenodd fill rule)
    const holePath = `M${x},${y} L${x},${y + height} L${x + width},${y + height} L${x + width},${y}Z`
    return {
      id: caster.id,
      pathD: pointsToPath(outerHull) + ' ' + holePath,
      opacity: caster.opacity ?? 0.35,
      fillRule: 'evenodd',
    }
  }
  const points = [...corners, ...projected]
  const hull = convexHull(points)
  return { id: caster.id, pathD: pointsToPath(hull), opacity: caster.opacity ?? 0.35 }
}

function computeCircleShadow(caster: Extract<ShadowCaster, { type: 'circle' }>, dx: number, dy: number): ShadowPolygon {
  const { cx, cy, radius } = caster
  // Sample points around the canopy circle and the displaced shadow circle,
  // then take the convex hull — produces an elongated oval/capsule shadow.
  const N = 24
  const points: [number, number][] = []
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * 2 * Math.PI
    const cos = Math.cos(angle), sin = Math.sin(angle)
    if (!caster.excludeSelf) {
      points.push([cx + cos * radius, cy + sin * radius])
    }
    points.push([cx + dx + cos * radius, cy + dy + sin * radius])
  }
  const hull = convexHull(points)
  return { id: caster.id, pathD: pointsToPath(hull), opacity: caster.opacity ?? 0.2 }
}

function computePolygonShadow(caster: Extract<ShadowCaster, { type: 'polygon' }>, dx: number, dy: number): ShadowPolygon {
  const projected: [number, number][] = caster.points.map(([px, py]) => [px + dx, py + dy])
  const points = caster.excludeSelf ? projected : [...caster.points, ...projected]
  const hull = convexHull(points)
  return { id: caster.id, pathD: pointsToPath(hull), opacity: caster.opacity ?? 0.35 }
}

/**
 * Compute all shadow polygons for the current sun position.
 */
export function computeShadows(sun: SunPosition, casters: ShadowCaster[], bearing: number): ShadowPolygon[] {
  if (!sun.isUp) return []

  const shadows: ShadowPolygon[] = []
  for (const caster of casters) {
    const vec = getShadowVector(sun.azimuthDeg, sun.altitudeDeg, caster.heightCm, bearing)
    if (!vec) continue

    if (caster.type === 'rect') {
      shadows.push(computeRectShadow(caster, vec.dx, vec.dy))
    } else if (caster.type === 'polygon') {
      shadows.push(computePolygonShadow(caster, vec.dx, vec.dy))
    } else {
      shadows.push(computeCircleShadow(caster, vec.dx, vec.dy))
    }
  }
  return shadows
}

// ── Hit-testing for heatmap ──────────────────────────────────────

export interface ShadowRegion {
  type: 'polygon' | 'circle'
  points?: [number, number][]  // for polygon
  hole?: [number, number][]    // optional sub-region to exclude (e.g. raised bed's own surface)
  cx?: number; cy?: number; r?: number  // for circle
  /** How much light this region blocks: 1.0 = fully opaque, 0.5 = dappled (50% passes through) */
  blockFactor: number
}

/**
 * Derive light-blocking factor from caster opacity.
 * Uses opacity directly: 1.0 = solid building (100% blocked), 0.35 = dappled tree (35% blocked).
 */
function casterBlockFactor(caster: ShadowCaster): number {
  return Math.min(1, Math.max(0, caster.opacity ?? 1))
}

function rectShadowRegion(caster: Extract<ShadowCaster, { type: 'rect' }>, dx: number, dy: number): ShadowRegion {
  const { x, y, width, height } = caster
  const corners: [number, number][] = [
    [x, y], [x + width, y], [x + width, y + height], [x, y + height],
  ]
  const projected: [number, number][] = corners.map(([cx, cy]) => [cx + dx, cy + dy])
  if (caster.excludeSelf) {
    const hullPoints: [number, number][] = [...corners, ...projected]
    return {
      type: 'polygon',
      points: convexHull(hullPoints),
      hole: corners,  // exclude the raised bed's own surface
      blockFactor: casterBlockFactor(caster),
    }
  }
  return { type: 'polygon', points: convexHull([...corners, ...projected]), blockFactor: casterBlockFactor(caster) }
}

function circleShadowRegion(caster: Extract<ShadowCaster, { type: 'circle' }>, dx: number, dy: number): ShadowRegion {
  return { type: 'circle', cx: caster.cx + dx, cy: caster.cy + dy, r: caster.radius, blockFactor: casterBlockFactor(caster) }
}

function polygonShadowRegion(caster: Extract<ShadowCaster, { type: 'polygon' }>, dx: number, dy: number): ShadowRegion {
  const projected: [number, number][] = caster.points.map(([px, py]) => [px + dx, py + dy])
  const points = caster.excludeSelf ? projected : [...caster.points, ...projected]
  return { type: 'polygon', points: convexHull(points), blockFactor: casterBlockFactor(caster) }
}

/**
 * Compute shadow regions as raw geometry for point-in-polygon hit testing (used by heatmap).
 */
export function computeShadowRegions(sun: SunPosition, casters: ShadowCaster[], bearing: number): ShadowRegion[] {
  if (!sun.isUp) return []
  const regions: ShadowRegion[] = []
  for (const caster of casters) {
    const vec = getShadowVector(sun.azimuthDeg, sun.altitudeDeg, caster.heightCm, bearing)
    if (!vec) continue
    if (caster.type === 'rect') {
      regions.push(rectShadowRegion(caster, vec.dx, vec.dy))
    } else if (caster.type === 'polygon') {
      regions.push(polygonShadowRegion(caster, vec.dx, vec.dy))
    } else {
      regions.push(circleShadowRegion(caster, vec.dx, vec.dy))
    }
  }
  return regions
}

/** Check if point (px,py) is inside a convex polygon (points in order). */
function pointInConvexPolygon(px: number, py: number, pts: [number, number][]): boolean {
  const n = pts.length
  if (n < 3) return false
  let sign = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % n]
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
    if (cross !== 0) {
      if (sign === 0) sign = cross > 0 ? 1 : -1
      else if ((cross > 0 ? 1 : -1) !== sign) return false
    }
  }
  return true
}

/** Check if a point is inside any shadow region (binary — treats all shadows as fully opaque). */
export function isPointInShadow(px: number, py: number, regions: ShadowRegion[]): boolean {
  for (const r of regions) {
    if (r.type === 'polygon' && r.points) {
      if (pointInConvexPolygon(px, py, r.points)) return true
    } else if (r.type === 'circle' && r.cx !== undefined && r.cy !== undefined && r.r !== undefined) {
      const dx = px - r.cx, dy = py - r.cy
      if (dx * dx + dy * dy <= r.r * r.r) return true
    }
  }
  return false
}

/**
 * Get the fraction of sunlight reaching a point (0.0 = full shade, 1.0 = full sun).
 * Accounts for partial blocking by dappled structures (trees, vegetation).
 *
 * When multiple shadows overlap, light must pass through ALL of them,
 * so fractions multiply: e.g. two 0.5-block regions → 0.5 × 0.5 = 0.25 sun.
 * A single fully-opaque region (blockFactor=1.0) immediately returns 0.
 */
export function getSunFraction(px: number, py: number, regions: ShadowRegion[]): number {
  let sunFraction = 1.0
  for (const r of regions) {
    let hit = false
    if (r.type === 'polygon' && r.points) {
      if (r.hole && pointInConvexPolygon(px, py, r.hole)) continue // in the hole = not shadowed here
      hit = pointInConvexPolygon(px, py, r.points)
    } else if (r.type === 'circle' && r.cx !== undefined && r.cy !== undefined && r.r !== undefined) {
      const dx = px - r.cx, dy = py - r.cy
      hit = dx * dx + dy * dy <= r.r * r.r
    }
    if (hit) {
      if (r.blockFactor >= 1.0) return 0 // fully opaque — early exit
      sunFraction *= (1 - r.blockFactor)
    }
  }
  return sunFraction
}
