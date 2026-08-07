import { describe, it, expect } from 'vitest'
import { zoneStyle, ZONE_STYLES, ZONE_TYPE_ORDER, UNKNOWN_ZONE_STYLE } from '../EditorDefs'

describe('zoneStyle', () => {
  it('does not throw on a type the app has never heard of', () => {
    // R1: the indexed lookup returned undefined and the next `.fill` threw,
    // which the ErrorBoundary caught as a full-page failure — one bad zone in
    // canvas_data made the entire map unopenable, with no way to delete it.
    expect(() => zoneStyle('border')).not.toThrow()
    expect(zoneStyle('border')).toBe(UNKNOWN_ZONE_STYLE)
  })

  it('returns something renderable for every field the SVG reads', () => {
    const style = zoneStyle('definitely-not-a-zone-type')
    for (const key of ['fill', 'stroke', 'strokeWidth', 'opacity'] as const) {
      expect(style[key]).toBeDefined()
    }
  })

  it('does not disguise an unknown zone as a real one', () => {
    // Falling back to, say, lawn would silently relabel the user's data.
    const known = ZONE_TYPE_ORDER.map((t) => ZONE_STYLES[t].fill)
    expect(known).not.toContain(UNKNOWN_ZONE_STYLE.fill)
  })

  it('still returns the real style for every known type', () => {
    for (const type of ZONE_TYPE_ORDER) {
      expect(zoneStyle(type)).toBe(ZONE_STYLES[type])
    }
  })

  it('survives the values that reach it from untyped canvas_data', () => {
    for (const bad of ['', 'LAWN', 'lawn ', '__proto__', 'toString']) {
      expect(() => zoneStyle(bad)).not.toThrow()
      expect(typeof zoneStyle(bad).fill).toBe('string')
    }
  })
})
