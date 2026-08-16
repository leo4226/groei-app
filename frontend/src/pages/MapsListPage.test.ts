// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import type { MapInfo } from '../types'
import MapsListPage from './MapsListPage'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  loadMaps: vi.fn(),
  createMap: vi.fn(),
  deleteMap: vi.fn(),
  me: null as AccountMe | null,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('../store/useFloreren', () => ({
  useFloreren: (selector: (store: Record<string, unknown>) => unknown) =>
    selector({
      maps: mocks.maps,
      isLoading: false,
      users: [],
      activeUserId: null,
      loadMaps: mocks.loadMaps,
      createMap: mocks.createMap,
      deleteMap: mocks.deleteMap,
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

function map(id: number, name: string): MapInfo {
  return {
    id, name, slug: `map-${id}`, svg_file: '', viewbox: '0 0 100 100',
    scale_info: null, sort_order: 0, canvas_data: '{}', thumbnail_file: null,
    map_type: 'outdoor', lat: null, lon: null, bearing: 0,
  }
}

describe('MapsListPage — capability rendering', () => {
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
    mocks.maps = [map(1, 'Garden')]
    mocks.loadMaps.mockReset()
    mocks.createMap.mockReset()
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
        createElement(MapsListPage),
      ))
    })
  }

  it('hides every write control for a viewer (no create, delete, or edit-layout)', () => {
    mocks.me = viewerMe
    render()
    const buttons = Array.from(container.querySelectorAll('button')).map(b => b.textContent?.trim())
    expect(buttons).not.toContain('New map')
    expect(buttons).not.toContain('Edit layout')
    // The delete button has no visible text (icon-only); assert by absence of
    // the create + edit controls and presence of the read-only banner.
    expect(container.textContent).toContain('Read-only')
    expect(container.querySelectorAll('[title="Delete"]').length).toBe(0)
    expect(container.textContent).toContain('Garden')   // map still readable
  })

  it('shows create + delete + edit-layout for an editor', () => {
    render()
    expect(container.textContent).toContain('New map')
    expect(container.textContent).toContain('Edit layout')
    expect(container.textContent).not.toContain('Read-only')
    expect(container.querySelectorAll('[title="Delete"]').length).toBe(1)
  })

  it('shows no empty-state create CTA to a viewer with zero maps', () => {
    mocks.me = viewerMe
    mocks.maps = []
    render()
    expect(container.textContent).toContain('No maps yet')
    expect(container.textContent).not.toContain('Create your first map')
  })
})
