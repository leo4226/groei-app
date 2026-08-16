// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import FieldJournalPage from './FieldJournalPage'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  me: null as AccountMe | null,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      users: [],
      activeUserId: null,
      me: mocks.me,
    }
    return selector ? selector(store) : store
  },
}))

// DiscoveriesSection is lazy-loaded and its own gating is covered by its test.
vi.mock('../components/discoveries/DiscoveriesSection', () => ({
  default: () => null,
}))

const ownerMe: AccountMe = {
  id: 1, household_id: 1, email: 'a@example.com', name: 'A', avatar: null,
  is_admin: false, household_name: 'House', role: 'owner',
  capabilities: { can_edit: true, can_manage_household: true },
}

const viewerMe: AccountMe = {
  ...ownerMe,
  role: 'viewer',
  capabilities: { can_edit: false, can_manage_household: false },
}

describe('FieldJournalPage — capability rendering', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }),
    })
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

  async function render() {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(FieldJournalPage),
      ))
    })
    // Resolve the lazy DiscoveriesSection so the tree finishes rendering.
    await act(async () => {})
    await act(async () => {})
  }

  it('shows the identify-wild entry for an editor', async () => {
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('field guide')
    expect(text).toContain('Identify in the wild')
  })

  it('hides the identify-wild entry for a viewer', async () => {
    mocks.me = viewerMe
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('field guide')
    expect(text).not.toContain('Identify in the wild')
  })
})
