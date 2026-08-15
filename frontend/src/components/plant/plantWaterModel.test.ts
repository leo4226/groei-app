import { describe, expect, it } from 'vitest'
import {
  buildWaterContext,
  daysBetween,
  rainSince,
  waterTone,
} from './plantWaterModel'

const NOW = new Date('2026-08-15T20:00:00Z')

const RAIN = [
  { date: '2026-08-09', mm: 0 },
  { date: '2026-08-10', mm: 12 },
  { date: '2026-08-11', mm: 0 },
  { date: '2026-08-12', mm: 3 },
  { date: '2026-08-13', mm: 0 },
  { date: '2026-08-14', mm: 0 },
  { date: '2026-08-15', mm: 1 },
]

describe('daysBetween', () => {
  it('counts whole days regardless of time of day', () => {
    expect(daysBetween('2026-08-10T23:50:00Z', NOW)).toBe(5)
    expect(daysBetween('2026-08-15T01:00:00Z', NOW)).toBe(0)
  })

  it('returns null for an unparseable date rather than NaN', () => {
    expect(daysBetween('not-a-date', NOW)).toBeNull()
  })
})

describe('rainSince', () => {
  it('sums only the rain that fell on or after the watering', () => {
    // Watered on the 12th: 3mm that day + 1mm on the 15th. The 12mm on the
    // 10th went to a plant that has since been watered again.
    expect(rainSince(RAIN, '2026-08-12')).toBe(4)
  })

  it('includes rain on the watering day itself', () => {
    // Excluding it would under-report on exactly the day you ask.
    expect(rainSince(RAIN, '2026-08-15')).toBe(1)
  })

  it('is zero when nothing has fallen since', () => {
    expect(rainSince(RAIN, '2026-08-16')).toBe(0)
  })
})

describe('buildWaterContext', () => {
  it('measures the dry spell against this plant’s own interval', () => {
    const ctx = buildWaterContext(
      { last_done: '2026-08-03', interval_days: 5 }, RAIN, NOW)
    expect(ctx.daysSinceWatered).toBe(12)
    expect(ctx.intervalDays).toBe(5)
    expect(ctx.overdueDays).toBe(7)
  })

  it('is not overdue when the interval has not elapsed', () => {
    const ctx = buildWaterContext(
      { last_done: '2026-08-13', interval_days: 30 }, RAIN, NOW)
    expect(ctx.overdueDays).toBe(0)
  })

  it('reports nothing measurable when the plant was never watered', () => {
    const ctx = buildWaterContext(
      { last_done: null, interval_days: 5 }, RAIN, NOW)
    expect(ctx.daysSinceWatered).toBeNull()
    // Without a window there is no rain figure — falling back to a 14-day
    // garden total would just be the old global number again.
    expect(ctx.mmSinceWatered).toBeNull()
    expect(ctx.overdueDays).toBe(0)
  })

  it('copes with the rain data not having loaded', () => {
    const ctx = buildWaterContext(
      { last_done: '2026-08-03', interval_days: 5 }, null, NOW)
    expect(ctx.daysSinceWatered).toBe(12)
    expect(ctx.mmSinceWatered).toBeNull()
  })
})

describe('waterTone', () => {
  const base = { daysSinceWatered: 12, intervalDays: 5, overdueDays: 7 }

  it('flags dry only when overdue AND barely any rain since', () => {
    expect(waterTone({ ...base, mmSinceWatered: 1 })).toBe('dry')
  })

  it('is merely due when rain has done the job', () => {
    // The distinction the old global badge could not make: past due after a
    // wet week is not the same situation as past due in a drought.
    expect(waterTone({ ...base, mmSinceWatered: 22 })).toBe('due')
  })

  it('is ok before the interval elapses, however dry', () => {
    expect(waterTone({
      daysSinceWatered: 2, intervalDays: 30, overdueDays: 0, mmSinceWatered: 0,
    })).toBe('ok')
  })

  it('falls back to due when there is no rain figure at all', () => {
    expect(waterTone({ ...base, mmSinceWatered: null })).toBe('due')
  })
})
