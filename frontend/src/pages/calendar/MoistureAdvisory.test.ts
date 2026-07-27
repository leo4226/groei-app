// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import CalendarAgendaCard from './CalendarAgendaCard'
import MobileAgendaList from './MobileAgendaList'
import MoistureAdvisory from './MoistureAdvisory'
import type { CalendarEvent } from './calendarTypes'
import { extractMoistureAdvisories } from './moistureAdvisoryModel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TODAY = '2026-07-27'
const REASON_NL = 'Een uitzonderlijk warme en droge middag vergroot de verdamping.'
const REASON_EN = 'An exceptionally warm and dry afternoon increases evaporation.'
const ACTION_NL = 'Voel de grond en geef alleen droge planten water.'
const ACTION_EN = 'Feel the soil and water only plants that are dry.'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'schedule:1:fertilize',
    date: TODAY,
    type: 'fertilize',
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

function moistureEvent(id: string, mapId: number, mapName: string, count: number): CalendarEvent {
  const scheduleIds = Array.from({ length: count }, (_, index) => mapId * 10 + index)
  return event({
    id,
    type: 'moisture_check',
    plant_id: null,
    plant_name: null,
    schedule_id: null,
    map_id: mapId,
    map_name: mapName,
    grouped: true,
    group_count: count,
    group_member_schedule_ids: scheduleIds,
    group_members: scheduleIds.map((scheduleId, index) => ({
      schedule_id: scheduleId,
      plant_id: scheduleId,
      plant_name: `${mapName} plant ${index + 1}`,
      plant_icon_variant: null,
    })),
    weather_triggered: true,
    reason_nl: REASON_NL,
    reason_en: REASON_EN,
    action_nl: ACTION_NL,
    action_en: ACTION_EN,
  })
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe('MoistureAdvisory', () => {
  let container: HTMLDivElement
  let root: Root
  const back = moistureEvent('moisture:back', 10, 'Back garden', 2)
  const front = moistureEvent('moisture:front', 20, 'Front garden', 3)
  const maps = new Map([[10, 'back-garden'], [20, 'front-garden']])

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders shared advice once, one linked count row per map, and the correct action handoff', () => {
    const onCheck = vi.fn()
    const advisory = extractMoistureAdvisories([back, front]).advisories[0]

    act(() => root.render(createElement(MemoryRouter, null,
      createElement(MoistureAdvisory, {
        advisory,
        todayIso: TODAY,
        saving: null,
        onCheck,
        mapSlugs: maps,
      }),
    )))

    expect(occurrences(container.textContent ?? '', REASON_NL)).toBe(1)
    expect(occurrences(container.textContent ?? '', ACTION_NL)).toBe(1)
    expect(container.querySelectorAll('[data-moisture-map-row]')).toHaveLength(2)
    expect(Array.from(container.querySelectorAll('a')).map(link => link.getAttribute('href')))
      .toEqual(['/map/back-garden', '/map/front-garden'])
    expect(container.textContent).toContain('2 planten')
    expect(container.textContent).toContain('3 planten')

    const frontButton = container.querySelector<HTMLButtonElement>('[data-moisture-map-id="20"] button')
    expect(frontButton?.textContent).toBe('Controleer vocht')
    act(() => frontButton?.click())
    expect(onCheck).toHaveBeenCalledWith(front)
  })

  it('preserves long English reason and recommendation copy without Dutch fallback', () => {
    localStorage.setItem('floreren_lang', 'en')
    const advisory = extractMoistureAdvisories([back, front]).advisories[0]

    act(() => root.render(createElement(LanguageProvider, null,
      createElement(MemoryRouter, null,
        createElement(MoistureAdvisory, {
          advisory,
          todayIso: TODAY,
          saving: back.id,
          onCheck: vi.fn(),
          mapSlugs: maps,
        }),
      ),
    )))

    expect(container.textContent).toContain(REASON_EN)
    expect(container.textContent).toContain(ACTION_EN)
    expect(container.textContent).not.toContain(REASON_NL)
    expect(container.querySelector<HTMLButtonElement>('[data-moisture-map-id="10"] button')?.disabled).toBe(true)
  })

  it('keeps a future advisory informational without completion controls', () => {
    const advisory = extractMoistureAdvisories([back, front]).advisories[0]

    act(() => root.render(createElement(MemoryRouter, null,
      createElement(MoistureAdvisory, {
        advisory,
        todayIso: '2026-07-26',
        saving: null,
        onCheck: vi.fn(),
        mapSlugs: maps,
      }),
    )))

    expect(container.querySelectorAll('[data-moisture-map-row]')).toHaveLength(2)
    expect(container.querySelector('button')).toBeNull()
  })

  it('is shared by mobile and desktop agendas while ordinary care keeps its normal row', () => {
    const ordinary = event()
    const props = {
      events: [back, front, ordinary],
      todayIso: TODAY,
      saving: null,
      onDone: vi.fn(),
      onSkip: vi.fn(),
      undoMsg: null,
      onGardenUndo: vi.fn(),
      actionError: null,
      mapSlugs: maps,
    }

    act(() => root.render(createElement(MemoryRouter, null,
      createElement(MobileAgendaList, props),
    )))
    expect(container.querySelectorAll('.calendar-moisture-advisory')).toHaveLength(1)
    expect(container.querySelectorAll('[data-moisture-map-row]')).toHaveLength(2)
    expect(occurrences(container.textContent ?? '', REASON_NL)).toBe(1)
    expect(container.textContent).toContain('Rose')
    expect(container.textContent).toContain('Voeden')

    act(() => root.render(createElement(MemoryRouter, null,
      createElement(CalendarAgendaCard, {
        selectedIso: TODAY,
        events: [back, front, ordinary],
        todayIso: TODAY,
        saving: null,
        onDone: vi.fn(),
        onSkip: vi.fn(),
        undoMsg: null,
        onGardenUndo: vi.fn(),
        mapSlugs: maps,
      }),
    )))
    expect(container.querySelectorAll('.calendar-moisture-advisory')).toHaveLength(1)
    expect(container.querySelectorAll('[data-moisture-map-row]')).toHaveLength(2)
    expect(container.querySelectorAll('.agenda-group')).toHaveLength(1)
    expect(container.textContent).toContain('Rose')
  })
})
