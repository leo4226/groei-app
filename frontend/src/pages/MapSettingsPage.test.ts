// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import type { MapInfo } from '../types'
import MapSettingsPage from './MapSettingsPage'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  byId: vi.fn(),
  update: vi.fn(),
  streken: vi.fn(),
  deleteMap: vi.fn(),
  me: null as AccountMe | null,
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: '1' }),
  useNavigate: () => mocks.navigate,
}))

vi.mock('../api/client', () => ({
  maps: {
    byId: mocks.byId,
    update: mocks.update,
    streken: mocks.streken,
  },
}))

vi.mock('../store/useFloreren', () => ({
  useFloreren: (selector: (store: Record<string, unknown>) => unknown) =>
    selector({
      deleteMap: mocks.deleteMap,
      users: [],
      activeUserId: null,
      me: mocks.me,
    }),
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

function map(): MapInfo {
  return {
    id: 1, name: 'Garden', slug: 'garden', svg_file: '', viewbox: '0 0 100 100',
    scale_info: null, sort_order: 0, canvas_data: JSON.stringify({ canvas_w: 680, canvas_h: 680, scale_px_per_m: 46 }),
    thumbnail_file: null, map_type: 'outdoor', lat: 52.37, lon: 4.85, bearing: 0,
  }
}

describe('MapSettingsPage — capability rendering', () => {
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
    mocks.byId.mockReset()
    mocks.byId.mockResolvedValue(map())
    mocks.streken.mockReset()
    mocks.streken.mockResolvedValue([])
    mocks.update.mockReset()
    mocks.update.mockResolvedValue(map())
    mocks.deleteMap.mockReset()
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
        createElement(MapSettingsPage),
      ))
    })
  }

  it('renders read-only for a viewer: banner, disabled inputs, no delete or edit-layout', async () => {
    mocks.me = viewerMe
    render()
    await act(async () => { await Promise.resolve() })

    expect(container.textContent).toContain('Read-only')
    const nameInput = container.querySelector('input') as HTMLInputElement
    expect(nameInput.disabled).toBe(true)
    expect(container.textContent).not.toContain('Delete map')
    expect(container.textContent).not.toContain('Edit layout')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('renders editable for an editor: enabled inputs, delete + edit-layout offered', async () => {
    render()
    await act(async () => { await Promise.resolve() })

    const nameInput = container.querySelector('input') as HTMLInputElement
    expect(nameInput.disabled).toBe(false)
    expect(container.textContent).toContain('Delete map')
    expect(container.textContent).toContain('Edit layout')
  })
})
