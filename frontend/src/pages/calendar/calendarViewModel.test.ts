import { describe, expect, it } from 'vitest'
import { defaultCalendarView } from './calendarViewModel'

describe('defaultCalendarView', () => {
  it('opens Work Agenda on narrow layouts', () => {
    expect(defaultCalendarView(true)).toBe('work')
  })

  it('opens Month on wide layouts', () => {
    expect(defaultCalendarView(false)).toBe('month')
  })
})
