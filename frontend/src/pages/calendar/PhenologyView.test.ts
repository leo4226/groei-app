// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../context/LanguageContext'
import type { Phenology } from '../../types'
import PhenologyView from './PhenologyView'

const storeState: {
  plants: Array<{ id: number; name: string; map_id: number | null; phenology: Phenology }>
  maps: Array<{ id: number; map_type: 'outdoor' | 'indoor' }>
  users: never[]
  activeUserId: null
} = {
  plants: [],
  maps: [],
  users: [],
  activeUserId: null,
}

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}))

vi.mock('../../api/client', () => ({
  alerts: { summary: vi.fn().mockResolvedValue({ plant_ids_with_alerts: [] }) },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PhenologyView editorial shell', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    storeState.plants = []
    storeState.maps = []
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

  it('renders no view-local cover (the shared page masthead owns the title) and an accessible 12-month selector', async () => {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(PhenologyView)))
      await Promise.resolve()
    })

    const view = container.querySelector('[data-calendar-view="year"]')
    const selector = view?.querySelector('[data-garden-year-months]')
    const monthButtons = Array.from(selector?.querySelectorAll('button') ?? [])

    expect(view).not.toBeNull()
    // One cover, three spreads: the page-level CalendarPageMasthead renders the
    // single "Calendar." title; the view must not add its own h1.
    expect(view?.querySelector('h1')).toBeNull()
    expect(selector?.getAttribute('aria-label')).toMatch(/garden year/i)
    expect(monthButtons).toHaveLength(12)
    expect(monthButtons.every((button) => button.className.includes('min-h-11'))).toBe(true)
    expect(monthButtons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('keeps the shared environment filter and limits plants to the selected map type', async () => {
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      phase: 'growing',
      phase_label_nl: 'Groei',
      phase_label_en: 'Growing',
      sun_hours_needed: 4,
      description_nl: 'Groeit',
      description_en: 'Growing',
      actions_nl: [],
      actions_en: [],
    }))
    const phenology: Phenology = {
      months,
      sow_window: [],
      transplant_window: [],
      harvest_window: [],
      frost_sensitive: false,
      min_temp_c: null,
      max_height_cm: null,
      max_spread_cm: null,
      interesting_facts_nl: '',
      interesting_facts_en: '',
      climate_zone: '8a',
    }
    storeState.maps = [
      { id: 10, map_type: 'outdoor' },
      { id: 20, map_type: 'indoor' },
    ]
    storeState.plants = [
      { id: 1, name: 'Lavender', map_id: 10, phenology },
      { id: 2, name: 'Fern', map_id: 20, phenology },
    ]

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(
            LanguageProvider,
            null,
            createElement(PhenologyView, {
              env: 'tuin',
              environmentFilter: createElement('div', { 'data-environment-filter': true }),
            }),
          ),
        ),
      )
      await Promise.resolve()
    })

    expect(container.querySelector('[data-environment-filter]')).not.toBeNull()
    expect(container.textContent).toContain('Lavender')
    expect(container.textContent).not.toContain('Fern')
  })
})
