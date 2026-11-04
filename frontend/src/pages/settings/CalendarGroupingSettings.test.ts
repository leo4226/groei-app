// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { household, type CalendarGroupingPreferences } from '../../api/client'
import CalendarGroupingSettings from './CalendarGroupingSettings'

vi.mock('../../api/client', () => ({
  household: {
    calendarGrouping: vi.fn(),
    updateCalendarGrouping: vi.fn(),
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const preferences: CalendarGroupingPreferences = {
  rules: [
    { map_id: 1, care_types: ['water'] },
    { map_id: 2, care_types: ['rotate'] },
    { map_id: 3, care_types: ['prune'] },
  ],
  maps: [
    {
      id: 1,
      name: 'Back garden',
      map_type: 'outdoor',
      recurring_care_types: ['water', 'fertilize'],
      recommended_care_types: ['water', 'fertilize', 'prune'],
    },
    {
      id: 2,
      name: 'Living room',
      map_type: 'indoor',
      recurring_care_types: ['water', 'rotate', 'dust'],
      recommended_care_types: ['water', 'fertilize', 'rotate', 'pest_check', 'dust'],
    },
    {
      id: 3,
      name: 'Front garden',
      map_type: 'outdoor',
      recurring_care_types: ['water', 'prune'],
      recommended_care_types: ['water', 'fertilize', 'prune'],
    },
  ],
  care_types: [],
  map_ids: [],
  outdoor_maps: [
    { id: 1, name: 'Back garden' },
    { id: 3, name: 'Front garden' },
  ],
}

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

async function flush() {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

describe('CalendarGroupingSettings', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(household.calendarGrouping).mockResolvedValue(structuredClone(preferences))
    vi.mocked(household.updateCalendarGrouping).mockImplementation(async ({ rules }) => ({
      ...structuredClone(preferences),
      rules: structuredClone(rules),
    }))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  async function renderSettings() {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(CalendarGroupingSettings)))
      await flush()
    })
  }

  async function expandAll() {
    await act(async () => {
      for (const edit of Array.from(container.querySelectorAll('button'))
        .filter((candidate) => candidate.textContent?.trim() === 'Edit')) {
        edit.click()
      }
      await flush()
    })
  }

  it('starts with one summary row per space and opens a space on Edit', async () => {
    await renderSettings()

    const backGarden = container.querySelector('[data-calendar-grouping-map="1"]') as HTMLElement
    expect(backGarden.querySelector('[data-calendar-grouping-summary]')?.textContent).toBe('Grouped: Water')
    expect(container.querySelector('[data-calendar-quick-setup]')).toBeNull()
    expect(Array.from(backGarden.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Edit'])

    await act(async () => {
      buttonWithText(backGarden, 'Edit').click()
      await flush()
    })

    expect(backGarden.querySelector('[data-calendar-quick-setup]')).not.toBeNull()
    expect(buttonWithText(backGarden, 'Done').getAttribute('aria-expanded')).toBe('true')
    // The other spaces stay closed.
    expect(container.querySelectorAll('[data-calendar-quick-setup]')).toHaveLength(1)
  })

  it('shows every space with its identity and independent selected care types', async () => {
    await renderSettings()
    await expandAll()

    expect(container.textContent).toContain('Care planning')
    expect(container.textContent).toContain('Shared with your household')
    expect(container.querySelectorAll('[data-calendar-grouping-map]')).toHaveLength(3)
    expect(container.textContent).toContain('Back garden')
    expect(container.textContent).toContain('Living room')
    expect(container.textContent).toContain('Outdoor')
    expect(container.textContent).toContain('Indoor')
    expect(container.textContent).not.toContain('Frost protect')

    const backGarden = container.querySelector('[data-calendar-grouping-map="1"]') as HTMLElement
    const livingRoom = container.querySelector('[data-calendar-grouping-map="2"]') as HTMLElement
    expect(buttonWithText(backGarden, 'Water').getAttribute('aria-pressed')).toBe('true')
    expect(buttonWithText(backGarden, 'Rotate').getAttribute('aria-pressed')).toBe('false')
    expect(buttonWithText(livingRoom, 'Rotate').getAttribute('aria-pressed')).toBe('true')
    expect(buttonWithText(livingRoom, 'Water').getAttribute('aria-pressed')).toBe('false')
  })

  it('uses semantic card headings and quiet sentence-case metadata', async () => {
    await renderSettings()
    await expandAll()

    const title = container.querySelector('[data-calendar-grouping-title]')
    const sharingStatus = container.querySelector('[data-calendar-sharing-status]')
    const quickSetup = container.querySelector('[data-calendar-quick-setup]')
    const mapTypes = Array.from(container.querySelectorAll('[data-calendar-map-type]'))

    expect(title?.tagName).toBe('H3')
    expect(title?.className).toContain('font-heading')
    expect(sharingStatus?.className).not.toContain('font-mono')
    expect(sharingStatus?.className).not.toContain('uppercase')
    expect(quickSetup?.className).not.toContain('font-mono')
    expect(quickSetup?.className).not.toContain('uppercase')
    expect(mapTypes).toHaveLength(3)
    expect(mapTypes.every((badge) => !badge.className.includes('font-mono'))).toBe(true)
    expect(mapTypes.every((badge) => !badge.className.includes('uppercase'))).toBe(true)
  })

  it('applies recommended, recurring, and clear presets to only one map', async () => {
    await renderSettings()
    await expandAll()
    const livingRoom = container.querySelector('[data-calendar-grouping-map="2"]') as HTMLElement

    await act(async () => {
      buttonWithText(livingRoom, 'Recommended').click()
      await flush()
    })
    expect(household.updateCalendarGrouping).toHaveBeenLastCalledWith({ rules: [
      { map_id: 1, care_types: ['water'] },
      { map_id: 2, care_types: ['water', 'fertilize', 'rotate', 'pest_check', 'dust'] },
      { map_id: 3, care_types: ['prune'] },
    ] })

    await act(async () => {
      buttonWithText(livingRoom, 'All recurring care').click()
      await flush()
    })
    expect(household.updateCalendarGrouping).toHaveBeenLastCalledWith({ rules: [
      { map_id: 1, care_types: ['water'] },
      { map_id: 2, care_types: ['water', 'rotate', 'dust'] },
      { map_id: 3, care_types: ['prune'] },
    ] })

    await act(async () => {
      buttonWithText(livingRoom, 'Clear').click()
      await flush()
    })
    expect(household.updateCalendarGrouping).toHaveBeenLastCalledWith({ rules: [
      { map_id: 1, care_types: ['water'] },
      { map_id: 2, care_types: [] },
      { map_id: 3, care_types: ['prune'] },
    ] })
  })

  it('copies one map rule only to maps with the same indoor/outdoor identity', async () => {
    await renderSettings()
    await expandAll()
    const backGarden = container.querySelector('[data-calendar-grouping-map="1"]') as HTMLElement

    await act(async () => {
      buttonWithText(backGarden, 'Copy this setup to outdoor spaces').click()
      await flush()
    })

    expect(household.updateCalendarGrouping).toHaveBeenCalledWith({ rules: [
      { map_id: 1, care_types: ['water'] },
      { map_id: 2, care_types: ['rotate'] },
      { map_id: 3, care_types: ['water'] },
    ] })
  })

  it('restores the previous selection and shows a localized error when saving fails', async () => {
    vi.mocked(household.updateCalendarGrouping).mockRejectedValueOnce(new Error('offline'))
    await renderSettings()
    await expandAll()
    const backGarden = container.querySelector('[data-calendar-grouping-map="1"]') as HTMLElement

    await act(async () => {
      buttonWithText(backGarden, 'Fertilize').click()
      await flush()
    })

    expect(container.textContent).toContain('Could not save Calendar settings.')
    expect(buttonWithText(backGarden, 'Water').getAttribute('aria-pressed')).toBe('true')
    expect(buttonWithText(backGarden, 'Fertilize').getAttribute('aria-pressed')).toBe('false')
  })
})
