// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { CalendarEvent } from './calendarTypes'
import CalendarWeatherContext from './CalendarWeatherContext'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function weatherEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'schedule:9:heat_protect',
    date: '2026-07-13',
    type: 'heat_protect',
    plant_id: 1,
    plant_name: 'Lemon',
    plant_icon_variant: null,
    schedule_id: 9,
    map_id: 2,
    map_name: 'Garden',
    overdue: false,
    severity: 'warning',
    color: '#e08049',
    icon: '🔥',
    grouped: false,
    group_count: null,
    group_member_schedule_ids: null,
    weather_triggered: true,
    reason_nl: 'Maximum 31°C verwacht vandaag (grens 25°C).',
    reason_en: 'Maximum 31°C expected today (threshold 25°C).',
    action_nl: 'Zet potten in de schaduw.',
    action_en: 'Move pots to shade.',
    weather_metric: 'max_temp_c',
    weather_value_c: 31,
    forecast_day_label_nl: 'vandaag',
    forecast_day_label_en: 'today',
    ...overrides,
  }
}

describe('CalendarWeatherContext', () => {
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
  })

  function render(event: CalendarEvent) {
    act(() => root.render(
      createElement(LanguageProvider, null, createElement(CalendarWeatherContext, { event })),
    ))
  }

  it('renders the active-language reason and recommended action', () => {
    render(weatherEvent())

    expect(container.textContent).toContain('Maximum 31°C expected today (threshold 25°C).')
    expect(container.textContent).toContain('Move pots to shade.')
    expect(container.textContent).not.toContain('Zet potten')
  })

  it('shows explicit unavailable copy instead of cross-filling Dutch', () => {
    render(weatherEvent({ reason_en: null, action_en: null }))

    expect(container.textContent).toContain('Weather explanation unavailable')
    expect(container.textContent).not.toContain('Maximum 31°C verwacht')
    expect(container.textContent).not.toContain('Zet potten')
  })
})
