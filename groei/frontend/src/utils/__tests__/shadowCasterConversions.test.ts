import { describe, it, expect } from 'vitest'
import {
  detectKant,
  rectToDisplay,
  displayToRect,
  circleToDisplay,
  displayToCircle,
  opacityToPreset,
  PRESET_OPACITIES,
} from '../shadowCasterConversions'
import type { ShadowCaster } from '../../types'

const BOUNDS = { minX: 0, minY: 0, maxX: 400, maxY: 600 }
const SCALE = 46 // PX_PER_M

function rect(x: number, y: number, w: number, h: number): ShadowCaster & { type: 'rect' } {
  return { id: 't', label: 't', type: 'rect', x, y, width: w, height: h, heightCm: 1000 }
}

describe('detectKant', () => {
  it('caster right edge < minX → links', () => {
    expect(detectKant(rect(-300, -500, 100, 1500), BOUNDS)).toBe('links')
  })
  it('caster left edge > maxX → rechts', () => {
    expect(detectKant(rect(500, -500, 100, 1500), BOUNDS)).toBe('rechts')
  })
  it('caster bottom edge < minY → boven', () => {
    expect(detectKant(rect(-500, -200, 1500, 50), BOUNDS)).toBe('boven')
  })
  it('caster top edge > maxY → onder', () => {
    expect(detectKant(rect(-500, 700, 1500, 100), BOUNDS)).toBe('onder')
  })
  it('caster inside garden → defaults to links', () => {
    expect(detectKant(rect(100, 100, 100, 100), BOUNDS)).toBe('links')
  })
})

describe('rectToDisplay', () => {
  it('links: afstand and dikte computed correctly', () => {
    // building width=92px(2m) at x=-138 → 46px(1m) gap from minX=0
    const caster = rect(-138, -900, 92, 1800)
    const d = rectToDisplay(caster, BOUNDS, SCALE)
    expect(d.kant).toBe('links')
    expect(d.afstandM).toBeCloseTo(1, 0)
    expect(d.dikteM).toBeCloseTo(2, 0)
  })
  it('rechts: afstand from maxX', () => {
    const caster = rect(492, -900, 92, 1800) // 92px gap from maxX=400
    const d = rectToDisplay(caster, BOUNDS, SCALE)
    expect(d.kant).toBe('rechts')
    expect(d.afstandM).toBeCloseTo(2, 0)
    expect(d.dikteM).toBeCloseTo(2, 0)
  })
})

describe('displayToRect round-trip', () => {
  it('links round-trip preserves afstand and dikte', () => {
    const px = displayToRect('links', 2, 8, BOUNDS, SCALE)
    const caster = rect(px.x, px.y, px.width, px.height)
    const d = rectToDisplay(caster, BOUNDS, SCALE)
    expect(d.kant).toBe('links')
    expect(d.afstandM).toBeCloseTo(2, 0)
    expect(d.dikteM).toBeCloseTo(8, 0)
  })
  it('rechts round-trip', () => {
    const px = displayToRect('rechts', 3, 10, BOUNDS, SCALE)
    const caster = rect(px.x, px.y, px.width, px.height)
    const d = rectToDisplay(caster, BOUNDS, SCALE)
    expect(d.kant).toBe('rechts')
    expect(d.afstandM).toBeCloseTo(3, 0)
    expect(d.dikteM).toBeCloseTo(10, 0)
  })
  it('building auto-spans 3× garden height for links/rechts', () => {
    const px = displayToRect('links', 1, 5, BOUNDS, SCALE)
    expect(px.height).toBe((BOUNDS.maxY - BOUNDS.minY) * 3)
  })
  it('building auto-spans 3× garden width for boven/onder', () => {
    const px = displayToRect('boven', 1, 5, BOUNDS, SCALE)
    expect(px.width).toBe((BOUNDS.maxX - BOUNDS.minX) * 3)
  })
})

describe('circleToDisplay + displayToCircle round-trip', () => {
  it('round-trips cx/cy/radius within 1px rounding', () => {
    const caster: ShadowCaster & { type: 'circle' } = {
      id: 't', label: 't', type: 'circle', cx: 268, cy: 507, radius: 80, heightCm: 1400,
    }
    const { xM, yM, straalM } = circleToDisplay(caster, SCALE)
    const result = displayToCircle(xM, yM, straalM, SCALE)
    expect(Math.abs(result.cx - caster.cx)).toBeLessThan(2)
    expect(Math.abs(result.cy - caster.cy)).toBeLessThan(2)
    expect(Math.abs(result.radius - caster.radius)).toBeLessThan(2)
  })
  it('straal minimum is 0.5m', () => {
    const caster: ShadowCaster & { type: 'circle' } = {
      id: 't', label: 't', type: 'circle', cx: 0, cy: 0, radius: 1, heightCm: 100,
    }
    const { straalM } = circleToDisplay(caster, SCALE)
    expect(straalM).toBeGreaterThanOrEqual(0.5)
  })
})

describe('opacityToPreset', () => {
  it('0.25 → lichte-boom', () => expect(opacityToPreset(0.25)).toBe('lichte-boom'))
  it('0.0 → lichte-boom', () => expect(opacityToPreset(0)).toBe('lichte-boom'))
  it('0.39 → lichte-boom', () => expect(opacityToPreset(0.39)).toBe('lichte-boom'))
  it('0.4 → dichte-boom', () => expect(opacityToPreset(0.4)).toBe('dichte-boom'))
  it('0.6 → dichte-boom', () => expect(opacityToPreset(0.6)).toBe('dichte-boom'))
  it('0.8 → dichte-boom', () => expect(opacityToPreset(0.8)).toBe('dichte-boom'))
  it('0.81 → gebouw', () => expect(opacityToPreset(0.81)).toBe('gebouw'))
  it('1.0 → gebouw', () => expect(opacityToPreset(1.0)).toBe('gebouw'))
})

describe('PRESET_OPACITIES', () => {
  it('lichte-boom is 0.25', () => expect(PRESET_OPACITIES['lichte-boom']).toBe(0.25))
  it('dichte-boom is 0.60', () => expect(PRESET_OPACITIES['dichte-boom']).toBe(0.60))
  it('gebouw is 1.0', () => expect(PRESET_OPACITIES['gebouw']).toBe(1.0))
})
