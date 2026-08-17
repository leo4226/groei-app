// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import type { AccountMe } from '../api/client'
import type { Plant } from '../types'
import PlantDetail from './PlantDetail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  me: null as AccountMe | null,
  plants: [] as Plant[],
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
      plants: mocks.plants,
      maps: [],
      loadPlants: vi.fn(),
      markCareDone: vi.fn(),
      archivePlant: vi.fn(),
      careVersions: {},
      users: [],
      activeUserId: null,
      me: mocks.me,
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../api/client', () => ({
  plants: {
    get: vi.fn(),
    warnings: vi.fn().mockResolvedValue({ warnings: [] }),
    update: vi.fn(),
    duplicate: vi.fn(),
    retrySpecies: vi.fn(),
  },
  care: {
    log: vi.fn().mockResolvedValue([]),
    undo: vi.fn(),
    syncSchedules: vi.fn(),
  },
  photos: {
    list: vi.fn().mockResolvedValue([]),
    upload: vi.fn(),
    remove: vi.fn(),
    photoReminder: vi.fn(),
  },
}))

// Heavy/irrelevant children: the passpart-test concerns the gated chrome, not
// the species cards. PageMasthead is mocked to render its `actions` so the
// desktop header buttons are assertable.
vi.mock('../components/plant/PhotoJournal', () => ({ default: () => createElement('div', null, 'PhotoJournal') }))
vi.mock('../components/EcologyCard', () => ({ default: () => null }))
vi.mock('../components/PhaseCalendar', () => ({ default: () => null }))
vi.mock('../components/plant/PlantWaterEvidence', () => ({ default: () => null }))
vi.mock('../components/plant/MeasuredSunEditor', () => ({ default: () => null }))
vi.mock('../components/ui/PageMasthead', () => ({
  default: (props: { title?: string; actions?: React.ReactNode }) =>
    createElement('div', null, props.title, props.actions ?? null),
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
    id: 1, name: 'Monstera', species: null, species_common_name_nl: null,
    species_common_name_en: null, location_id: null, location_name: null,
    location_icon: null, map_id: null, map_x: null, map_y: null,
    photo_path: null, acquired_date: null, pot_size_cm: null, container_id: null,
    last_repotted: null, notes: null, is_active: true, is_locked: false,
    created_at: '2026-01-01T00:00:00Z', sown_date: null, sun_requirement: null,
    measured_sun_hours: null, plant_type: null, icon_key: null,
    icon_requested: false, phase: 'established', pot_material: null,
    pot_diameter_cm: null, pot_height_cm: null, has_drainage: null,
    substrate: [], acquired_from: null, species_id: null, phenology: null,
    care_schedules: [{
      id: 10, plant_id: 1, care_type: 'water', interval_days: 7,
      season_adjust: null, next_due: '2099-01-01', last_done: null,
      last_done_by: null, last_done_by_name: null, notes: null, is_active: true,
    }],
    care_status: 'good', temp_status: 'comfortable',
  } as unknown as Plant
}

describe('PlantDetail — capability rendering', () => {
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
    mocks.plants = [plant()]
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
        createElement(PlantDetail),
      ))
    })
    // Flush care-log + warnings promises so their setState lands inside act.
    await act(async () => {})
    await act(async () => {})
  }

  it('shows the full editor surface for an editor (no banner)', async () => {
    await render()
    const text = container.textContent ?? ''
    expect(text).not.toContain('Read-only')
    expect(text).toContain('Monstera')
    // Desktop: quick-action care pills in the hero panel.
    expect(text).toContain('Water')
    expect(text).toContain('Fetch species data')
    expect(text).toContain('Add or remove care')
    expect(text).toContain('Copy plant')
    expect(text).toContain('Edit')
    expect(text).toContain('Archive plant')
  })

  it('blocks every write control for a viewer and shows the read-only banner', async () => {
    mocks.me = viewerMe
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Read-only')
    expect(text).toContain('Monstera')        // reading stays
    expect(text).toContain('PhotoJournal')    // journal list still renders
    expect(text).not.toContain('Mark done')
    expect(text).not.toContain('Add or remove care')
    expect(text).not.toContain('Copy plant')
    expect(text).not.toContain('Archive plant')
    expect(text).not.toContain('Fetch species data')
    // The interval line stays readable but is no longer a button.
    expect(text).toContain('7 days')
  })

  it('hides the mark-done row action for a viewer on mobile', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }),
    })
    mocks.me = viewerMe
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Read-only')
    expect(text).not.toContain('Mark done')
    expect(text).not.toContain('Add or remove care')
    expect(text).not.toContain('Archive plant')
  })
})
