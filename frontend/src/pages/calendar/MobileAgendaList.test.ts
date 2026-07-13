// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MobileAgendaList from './MobileAgendaList'
import type { CalendarEvent } from './calendarTypes'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TODAY = '2026-07-12'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'schedule:1:water',
    date: TODAY,
    type: 'water',
    plant_id: 1,
    plant_name: 'Varen',
    species_common_name_nl: null,
    species_common_name_en: null,
    plant_icon_variant: null,
    schedule_id: 1,
    map_id: 2,
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

describe('MobileAgendaList care controls', () => {
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

  it('shows grouped care context, one aligned action, and group undo', () => {
    const groupedEvent = event({
      id: 'garden-group:2:water:2026-07-12',
      plant_id: null,
      schedule_id: null,
      grouped: true,
      group_count: 3,
      group_member_schedule_ids: [11, 12, 13],
    })
    const onDone = vi.fn()
    const onSkip = vi.fn()
    const onGardenUndo = vi.fn()

    act(() => root.render(createElement(MobileAgendaList, {
      events: [groupedEvent],
      todayIso: TODAY,
      saving: null,
      onDone,
      onSkip,
      undoMsg: null,
      onGardenUndo,
      actionError: null,
    })))

    expect(container.textContent).toContain('Water')
    expect(container.textContent).toContain('Achtertuin')
    expect(container.textContent).toContain('3 planten')

    const completeButton = container.querySelector('button')
    expect(completeButton?.textContent).toBe('Voltooi & aligneer')
    expect(container.textContent).not.toContain('Sla over')

    act(() => completeButton?.click())
    expect(onDone).toHaveBeenCalledWith(groupedEvent)
    expect(onSkip).not.toHaveBeenCalled()

    act(() => root.render(createElement(MobileAgendaList, {
      events: [],
      todayIso: TODAY,
      saving: null,
      onDone,
      onSkip,
      undoMsg: 'Tuin klaar',
      onGardenUndo,
      actionError: null,
    })))

    expect(container.querySelector('[role="status"]')?.textContent).toContain('Tuin klaar')
    const undoButton = container.querySelector('button')
    expect(undoButton?.textContent).toBe('Zet groep terug')
    act(() => undoButton?.click())
    expect(onGardenUndo).toHaveBeenCalledOnce()
  })

  it('keeps individual Done and Skip controls unchanged', () => {
    const individualEvent = event()
    const onDone = vi.fn()
    const onSkip = vi.fn()

    act(() => root.render(createElement(MobileAgendaList, {
      events: [individualEvent],
      todayIso: TODAY,
      saving: null,
      onDone,
      onSkip,
      undoMsg: null,
      onGardenUndo: vi.fn(),
      actionError: null,
    })))

    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.map(button => button.textContent)).toEqual(['Gedaan', 'Sla over'])
    expect(container.textContent).not.toContain('Voltooi & aligneer')

    act(() => buttons[0].click())
    act(() => buttons[1].click())
    expect(onDone).toHaveBeenCalledWith(individualEvent)
    expect(onSkip).toHaveBeenCalledWith(individualEvent)
  })

  it('announces grouped busy and error states', () => {
    const groupedEvent = event({
      id: 'garden-group:2:water:2026-07-12',
      plant_id: null,
      schedule_id: null,
      grouped: true,
      group_count: 2,
      group_member_schedule_ids: [11, 12],
    })

    act(() => root.render(createElement(MobileAgendaList, {
      events: [groupedEvent],
      todayIso: TODAY,
      saving: groupedEvent.id,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      actionError: 'Actie mislukt',
    })))

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Actie mislukt')
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    const button = container.querySelector('button')
    expect(button?.disabled).toBe(true)
    expect(button?.textContent).toBe('Laden…')
  })

  it('renders localized weather guidance without completion controls', () => {
    const weatherEvent = event({
      id: 'schedule:9:heat_protect',
      type: 'heat_protect',
      weather_triggered: true,
      reason_nl: 'Maximum 31°C verwacht vandaag (grens 25°C).',
      reason_en: 'Maximum 31°C expected today (threshold 25°C).',
      action_nl: 'Zet potten in de schaduw.',
      action_en: 'Move pots to shade.',
    })

    act(() => root.render(createElement(MobileAgendaList, {
      events: [weatherEvent],
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      actionError: null,
    })))

    expect(container.textContent).toContain('Maximum 31°C verwacht vandaag')
    expect(container.textContent).toContain('Zet potten in de schaduw.')
    expect(container.textContent).not.toContain('Maximum 31°C expected today')
    expect(container.querySelector('button')).toBeNull()
  })
})
