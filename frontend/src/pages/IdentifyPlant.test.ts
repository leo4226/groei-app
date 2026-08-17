// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import { IdentifyPlantPage } from './IdentifyPlant'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  me: null as AccountMe | null,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ state: null }),
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

vi.mock('../api/client', () => ({
  plants: {},
  maps: { biodiversity: vi.fn().mockResolvedValue([]) },
  apiRequest: vi.fn().mockResolvedValue({}),
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

describe('IdentifyPlantPage — capability rendering', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    mocks.me = ownerMe
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

  function render() {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(IdentifyPlantPage),
      ))
    })
  }

  it('does not block an editor (camera step renders)', () => {
    render()
    const text = container.textContent ?? ''
    expect(text).not.toContain('Read-only')
    expect(text).not.toContain('Identifying is for editors')
  })

  it('blocks a viewer with the read-only notice instead of the camera', () => {
    mocks.me = viewerMe
    render()
    const text = container.textContent ?? ''
    expect(text).toContain('Read-only')
    expect(text).toContain('Identifying is for editors')
    expect(text).toContain('You can browse the guide, but only editors can identify plants.')
  })

  it('back button on the viewer block navigates back', () => {
    mocks.me = viewerMe
    render()
    const back = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Back'))
    expect(back).toBeDefined()
    act(() => back!.click())
    expect(mocks.navigate).toHaveBeenCalledWith(-1)
  })
})
