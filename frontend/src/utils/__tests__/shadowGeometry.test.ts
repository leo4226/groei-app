import { describe, it, expect } from 'vitest'
import { computeShadows } from '../shadowGeometry'
import type { ShadowCaster } from '../../types'
import type { SunPosition } from '../sunCalc'

// Reference bearing for tests (Leon's garden: NNW ≈ 347°)
const TEST_BEARING = 347

// ── Helper: call the internal getShadowVector indirectly via computeShadows ──

// ── Direct test via exported computeShadows (unit-tests the vector direction) ──

const unitCaster: ShadowCaster = {
  id: 'unit', label: 'unit', type: 'rect',
  x: 0, y: 0, width: 1, height: 1,
  heightCm: 100,
}

function shadowDirection(az: number, alt: number): { dx: number; dy: number } | null {
  const ref: ShadowCaster = {
    id: 'ref', label: 'ref', type: 'rect',
    x: 300, y: 300, width: 1, height: 1,
    heightCm: 100,
  }
  const sun: SunPosition = { azimuthDeg: az, altitudeDeg: alt, isUp: true }
  const s = computeShadows(sun, [ref], TEST_BEARING)
  if (!s.length) return null
  const coords = [...s[0].pathD.matchAll(/([-\d.]+),([-\d.]+)/g)]
  const xs = coords.map(m => parseFloat(m[1]))
  const ys = coords.map(m => parseFloat(m[2]))
  const centX = xs.reduce((a, b) => a + b, 0) / xs.length
  const centY = ys.reduce((a, b) => a + b, 0) / ys.length
  // Original centroid = (300.5, 300.5); displaced centroid ≈ (300.5 + dx/2, 300.5 + dy/2)
  // Sign of (centX - 300.5) gives sign of dx
  return { dx: centX - 300.5, dy: centY - 300.5 }
}

describe('TEST_BEARING', () => {
  it('is 347', () => {
    expect(TEST_BEARING).toBe(347)
  })
})

describe('getShadowVector direction (via computeShadows)', () => {
  it('sun below horizon → no shadows', () => {
    const sun: SunPosition = { azimuthDeg: 180, altitudeDeg: -5, isUp: false }
    expect(computeShadows(sun, [unitCaster], TEST_BEARING)).toHaveLength(0)
  })

  it('sun at SVG-top bearing → shadow falls +Y (toward SVG bottom)', () => {
    const v = shadowDirection(TEST_BEARING, 45)!
    expect(Math.abs(v.dx)).toBeLessThan(0.5)
    expect(v.dy).toBeGreaterThan(0)
  })

  it('sun 90° CW of SVG-top → shadow falls -X (toward SVG left)', () => {
    const v = shadowDirection(TEST_BEARING + 90, 45)!
    expect(v.dx).toBeLessThan(0)
    expect(Math.abs(v.dy)).toBeLessThan(0.5)
  })

  it('sun 180° of SVG-top → shadow falls -Y (toward SVG top)', () => {
    const v = shadowDirection(TEST_BEARING + 180, 45)!
    expect(Math.abs(v.dx)).toBeLessThan(0.5)
    expect(v.dy).toBeLessThan(0)
  })

  // Photo-match regression tests.
  // In landscape SVG after migration:
  //   SVG-top  = brick fence (NNE, bearing 22°)
  //   SVG-right = back fence (ESE, bearing ~112°)
  //   SVG-bottom = wooden fence (SSW, bearing ~202°)
  //   SVG-left  = house (WNW, bearing ~292°)
  //
  // 13:15 sun az≈171° (near S) → shadow falls NNW → toward brick fence = SVG-top → dy < 0
  // 10:04 sun az≈113° (ESE, near back-fence bearing) → shadow WNW → house = SVG-left → dx < 0
  // 09:40 sun az≈107° → same as 10:04 → dx < 0
  const cases = [
    ['2026-04-19 13:15 sun≈S → shadow toward brick (SVG-top, -Y)', 171, 48, '-Y'],
    ['2026-04-19 10:04 sun ESE → shadow toward house (SVG-left, -X)', 113, 30, '-X'],
    ['2026-04-22 09:40 sun ESE → shadow toward house (SVG-left, -X)', 107, 28, '-X'],
  ] as const

  for (const [label, az, alt, dominant] of cases) {
    it(label, () => {
      const v = shadowDirection(az, alt)!
      expect(v).not.toBeNull()
      const ax = Math.abs(v.dx), ay = Math.abs(v.dy)
      if (dominant === '-X') { expect(v.dx).toBeLessThan(0); expect(ax).toBeGreaterThan(ay * 0.5) }
      if (dominant === '-Y') { expect(v.dy).toBeLessThan(0); expect(ay).toBeGreaterThan(ax * 0.5) }
    })
  }
})
