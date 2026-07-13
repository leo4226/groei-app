// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MobileAgendaList from './MobileAgendaList'
import type { CalendarEvent } from './calendarTypes'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TODAY = '2026-07-13'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'schedule:1:water:0',
    date: TODAY,
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

describe('MobileAgendaList handoffs', () => {
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

  it('links individual jobs to Plant Passport and grouped sessions to Map', () => {
    const list = createElement(MobileAgendaList, {
      events: [
        event(),
        event({
          id: 'garden-group:10:water:2026-07-13',
          plant_id: null,
          schedule_id: null,
          grouped: true,
          group_count: 3,
          group_member_schedule_ids: [11, 12, 13],
        }),
      ],
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      actionError: null,
      mapSlugs: new Map([[10, 'back-garden']]),
    })
    act(() => root.render(createElement(MemoryRouter, null, list)))

    expect(Array.from(container.querySelectorAll('a')).map(link => link.getAttribute('href')))
      .toEqual(['/plants/1', '/map/back-garden'])
  })
})
