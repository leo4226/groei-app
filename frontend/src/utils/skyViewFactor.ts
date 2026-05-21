/**
 * Sky View Factor (SVF) / sky openness computation.
 *
 * Casts N cosine-weighted rays upward into the hemisphere from a cell center
 * and returns the fraction that escape without hitting any shadow-caster.
 * This gives the "sky openness" (cosine-weighted SVF), a proxy for diffuse
 * light availability (PAR) at a given spot.
 *
 * Coordinate system:
 *   x, y — SVG garden coordinates in pixels (same as the rest of the app)
 *   z     — height in pixels (use heightCm * PX_PER_CM to convert)
 *   z = 0 is ground level; z increases upward
 *
 * Range: 0.0 (fully enclosed, no sky visible) → 1.0 (open field)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Axis-aligned 3-D box (covers a rect shadow-caster from ground to its roof). */
export interface BoxObstruction {
  type: 'box'
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  zMin: number
  zMax: number
}

/** Vertical cylinder (covers a circle shadow-caster from ground to its top). */
export interface CylinderObstruction {
  type: 'cylinder'
  cx: number
  cy: number
  radius: number
  zMin: number
  zMax: number
}

export type Obstruction = BoxObstruction | CylinderObstruction

// ── Constants ────────────────────────────────────────────────────────────────

const EPSILON = 1e-9
/** Minimum ray parameter — avoids counting the cell's own surface as a hit. */
const T_MIN = 1e-4

// ── Ray–geometry intersection ─────────────────────────────────────────────

/**
 * Axis-aligned bounding-box ray intersection (slab method).
 * Returns true if the ray (origin, dir) hits the box at t > T_MIN.
 * Works correctly when the origin is inside the box (entry in the past,
 * exit in the future with t > T_MIN).
 */
function rayHitsBox(origin: Vec3, dir: Vec3, box: BoxObstruction): boolean {
  let tNear = -Infinity
  let tFar = Infinity

  // X slab
  if (Math.abs(dir.x) < EPSILON) {
    if (origin.x < box.xMin || origin.x > box.xMax) return false
  } else {
    let t1 = (box.xMin - origin.x) / dir.x
    let t2 = (box.xMax - origin.x) / dir.x
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
    tNear = Math.max(tNear, t1)
    tFar = Math.min(tFar, t2)
    if (tNear > tFar) return false
  }

  // Y slab
  if (Math.abs(dir.y) < EPSILON) {
    if (origin.y < box.yMin || origin.y > box.yMax) return false
  } else {
    let t1 = (box.yMin - origin.y) / dir.y
    let t2 = (box.yMax - origin.y) / dir.y
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
    tNear = Math.max(tNear, t1)
    tFar = Math.min(tFar, t2)
    if (tNear > tFar) return false
  }

  // Z slab
  if (Math.abs(dir.z) < EPSILON) {
    if (origin.z < box.zMin || origin.z > box.zMax) return false
  } else {
    let t1 = (box.zMin - origin.z) / dir.z
    let t2 = (box.zMax - origin.z) / dir.z
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
    tNear = Math.max(tNear, t1)
    tFar = Math.min(tFar, t2)
    if (tNear > tFar) return false
  }

  return tFar > T_MIN
}

/**
 * Vertical-cylinder ray intersection.
 * The cylinder is infinite in radius from its axis (cx, cy) and capped at
 * [zMin, zMax]. Returns true if the ray (origin, dir) hits the solid
 * cylinder at t > T_MIN.
 *
 * If the origin is already inside the solid cylinder (including at the
 * zMin boundary at ground level), the ray is considered blocked
 * — consistent with how the 2-D sun model treats points under a caster.
 */
function rayHitsCylinder(origin: Vec3, dir: Vec3, cyl: CylinderObstruction): boolean {
  const px = origin.x - cyl.cx
  const py = origin.y - cyl.cy

  // Is the origin inside the cylinder solid?  (handles ground-level cells
  // that sit directly under a canopy or trunk caster)
  const insideRadially = px * px + py * py <= cyl.radius * cyl.radius
  const insideZ = origin.z >= cyl.zMin && origin.z <= cyl.zMax
  if (insideRadially && insideZ) return true

  // Quadratic for ray vs infinite cylinder
  const a = dir.x * dir.x + dir.y * dir.y
  if (a < EPSILON) {
    // Perfectly vertical ray: already handled by the insideRadially+insideZ
    // check above. If we reach here the origin is outside the cylinder.
    return false
  }

  const b = 2 * (px * dir.x + py * dir.y)
  const c = px * px + py * py - cyl.radius * cyl.radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return false

  const sqrtD = Math.sqrt(discriminant)
  const t1 = (-b - sqrtD) / (2 * a)
  const t2 = (-b + sqrtD) / (2 * a)

  for (const t of [t1, t2]) {
    if (t > T_MIN) {
      const hitZ = origin.z + t * dir.z
      if (hitZ >= cyl.zMin && hitZ <= cyl.zMax) return true
    }
  }
  return false
}

function rayIsBlocked(origin: Vec3, dir: Vec3, obstructions: Obstruction[]): boolean {
  for (const obs of obstructions) {
    const hit = obs.type === 'box'
      ? rayHitsBox(origin, dir, obs)
      : rayHitsCylinder(origin, dir, obs)
    if (hit) return true
  }
  return false
}

// ── Hemisphere sampling ───────────────────────────────────────────────────

/**
 * Generate N cosine-weighted hemisphere sample directions using a Fibonacci
 * lattice. All returned vectors point upward (z ≥ 0) and have unit length.
 *
 * Cosine-weighting means samples are denser near the zenith and sparser near
 * the horizon, matching Lambert's law for incident flux on a horizontal surface.
 * This lets us compute cosine-weighted SVF by simply counting the fraction of
 * unblocked samples — no per-sample weight factor needed.
 */
export function cosineHemisphereSamples(n: number): Vec3[] {
  if (n <= 0) return []
  if (n === 1) return [{ x: 0, y: 0, z: 1 }] // zenith

  const samples: Vec3[] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < n; i++) {
    const z = 1 - (i / (n - 1)) // 1 at zenith → 0 at horizon
    const radius = Math.sqrt(1 - z * z)
    const theta = goldenAngle * i
    samples.push({
      x: Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      z,
    })
  }
  return samples
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Compute sky openness (cosine-weighted Sky View Factor) for a cell center.
 *
 * Casts `nSamples` rays upward into the hemisphere and returns the fraction
 * that escape all obstructions. Range: 0.0 (fully enclosed) → 1.0 (open sky).
 *
 * @param cellCenter  SVG position + height of the cell (z=0 for ground cells)
 * @param obstructions 3-D geometry to test against (boxes + cylinders)
 * @param nSamples    Number of hemisphere samples; 64 is the recommended default
 */
export function computeSkyOpenness(
  cellCenter: Vec3,
  obstructions: Obstruction[],
  nSamples = 64,
): number {
  if (obstructions.length === 0) return 1.0

  const samples = cosineHemisphereSamples(nSamples)
  let clear = 0
  for (const dir of samples) {
    if (!rayIsBlocked(cellCenter, dir, obstructions)) clear++
  }
  return clear / samples.length
}

// ── Debug API ─────────────────────────────────────────────────────────────

export interface SvfRay {
  dir: Vec3
  blocked: boolean
}

export interface SvfDebugResult {
  cellCenter: Vec3
  rays: SvfRay[]
  /** Cosine-weighted SVF — fraction of clear rays. */
  svf: number
}

/**
 * Same as `computeSkyOpenness` but returns per-ray blocked/clear results
 * for debug visualisation (guarded by `?debug=svf`).
 */
export function computeSkyOpennessDebug(
  cellCenter: Vec3,
  obstructions: Obstruction[],
  nSamples = 64,
): SvfDebugResult {
  const samples = cosineHemisphereSamples(nSamples)
  let clear = 0
  const rays: SvfRay[] = samples.map(dir => {
    const blocked = obstructions.length > 0 && rayIsBlocked(cellCenter, dir, obstructions)
    if (!blocked) clear++
    return { dir, blocked }
  })
  return { cellCenter, rays, svf: clear / samples.length }
}
