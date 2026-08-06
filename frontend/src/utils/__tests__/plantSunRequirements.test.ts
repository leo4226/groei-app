import { describe, it, expect } from 'vitest'
import { getSunFit, effectiveSunHours, PLANT_SUN_PROFILES } from '../plantSunRequirements'

// Thresholds must mirror the unified 4h/2h light model (lightQuality.ts +
// backend plant_suggestions.py bucket_for) — see issue #811.
describe('PLANT_SUN_PROFILES thresholds', () => {
  it('full_sun starts at 4h (unified FULL_SUN_HOURS)', () => {
    const p = PLANT_SUN_PROFILES.find(x => x.id === 'full_sun')
    expect(p?.minHours).toBe(4)
  })

  it('partial_sun spans 2–4h (unified PART_SUN_HOURS .. FULL_SUN_HOURS)', () => {
    const p = PLANT_SUN_PROFILES.find(x => x.id === 'partial_sun')
    expect(p?.minHours).toBe(2)
    expect(p?.maxHours).toBe(4)
  })

  it('shade tops out at 2h (below PART_SUN_HOURS)', () => {
    const p = PLANT_SUN_PROFILES.find(x => x.id === 'shade')
    expect(p?.minHours).toBe(0)
    expect(p?.maxHours).toBe(2)
  })
})

describe('getSunFit', () => {
  it('returns null for unknown or missing requirement', () => {
    expect(getSunFit(null, 5)).toBeNull()
    expect(getSunFit('', 5)).toBeNull()
    expect(getSunFit('no_such_profile', 5)).toBeNull()
  })

  it('full-sun plant at 4h grades good (regression: was poor at 6h threshold)', () => {
    expect(getSunFit('full_sun', 4)).toBe('good')
  })

  it('full-sun plant at 3h grades partial via ±1h tolerance (regression: was poor)', () => {
    expect(getSunFit('full_sun', 3)).toBe('partial')
  })

  it('full-sun plant at 2h still grades poor (real deficit)', () => {
    expect(getSunFit('full_sun', 2)).toBe('poor')
  })

  it('full-sun plant at 14h grades good', () => {
    expect(getSunFit('full_sun', 14)).toBe('good')
  })

  it('partial-sun plant grades good across 2–4h', () => {
    expect(getSunFit('partial_sun', 2)).toBe('good')
    expect(getSunFit('partial_sun', 3)).toBe('good')
    expect(getSunFit('partial_sun', 4)).toBe('good')
  })

  it('partial-sun plant at 1h or 5h grades partial (tolerance band)', () => {
    expect(getSunFit('partial_sun', 1)).toBe('partial')
    expect(getSunFit('partial_sun', 5)).toBe('partial')
  })

  it('partial-sun plant at 6h grades poor', () => {
    expect(getSunFit('partial_sun', 6)).toBe('poor')
  })

  it('shade plant grades good at 0–2h, partial at 3h, poor at 4h', () => {
    expect(getSunFit('shade', 0)).toBe('good')
    expect(getSunFit('shade', 2)).toBe('good')
    expect(getSunFit('shade', 3)).toBe('partial')
    expect(getSunFit('shade', 4)).toBe('poor')
  })
})

describe('effectiveSunHours', () => {
  it('measured value wins over modelled', () => {
    expect(effectiveSunHours(5, 1)).toEqual({ sunHours: 5, source: 'measured' })
  })

  it('falls back to modelled when measured is null', () => {
    expect(effectiveSunHours(null, 1)).toEqual({ sunHours: 1, source: 'estimated' })
    expect(effectiveSunHours(undefined, 1)).toEqual({ sunHours: 1, source: 'estimated' })
  })
})
