// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import MonthView from './MonthView'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const calendarHookMocks = vi.hoisted(() => ({
  retry: vi.fn(),
  useCalendarActions: vi.fn(),
}))

vi.mock('./useCalendarEvents', () => ({
  useCalendarEvents: () => ({
    events: [], loading: false, error: false, retry: calendarHookMocks.retry,
  }),
}))

vi.mock('./useCalendarActions', () => ({
  useCalendarActions: (...args: unknown[]) => {
    calendarHookMocks.useCalendarActions(...args)
    return {
      actionError: null,
      clearCompletion: vi.fn(),
      completion: null,
      doneIds: new Set<string>(),
      handleDone: vi.fn(),
      handleGardenUndo: vi.fn(),
      handleSkip: vi.fn(),
      saving: null,
      undoMsg: null,
    }
  },
}))

vi.mock('./useIsNarrow', () => ({ useIsNarrow: () => false }))
vi.mock('./CalendarGrid', () => ({ default: () => null }))

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
        }),
      ),
    ))

    const rail = container.querySelector('aside.col-side')
    expect(rail).not.toBeNull()
    expect(rail?.querySelector('.upcoming-summary')).toBeNull()
    expect(rail?.querySelector('.almanac-side')).toBeNull()
    expect(calendarHookMocks.useCalendarActions).toHaveBeenCalledWith(
      [], calendarHookMocks.retry, expect.any(String),
    )
  })
})
