// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import MapActionCluster, { formatWaterRecency } from './MapActionCluster'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const callbacks = {
  onWater: vi.fn(),
  onFertilize: vi.fn(),
  onToggleSun: vi.fn(),
  onToggleInspector: vi.fn(),
  onToggleMoveMode: vi.fn(),
  onAddPlant: vi.fn(),
}

describe('MapActionCluster watering recency', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T12:00:00Z'))
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function render(lastWateredAt: string | null) {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MapActionCluster, {
          isOutdoor: true,
          waterStatus: 'hydrated',
          lastWateredAt,
          sunActive: false,
          sunAvailable: true,
          inspectorMode: false,
          moveModeActive: false,
          ...callbacks,
        }),
      ))
    })
  }

  it('shows a quiet elapsed-day badge and full accessible history title', () => {
    expect(formatWaterRecency(null)).toBe('—')
    expect(formatWaterRecency('2026-07-23')).toBe('0d')
    expect(formatWaterRecency('2026-07-15')).toBe('8d')

    render(null)
    const badge = container.querySelector('[data-water-recency]') as HTMLElement
    const waterButton = badge.closest('button') as HTMLButtonElement
    expect(badge.textContent).toBe('—')
    expect(waterButton.title).toContain('No watering history')

    render('2026-07-15')
    expect(badge.textContent).toBe('8d')
    expect(waterButton.title).toContain('15-07-2026')
  })

  it('calculates recency from the browser-local calendar date', () => {
    const localNow = new Date(2026, 6, 23, 0, 30)
    vi.spyOn(localNow, 'getUTCFullYear').mockReturnValue(2026)
    vi.spyOn(localNow, 'getUTCMonth').mockReturnValue(6)
    vi.spyOn(localNow, 'getUTCDate').mockReturnValue(22)

    expect(formatWaterRecency('2026-07-22', localNow)).toBe('1d')
  })
})

describe('MapActionCluster capability gating', () => {
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

  function render(canEdit: boolean) {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MapActionCluster, {
          isOutdoor: true,
          waterStatus: 'hydrated',
          lastWateredAt: null,
          sunActive: false,
          sunAvailable: true,
          inspectorMode: false,
          moveModeActive: false,
          canEdit,
          onNewGame: vi.fn(),
          ...callbacks,
        }),
      ))
    })
  }

  function buttons() {
    return Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
  }

  it('enables every write control for an editor', () => {
    render(true)
    const disabled = buttons().filter((b) => b.disabled)
    expect(disabled).toEqual([])
  })

  it('disables water/fertilize/move/add/game but keeps sun and inspect for a viewer', () => {
    render(false)
    const byTitle: Record<string, HTMLButtonElement> = {}
    for (const b of buttons()) byTitle[b.title] = b

    // Sun + inspect stay usable
    expect(byTitle['Sun']).toBeDefined()
    expect(byTitle['Sun'].disabled).toBe(false)
    expect(byTitle['Inspect']).toBeDefined()
    expect(byTitle['Inspect'].disabled).toBe(false)

    // Write controls disabled with the read-only explanation
    expect(byTitle['Only editors can change this.']).toBeDefined()
    for (const b of buttons()) {
      if (b.title === 'Only editors can change this.') expect(b.disabled).toBe(true)
    }
    // The five write controls must all be disabled
    const water = buttons().find((b) => b.querySelector('[data-water-recency]'))
    expect(water?.disabled).toBe(true)
  })
})
