// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { MapPlant } from '../../types'
import PlantQuickSheet from './PlantQuickSheet'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  markCareDone: vi.fn(),
  undoCare: vi.fn(),
  plantGet: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('../../api/client', () => ({
  plants: { get: mocks.plantGet },
}))

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector: (store: Record<string, unknown>) => unknown) =>
    selector({
      users: [],
      activeUserId: null,
      markCareDone: mocks.markCareDone,
      undoCare: mocks.undoCare,
    }),
}))

function plant(): MapPlant {
  return {
    id: 1,
    name: 'Monstera',
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: 0,
    map_y: 0,
    photo_path: null,
    container_id: null,
    ground_zone_id: null,
    display_radius_cm: null,
    care_status: 'good',
    temp_status: 'comfortable',
    most_urgent: null,
    sun_requirement: null,
    measured_sun_hours: null,
    plant_type: null,
    icon_key: null,
    species_id: null,
    phenology: null,
    is_locked: false,
    quantity: 1,
    top_alert: null,
    alerts: [],
    top_warning: null,
    warnings: [],
  }
}

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

describe('PlantQuickSheet care chips', () => {
  let container: HTMLDivElement
  let root: Root
  const onCareAction = vi.fn()
  const onAction = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    mocks.markCareDone.mockReset()
    mocks.undoCare.mockReset()
    mocks.plantGet.mockReset()
    mocks.plantGet.mockResolvedValue({ care_schedules: [] })
    mocks.markCareDone.mockResolvedValue({
      care_log_id: 42,
      previous_next_due: '2026-08-01',
      previous_last_done: null,
      previous_last_done_by: null,
    })
    mocks.undoCare.mockResolvedValue(undefined)
    onCareAction.mockClear()
    onAction.mockClear()
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
    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(PlantQuickSheet, {
            plant: plant(),
            objects: [],
            mapId: 1,
            mapName: 'Back garden',
            onClose: () => {},
            onCareAction,
            onAction,
          }),
        ),
      )
    })
  }

  it('logs care on first tap and undoes it on a second tap (#791)', async () => {
    await render()

    const waterChip = buttonWithText(container, 'Water')
    await act(async () => {
      waterChip.click()
    })

    expect(mocks.markCareDone).toHaveBeenCalledWith(1, 'water')
    expect(mocks.undoCare).not.toHaveBeenCalled()

    // The chip flips to a tappable "Undo" state — never disabled after logging
    const undoChip = buttonWithText(container, 'Undo')
    expect(undoChip).toBeTruthy()
    expect(undoChip.disabled).toBe(false)

    await act(async () => {
      undoChip.click()
    })

    expect(mocks.undoCare).toHaveBeenCalledWith(1, 42, '2026-08-01', null, null)
    expect(mocks.markCareDone).toHaveBeenCalledTimes(1)

    // The chip reverts to the normal care label
    expect(buttonWithText(container, 'Water')).toBeTruthy()
  })

  it('keeps an undone chip tappable to log again', async () => {
    await render()

    const waterChip = buttonWithText(container, 'Water')
    await act(async () => {
      waterChip.click()
    })
    await act(async () => {
      buttonWithText(container, 'Undo').click()
    })
    await act(async () => {
      buttonWithText(container, 'Water').click()
    })

    expect(mocks.markCareDone).toHaveBeenCalledTimes(2)
    expect(mocks.undoCare).toHaveBeenCalledTimes(1)
  })
})
