// @vitest-environment jsdom
//
// Capability rendering for the calendar write surfaces (#935, surface 12):
// care completions, watering round, moisture check and weather advisories all
// render disabled for a viewer (readOnly) while staying visible.

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import CalendarAgendaCard from './CalendarAgendaCard'
import MobileAgendaList from './MobileAgendaList'
import MoistureAdvisory from './MoistureAdvisory'
import CalendarWeatherAdvisories from './CalendarWeatherAdvisories'
import type { CalendarEvent } from './calendarTypes'
import { extractMoistureAdvisories } from './moistureAdvisoryModel'
import type { CalendarWeatherAdvisory } from './calendarWeatherAdvisoryModel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TODAY = '2026-07-27'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'schedule:1:water:0',
    date: TODAY,
    type: 'water',
    plant_id: 1,
    plant_name: 'Rose',
    plant_icon_variant: null,
    schedule_id: 1,
    map_id: 10,
    map_name: 'Back garden',
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

const advisory: CalendarWeatherAdvisory = {
  key: 'heat',
  date: TODAY,
  type: 'heat_protect',
  severity: 'warning',
  warningId: 'weather:heat:2026-07-27',
  acknowledgedAt: null,
  reasonNl: '33°C morgen',
  reasonEn: '33°C tomorrow',
  actionNl: 'Geef schaduw',
  actionEn: 'Provide shade',
  color: null,
  icon: null,
  affectedPlantCount: 1,
  locations: [{
    key: 'map:1', mapId: 1, mapName: 'Garden', affectedPlantCount: 1,
    plants: [{ id: 7, name: 'Rose' }],
  }],
  sourceEvents: [],
}

describe('Calendar read-only capability gating', () => {
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
    vi.clearAllMocks()
  })

  function render(element: Parameters<typeof root.render>[0]) {
    act(() => root.render(createElement(MemoryRouter, null,
      createElement(LanguageProvider, null, element),
    )))
  }

  it('keeps agenda Done/Skip enabled for an editor and disabled for a viewer', () => {
    const props = {
      selectedIso: TODAY,
      events: [event()],
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      mapSlugs: new Map<number, string>(),
    }
    render(createElement(CalendarAgendaCard, { ...props, readOnly: false }))
    const editableButtons = Array.from(container.querySelectorAll('button'))
    expect(editableButtons.length).toBeGreaterThan(0)
    for (const button of editableButtons) expect((button as HTMLButtonElement).disabled).toBe(false)

    act(() => root.unmount())
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    render(createElement(CalendarAgendaCard, { ...props, readOnly: true }))
    const readOnlyButtons = Array.from(container.querySelectorAll('button'))
    expect(readOnlyButtons.length).toBeGreaterThan(0)
    for (const button of readOnlyButtons) expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(container.textContent).toContain('Done')
  })

  it('disables mobile agenda completion and skip for a viewer', () => {
    const props = {
      events: [event()],
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      actionError: null,
      mapSlugs: new Map<number, string>(),
    }
    render(createElement(MobileAgendaList, { ...props, readOnly: false }))
    const editable = Array.from(container.querySelectorAll('button'))
    for (const button of editable) expect((button as HTMLButtonElement).disabled).toBe(false)

    act(() => root.unmount())
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    render(createElement(MobileAgendaList, { ...props, readOnly: true }))
    const readOnly = Array.from(container.querySelectorAll('button'))
    expect(readOnly.length).toBeGreaterThan(0)
    for (const button of readOnly) expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(container.textContent).toContain('Done')
  })

  it('disables moisture check buttons for a viewer but keeps them for an editor', () => {
    const moistureEvents = [event({
      id: 'moisture:back',
      type: 'moisture_check',
      plant_id: null,
      plant_name: null,
      schedule_id: null,
      grouped: true,
      group_count: 2,
      group_member_schedule_ids: [10, 11],
      weather_triggered: true,
      reason_nl: 'Een uitzonderlijk warme en droge middag vergroot de verdamping.',
      reason_en: 'An exceptionally warm and dry afternoon increases evaporation.',
      action_nl: 'Voel de grond en geef alleen droge planten water.',
      action_en: 'Feel the soil and water only plants that are dry.',
    })]
    const { advisories } = extractMoistureAdvisories(moistureEvents)

    render(createElement(MoistureAdvisory, {
      advisory: advisories[0],
      todayIso: TODAY,
      saving: null,
      onCheck: vi.fn(),
      mapSlugs: new Map<number, string>(),
      readOnly: true,
    }))
    const check = container.querySelector('.calendar-moisture-check-button') as HTMLButtonElement
    expect(check).not.toBeNull()
    expect(check.disabled).toBe(true)

    act(() => root.unmount())
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    render(createElement(MoistureAdvisory, {
      advisory: advisories[0],
      todayIso: TODAY,
      saving: null,
      onCheck: vi.fn(),
      mapSlugs: new Map<number, string>(),
      readOnly: false,
    }))
    const editableCheck = container.querySelector('.calendar-moisture-check-button') as HTMLButtonElement
    expect(editableCheck.disabled).toBe(false)
  })

  it('disables weather advisory acknowledge/restore for a viewer', () => {
    render(createElement(CalendarWeatherAdvisories, {
      advisories: [advisory],
      onChanged: vi.fn(),
      readOnly: true,
    }))
    const acknowledge = container.querySelector('.calendar-weather-state-action') as HTMLButtonElement
    expect(acknowledge).not.toBeNull()
    expect(acknowledge.disabled).toBe(true)
  })
})
