// @vitest-environment jsdom
//
// GamePlayerPage capability rendering (#935, surface 17): a signed-in viewer
// without a session guest token sees the read-only notice instead of the play
// UI; the guest join flow is unaffected (guest token present → plays on).

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import GamePlayerPage from './GamePlayerPage'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  guestToken: null as string | null,
  me: null as AccountMe | null,
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ code: 'ABC123' }),
  useNavigate: () => mocks.navigate,
}))

vi.mock('../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      users: [{ id: 1, language: 'en' }],
      activeUserId: 1,
      me: mocks.me,
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../api/game', () => ({
  gameApi: {
    getState: vi.fn().mockResolvedValue(null),
    join: vi.fn(),
  },
  getGuest: () => (mocks.guestToken ? { code: 'ABC123', token: mocks.guestToken, player_id: 9, name: 'Gast' } : null),
}))

const ownerMe: AccountMe = {
  id: 1, household_id: 1, email: 'a@example.com', name: 'A', avatar: null,
  is_admin: false, household_name: 'H', role: 'owner',
  capabilities: { can_edit: true, can_manage_household: true },
}

const viewerMe: AccountMe = {
  ...ownerMe,
  role: 'viewer',
  capabilities: { can_edit: false, can_manage_household: false },
}

describe('GamePlayerPage — capability rendering', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    mocks.guestToken = null
    mocks.me = ownerMe
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  function render() {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(GamePlayerPage)))
    })
  }

  it('keeps the play flow for an editor', () => {
    render()
    expect(container.textContent).not.toContain('This is an editing page')
  })

  it('shows the read-only notice for a viewer without a guest token', () => {
    mocks.me = viewerMe
    render()
    expect(container.textContent).toContain('This is an editing page')
    expect(container.textContent).toContain('Read-only')
  })

  it('leaves the guest join flow unaffected for a viewer holding a guest token', () => {
    mocks.me = viewerMe
    mocks.guestToken = 'guest-abc'
    render()
    expect(container.textContent).not.toContain('This is an editing page')
  })
})
