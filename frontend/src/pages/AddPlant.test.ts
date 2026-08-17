// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import AddPlant from './AddPlant'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  locationState: null as unknown,
  me: null as AccountMe | null,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ state: mocks.locationState, pathname: '/plants/add' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    createElement('a', { href: to }, children),
}))

vi.mock('../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      maps: [],
      plants: [],
      addPlant: vi.fn(),
      uploadPhoto: vi.fn(),
      users: [],
      activeUserId: null,
      me: mocks.me,
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../api/client', () => ({
  icons: { catalog: vi.fn().mockResolvedValue([]) },
  species: { list: vi.fn().mockResolvedValue([]) },
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

describe('AddPlant — capability rendering', () => {
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
    mocks.locationState = null
    mocks.navigate.mockClear()
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
        createElement(AddPlant),
      ))
    })
    // Flush the icon-catalog promise so its setState lands inside act.
    await act(async () => {})
  }

  it('shows the entry screen for an editor (no block, no banner)', async () => {
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Identify with photo')
    expect(text).toContain('Enter manually')
    expect(text).not.toContain('Read-only')
  })

  it('blocks a viewer with the read-only notice even without route state', async () => {
    mocks.me = viewerMe
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Read-only')
    expect(text).toContain('Adding plants is for editors')
    expect(text).toContain('You can browse the collection, but only editors can add plants.')
    // None of the entry-screen write routes leak through.
    expect(text).not.toContain('Identify with photo')
    expect(text).not.toContain('Enter manually')
  })

  it('back button on the viewer block returns to /plants', async () => {
    mocks.me = viewerMe
    await render()
    const back = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Back'))
    expect(back).toBeDefined()
    act(() => back!.click())
    expect(mocks.navigate).toHaveBeenCalledWith('/plants')
  })
})
