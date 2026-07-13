// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from './calendarTypes'
import { useCalendarActions } from './useCalendarActions'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  gardenComplete: vi.fn(),
  gardenUndo: vi.fn(),
  markCareDone: vi.fn(),
  skipCare: vi.fn(async () => undefined),
}))

vi.mock('../../api/client', () => ({
  gardenCare: {
    complete: mocks.gardenComplete,
    undo: mocks.gardenUndo,
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

  function Harness({ events, navigationKey }: { events: CalendarEvent[]; navigationKey?: string }) {
    state = useCalendarActions(events, undefined, navigationKey)
    return null
  }

  beforeEach(() => {
    mocks.gardenComplete.mockReset()
    mocks.gardenUndo.mockReset()
    mocks.markCareDone.mockReset()
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

  it('publishes and clears an individual completion follow-up', async () => {
    mocks.markCareDone.mockResolvedValue({
      care_log_id: 77,
      previous_next_due: null,
      previous_last_done: null,
      previous_last_done_by: null,
    })
    const current = event('2026-07-12')
    act(() => root.render(createElement(Harness, { events: [current] })))

    await act(async () => state.handleDone(current))

    expect(state.completion).toEqual({
      kind: 'plant',
      plantId: 1,
      plantName: 'Fern',
      careLogId: 77,
    })

    act(() => state.clearCompletion())
    expect(state.completion).toBeNull()
  })

  it('publishes a map follow-up for grouped care and clears it on undo', async () => {
    mocks.gardenComplete.mockResolvedValue({ operation_id: 88 })
    mocks.gardenUndo.mockResolvedValue(undefined)
    const grouped: CalendarEvent = {
      ...event('2026-07-12'),
      id: 'garden-group:1:water:2026-07-12',
      plant_id: null,
      plant_name: null,
      schedule_id: null,
      map_name: 'Back garden',
      grouped: true,
      group_count: 2,
      group_member_schedule_ids: [10, 11],
    }
    act(() => root.render(createElement(Harness, { events: [grouped] })))

    await act(async () => state.handleDone(grouped))
    expect(state.completion).toEqual({ kind: 'map', mapId: 1, mapName: 'Back garden' })

    await act(async () => state.handleGardenUndo())
    expect(state.completion).toBeNull()
  })

  it('clears a completion when Calendar navigation changes', async () => {
    mocks.markCareDone.mockResolvedValue({
      care_log_id: 78,
      previous_next_due: null,
      previous_last_done: null,
      previous_last_done_by: null,
    })
    const current = event('2026-07-12')
    act(() => root.render(createElement(Harness, { events: [current], navigationKey: 'july' })))
    await act(async () => state.handleDone(current))
    expect(state.completion).not.toBeNull()

    act(() => root.render(createElement(Harness, { events: [current], navigationKey: 'august' })))
    expect(state.completion).toBeNull()
  })
})
