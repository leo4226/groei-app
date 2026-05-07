import { describe, it, expect } from 'vitest'
import { computeShadows } from '../shadowGeometry'
import { GARDEN_SVG_TOP_AZIMUTH } from '../gardenStructures'
import type { ShadowCaster } from '../gardenStructures'
import type { SunPosition } from '../sunCalc'

// ── Helper: call the internal getShadowVector indirectly via computeShadows ──

function shadowVec(azimuthDeg: number, altitudeDeg: number, heightCm: number) {
  const caster: ShadowCaster = { id: 't', label: 't', type: 'circle', cx: 0, cy: 0, radius: 1, heightCm }
  const sun: SunPosition = { azimuthDeg, altitudeDeg, isUp: true }
  const shadows = computeShadows(sun, [caster])
  if (!shadows.length) return null
  // Circle displaced by (dx, dy): pathD = "M{cx+dx-r},{cy+dy}A..."
  // Extract new centre from path: "M{cx},{cy}A..." after displacement
  // Easiest: re-derive from path M coords
  const m = shadows[0].pathD.match(/^M([-\d.]+),([-\d.]+)/)
  if (!m) return null
  const dispCx = parseFloat(m[1]) + 1 // +radius to recover centre
  const dispCy = parseFloat(m[2])
  return { dx: dispCx - 0, dy: dispCy - 0 }
}

// ── Direct test via exported computeShadows (unit-tests the vector direction) ──

const unitCaster: ShadowCaster = {
  id: 'unit', label: 'unit', type: 'rect',
  x: 0, y: 0, width: 1, height: 1,
  heightCm: 100,
}

function vec(az: number, alt: number) {
  const sun: SunPosition = { azimuthDeg: az, altitudeDeg: alt, isUp: true }
  const s = computeShadows(sun, [unitCaster])
  if (!s.length) return null
  // The convex hull of a unit rect displaced by (dx,dy) — extract dx,dy from first two corners
  // Corner [0,0] → tip [dx, dy]: find this in path points
  // Use a simpler approach: a 1×1 rect at (0,0), displaced by (dx,dy).
  // The shadow polygon will contain corners (0,0), (1,0), (1,1), (0,1) and
  // their displaced counterparts. The centroid shifts by (dx,dy).
  // Average all path coords.
  const coords = [...s[0].pathD.matchAll(/([-\d.]+),([-\d.]+)/g)]
  const xs = coords.map(m => parseFloat(m[1]))
  const ys = coords.map(m => parseFloat(m[2]))
  const avgX = xs.reduce((a, b) => a + b, 0) / xs.length
  const avgY = ys.reduce((a, b) => a + b, 0) / ys.length
  // Original centroid of rect is (0.5, 0.5); displaced centroid ≈ (0.5+dx/2, 0.5+dy/2)
  // Actually the convex hull mixes both, so just read sign of displacement from full shadow:
  // Cast a tiny rect at (300,300) far from origin to get clean displacement direction
  return { avgX, avgY }
}

function shadowDirection(az: number, alt: number): { dx: number; dy: number } | null {
  const ref: ShadowCaster = {
    id: 'ref', label: 'ref', type: 'rect',
    x: 300, y: 300, width: 1, height: 1,
    heightCm: 100,
  }
  const sun: SunPosition = { azimuthDeg: az, altitudeDeg: alt, isUp: true }
  const s = computeShadows(sun, [ref])
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

describe('GARDEN_SVG_TOP_AZIMUTH', () => {
  it('is 22', () => {
    expect(GARDEN_SVG_TOP_AZIMUTH).toBe(22)
  })
})

describe('getShadowVector direction (via computeShadows)', () => {
  it('sun below horizon → no shadows', () => {
    const sun: SunPosition = { azimuthDeg: 180, altitudeDeg: -5, isUp: false }
    expect(computeShadows(sun, [unitCaster])).toHaveLength(0)
  })

  it('sun at SVG-top bearing → shadow falls +Y (toward SVG bottom)', () => {
    const v = shadowDirection(GARDEN_SVG_TOP_AZIMUTH, 45)!
    expect(Math.abs(v.dx)).toBeLessThan(0.5)
    expect(v.dy).toBeGreaterThan(0)
  })

  it('sun 90° CW of SVG-top → shadow falls -X (toward SVG left)', () => {
    const v = shadowDirection(GARDEN_SVG_TOP_AZIMUTH + 90, 45)!
    expect(v.dx).toBeLessThan(0)
    expect(Math.abs(v.dy)).toBeLessThan(0.5)
  })

  it('sun 180° of SVG-top → shadow falls -Y (toward SVG top)', () => {
    const v = shadowDirection(GARDEN_SVG_TOP_AZIMUTH + 180, 45)!
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
      if (dominant === '+X') { expect(v.dx).toBeGreaterThan(0); expect(ax).toBeGreaterThan(ay * 0.5) }
      if (dominant === '-Y') { expect(v.dy).toBeLessThan(0); expect(ay).toBeGreaterThan(ax * 0.5) }
      if (dominant === '+Y') { expect(v.dy).toBeGreaterThan(0); expect(ay).toBeGreaterThan(ax * 0.5) }
    })
  }
})
