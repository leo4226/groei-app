import { describe, it, expect } from 'vitest'
import {
  STARTER_TEMPLATES,
  STARTER_TEMPLATE_ORDER,
  INDOOR_TEMPLATE_ORDER,
  templateOrderFor,
  buildTemplateZones,
  fitScalePxPerM,
  CANVAS_SIZE,
} from '../starterTemplates'

// F1: indoor maps fell straight through to the tour on an empty canvas while
// outdoor got a guided wizard — and indoor is the harder model, with rooms,
// wall thickness and openings placed on edges.

describe('templateOrderFor', () => {
  it('offers floor plans indoors and garden shapes outdoors', () => {
    expect(templateOrderFor('indoor')).toEqual(INDOOR_TEMPLATE_ORDER)
    expect(templateOrderFor('outdoor')).toEqual(STARTER_TEMPLATE_ORDER)
  })

  it('never mixes the two vocabularies', () => {
    const overlap = INDOOR_TEMPLATE_ORDER.filter((id) => STARTER_TEMPLATE_ORDER.includes(id))
    expect(overlap).toEqual([])
  })

  it('gives both modes the same number of choices, ending in a blank', () => {
    expect(INDOOR_TEMPLATE_ORDER).toHaveLength(STARTER_TEMPLATE_ORDER.length)
    for (const order of [INDOOR_TEMPLATE_ORDER, STARTER_TEMPLATE_ORDER]) {
      expect(STARTER_TEMPLATES[order[order.length - 1]].seedsZones).toBe(false)
    }
  })
})

describe('indoor templates', () => {
  const scale = fitScalePxPerM(8, 5)

  it('seeds rooms, not lawn — the indoor palette has no lawn', () => {
    for (const id of INDOOR_TEMPLATE_ORDER) {
      for (const rect of buildTemplateZones(id, 8, 5, scale)) {
        expect(rect.type).toBe('room')
      }
    }
  })

  it('seeds nothing for the blank tile, in either mode', () => {
    expect(buildTemplateZones('blank_indoor', 8, 5, scale)).toEqual([])
    expect(buildTemplateZones('blank', 8, 5, scale)).toEqual([])
  })

  it('splits two_room into two rooms that tile the outline without a gap', () => {
    const [left, right] = buildTemplateZones('two_room', 8, 5, scale)
    expect(left.x + left.width).toBe(right.x)
    expect(left.y).toBe(right.y)
    expect(left.height).toBe(right.height)
  })

  it('keeps every seeded room inside the canvas', () => {
    for (const id of INDOOR_TEMPLATE_ORDER) {
      for (const r of buildTemplateZones(id, 8, 5, scale)) {
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.width).toBeLessThanOrEqual(CANVAS_SIZE)
        expect(r.y + r.height).toBeLessThanOrEqual(CANVAS_SIZE)
      }
    }
  })

  it('holds up at the extremes the size step allows', () => {
    for (const [w, d] of [[0.5, 0.5], [60, 40]] as const) {
      const s = fitScalePxPerM(w, d)
      for (const id of INDOOR_TEMPLATE_ORDER) {
        for (const r of buildTemplateZones(id, w, d, s)) {
          expect(r.width).toBeGreaterThan(0)
          expect(r.height).toBeGreaterThan(0)
          expect(r.x + r.width).toBeLessThanOrEqual(CANVAS_SIZE)
        }
      }
    }
  })
})
