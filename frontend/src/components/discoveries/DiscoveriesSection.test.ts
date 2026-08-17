// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { AccountMe } from '../../api/client'
import DiscoveriesSection from './DiscoveriesSection'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  me: null as AccountMe | null,
  items: [] as unknown[],
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      refreshTick: 0,
      users: [],
      activeUserId: null,
      me: mocks.me,
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../../api/client', () => ({
  discoveries: {
    list: vi.fn().mockImplementation(() => Promise.resolve(mocks.items)),
    delete: vi.fn(),
    share: vi.fn(),
    updateNotes: vi.fn(),
    updateLocation: vi.fn(),
  },
  species: { list: vi.fn().mockResolvedValue([]) },
}))

vi.mock('./ExpeditionMap', () => ({ default: () => null }))
vi.mock('./WikipediaLink', () => ({ default: () => null }))
vi.mock('../PageDecor', () => ({ default: () => null }))

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

function item(id = 1) {
  return {
    id,
    species_id: null,
    common_name: 'Daisy',
    species_common_name_nl: null,
    species_common_name_en: null,
    latin_name: null,
    thumbnail_url: null,
    notes: null,
    location_lat: null,
    location_lon: null,
    place_name: null,
    country_code: null,
    fun_fact_nl: null,
    fun_fact_en: null,
    discovered_at: '2026-01-01T00:00:00Z',
  }
}

describe('DiscoveriesSection — capability rendering', () => {
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
    mocks.items = [item()]
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  async function openFirstEntry() {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(DiscoveriesSection),
      ))
    })
    await act(async () => {})
    await act(async () => {})
    const card = [...container.querySelectorAll('[role="button"]')]
      .find(el => el.textContent?.includes('Daisy'))
    act(() => (card as HTMLButtonElement)?.click())
    await act(async () => {})
  }

  it('shows every write action in the detail sheet for an editor', async () => {
    await openFirstEntry()
    const text = container.textContent ?? ''
    expect(text).toContain('Add to garden')
    expect(text).toContain('Share')
    expect(text).toContain('Add current location')
    expect(container.querySelector('[aria-label="Delete"]')).not.toBeNull()
  })

  it('hides every write action in the detail sheet for a viewer', async () => {
    mocks.me = viewerMe
    await openFirstEntry()
    const text = container.textContent ?? ''
    expect(text).not.toContain('Add to garden')
    expect(text).not.toContain('Share')
    expect(text).not.toContain('Add current location')
    expect(container.querySelector('[aria-label="Delete"]')).toBeNull()
    // Reading the entry itself stays.
    expect(text).toContain('Daisy')
  })
})
