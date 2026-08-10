import { describe, expect, it } from 'vitest'
import {
  daysSince,
  localCalendarDate,
  nextScheduleInput,
  relativeDayLabel,
  showsGardenWeather,
} from './plantPassportModel'

const LABELS = {
  today: 'Done today',
  yesterday: 'Done yesterday',
  daysAgo: (n: number) => `Done ${n} days ago`,
}

describe('daysSince / relativeDayLabel', () => {
  const now = new Date(2026, 7, 9, 14, 0)

  it('counts calendar days, not elapsed hours', () => {
    // 23:00 yesterday is 15 hours ago but still "1 day ago" to a gardener.
    expect(daysSince('2026-08-08T23:00:00', now)).toBe(1)
    expect(daysSince('2026-08-09T00:30:00', now)).toBe(0)
    expect(daysSince('2026-08-02T09:00:00', now)).toBe(7)
  })

  it('labels today, yesterday and older', () => {
    expect(relativeDayLabel('2026-08-09T08:00:00', LABELS, now)).toBe('Done today')
    expect(relativeDayLabel('2026-08-08T08:00:00', LABELS, now)).toBe('Done yesterday')
    expect(relativeDayLabel('2026-08-06T08:00:00', LABELS, now)).toBe('Done 3 days ago')
  })

  it('returns null for never-done, unparseable and future dates', () => {
    expect(relativeDayLabel(null, LABELS, now)).toBeNull()
    expect(relativeDayLabel(undefined, LABELS, now)).toBeNull()
    expect(relativeDayLabel('not a date', LABELS, now)).toBeNull()
    expect(relativeDayLabel('2026-08-20T08:00:00', LABELS, now)).toBeNull()
  })
})

describe('nextScheduleInput', () => {
  it('makes the new schedule due today so the plant reaches the care lists', () => {
    const now = new Date(2026, 7, 9)
    expect(nextScheduleInput('water', 7, now)).toEqual({
      care_type: 'water',
      interval_days: 7,
      next_due: '2026-08-09',
    })
  })

  it('never produces an interval below one day', () => {
    expect(nextScheduleInput('mist', 0).interval_days).toBe(1)
    expect(nextScheduleInput('mist', -5).interval_days).toBe(1)
    expect(nextScheduleInput('mist', 2.4).interval_days).toBe(2)
  })
})

describe('localCalendarDate', () => {
  it('formats the local calendar date, zero-padded', () => {
    expect(localCalendarDate(new Date(2026, 7, 9, 14, 30))).toBe('2026-08-09')
    expect(localCalendarDate(new Date(2026, 0, 1, 9, 0))).toBe('2026-01-01')
  })

  it('stays on today just after local midnight, where the UTC date is still yesterday', () => {
    // 00:30 on 9 Aug in UTC+2 is 22:30 on 8 Aug UTC — toISOString() would say the 8th.
    const justAfterMidnight = new Date('2026-08-08T22:30:00Z')
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-08-08')
    expect(localCalendarDate(justAfterMidnight)).toBe(
      `${justAfterMidnight.getFullYear()}-${String(justAfterMidnight.getMonth() + 1).padStart(2, '0')}-${String(justAfterMidnight.getDate()).padStart(2, '0')}`,
    )
  })
})

describe('showsGardenWeather', () => {
  it('hides the weather for indoor maps', () => {
    expect(showsGardenWeather({ map_type: 'indoor' })).toBe(false)
  })

  it('shows the weather outdoors, and for a plant with no map', () => {
    expect(showsGardenWeather({ map_type: 'outdoor' })).toBe(true)
    expect(showsGardenWeather(null)).toBe(true)
    expect(showsGardenWeather(undefined)).toBe(true)
  })
})
