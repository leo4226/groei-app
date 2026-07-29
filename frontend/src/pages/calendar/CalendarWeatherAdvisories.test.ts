// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import CalendarWeatherAdvisories from './CalendarWeatherAdvisories'
import type { CalendarWeatherAdvisory } from './calendarWeatherAdvisoryModel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const api = vi.hoisted(() => ({ acknowledge: vi.fn(), restore: vi.fn() }))
vi.mock('../../api/client', () => ({ weatherWarnings: api }))

const advisory: CalendarWeatherAdvisory = {
  key: 'heat',
  date: '2026-07-30',
  type: 'heat_protect',
  severity: 'warning',
  warningId: 'weather:heat:2026-07-30',
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

describe('CalendarWeatherAdvisories acknowledgment', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    api.acknowledge.mockReset().mockResolvedValue(undefined)
    api.restore.mockReset().mockResolvedValue(undefined)
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function render(item: CalendarWeatherAdvisory, onChanged = vi.fn()) {
    act(() => root.render(createElement(MemoryRouter, null,
      createElement(LanguageProvider, null,
        createElement(CalendarWeatherAdvisories, { advisories: [item], onChanged }),
      ),
    )))
    return onChanged
  }

  it('acknowledges active guidance with the canonical warning fields', async () => {
    const onChanged = render(advisory)

    await act(async () => {
      ;(container.querySelector('.calendar-weather-state-action') as HTMLButtonElement).click()
    })

    expect(api.acknowledge).toHaveBeenCalledWith({
      warning_id: advisory.warningId,
      care_type: 'heat_protect',
      forecast_date: '2026-07-30',
      severity: 'warning',
    })
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('keeps acknowledged guidance collapsed under Seen and restores it', async () => {
    render({ ...advisory, acknowledgedAt: '2026-07-29T08:00:00Z' })
    const details = container.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)

    details.open = true
    await act(async () => {
      ;(container.querySelector('.calendar-weather-state-action') as HTMLButtonElement).click()
    })

    expect(api.restore).toHaveBeenCalledWith(advisory.warningId)
  })
})
