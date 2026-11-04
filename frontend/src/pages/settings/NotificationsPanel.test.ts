// @vitest-environment jsdom
//
// Quiet hours and muted care types are account-wide, so they show whether or
// not push is on for this device, and a viewer may change them (2026-11 audit).

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { notifications } from '../../api/client'
import NotificationsPanel from './NotificationsPanel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../api/client', () => ({
  notifications: { getPrefs: vi.fn(), updatePrefs: vi.fn(), pushTest: vi.fn() },
}))

vi.mock('../../utils/push', () => ({
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  pushSupported: () => true,
  pushAvailabilityInfo: () => ({ state: 'supported' }),
  isPushSubscribedHere: vi.fn().mockResolvedValue(false),
}))

const prefs = {
  digest_enabled: true,
  digest_time: '08:00',
  push_enabled: true,
  quiet_start: '21:00',
  quiet_end: '08:00',
  muted_care_types: ['mist'],
}

describe('NotificationsPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(notifications.getPrefs).mockResolvedValue(structuredClone(prefs) as never)
    vi.mocked(notifications.updatePrefs).mockImplementation(async (next) => next as never)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  async function render() {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(NotificationsPanel)))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('shows quiet hours and muted types while push is off on this device', async () => {
    await render()

    expect(container.querySelector('select[aria-label="Quiet hours start"]')).not.toBeNull()
    expect(container.textContent).toContain('Mute care types')
    // The test push only makes sense once this device is subscribed.
    expect(container.textContent).not.toContain('Send a test notification')
  })

  it('saves a muted care type from any device', async () => {
    await render()
    const water = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Water') as HTMLButtonElement
    expect(water.disabled).toBe(false)

    await act(async () => {
      water.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(notifications.updatePrefs).toHaveBeenCalledWith(
      expect.objectContaining({ muted_care_types: ['mist', 'water'] }),
    )
  })
})
