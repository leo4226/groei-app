// @vitest-environment jsdom
//
// YouPanel capability rendering (#935, surface 13): name/avatar/password are
// viewer-disabled writes; language and theme stay editable for everyone.

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { AccountMe } from '../../api/client'
import YouPanel, { type Theme } from './YouPanel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      users: [{ id: 1, language: 'en' }],
      activeUserId: 1,
      updateUserLanguage: vi.fn(),
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../../api/client', () => ({
  auth: { changePassword: vi.fn() },
  household: { updateMember: vi.fn() },
  icons: { catalog: vi.fn().mockResolvedValue([]) },
}))

const ownerMe: AccountMe = {
  id: 1, household_id: 1, email: 'a@example.com', name: 'Leon', avatar: null,
  is_admin: false, household_name: 'Het huis', role: 'owner',
  capabilities: { can_edit: true, can_manage_household: true },
}

const viewerMe: AccountMe = {
  ...ownerMe,
  role: 'viewer',
  capabilities: { can_edit: false, can_manage_household: false },
}

describe('YouPanel — capability rendering', () => {
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

  function render(me: AccountMe) {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(YouPanel, {
        me,
        theme: 'system' as Theme,
        onThemeChange: vi.fn(),
      })))
    })
  }

  it('keeps identity and password editable for an owner', () => {
    render(ownerMe)
    expect((container.querySelector('#profile-name') as HTMLInputElement).disabled).toBe(false)
    const save = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Save')
    expect((save as HTMLButtonElement).disabled).toBe(false)
    const changePassword = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Change password')
    expect((changePassword as HTMLButtonElement).disabled).toBe(false)
  })

  it('makes identity and password read-only for a viewer but keeps language and theme', () => {
    render(viewerMe)
    expect((container.querySelector('#profile-name') as HTMLInputElement).disabled).toBe(true)
    const save = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Save')
    expect((save as HTMLButtonElement).disabled).toBe(true)
    const changePassword = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Change password')
    expect((changePassword as HTMLButtonElement).disabled).toBe(true)
    expect((changePassword as HTMLButtonElement).title).toContain('Only editors can change this.')

    // Language + theme stay interactive
    const languageButtons = Array.from(container.querySelectorAll('button'))
      .filter((b) => b.textContent?.includes('Nederlands') || b.textContent?.includes('English'))
    expect(languageButtons.length).toBe(2)
    for (const button of languageButtons) expect(button.disabled).toBe(false)
    const themeButtons = Array.from(container.querySelectorAll('button'))
      .filter((b) => b.textContent?.includes('Light') || b.textContent?.includes('Dark'))
    for (const button of themeButtons) expect(button.disabled).toBe(false)
  })
})
