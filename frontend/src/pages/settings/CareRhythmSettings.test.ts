// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { careRhythm, type CareRhythmPreview } from '../../api/client'
import CareRhythmSettings from './CareRhythmSettings'

vi.mock('../../api/client', () => ({
  careRhythm: {
    settings: vi.fn(),
    preview: vi.fn(),
    apply: vi.fn(),
    undo: vi.fn(),
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const settings = {
  saved: false,
  config: {
    indoor_weekdays: [4],
    outdoor_weekdays: [1],
    map_overrides: [],
  },
  maps: [
    { id: 1, name: 'Back garden', map_type: 'outdoor' as const },
    { id: 2, name: 'Living room', map_type: 'indoor' as const },
  ],
}

function makePreview(hash: string): CareRhythmPreview {
  return {
    config: structuredClone(settings.config),
    preview_hash: hash,
    items: [
      {
        schedule_id: 10,
        plant_id: 1,
        plant_name: 'Rose',
        species_common_name_nl: null,
        species_common_name_en: null,
        plant_icon_variant: null,
        map_id: 1,
        map_name: 'Back garden',
        map_type: 'outdoor' as const,
        old_date: '2026-07-21',
        new_date: '2026-07-20',
        movement_days: -1,
        status: 'moved' as const,
        reason: 'moved_earlier',
      },
      {
        schedule_id: 11,
        plant_id: 2,
        plant_name: 'Fern',
        species_common_name_nl: null,
        species_common_name_en: null,
        plant_icon_variant: null,
        map_id: 1,
        map_name: 'Back garden',
        map_type: 'outdoor' as const,
        old_date: '2026-07-22',
        new_date: '2026-07-22',
        movement_days: 0,
        status: 'exception' as const,
        reason: 'outside_window',
      },
    ],
    groups: [
      { date: '2026-07-20', map_id: 1, map_name: 'Back garden', count: 1, schedule_ids: [10] },
    ],
    summary: { total: 2, moved: 1, unchanged: 0, exceptions: 1, group_count: 1 },
  }
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

async function waitForPreviewCalls(count: number) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (vi.mocked(careRhythm.preview).mock.calls.length >= count) return
    await flush()
  }
}

describe('CareRhythmSettings', () => {
  let container: HTMLDivElement
  let root: Root
  let rhythmChanged: EventListener
  let rhythmChangedCount: number

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    rhythmChangedCount = 0
    rhythmChanged = () => { rhythmChangedCount += 1 }
    window.addEventListener('floreren-care-rhythm-changed', rhythmChanged)
    vi.mocked(careRhythm.settings).mockResolvedValue(structuredClone(settings))
    let previewNumber = 0
    vi.mocked(careRhythm.preview).mockImplementation(async (config) => ({
      ...makePreview(`hash-${++previewNumber}`),
      config: structuredClone(config),
    }))
    vi.mocked(careRhythm.apply).mockResolvedValue({
      operation_id: 9,
      affected_count: 1,
      preview_hash: 'hash-3',
      summary: { total: 2, moved: 1, unchanged: 0, exceptions: 1, group_count: 1 },
    })
    vi.mocked(careRhythm.undo).mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    window.removeEventListener('floreren-care-rhythm-changed', rhythmChanged)
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  async function renderSettings() {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(CareRhythmSettings)))
      await flush()
    })
  }

  it('previews day and map-override edits before explicit Apply, then offers Undo', async () => {
    await renderSettings()

    expect(container.textContent).toContain('Water care rhythm')
    expect(container.textContent).toContain('Proposed')
    expect(careRhythm.preview).not.toHaveBeenCalled()

    await act(async () => {
      buttonWithText(container, 'Organize watering').click()
      await flush()
    })
    expect(careRhythm.preview).toHaveBeenCalledWith(settings.config)
    expect(container.textContent).toContain('1 moved')
    expect(container.textContent).toContain('1 exception')
    expect(container.textContent).toContain('Rose')

    const outdoor = container.querySelector('[data-care-rhythm-environment="outdoor"]') as HTMLElement
    await act(async () => {
      buttonWithText(outdoor, 'Wednesday').click()
      await flush()
    })
    expect(careRhythm.preview).toHaveBeenLastCalledWith({
      indoor_weekdays: [4],
      outdoor_weekdays: [1, 3],
      map_overrides: [],
    })

    const map = container.querySelector('[data-care-rhythm-map="1"]') as HTMLElement
    await act(async () => {
      buttonWithText(map, 'Override').click()
      await flush()
    })
    expect(careRhythm.preview).toHaveBeenLastCalledWith({
      indoor_weekdays: [4],
      outdoor_weekdays: [1, 3],
      map_overrides: [{ map_id: 1, weekdays: [1, 3] }],
    })

    await act(async () => {
      buttonWithText(container, 'Apply rhythm').click()
      await flush()
    })
    expect(careRhythm.apply).toHaveBeenCalledWith(expect.objectContaining({
      config: {
        indoor_weekdays: [4],
        outdoor_weekdays: [1, 3],
        map_overrides: [{ map_id: 1, weekdays: [1, 3] }],
      },
    }))
    expect(container.textContent).toContain('Rhythm applied to 1 schedule')
    expect(rhythmChangedCount).toBe(1)

    await act(async () => {
      buttonWithText(container, 'Undo').click()
      await flush()
    })
    expect(careRhythm.undo).toHaveBeenCalledWith(9)
    expect(rhythmChangedCount).toBe(2)
  })

  it('refreshes a stale preview instead of applying unseen dates', async () => {
    vi.mocked(careRhythm.apply).mockRejectedValueOnce(
      Object.assign(new Error('stale'), { status: 409 }),
    )
    await renderSettings()
    await act(async () => {
      buttonWithText(container, 'Organize watering').click()
      await flush()
    })
    await act(async () => {
      buttonWithText(container, 'Apply rhythm').click()
      await flush()
    })
    await act(async () => {
      await waitForPreviewCalls(2)
    })

    expect(careRhythm.preview).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('The schedules changed. Review the refreshed preview.')
  })

  it('explains an empty routine and disables map overrides until a day is selected', async () => {
    vi.mocked(careRhythm.settings).mockResolvedValueOnce({
      ...structuredClone(settings),
      config: {
        indoor_weekdays: [],
        outdoor_weekdays: [],
        map_overrides: [],
      },
    })

    await renderSettings()
    await act(async () => {
      buttonWithText(container, 'Organize watering').click()
      await flush()
    })

    expect(container.textContent).toContain('No preferred days selected')
    const maps = Array.from(container.querySelectorAll('[data-care-rhythm-map]'))
    expect(maps).toHaveLength(2)
    for (const map of maps) {
      expect(buttonWithText(map as HTMLElement, 'Override').disabled).toBe(true)
    }
  })

  it('distinguishes schedules already aligned with a preferred day from schedules without a routine', async () => {
    const preview = makePreview('hash-labels')
    preview.items = [
      {
        ...preview.items[0],
        schedule_id: 12,
        plant_name: 'Aligned rose',
        old_date: '2026-07-20',
        new_date: '2026-07-20',
        movement_days: 0,
        status: 'unchanged',
        reason: 'aligned',
      },
      {
        ...preview.items[1],
        schedule_id: 13,
        plant_name: 'Unscheduled fern',
        status: 'exception',
        reason: 'no_routine',
      },
    ]
    vi.mocked(careRhythm.preview).mockResolvedValue(preview)

    await renderSettings()
    await act(async () => {
      buttonWithText(container, 'Organize watering').click()
      await flush()
    })

    expect(container.textContent).toContain('Already on a preferred day')
    expect(container.textContent).toContain('No routine selected')
  })

  it('renders the aligned reason in Dutch', async () => {
    localStorage.setItem('floreren_lang', 'nl')
    const preview = makePreview('hash-aligned-nl')
    preview.items = [{
      ...preview.items[0],
      old_date: '2026-07-20',
      new_date: '2026-07-20',
      movement_days: 0,
      status: 'unchanged',
      reason: 'aligned',
    }]
    vi.mocked(careRhythm.preview).mockResolvedValue(preview)

    await renderSettings()
    await act(async () => {
      buttonWithText(container, 'Water geven organiseren').click()
      await flush()
    })

    expect(container.textContent).toContain('Valt al op een voorkeursdag')
  })
})
