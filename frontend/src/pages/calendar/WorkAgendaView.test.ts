// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import WorkAgendaView from './WorkAgendaView'
import type { CalendarEvent } from './calendarTypes'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ retry: vi.fn() }))

vi.mock('./useCalendarEvents', () => ({
  useCalendarEventRange: () => ({
    events: [{
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
    } satisfies CalendarEvent],
    loading: false,
    error: null,
    refreshError: 'offline',
    retry: mocks.retry,
  }),
}))

vi.mock('./useCalendarActions', () => ({
  useCalendarActions: () => ({
    actionError: null,
    cancelMoistureCheck: vi.fn(),
    cancelWaterRound: vi.fn(),
    clearCompletion: vi.fn(),
    completion: null,
    confirmWaterRound: vi.fn(),
    doneIds: new Set<string>(),
    handleDone: vi.fn(),
    handleGardenUndo: vi.fn(),
    handleSkip: vi.fn(),
    moistureNotice: null,
    pendingMoistureCheck: null,
    pendingWaterRound: null,
    resolveMoistureCheck: vi.fn(),
    saving: null,
    undoMsg: null,
  }),
}))

vi.mock('./WaterOutlookPanel', () => ({ default: () => null }))
vi.mock('./MonthSeasonalPanel', () => ({ default: () => null }))
vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector: (state: {
    maps: never[]
    plants: never[]
    users: never[]
    activeUserId: null
  }) => unknown) => (
    selector({ maps: [], plants: [], users: [], activeUserId: null })
  ),
}))

describe('WorkAgendaView background refresh', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.retry.mockClear()
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

  it('keeps actionable work visible when a background refresh fails', () => {
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(MemoryRouter, null,
          createElement(WorkAgendaView, {
            env: 'all',
            environmentFilter: null,
            viewNavigation: null,
          }),
        ),
      ),
    ))

    expect(container.textContent).toContain('Rose')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    act(() => (container.querySelector('[role="alert"] button') as HTMLButtonElement).click())
    expect(mocks.retry).toHaveBeenCalledOnce()
  })
})
