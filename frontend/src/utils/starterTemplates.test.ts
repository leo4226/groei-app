import { describe, it, expect } from 'vitest'
import {
  CANVAS_SIZE,
  buildTemplateZones,
  fitScalePxPerM,
  STARTER_TEMPLATES,
} from './starterTemplates'

describe('fitScalePxPerM', () => {
  it('fits the larger dimension inside the canvas with a margin', () => {
    const scale = fitScalePxPerM(10, 6)
    const usable = CANVAS_SIZE * (1 - 2 * 0.12)
    // 10m is the larger span, so 10m * scale must not exceed the usable width.
    expect(10 * scale).toBeLessThanOrEqual(usable + 0.5)
    expect(scale).toBeGreaterThan(0)
  })

  it('never returns an absurdly small scale for tiny gardens', () => {
    expect(fitScalePxPerM(0.1, 0.1)).toBeGreaterThanOrEqual(4)
  })
})

describe('buildTemplateZones', () => {
  const scale = fitScalePxPerM(8, 6)

  it('seeds nothing for the blank template', () => {
    expect(buildTemplateZones('blank', 8, 6, scale)).toEqual([])
    expect(STARTER_TEMPLATES.blank.seedsZones).toBe(false)
  })

  it('rectangle is a single centred lawn zone inside the canvas', () => {
    const rects = buildTemplateZones('rectangle', 8, 6, scale)
    expect(rects).toHaveLength(1)
    const [r] = rects
    expect(r.type).toBe('lawn')
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.x + r.width).toBeLessThanOrEqual(CANVAS_SIZE)
    expect(r.y + r.height).toBeLessThanOrEqual(CANVAS_SIZE)
    // Roughly centred (allow 1px of integer-rounding slack)
    expect(Math.abs(r.x - (CANVAS_SIZE - (r.x + r.width)))).toBeLessThanOrEqual(1)
  })

  it('scales dimensions to metres', () => {
    const [r] = buildTemplateZones('rectangle', 8, 6, scale)
    expect(r.width).toBe(Math.round(8 * scale))
    expect(r.height).toBe(Math.round(6 * scale))
  })

  it('l_shape is two lawn zones forming an L', () => {
    const rects = buildTemplateZones('l_shape', 8, 8, scale)
    expect(rects).toHaveLength(2)
    expect(rects.every((r) => r.type === 'lawn')).toBe(true)
    const [col, bar] = rects
    // Column is on the left, bar continues to the right of it.
    expect(bar.x).toBe(col.x + col.width)
    // Bar sits along the bottom edge of the column.
    expect(bar.y + bar.height).toBe(col.y + col.height)
    // The bar is shorter than the column (that's what makes the corner).
    expect(bar.height).toBeLessThan(col.height)
  })

  it('balcony is a single deck strip', () => {
    const rects = buildTemplateZones('balcony', 4, 1.4, fitScalePxPerM(4, 1.4))
    expect(rects).toHaveLength(1)
    expect(rects[0].type).toBe('deck')
    expect(rects[0].width).toBeGreaterThan(rects[0].height)
  })
})
