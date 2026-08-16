// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import type { Plant } from '../types'
import Plants from './Plants'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  me: null as AccountMe | null,
  plants: [] as Plant[],
  maps: [] as { id: number; map_type: 'outdoor' | 'indoor' }[],
  isLoading: false,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    createElement('a', { href: to }, children),
}))

vi.mock('../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      plants: mocks.plants,
      maps: mocks.maps,
      users: [],
      activeUserId: null,
      isLoading: mocks.isLoading,
      me: mocks.me,
      bulkArchivePlants: vi.fn(),
      loadPlants: vi.fn(),
      loadMaps: vi.fn(),
      plantFact: null,
      loadPlantFact: vi.fn(),
      recentLog: [],
      loadRecentLog: vi.fn(),
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../api/client', () => ({
  icons: { catalog: vi.fn().mockResolvedValue([]) },
  alerts: { summary: vi.fn().mockResolvedValue({ plant_ids_with_alerts: [] }) },
}))

vi.mock('../components/plants/PlantFactCard', () => ({ default: () => null }))
vi.mock('../components/plants/RecentCareSection', () => ({ default: () => null }))

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

function plant(id: number, name: string): Plant {
  return {
    id, name, plant_type: null, icon_key: null, photo_path: null,
    species: null, species_id: null, notes: null, map_id: null,
    location_name: null, location_icon: null, container_id: null,
    pot_size_cm: null, acquired_date: null, measured_sun_hours: null,
    sun_requirement: null, care_schedules: [], created_at: '2026-01-01T00:00:00Z',
    is_active: true, phenology: null,
  } as unknown as Plant
}

describe('Plants — capability rendering', () => {
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
    mocks.plants = [plant(1, 'Monstera')]
    mocks.maps = []
    mocks.isLoading = false
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
        createElement(Plants),
      ))
    })
  }

  it('shows identify/photo-round/add/select for an editor and no banner', () => {
    render()
    const text = container.textContent ?? ''
    expect(text).toContain('Identify in the wild')
    expect(text).toContain('Photo round')
    expect(text).toContain('+ Add')
    expect(text).toContain('Select')
    expect(text).not.toContain('Read-only')
  })

  it('hides every write control for a viewer and shows the read-only banner', () => {
    mocks.me = viewerMe
    render()
    const text = container.textContent ?? ''
    expect(text).toContain('Read-only')
    expect(text).toContain('Monstera')     // collection stays readable
    expect(text).not.toContain('Identify in the wild')
    expect(text).not.toContain('Photo round')
    expect(text).not.toContain('+ Add')
    expect(text).not.toContain('Select')
  })
})
