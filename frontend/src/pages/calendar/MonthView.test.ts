// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import MonthView from './MonthView'
import type { CalendarEvent } from './calendarTypes'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const calendarHookMocks = vi.hoisted(() => ({
  events: [] as CalendarEvent[],
  doneIds: new Set<string>(),
  retry: vi.fn(),
  useCalendarActions: vi.fn(),
}))

vi.mock('./useCalendarEvents', () => ({
  useCalendarEvents: () => ({
    events: calendarHookMocks.events, loading: false, error: false, retry: calendarHookMocks.retry,
  }),
}))

vi.mock('./useCalendarActions', () => ({
  useCalendarActions: (...args: unknown[]) => {
    calendarHookMocks.useCalendarActions(...args)
    return {
      actionError: null,
      clearCompletion: vi.fn(),
      completion: null,
      doneIds: calendarHookMocks.doneIds,
      handleDone: vi.fn(),
      handleGardenUndo: vi.fn(),
      handleSkip: vi.fn(),
      saving: null,
      undoMsg: null,
    }
  },
}))

vi.mock('./useIsNarrow', () => ({ useIsNarrow: () => false }))
vi.mock('./CalendarGrid', () => ({
  default: ({ events }: { events: unknown[] }) =>
    createElement('section', { 'data-calendar-context': 'grid', 'data-event-count': events.length }),
}))
vi.mock('./WaterOutlookPanel', () => ({
  default: () => createElement('section', { 'data-calendar-context': 'weather' }),
}))
vi.mock('./MonthSeasonalPanel', () => ({
  default: () => createElement('section', { 'data-calendar-context': 'seasonal' }),
}))

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector: (state: {
    maps: never[]
    plants: never[]
    users: never[]
    activeUserId: null
  }) => unknown) => selector({ maps: [], plants: [], users: [], activeUserId: null }),
}))

describe('MonthView desktop rail', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    calendarHookMocks.events = []
    calendarHookMocks.doneIds = new Set<string>()
    calendarHookMocks.retry.mockClear()
    calendarHookMocks.useCalendarActions.mockClear()
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('does not mount redundant Upcoming or permanent Almanac cards', () => {
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(MonthView, {
          onSetView: vi.fn(),
          env: 'all',
          environmentFilter: null,
          viewNavigation: createElement('nav', { 'data-calendar-view-navigation': true }),
          year: 2026,
          month1: 7,
          onMonthChange: vi.fn(),
        }),
      ),
    ))

    const rail = container.querySelector('aside.col-side')
    expect(rail).not.toBeNull()
    expect(rail?.querySelector('.upcoming-summary')).toBeNull()
    expect(rail?.querySelector('.almanac-side')).toBeNull()
    const cards = Array.from(rail?.children ?? [])
    expect(cards.findIndex(card => card.getAttribute('data-calendar-context') === 'agenda'))
      .toBeLessThan(cards.findIndex(card => card.getAttribute('data-calendar-context') === 'weather'))
    expect(cards.findIndex(card => card.getAttribute('data-calendar-context') === 'weather'))
      .toBeLessThan(cards.findIndex(card => card.getAttribute('data-calendar-context') === 'seasonal'))
    expect(calendarHookMocks.useCalendarActions).toHaveBeenCalledWith(
      [], undefined, expect.any(String),
    )
  })

  it('keeps completed tasks on the month grid while removing them from the selected-day agenda', () => {
    calendarHookMocks.events = [{
      id: 'schedule:42:water:0',
      date: new Date().toISOString().slice(0, 10),
      type: 'water',
      plant_id: 42,
      plant_name: 'Rose',
      plant_icon_variant: null,
      schedule_id: 42,
      map_id: 1,
      map_name: 'Garden',
      overdue: false,
      severity: null,
      color: null,
      icon: null,
      grouped: false,
      group_count: null,
      group_member_schedule_ids: null,
      weather_triggered: false,
    }]
    calendarHookMocks.doneIds = new Set(['schedule:42:water:0'])

    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(MonthView, {
          onSetView: vi.fn(),
          env: 'all',
          environmentFilter: null,
          viewNavigation: null,
          year: 2026,
          month1: 7,
          onMonthChange: vi.fn(),
        }),
      ),
    ))

    expect(container.querySelector('[data-calendar-context="grid"]')?.getAttribute('data-event-count'))
      .toBe('1')
    expect(container.querySelector('.sc-sub')?.textContent).toContain('No tasks')
  })
})
