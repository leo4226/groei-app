// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { Phenology } from '../../types'
import MonthSeasonalPanel, { type SeasonalPanelPlant } from './MonthSeasonalPanel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function phenology(overrides: Partial<Phenology> = {}): Phenology {
  return {
    months: [{
      month: 7,
      phase: 'flowering',
      phase_label_nl: 'Bloei',
      phase_label_en: 'Flowering',
      sun_hours_needed: 6,
      description_nl: 'In bloei',
      description_en: 'In bloom',
      actions_nl: [],
      actions_en: [],
    }],
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
    ...overrides,
  }
}

function plant(id: number, name: string, data: Phenology | null): SeasonalPanelPlant {
  return {
    id,
    name,
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    phenology: data,
  }
}

describe('MonthSeasonalPanel', () => {
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

  it('renders only real seasonal groups, Passport links, and honest missing-data context', () => {
    const plants = [
      plant(1, 'Rose', phenology()),
      plant(2, 'Basil', phenology({ sow_window: [7], months: [{ ...phenology().months[0], phase: 'dormant' }] })),
      plant(3, 'Unknown plant', null),
    ]

    const onOpenGardenYear = vi.fn()
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(MemoryRouter, null,
          createElement(MonthSeasonalPanel, { month1: 7, plants, onOpenGardenYear }),
        ),
      ),
    ))

    expect(container.textContent).toContain('Seasonal this month')
    expect(container.textContent).toContain('Bloom')
    expect(container.textContent).toContain('Sow')
    expect(container.textContent).not.toContain('Harvest')
    expect(container.textContent).toContain('1 plant has no seasonal data for this month')
    expect(Array.from(container.querySelectorAll('a.seasonal-plant-link')).map(link => link.getAttribute('href')))
      .toEqual(['/plants/1', '/plants/2'])

    act(() => container.querySelector('button.seasonal-year-link')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onOpenGardenYear).toHaveBeenCalledOnce()
  })

  it('limits long seasonal groups and reports the remaining plant count', () => {
    const plants = Array.from({ length: 5 }, (_, index) =>
      plant(index + 1, `Blooming plant ${index + 1}`, phenology()),
    )

    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(MemoryRouter, null,
          createElement(MonthSeasonalPanel, { month1: 7, plants }),
        ),
      ),
    ))

    const bloomGroup = Array.from(container.querySelectorAll('.seasonal-group'))
      .find(group => group.querySelector('h3')?.textContent === 'Bloom')

    expect(bloomGroup?.querySelectorAll('a.seasonal-plant-link')).toHaveLength(3)
    expect(bloomGroup?.textContent).toContain('+2 more')
    expect(bloomGroup?.textContent).not.toContain('Blooming plant 4')
    expect(bloomGroup?.querySelector('.seasonal-more')?.getAttribute('aria-label'))
      .toBe('Bloom +2 more')
  })
})
