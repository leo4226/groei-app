import { describe, expect, it } from 'vitest'
import { getGardenActionDefaultDate } from './useGardenActions'

describe('garden action date picker', () => {
  it('pre-fills with last done date when a previous garden log exists', () => {
    const now = new Date('2026-06-20T12:00:00.000Z')

    expect(getGardenActionDefaultDate('2026-06-01', now)).toBe('2026-06-01')
  })

  it('falls back to today when no previous garden log exists', () => {
    const now = new Date('2026-06-20T12:00:00.000Z')

    expect(getGardenActionDefaultDate(null, now)).toBe('2026-06-20')
    expect(getGardenActionDefaultDate(undefined, now)).toBe('2026-06-20')
  })
})
