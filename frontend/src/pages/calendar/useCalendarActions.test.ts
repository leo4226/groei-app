// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from './calendarTypes'
import { useCalendarActions } from './useCalendarActions'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  markCareDone: vi.fn(async () => undefined),
  skipCare: vi.fn(async () => undefined),
}))

vi.mock('../../api/client', () => ({
  gardenCare: {
    complete: vi.fn(),
    undo: vi.fn(),
  },
}))

vi.mock('../../store/useFloreren', () => ({
  useFloreren: () => ({
    markCareDone: mocks.markCareDone,
    skipCare: mocks.skipCare,
    activeUserId: 1,
  }),
}))

function event(date: string): CalendarEvent {
  return {
    id: 'schedule:1:water:0',
    date,
    type: 'water',
    plant_id: 1,
    plant_name: 'Fern',
    plant_icon_variant: null,
    schedule_id: 1,
    map_id: 1,
    map_name: 'House',
    overdue: false,
    severity: null,
    color: null,
    icon: null,
    grouped: false,
    group_count: null,
    group_member_schedule_ids: null,
    weather_triggered: false,
  }
}

describe('useCalendarActions', () => {
  let container: HTMLDivElement
  let root: Root
  let state: ReturnType<typeof useCalendarActions>

  function Harness({ events }: { events: CalendarEvent[] }) {
    state = useCalendarActions(events)
    return null
  }

  beforeEach(() => {
    mocks.markCareDone.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('reveals a refreshed next occurrence that reuses the dismissed event id', async () => {
    const current = event('2026-07-12')
    act(() => root.render(createElement(Harness, { events: [current] })))

    await act(async () => state.handleDone(current))
    expect(state.doneIds.has(current.id)).toBe(true)

    const refreshed = event('2026-07-19')
    act(() => root.render(createElement(Harness, { events: [refreshed] })))

    expect(state.doneIds.has(refreshed.id)).toBe(false)
  })
})
