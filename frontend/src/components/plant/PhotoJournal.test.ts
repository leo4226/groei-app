// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PhotoJournal from './PhotoJournal'
import { LanguageProvider } from '../../context/LanguageContext'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  photosList: vi.fn().mockResolvedValue([]),
  photoReminder: vi.fn().mockResolvedValue({ ok: true }),
  loadPlants: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../api/client', () => ({
  photos: {
    list: mocks.photosList,
    photoReminder: mocks.photoReminder,
    upload: vi.fn(),
    remove: vi.fn(),
  },
  plants: {},
}))

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      plants: [],
      users: [],
      activeUserId: null,
      loadPlants: mocks.loadPlants,
    }
    return selector ? selector(state) : state
  },
}))

describe('PhotoJournal reminder toggle', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows reminder OFF when no active photo schedule exists', () => {
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(PhotoJournal, { plantId: 1 }),
      ),
    ))
    // The select (interval dropdown) is only rendered when reminderOn is true
    const select = container.querySelector('select')
    expect(select).toBeNull()
  })

  it('shows reminder ON when an active photo schedule is provided', () => {
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(PhotoJournal, {
          plantId: 1,
          reminder: { enabled: true, intervalDays: 30 },
        }),
      ),
    ))
    const select = container.querySelector('select')
    expect(select).not.toBeNull()
  })

  it('syncs toggle state when the reminder prop updates from undefined to enabled', () => {
    // Phase 1: render with no reminder (OFF)
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(PhotoJournal, { plantId: 1 }),
      ),
    ))
    let select = container.querySelector('select')
    expect(select).toBeNull()

    // Phase 2: re-render with reminder enabled
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(PhotoJournal, {
          plantId: 1,
          reminder: { enabled: true, intervalDays: 30 },
        }),
      ),
    ))
    select = container.querySelector('select')
    expect(select).not.toBeNull() // prop change synced to state
  })

  it('syncs toggle state when the reminder prop changes from enabled to undefined', () => {
    // Phase 1: render with reminder enabled
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(PhotoJournal, {
          plantId: 1,
          reminder: { enabled: true, intervalDays: 30 },
        }),
      ),
    ))
    let select = container.querySelector('select')
    expect(select).not.toBeNull()

    // Phase 2: re-render with no reminder (schedule deactivated)
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(PhotoJournal, { plantId: 1 }),
      ),
    ))
    select = container.querySelector('select')
    expect(select).toBeNull() // prop change synced to state
  })
})
