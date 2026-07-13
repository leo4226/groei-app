// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarLegend from './CalendarLegend'
import type { CalendarEvent } from './calendarTypes'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'schedule:1:water:0',
    date: '2026-07-13',
    type: 'water',
    plant_id: 1,
    plant_name: 'Varen',
    plant_icon_variant: null,
    schedule_id: 1,
    map_id: 10,
    map_name: 'Achtertuin',
    overdue: false,
    severity: null,
    color: null,
    icon: null,
    grouped: false,
    group_count: null,
    group_member_schedule_ids: null,
    weather_triggered: false,
    ...overrides,
  }
}

describe('CalendarLegend', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows controls only for event types present in the Month dataset', () => {
    act(() => root.render(createElement(CalendarLegend, {
      events: [event()],
      activeTypes: new Set(['water']),
      onToggle: vi.fn(),
    })))

    const controls = container.querySelectorAll('[role="button"]')
    expect(controls).toHaveLength(1)
    expect(controls[0].textContent).toContain('Water')
    expect(container.textContent).not.toContain('Bloei')
    expect(container.textContent).not.toContain('Snoeien')
  })
})
