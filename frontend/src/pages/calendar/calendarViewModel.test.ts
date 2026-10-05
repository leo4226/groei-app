import { describe, expect, it } from 'vitest'
import { deepLinkedDate, defaultCalendarView } from './calendarViewModel'

describe('defaultCalendarView', () => {
  it('opens Work Agenda on narrow layouts', () => {
    expect(defaultCalendarView(true)).toBe('work')
  })

  it('opens Month on wide layouts', () => {
    expect(defaultCalendarView(false)).toBe('month')
  })
})

describe('deepLinkedDate', () => {
  it('reads the month from a personal-calendar event link', () => {
    expect(deepLinkedDate('?date=2026-11-03')).toEqual({ year: 2026, month1: 11, iso: '2026-11-03' })
  })

  it('ignores missing or malformed dates', () => {
    expect(deepLinkedDate('')).toBeNull()
    expect(deepLinkedDate('?date=tomorrow')).toBeNull()
    expect(deepLinkedDate('?date=2026-13-01')).toBeNull()
    expect(deepLinkedDate('?date=2026-02-30')).toBeNull()
  })
})
