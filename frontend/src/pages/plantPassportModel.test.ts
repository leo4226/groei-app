import { describe, expect, it } from 'vitest'
import type { CareType } from '../types'
import {
  addableCareTypes,
  buildAddSchedulePayload,
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

describe('buildAddSchedulePayload / addableCareTypes', () => {
  // PUT /plants/{id}/care-schedules 422s the WHOLE request on any row it does
  // not consider a user-managed recurring schedule, so the replacement payload
  // must not echo `plant.care_schedules` back verbatim.
  const schedules: { care_type: CareType; interval_days: number; season_adjust: string | null; notes: string | null; next_due: string; is_active: boolean }[] = [
    { care_type: 'water', interval_days: 3, season_adjust: null, notes: null, next_due: '2026-08-10', is_active: true },
    { care_type: 'photo', interval_days: 30, season_adjust: null, notes: null, next_due: '2026-09-01', is_active: true },
    { care_type: 'frost_protect', interval_days: 1, season_adjust: null, notes: null, next_due: '2026-08-11', is_active: true },
    { care_type: 'prune', interval_days: 180, season_adjust: null, notes: null, next_due: '2026-12-01', is_active: false },
  ]

  it('drops photo, weather and inactive rows from the payload', () => {
    const payload = buildAddSchedulePayload(schedules, 'outdoor_ground', 'fertilize', 30, new Date(2026, 7, 11))
    expect(payload.map(p => p.care_type)).toEqual(['water', 'fertilize'])
  })

  it('drops rows invalid for the environment', () => {
    const indoorOnly: typeof schedules = [
      { care_type: 'mist', interval_days: 7, season_adjust: null, notes: null, next_due: '2026-08-12', is_active: true },
      ...schedules,
    ]
    // mist is indoor-only, so it must not be echoed back for a garden plant.
    expect(buildAddSchedulePayload(indoorOnly, 'outdoor_ground', 'fertilize', 30).map(p => p.care_type))
      .toEqual(['water', 'fertilize'])
    expect(buildAddSchedulePayload(indoorOnly, 'indoor', 'fertilize', 30).map(p => p.care_type))
      .toEqual(['mist', 'water', 'fertilize'])
  })

  it('never sends the same care type twice', () => {
    const payload = buildAddSchedulePayload(schedules, 'outdoor_ground', 'water', 5)
    expect(payload.map(p => p.care_type)).toEqual(['water'])
    expect(payload[0].interval_days).toBe(5)
  })

  it('offers only environment-valid types the plant does not already have', () => {
    const outdoor = addableCareTypes(schedules, 'outdoor_ground')
    expect(outdoor).not.toContain('water')          // already scheduled
    expect(outdoor).not.toContain('mist')           // indoor only
    expect(outdoor).not.toContain('repot')          // in-ground plants are not repotted
    expect(outdoor).toContain('fertilize')
    expect(outdoor).toContain('pest_check')
    // Weather-triggered care is automatic — the API rejects it outright.
    expect(outdoor as string[]).not.toContain('frost_protect')
    expect(outdoor as string[]).not.toContain('heat_protect')
    expect(outdoor as string[]).not.toContain('photo')
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
