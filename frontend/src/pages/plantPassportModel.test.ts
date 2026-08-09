import { describe, expect, it } from 'vitest'
import { localCalendarDate, showsGardenWeather } from './plantPassportModel'

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
