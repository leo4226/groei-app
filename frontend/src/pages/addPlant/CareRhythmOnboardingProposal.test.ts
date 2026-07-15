// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { careRhythm } from '../../api/client'
import CareRhythmOnboardingProposal from './CareRhythmOnboardingProposal'

vi.mock('../../api/client', () => ({
  careRhythm: { onboardingPreview: vi.fn() },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

describe('CareRhythmOnboardingProposal', () => {
  let container: HTMLDivElement
  let root: Root
  const onAccepted = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(careRhythm.onboardingPreview).mockResolvedValue({
      available: true,
      baseline_date: '2026-07-21',
      proposed_date: '2026-07-20',
      movement_days: -1,
      reason: 'moved_earlier',
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('offers but does not silently accept the proposed first Water date', async () => {
    await act(async () => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(CareRhythmOnboardingProposal, {
          mapId: 1,
          intervalDays: 7,
          onAccepted,
        }),
      ))
      await flush()
    })

    expect(careRhythm.onboardingPreview).toHaveBeenCalledWith(1, 7)
    expect(container.textContent).toContain('Join the Water rhythm')
    expect(container.textContent).toContain('20-07-2026')
    expect(onAccepted).toHaveBeenCalledWith(null)

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    act(() => checkbox.click())
    expect(onAccepted).toHaveBeenLastCalledWith('2026-07-20')
  })

  it('renders nothing when no saved rhythm can safely propose a date', async () => {
    vi.mocked(careRhythm.onboardingPreview).mockResolvedValueOnce({
      available: false,
      baseline_date: '2026-07-22',
      proposed_date: null,
      movement_days: 0,
      reason: 'outside_window',
    })
    await act(async () => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(CareRhythmOnboardingProposal, {
          mapId: 1,
          intervalDays: 8,
          onAccepted,
        }),
      ))
      await flush()
    })

    expect(container.textContent).toBe('')
    expect(onAccepted).toHaveBeenCalledWith(null)
  })
})
