import { describe, expect, it } from 'vitest'
import type { CareType } from '../types'
import {
  addableCareTypes,
  buildAddSchedulePayload,
  buildIntervalChangePayload,
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

// ── #886 §2.1: retiming a schedule from the passport ────────────────────────
//
// The interval was editable only in the edit form, while adding and deleting
// were both possible from the passport — so the most common care edit of all,
// "water every 5 days, not 7", was the one that needed the other screen.

describe('buildIntervalChangePayload', () => {
  const schedules: { care_type: CareType; interval_days: number; season_adjust: string | null; notes: string | null; next_due: string; is_active: boolean }[] = [
    { care_type: 'water', interval_days: 7, season_adjust: null, notes: null, next_due: '2026-08-20', is_active: true },
    { care_type: 'fertilize', interval_days: 30, season_adjust: 'summer', notes: 'half dose', next_due: '2026-09-01', is_active: true },
    { care_type: 'photo', interval_days: 30, season_adjust: null, notes: null, next_due: '2026-09-01', is_active: true },
    { care_type: 'frost_protect', interval_days: 1, season_adjust: null, notes: null, next_due: '2026-08-11', is_active: true },
    { care_type: 'prune', interval_days: 180, season_adjust: null, notes: null, next_due: '2026-12-01', is_active: false },
  ]

  it('changes only the targeted interval and leaves the rest untouched', () => {
    const payload = buildIntervalChangePayload(schedules, 'outdoor_ground', 'water', 5)

    expect(payload).toEqual([
      { care_type: 'water', interval_days: 5 },
      {
        care_type: 'fertilize', interval_days: 30, season_adjust: 'summer',
        notes: 'half dose', next_due: '2026-09-01',
      },
    ])
  })

  it('omits next_due for the edited row so the backend recomputes it', () => {
    // Retiming must not also mean "and do it right now": with next_due absent
    // the backend anchors the next visit on last_done. buildAddSchedulePayload
    // stamps today, which is correct when creating a schedule and wrong here.
    const payload = buildIntervalChangePayload(schedules, 'outdoor_ground', 'water', 5)
    const water = payload.find(p => p.care_type === 'water')!
    expect(water).not.toHaveProperty('next_due')
  })

  it('pins every other row to its current next_due', () => {
    // The endpoint replaces the whole list, so an untouched row that arrived
    // without its date would have it recalculated out from under the user.
    const payload = buildIntervalChangePayload(schedules, 'outdoor_ground', 'water', 5)
    expect(payload.find(p => p.care_type === 'fertilize')!.next_due).toBe('2026-09-01')
  })

  it('drops photo, weather, inactive and environment-invalid rows', () => {
    // Same 422 hazard as buildAddSchedulePayload: the endpoint rejects the
    // whole request on any row it does not consider user-managed.
    expect(buildIntervalChangePayload(schedules, 'outdoor_ground', 'water', 5).map(p => p.care_type))
      .toEqual(['water', 'fertilize'])
  })

  it('never sends an interval below 1 day', () => {
    expect(buildIntervalChangePayload(schedules, 'outdoor_ground', 'water', 0)[0].interval_days).toBe(1)
    expect(buildIntervalChangePayload(schedules, 'outdoor_ground', 'water', -3)[0].interval_days).toBe(1)
    expect(buildIntervalChangePayload(schedules, 'outdoor_ground', 'water', 5.6)[0].interval_days).toBe(6)
  })

  it('is a no-op payload when the care type is not scheduled', () => {
    const payload = buildIntervalChangePayload(schedules, 'outdoor_ground', 'repot', 90)
    expect(payload.map(p => p.care_type)).toEqual(['water', 'fertilize'])
    expect(payload.every(p => p.next_due !== undefined)).toBe(true)
  })
})
