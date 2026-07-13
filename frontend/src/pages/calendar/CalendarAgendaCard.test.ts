// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarAgendaCard from './CalendarAgendaCard'
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

describe('CalendarAgendaCard handoffs', () => {
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

  it('keeps individual jobs separate and links jobs and sessions to their canonical pages', () => {
    const events = [
      event(),
      event({ id: 'schedule:2:water:0', plant_id: 2, plant_name: 'Monstera', schedule_id: 2 }),
      event({
        id: 'garden-group:10:water:2026-07-13',
        plant_id: null,
        schedule_id: null,
        grouped: true,
        group_count: 4,
        group_member_schedule_ids: [11, 12, 13, 14],
      }),
    ]

    const card = createElement(CalendarAgendaCard, {
      selectedIso: TODAY,
      events,
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      mapSlugs: new Map([[10, 'back-garden']]),
    })
    act(() => root.render(createElement(MemoryRouter, null, card)))

    expect(container.querySelectorAll('.agenda-group')).toHaveLength(3)
    expect(Array.from(container.querySelectorAll('a')).map(link => link.getAttribute('href')))
      .toEqual(['/plants/1', '/plants/2', '/map/back-garden'])
    expect(container.textContent).toContain('Varen')
    expect(container.textContent).toContain('Monstera')
    expect(container.textContent).toContain('4')
  })

  it('renders weather reason and recommendation in the desktop agenda', () => {
    const weatherEvent = event({
      id: 'schedule:9:frost_protect',
      type: 'frost_protect',
      weather_triggered: true,
      reason_nl: 'Minimum -2°C verwacht vannacht (grens 0°C).',
      action_nl: 'Zet kwetsbare potten binnen.',
    })
    const card = createElement(CalendarAgendaCard, {
      selectedIso: TODAY,
      events: [weatherEvent],
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      mapSlugs: new Map([[10, 'back-garden']]),
    })
    act(() => root.render(createElement(MemoryRouter, null, card)))

    expect(container.textContent).toContain('Minimum -2°C verwacht vannacht')
    expect(container.textContent).toContain('Zet kwetsbare potten binnen.')
    expect(container.querySelector('button')).toBeNull()
  })
})
