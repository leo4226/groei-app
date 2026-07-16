// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { calendarSubscription, household } from '../../api/client'
import CalendarSubscriptionSettings from './CalendarSubscriptionSettings'

vi.mock('../../api/client', () => ({
  calendarSubscription: {
    status: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
    downloadSnapshot: vi.fn(),
  },
  household: {
    calendarGrouping: vi.fn(),
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.includes(text))
  if (!match) throw new Error(`Button not found: ${text}`)
  return match
}

describe('CalendarSubscriptionSettings', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    vi.mocked(calendarSubscription.status).mockResolvedValue({
      active: false,
      config: null,
      created_at: null,
    })
    vi.mocked(household.calendarGrouping).mockResolvedValue({
      rules: [],
      maps: [
        {
          id: 4,
          name: 'Back garden',
          map_type: 'outdoor',
          recurring_care_types: ['water'],
          recommended_care_types: ['water'],
        },
        {
          id: 5,
          name: 'Living room',
          map_type: 'indoor',
          recurring_care_types: ['water', 'rotate'],
          recommended_care_types: ['water', 'rotate'],
        },
      ],
      care_types: [],
      map_ids: [],
      outdoor_maps: [],
    })
    vi.mocked(calendarSubscription.create).mockResolvedValue({
      feed_url: 'https://api.floreren.app/api/calendar/feed/one-time-secret.ics',
      webcal_url: 'webcal://api.floreren.app/api/calendar/feed/one-time-secret.ics',
      config: {
        environment: 'all',
        map_ids: [],
        care_types: [],
        include_context: false,
        privacy: true,
      },
    })
    vi.mocked(calendarSubscription.revoke).mockResolvedValue(undefined)
    vi.mocked(calendarSubscription.downloadSnapshot).mockResolvedValue(new Blob(['ics']))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders the read-only security boundary, filters and provider guidance', async () => {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(CalendarSubscriptionSettings)))
      await flush()
    })

    expect(container.querySelector('[data-calendar-subscription-title]')?.tagName).toBe('H3')
    expect(container.textContent).toContain('Anyone with this private link')
    expect(container.textContent).toContain('Google Calendar')
    expect(container.textContent).toContain('Outlook')
    expect(container.textContent).toContain('Apple Calendar')
    const privacyToggle = [...container.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('Hide plant and space names'))
      ?.querySelector('input') as HTMLInputElement
    expect(privacyToggle.checked).toBe(true)
    expect(container.querySelector('fieldset[aria-label="Spaces"]')).not.toBeNull()
    expect(container.querySelector('fieldset[aria-label="Care types"]')).not.toBeNull()
    expect(button(container, 'Download .ics')).not.toBeNull()
    expect(button(container, 'Create private subscription')).not.toBeNull()
  })

  it('reveals a generated URL once and supports immediate revoke', async () => {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(CalendarSubscriptionSettings)))
      await flush()
    })

    await act(async () => {
      button(container, 'Create private subscription').click()
      await flush()
    })

    expect(calendarSubscription.create).toHaveBeenCalledWith(expect.objectContaining({
      include_context: false,
      privacy: true,
    }))
    expect(container.textContent).toContain('Save this link now')
    expect((container.querySelector('input[readonly]') as HTMLInputElement | null)?.value)
      .toBe('https://api.floreren.app/api/calendar/feed/one-time-secret.ics')
    await act(async () => {
      button(container, 'Copy link').click()
      await flush()
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://api.floreren.app/api/calendar/feed/one-time-secret.ics',
    )
    expect(button(container, 'Revoke link')).not.toBeNull()

    const privacyToggle = [...container.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('Hide plant and space names'))
      ?.querySelector('input') as HTMLInputElement
    await act(async () => {
      privacyToggle.click()
    })
    expect(container.querySelector('input[readonly]')).toBeNull()

    await act(async () => {
      button(container, 'Revoke link').click()
      await flush()
    })
    expect(calendarSubscription.revoke).toHaveBeenCalledTimes(1)
    expect(container.querySelector('input[readonly]')).toBeNull()
  })
})
