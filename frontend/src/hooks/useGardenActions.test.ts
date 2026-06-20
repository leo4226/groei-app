import { describe, expect, it } from 'vitest'
import { getGardenActionDefaultDate } from './useGardenActions'

describe('garden action date picker', () => {
  it('defaults to today even when a previous garden log exists', () => {
    const now = new Date('2026-06-20T12:00:00.000Z')

    expect(getGardenActionDefaultDate('2026-06-01', now)).toBe('2026-06-20')
  })
})
