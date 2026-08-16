// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { AccountMe } from '../api/client'
import type { PlantPhoto } from '../types'
import PhotoJournal from './PhotoJournal'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  me: null as AccountMe | null,
  photos: [] as PlantPhoto[],
}))

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector?: (store: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      loadPlants: vi.fn(),
      users: [],
      activeUserId: null,
      me: mocks.me,
    }
    return selector ? selector(store) : store
  },
}))

vi.mock('../../api/client', () => ({
  photos: {
    list: vi.fn().mockImplementation(() => Promise.resolve(mocks.photos)),
    upload: vi.fn(),
    remove: vi.fn(),
    photoReminder: vi.fn(),
  },
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

describe('PhotoJournal — capability rendering', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    mocks.me = ownerMe
    mocks.photos = [{
      id: 1, plant_id: 1, url: 'https://example.com/p1.jpg', note: null,
      taken_at: '2026-01-01T00:00:00Z', care_log_id: null, species_mismatch: false,
    } as unknown as PlantPhoto]
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
        createElement(PhotoJournal, { plantId: 1 }),
      ))
    })
    await act(async () => {})
    await act(async () => {})
  }

  it('enables upload and reminder for an editor', async () => {
    await render()
    const upload = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Add photo'))
    expect(upload).toBeDefined()
    expect((upload as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables upload and reminder for a viewer with an explanatory title', async () => {
    mocks.me = viewerMe
    await render()
    const upload = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Add photo'))
    expect(upload).toBeDefined()
    expect((upload as HTMLButtonElement).disabled).toBe(true)
    expect((upload as HTMLButtonElement).title).toContain('Only editors can change this.')
    const toggle = container.querySelector('button[aria-label="Only editors can change this."]')
    expect(toggle).not.toBeNull()
    expect((toggle as HTMLButtonElement).disabled).toBe(true)
  })

  it('hides the delete control in the photo viewer for a viewer', async () => {
    mocks.me = viewerMe
    await render()
    // Open the fullscreen photo viewer by clicking the grid thumbnail.
    const thumb = container.querySelector('button img')?.closest('button')
    expect(thumb).not.toBeNull()
    act(() => (thumb as HTMLButtonElement).click())
    await act(async () => {})
    const text = container.textContent ?? ''
    expect(text).not.toContain('Delete')
  })

  it('shows the delete control in the photo viewer for an editor', async () => {
    await render()
    const thumb = container.querySelector('button img')?.closest('button')
    expect(thumb).not.toBeNull()
    act(() => (thumb as HTMLButtonElement).click())
    await act(async () => {})
    const text = container.textContent ?? ''
    expect(text).toContain('Delete')
  })
})
