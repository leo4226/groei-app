import { describe, expect, it, vi } from 'vitest'
import { localIsoDate } from './dateFormat'

describe('localIsoDate', () => {
  it('uses the browser-local calendar day instead of UTC', () => {
    const localMidnight = new Date(2026, 6, 23, 0, 30)
    vi.spyOn(localMidnight, 'toISOString').mockReturnValue('2026-07-22T22:30:00.000Z')

    expect(localIsoDate(localMidnight)).toBe('2026-07-23')
  })
})
