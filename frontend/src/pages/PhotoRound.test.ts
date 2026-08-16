// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import PhotoRound from './PhotoRound'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setParams: vi.fn(),
  me: null as AccountMe | null,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(), mocks.setParams],
}))

vi.mock('../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      maps: [],
      loadPlants: vi.fn(),
      users: [],
      activeUserId: null,
      me: mocks.me,
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../api/client', () => ({
  photos: { round: vi.fn().mockResolvedValue([]) },
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

describe('PhotoRound — capability rendering', () => {
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
    mocks.navigate.mockClear()
    mocks.setParams.mockClear()
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
        createElement(PhotoRound),
      ))
    })
    // Flush the async round load (photosApi.round → setQueue).
    await act(async () => {})
    await act(async () => {})
  }

  it('shows the round UI for an editor', async () => {
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Photo round')
    expect(text).not.toContain('Read-only')
  })

  it('blocks a viewer with the read-only notice instead of the round', async () => {
    mocks.me = viewerMe
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Read-only')
    expect(text).toContain('Photo rounds are for editors')
    expect(text).toContain('A photo round photographs every plant, which only editors can do.')
    // The round chrome (scope select, map label) must not render.
    expect(text).not.toContain('All plants')
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
