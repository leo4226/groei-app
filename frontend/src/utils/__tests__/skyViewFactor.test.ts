import { describe, it, expect } from 'vitest'
import {
  cosineHemisphereSamples,
  computeSkyOpenness,
} from '../skyViewFactor'
import type { BoxObstruction, Obstruction } from '../skyViewFactor'

// ── Helper ────────────────────────────────────────────────────────────────────

/** A very large half-space box blocking all of x < 0, covering the full y and z range. */
function halfSpaceWall(): BoxObstruction {
  return {
    type: 'box',
    xMin: -1_000_000,
    xMax: 0,
    yMin: -1_000_000,
    yMax: 1_000_000,
    zMin: 0,
    zMax: 1_000_000,
  }
}

// ── Test cases ────────────────────────────────────────────────────────────────

describe('cosineHemisphereSamples', () => {
  it('returns the requested number of samples', () => {
    expect(cosineHemisphereSamples(64)).toHaveLength(64)
    expect(cosineHemisphereSamples(256)).toHaveLength(256)
  })

  it('all samples point upward (z ≥ 0)', () => {
    for (const s of cosineHemisphereSamples(64)) {
      expect(s.z).toBeGreaterThanOrEqual(0)
    }
  })

  it('all samples are unit vectors', () => {
    for (const s of cosineHemisphereSamples(64)) {
      const len = Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2)
      expect(len).toBeCloseTo(1, 5)
    }
  })
})

describe('computeSkyOpenness', () => {
  // ── Case 1: empty scene ────────────────────────────────────────────────────
  it('empty scene → SVF ≈ 1.0 (tolerance 0.02 at N=64)', () => {
    const svf = computeSkyOpenness({ x: 0, y: 0, z: 0 }, [], 64)
    expect(svf).toBeCloseTo(1.0, 2 /* decimal places → ±0.005 */)
  })

  // ── Case 2: obstructions below ground only → treated as empty scene ────────
  it('obstructions only below z=0 → SVF ≈ 1.0', () => {
    const belowGround: Obstruction = {
      type: 'box',
      xMin: -100, xMax: 100,
      yMin: -100, yMax: 100,
      zMin: -200, zMax: -1, // entirely below the cell
    }
    const svf = computeSkyOpenness({ x: 0, y: 0, z: 0 }, [belowGround], 64)
    expect(svf).toBeCloseTo(1.0, 2)
  })

  // ── Case 3: cell fully enclosed in a box → SVF ≈ 0.0 ─────────────────────
  it('fully enclosed cell → SVF ≈ 0.0', () => {
    // Box from zMin=-1 so the cell at z=0 is clearly inside
    const cube: Obstruction = {
      type: 'box',
      xMin: -100, xMax: 100,
      yMin: -100, yMax: 100,
      zMin: -1,   zMax: 100,
    }
    const svf = computeSkyOpenness({ x: 0, y: 0, z: 0 }, [cube], 64)
    // Every upward ray exits through the box walls or ceiling → all blocked
    expect(svf).toBeCloseTo(0.0, 2)
  })

  // ── Case 4: half-hemisphere blocked by a tall vertical wall → SVF ≈ 0.5 ───
  it('half-hemisphere wall → cosine-weighted SVF ≈ 0.5 (tolerance 0.05 at N=64)', () => {
    // Cell is at x=1 (just to the right of the wall at x=0).
    // All rays with dx < 0 hit the wall; all rays with dx > 0 escape.
    // Cosine-weighted SVF for a hemisphere split by a vertical plane = exactly 0.5.
    const wall = halfSpaceWall()
    const svf = computeSkyOpenness({ x: 1, y: 0, z: 0 }, [wall], 64)
    expect(svf).toBeGreaterThanOrEqual(0.5 - 0.05)
    expect(svf).toBeLessThanOrEqual(0.5 + 0.05)
  })

  // ── Case 5: N=256 result converges to N=64 result (tolerance 0.02) ────────
  it('convergence: N=256 result within 0.02 of N=64 result (half-space wall)', () => {
    const wall = halfSpaceWall()
    const cell = { x: 1, y: 0, z: 0 }
    const obstructions: Obstruction[] = [wall]
    const svf64 = computeSkyOpenness(cell, obstructions, 64)
    const svf256 = computeSkyOpenness(cell, obstructions, 256)
    expect(Math.abs(svf256 - svf64)).toBeLessThanOrEqual(0.02)
  })
})
