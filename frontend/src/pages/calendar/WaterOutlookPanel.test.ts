// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { calendar } from '../../api/client'
import WaterOutlookPanel from './WaterOutlookPanel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../api/client', () => ({
  calendar: { waterOutlook: vi.fn() },
}))

const mockedOutlook = vi.mocked(calendar.waterOutlook)

const OUTLOOK = {
  generated_at: '2026-07-16',
  maps: [
    {
      map_id: 1,
      map_name: 'Garden',
      map_type: 'outdoor' as const,
      level: 'high' as const,
      weather_status: 'fresh' as const,
      temperature_source: 'own_map' as const,
      source_timestamp: '2026-07-16T09:00:00Z',
      high_count: 1,
      elevated_count: 1,
      plants: [
        {
          plant_id: 1,
          plant_name: 'Tomato',
          schedule_id: 10,
          environment: 'outdoor_container' as const,
          next_due: '2026-07-20',
          recommended_check_date: '2026-07-16',
          level: 'high' as const,
          score: 1.4,
          reason_nl: 'Warm en droog weer laat deze buitenpot sneller uitdrogen.',
          reason_en: 'Warm, dry weather is making this outdoor container dry out faster.',
          factors: {},
        },
        {
          plant_id: 3,
          plant_name: 'Rosemary',
          schedule_id: 12,
          environment: 'outdoor_container' as const,
          next_due: '2026-07-21',
          recommended_check_date: '2026-07-18',
          level: 'elevated' as const,
          score: 0.8,
          reason_nl: 'De potgrond kan iets sneller uitdrogen dan normaal.',
          reason_en: 'The potting soil may dry out a little faster than normal.',
          factors: {},
        },
      ],
    },
    {
      map_id: 2,
      map_name: 'Living room',
      map_type: 'indoor' as const,
      level: 'normal' as const,
      weather_status: 'fresh' as const,
      temperature_source: 'outdoor_proxy' as const,
      source_timestamp: '2026-07-16T09:00:00Z',
      high_count: 0,
      elevated_count: 0,
      plants: [{
        plant_id: 2,
        plant_name: 'Fern',
        schedule_id: 11,
        environment: 'indoor' as const,
        next_due: '2026-07-22',
        recommended_check_date: '2026-07-22',
        level: 'normal' as const,
        score: 0.1,
        reason_nl: 'Buitentemperatuur wordt gebruikt als voorzichtige proxy.',
        reason_en: 'Outdoor temperature is used as a conservative proxy.',
        factors: {},
      }],
    },
  ],
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

describe('WaterOutlookPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockedOutlook.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows map pressure, bounded check date and explanation without task controls', async () => {
    mockedOutlook.mockResolvedValue(OUTLOOK)

    act(() => root.render(createElement(LanguageProvider, null,
      createElement(WaterOutlookPanel, { env: 'all' }),
    )))
    await flush()

    expect(container.textContent).toContain('Water outlook')
    expect(container.textContent).toContain('Weather may suggest an earlier soil check, never a later Water deadline.')
    expect(container.textContent).toContain('Warm and dry. Check exposed outdoor soil earlier.')
    expect(container.textContent).toContain('Check by 16 Jul')
    expect(container.textContent).toContain('Water deadlines stay unchanged.')
    expect(container.textContent).not.toContain('Garden')
    expect(container.textContent).not.toContain('Tomato')
    expect(container.textContent).not.toContain('Rosemary')
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('respects the Calendar environment filter and labels the indoor proxy', async () => {
    mockedOutlook.mockResolvedValue(OUTLOOK)

    act(() => root.render(createElement(LanguageProvider, null,
      createElement(WaterOutlookPanel, { env: 'huis' }),
    )))
    await flush()

    expect(container.textContent).toContain('Available weather data does not suggest an earlier soil check.')
    expect(container.textContent).toContain('Water deadlines stay unchanged.')
    expect(container.textContent).not.toContain('Living room')
    expect(container.textContent).not.toContain('Fern')
    expect(container.textContent).not.toContain('Garden')
  })

  it('renders the outlook in Dutch', async () => {
    localStorage.setItem('floreren_lang', 'nl')
    mockedOutlook.mockResolvedValue(OUTLOOK)

    act(() => root.render(createElement(LanguageProvider, null,
      createElement(WaterOutlookPanel, { env: 'all' }),
    )))
    await flush()

    expect(container.textContent).toContain('Waterverwachting')
    expect(container.textContent).toContain('Warm en droog. Controleer blootgestelde buitengrond eerder.')
    expect(container.textContent).toContain('Controleer uiterlijk 16 jul')
    expect(container.textContent).toContain('Waterdeadlines blijven ongewijzigd.')
    expect(container.textContent).not.toContain('Tomato')
  })

  it('labels an already-due canonical schedule instead of suggesting weather escalation', async () => {
    mockedOutlook.mockResolvedValue({
      ...OUTLOOK,
      maps: [{
        ...OUTLOOK.maps[0],
        level: 'normal',
        high_count: 0,
        plants: [{
          ...OUTLOOK.maps[0].plants[0],
          level: 'normal',
          score: 0,
          next_due: '2026-07-14',
          recommended_check_date: '2026-07-14',
          reason_en: 'The personalized Water schedule is already due.',
        }],
      }],
    })

    act(() => root.render(createElement(LanguageProvider, null,
      createElement(WaterOutlookPanel, { env: 'all' }),
    )))
    await flush()

    expect(container.textContent).toContain('Available weather data does not suggest an earlier soil check.')
    expect(container.textContent).not.toContain('Check by')
  })

  it('shows a localized failure and retries', async () => {
    mockedOutlook
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(OUTLOOK)

    act(() => root.render(createElement(LanguageProvider, null,
      createElement(WaterOutlookPanel, { env: 'all' }),
    )))
    await flush()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Water outlook could not be loaded.')
    const retry = container.querySelector('button')
    expect(retry?.textContent).toBe('Try again')

    act(() => retry?.click())
    await flush()
    expect(mockedOutlook).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Water outlook')
    expect(container.textContent).not.toContain('Garden')
  })
})
