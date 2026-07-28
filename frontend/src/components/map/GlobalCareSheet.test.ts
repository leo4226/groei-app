// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import type { WeatherWarningGroupOut, WarningSummaryOut } from '../../types'
import GlobalCareSheet from './GlobalCareSheet'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const warning: WeatherWarningGroupOut = {
  warning_id: 'weather:heat:2026-07-29:urgent',
  care_type: 'heat_protect',
  severity: 'urgent',
  trigger: 'weather_event',
  days_overdue: null,
  message_nl: 'Morgen hitte op komst — max 36°C',
  message_en: 'Heat building tomorrow — max 36°C',
  reason_nl: 'Maximum 36°C verwacht morgen.',
  reason_en: 'Maximum 36°C expected tomorrow.',
  action_nl: 'Zet potten in de schaduw.',
  action_en: 'Move pots into shade.',
  icon: '🔥',
  color: '#e08049',
  forecast_date: '2026-07-29',
  weather_metric: 'max_temp_c',
  weather_value_c: 36,
  acknowledged_at: null,
  affected_plant_ids: [1, 2, 3],
  map_names: ['Back Garden', 'Roof Terrace'],
}

function summary(weatherWarnings: WeatherWarningGroupOut[]): WarningSummaryOut {
  return {
    total_plants: 3,
    on_schedule: 3,
    kpis: [],
    buckets: { nu: [], vandaag: [], komende_week: [] },
    weather_warnings: weatherWarnings,
  }
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')]
    .find((item) => item.textContent?.includes(label))
  if (!match) throw new Error(`Missing button: ${label}`)
  return match
}

describe('GlobalCareSheet weather acknowledgment', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useFloreren.setState({
      users: [],
      activeUserId: null,
      warningSummary: summary([warning]),
      acknowledgeWeatherWarning: async (active) => {
        useFloreren.setState({
          warningSummary: summary([{ ...active, acknowledged_at: '2026-07-28T10:00:00' }]),
        })
      },
      restoreWeatherWarning: async (warningId) => {
        const current = useFloreren.getState().warningSummary!
        useFloreren.setState({
          warningSummary: summary(current.weather_warnings.map((item) =>
            item.warning_id === warningId ? { ...item, acknowledged_at: null } : item
          )),
        })
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('moves an active warning into collapsed Seen and restores it', async () => {
    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(GlobalCareSheet),
        ),
      )
    })

    expect(container.textContent).toContain('Heat building tomorrow — max 36°C')
    expect(button(container, 'Got it')).toBeTruthy()

    await act(async () => button(container, 'Got it').click())

    expect(container.textContent).not.toContain('Heat building tomorrow — max 36°C')
    expect(button(container, 'Seen weather guidance · 1').getAttribute('aria-expanded')).toBe('false')

    await act(async () => button(container, 'Seen weather guidance · 1').click())

    expect(container.textContent).toContain('Heat building tomorrow — max 36°C')
    expect(button(container, 'Restore')).toBeTruthy()

    await act(async () => button(container, 'Restore').click())

    expect(button(container, 'Got it')).toBeTruthy()
    expect(container.textContent).not.toContain('Seen weather guidance')
  })
})
