// @vitest-environment jsdom
//
// YouPanel capability rendering (#935, surface 13): name/avatar/password are
// viewer-disabled writes; language and theme stay editable for everyone.

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { auth, household, type AccountMe } from '../../api/client'
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
  auth: { changePassword: vi.fn(), logoutAll: vi.fn(), deleteAccount: vi.fn() },
  household: { updateMember: vi.fn(), members: vi.fn() },
  icons: { catalog: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../../api/auth', () => ({ clearToken: vi.fn() }))

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

  it('makes identity read-only for a viewer but keeps their own password, language and theme', () => {
    render(viewerMe)
    expect((container.querySelector('#profile-name') as HTMLInputElement).disabled).toBe(true)
    const save = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Save')
    expect((save as HTMLButtonElement).disabled).toBe(true)
    // The password is the viewer's own credential (settings audit, 2026-11).
    const changePassword = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Change password')
    expect((changePassword as HTMLButtonElement).disabled).toBe(false)

    // Language + theme stay interactive
    const languageButtons = Array.from(container.querySelectorAll('button'))
      .filter((b) => b.textContent?.includes('Nederlands') || b.textContent?.includes('English'))
    expect(languageButtons.length).toBe(2)
    for (const button of languageButtons) expect(button.disabled).toBe(false)
    const themeButtons = Array.from(container.querySelectorAll('button'))
      .filter((b) => b.textContent?.includes('Light') || b.textContent?.includes('Dark'))
    for (const button of themeButtons) expect(button.disabled).toBe(false)
  })

  function buttonByText(text: string): HTMLButtonElement {
    const found = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)
    if (!found) throw new Error(`Button not found: ${text}`)
    return found as HTMLButtonElement
  }

  async function flushAll() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }

  it('asks before signing out everywhere', async () => {
    vi.mocked(auth.logoutAll).mockRejectedValue(new Error('offline'))
    render(ownerMe)
    const triggers = Array.from(container.querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === 'Sign out on all devices')
    expect(triggers).toHaveLength(1)
    act(() => triggers[0].click())
    expect(auth.logoutAll).not.toHaveBeenCalled()

    // The dialog's confirm button carries the same label.
    const confirm = Array.from(document.querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === 'Sign out on all devices')
      .find((b) => b !== triggers[0]) as HTMLButtonElement
    act(() => confirm.click())
    await flushAll()
    expect(auth.logoutAll).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('Signing out failed. Try again.')
  })

  it('stops an owner who still has members from deleting their account', async () => {
    vi.mocked(household.members).mockResolvedValue([
      { id: 1, is_self: true } as never,
      { id: 2, is_self: false } as never,
    ])
    render(ownerMe)
    act(() => buttonByText('Delete my account').click())
    await flushAll()
    expect(container.querySelector('[data-delete-account-blocked]')).not.toBeNull()
    expect(container.querySelector('#delete-account-password')).toBeNull()
  })

  it('warns a member what stays behind and reports a wrong password', async () => {
    vi.mocked(auth.deleteAccount).mockRejectedValue(Object.assign(new Error('x'), { status: 400 }))
    render(viewerMe)
    act(() => buttonByText('Delete my account').click())
    await flushAll()
    // A member never needs the member count; only an owner can be blocked.
    expect(household.members).not.toHaveBeenCalled()
    expect(container.querySelector('[data-delete-account-warning]')?.textContent).toContain('You leave Het huis')

    const input = container.querySelector('#delete-account-password') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(input, 'nope')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => buttonByText('Delete for good').click())
    await flushAll()
    expect(auth.deleteAccount).toHaveBeenCalledWith('nope')
    expect(container.textContent).toContain('That password is not right.')
  })
})
