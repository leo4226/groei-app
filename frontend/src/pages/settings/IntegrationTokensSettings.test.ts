// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { integrations } from '../../api/client'
import IntegrationTokensSettings from './IntegrationTokensSettings'

vi.mock('../../api/client', () => ({
  integrations: {
    list: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
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

describe('IntegrationTokensSettings', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(integrations.list).mockResolvedValue([
      { id: 1, name: 'Old', token_hint: 'abcd', scope: 'read', created_at: null, last_used_at: '2026-10-30T08:00:00' },
    ])
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  async function typeName(value: string) {
    const input = container.querySelector('#integration-token-name') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
    })
  }

  async function render(canEdit = true) {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(IntegrationTokensSettings, { canEdit })))
      await flush()
    })
  }

  it('shows a new token once, with the snapshot address, and lists only its hint', async () => {
    vi.mocked(integrations.create).mockResolvedValue({
      id: 2, name: 'LAveren', token_hint: 'wxyz', scope: 'read', created_at: null, last_used_at: null,
      token: 'flo_one-time-secret-wxyz',
      snapshot_url: 'https://api.floreren.app/api/integrations/snapshot',
    })
    await render()
    expect(container.textContent).toContain('Last used 30-10-2026')

    await typeName('LAveren')
    await act(async () => {
      button(container, 'Create token').click()
      await flush()
    })

    expect(integrations.create).toHaveBeenCalledWith('LAveren', 'read')
    const values = Array.from(container.querySelectorAll('input[readonly]')).map((input) => (input as HTMLInputElement).value)
    expect(values).toEqual([
      'flo_one-time-secret-wxyz',
      'https://api.floreren.app/api/integrations/snapshot',
    ])
    expect(container.textContent).toContain('…wxyz')
  })

  it('makes a care token when logging care is allowed', async () => {
    vi.mocked(integrations.create).mockResolvedValue({
      id: 3, name: 'LAveren', token_hint: 'care', scope: 'care', created_at: null, last_used_at: null,
      token: 'flo_secret-care', snapshot_url: 'https://api.floreren.app/api/integrations/snapshot',
    })
    await render()
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => {
      checkbox.click()
      await flush()
    })
    await typeName('LAveren')
    await act(async () => {
      button(container, 'Create token').click()
      await flush()
    })
    expect(integrations.create).toHaveBeenCalledWith('LAveren', 'care')
    expect(container.textContent).toContain('Read + log care')
  })

  it('explains the limit on a 409', async () => {
    vi.mocked(integrations.create).mockRejectedValue(Object.assign(new Error('x'), { status: 409 }))
    await render()
    await typeName('LAveren')
    await act(async () => {
      button(container, 'Create token').click()
      await flush()
    })
    expect(container.textContent).toContain('You already have 5 tokens')
  })

  it('starts with no name, so nobody else gets a token called LAveren', async () => {
    await render()
    expect((container.querySelector('#integration-token-name') as HTMLInputElement).value).toBe('')
    expect(button(container, 'Create token').disabled).toBe(true)
  })

  it('is read-only for viewers', async () => {
    await render(false)
    expect(button(container, 'Create token').disabled).toBe(true)
    expect(button(container, 'Revoke').disabled).toBe(true)
  })
})
