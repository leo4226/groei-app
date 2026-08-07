import { describe, it, expect } from 'vitest'
import { computeHeatmap } from '../heatmapCalc'

// Amsterdam garden (same defaults the app uses). Small bounds keep the test
// fast; no shadow casters means every cell is full-sun.
const LAT = 52.3715
const LON = 4.8499
const BOUNDS = { minX: 0, minY: 0, maxX: 46, maxY: 46 }
const GRID = 0.46 // one cell per 46px (1m)

function maxSunHours(month: number): number {
  const cells = computeHeatmap(month, GRID, 30, LAT, LON, 0, [], BOUNDS)
  return Math.max(...cells.map(c => c.sunHours))
}

describe('computeHeatmap intensity weighting (#855)', () => {
  it('marks every cell as weighted', () => {
    const cells = computeHeatmap(6, GRID, 30, LAT, LON, 0, [], BOUNDS)
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.weighted).toBe(true)
    }
  })

  it('full-sun June scores higher than full-sun March', () => {
    const june = maxSunHours(6)
    const march = maxSunHours(3)
    expect(june).toBeGreaterThan(march)
  })

  it('full-sun June scores higher than full-sun December', () => {
    const june = maxSunHours(6)
    const december = maxSunHours(12)
    expect(june).toBeGreaterThan(december)
  })

  it('weighted hours stay below raw daylight hours (sin <= 1)', () => {
    // June 15 in Amsterdam has ~16.5h of daylight; weighted hours must be
    // strictly less than that because every sample is weighted by sin(alt) < 1.
    const cells = computeHeatmap(6, GRID, 30, LAT, LON, 0, [], BOUNDS)
    for (const cell of cells) {
      expect(cell.sunHours).toBeLessThan(17)
    }
  })

  it('a shaded cell scores lower than an open cell in the same month', () => {
    // A giant box enclosing the whole plot blocks direct sun most of the day,
    // while the same plot with no casters is open sky.
    const enclosed = computeHeatmap(6, GRID, 30, LAT, LON, 0, [
      {
        id: 'wall', label: 'Wall',
        type: 'rect' as const,
        x: -50, y: -50, width: 146, height: 146,
        heightCm: 500, excludeSelf: false,
      },
    ], BOUNDS)
    const open = computeHeatmap(6, GRID, 30, LAT, LON, 0, [], BOUNDS)
    expect(open.length).toBeGreaterThan(0)
    expect(enclosed.length).toBeGreaterThan(0)
    expect(Math.max(...open.map(c => c.sunHours))).toBeGreaterThan(
      Math.max(...enclosed.map(c => c.sunHours)),
    )
  })

  it('keeps the 4h full-sun threshold reachable for a June full-sun spot', () => {
    // The point of weighting is honest light, not a broken scale: a genuinely
    // full-sun June spot must still clear the 4h full-sun bucket threshold.
    const june = maxSunHours(6)
    expect(june).toBeGreaterThanOrEqual(4)
  })
})
