// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import type { Plant } from '../types'
import EditPlant from './EditPlant'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  me: null as AccountMe | null,
  plant: null as Plant | null,
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: '1' }),
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    createElement('a', { href: to }, children),
}))

vi.mock('../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      maps: [],
      plants: [],
      updatePlant: vi.fn(),
      uploadPhoto: vi.fn(),
      users: [],
      activeUserId: null,
      me: mocks.me,
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../api/client', () => ({
  plants: {
    get: vi.fn().mockImplementation(() => Promise.resolve(mocks.plant)),
    setContainer: vi.fn(),
  },
  care: { syncSchedules: vi.fn() },
  icons: { catalog: vi.fn().mockResolvedValue([]) },
  objects: { list: vi.fn().mockResolvedValue([]) },
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

function plant(): Plant {
  return {
    id: 1, name: 'Monstera', plant_type: null, icon_key: null, photo_path: null,
    species: null, species_id: null, notes: null, map_id: null,
    location_name: null, location_icon: null, container_id: null,
    pot_size_cm: null, acquired_date: '2026-01-01T00:00:00Z', measured_sun_hours: null,
    sun_requirement: null, care_schedules: [], created_at: '2026-01-01T00:00:00Z',
    is_active: true, phenology: null,
  } as unknown as Plant
}

describe('EditPlant — capability rendering', () => {
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
    mocks.plant = plant()
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
        createElement(EditPlant),
      ))
    })
    // Flush the async plant load (plantsApi.get → setPlant → setLoading(false)).
    await act(async () => {})
    await act(async () => {})
  }

  it('shows the edit form for an editor after the plant loads', async () => {
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Monstera')
    expect(text).not.toContain('Read-only')
  })

  it('blocks a viewer with the read-only notice instead of the form', async () => {
    mocks.me = viewerMe
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Read-only')
    expect(text).toContain('Editing plants is for editors')
    expect(text).toContain("You can read the plant's page, but only editors can change it.")
    // The form itself must not render.
    expect(text).not.toContain('Save changes')
    expect(text).not.toContain('Monstera')
  })
})
