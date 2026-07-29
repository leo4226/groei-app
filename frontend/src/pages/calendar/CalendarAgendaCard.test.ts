// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarAgendaCard from './CalendarAgendaCard'
import type { CalendarEvent } from './calendarTypes'
import type { CalendarWeatherAdvisory } from './calendarWeatherAdvisoryModel'

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

  it('renders completed care in a separate read-only history section', () => {
    const card = createElement(CalendarAgendaCard, {
      selectedIso: TODAY,
      events: [],
      completedEvents: [
        event({ id: 'care-log:1', status: 'completed', schedule_id: null }),
        event({
          id: 'garden-operation:2',
          status: 'completed',
          plant_id: null,
          schedule_id: null,
          grouped: true,
          group_count: 4,
        }),
      ],
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      mapSlugs: new Map([[10, 'back-garden']]),
    })
    act(() => root.render(createElement(MemoryRouter, null, card)))

    const history = container.querySelector('[data-calendar-history]')
    expect(history).not.toBeNull()
    expect(history?.querySelectorAll('.agenda-group')).toHaveLength(2)
    expect(history?.querySelector('button')).toBeNull()
    expect(Array.from(history?.querySelectorAll('a') ?? []).map(link => link.getAttribute('href')))
      .toEqual(['/plants/1', '/map/back-garden'])
  })

  it('does not call an active weather-only day a free day', () => {
    const advisory: CalendarWeatherAdvisory = {
      key: 'heat',
      date: TODAY,
      type: 'heat_protect',
      severity: 'warning',
      warningId: 'weather:heat',
      acknowledgedAt: null,
      reasonNl: 'Maximum 33°C verwacht.',
      reasonEn: 'Maximum 33°C expected.',
      actionNl: 'Geef schaduw.',
      actionEn: 'Provide shade.',
      color: null,
      icon: null,
      affectedPlantCount: 3,
      locations: [],
      sourceEvents: [],
    }
    const card = createElement(CalendarAgendaCard, {
      selectedIso: TODAY,
      events: [],
      weatherAdvisories: [advisory],
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      mapSlugs: new Map(),
    })

    act(() => root.render(createElement(MemoryRouter, null, card)))

    expect(container.textContent).toContain('3 planten hebben bescherming tegen hitte nodig')
    expect(container.querySelector('.agenda-empty')).toBeNull()
  })
})
