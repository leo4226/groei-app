import { describe, it, expect } from 'vitest'
import { fitTransform, graticuleStep, clusterEntries, countPlaces } from './expeditionGeo'

describe('fitTransform', () => {
  it('maps all entries inside the padded canvas', () => {
    const entries = [
      { lat: 52.37, lon: 4.85 },   // Amsterdam
      { lat: 43.46, lon: 11.04 },  // Tuscany
      { lat: 41.1, lon: -7.8 },    // Douro
    ]
    const t = fitTransform(entries, 760, 400, 48)
    for (const e of entries) {
      const [x, y] = t.toScreen(e.lon, e.lat)
      expect(x).toBeGreaterThanOrEqual(48 - 1e-6)
      expect(x).toBeLessThanOrEqual(760 - 48 + 1e-6)
      expect(y).toBeGreaterThanOrEqual(48 - 1e-6)
      expect(y).toBeLessThanOrEqual(400 - 48 + 1e-6)
    }
  })

  it('enforces a minimum span for a single pin', () => {
    const t = fitTransform([{ lat: 52.37, lon: 4.85 }], 760, 400, 48, 4)
    expect(t.lonMax - t.lonMin).toBeGreaterThanOrEqual(4)
    expect(t.latMax - t.latMin).toBeGreaterThanOrEqual(4 * (400 - 96) / (760 - 96) * 0.9)
  })

  it('north is up: higher latitude maps to smaller y', () => {
    const t = fitTransform([{ lat: 50, lon: 5 }, { lat: 54, lon: 5 }], 760, 400)
    const [, yNorth] = t.toScreen(5, 54)
    const [, ySouth] = t.toScreen(5, 50)
    expect(yNorth).toBeLessThan(ySouth)
  })
})

describe('graticuleStep', () => {
  it('scales with the visible span', () => {
    expect(graticuleStep(3)).toBe(0.5)
    expect(graticuleStep(20)).toBe(5)
    expect(graticuleStep(200)).toBe(30)
  })
})

describe('clusterEntries', () => {
  it('merges nearby pins and keeps chronological order', () => {
    const clusters = clusterEntries([
      { id: 1, index: 1, lat: 0, lon: 0, x: 100, y: 100 },
      { id: 2, index: 2, lat: 0, lon: 0, x: 110, y: 105 },
      { id: 3, index: 3, lat: 0, lon: 0, x: 400, y: 300 },
    ], 30)
    expect(clusters).toHaveLength(2)
    expect(clusters[0].ids).toEqual([1, 2])
    expect(clusters[0].indices).toEqual([1, 2])
    expect(clusters[1].ids).toEqual([3])
  })
})

describe('countPlaces', () => {
  it('counts proximity groups, not entries', () => {
    expect(countPlaces([
      { lat: 52.37, lon: 4.85 },
      { lat: 52.38, lon: 4.86 },  // same neighbourhood
      { lat: 43.46, lon: 11.04 },
    ])).toBe(2)
  })
  it('is 0 for no located entries', () => {
    expect(countPlaces([])).toBe(0)
  })
})
