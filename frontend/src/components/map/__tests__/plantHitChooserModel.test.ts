// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDetail, MapObject, MapPlant } from '../../../types'
import type { PlantHitCandidate } from '../../../utils/plantHitTesting'
import MapView from '../MapView'
import PlantHitChooser from '../PlantHitChooser'
import { chooserLayout, chooserOptions } from '../plantHitChooserModel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mapViewMocks = vi.hoisted(() => ({
  dragPositions: {},
  handleItemSelect: vi.fn(),
  handleMapClick: vi.fn(),
}))

vi.mock('@use-gesture/react', () => ({ usePinch: vi.fn() }))
vi.mock('../../../hooks/useContainerSize', () => ({
  useContainerSize: () => ({ ref: { current: null }, width: 200, height: 200 }),
}))
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../../hooks/useLandscapeMobile', () => ({ useLandscapeMobile: () => false }))
vi.mock('../../../context/LanguageContext', () => ({
  useT: () => ({
    locale: 'en',
    mapPage: {
      plantHitChooserTitle: 'Choose a plant',
      plantHitChooserClose: 'Close chooser',
    },
  }),
}))
vi.mock('../../../hooks/useMapInteraction', () => ({
  useMapInteraction: () => ({
    selection: { selectedId: null, mode: 'idle' },
    dragging: null,
    dragPositions: mapViewMocks.dragPositions,
    dragKey: null,
    hoveredContainerId: null,
    hoveredZoneName: null,
    removeTarget: null,
    setRemoveTarget: vi.fn(),
    plantResizeRadius: null,
    isResizing: false,
    activeResizeHandle: null,
    selectedPlant: null,
    selectedPlantPos: null,
    handlePlantPointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
    handleItemSelect: mapViewMocks.handleItemSelect,
    handleMapClick: mapViewMocks.handleMapClick,
    handlePlantResizeDown: vi.fn(),
  }),
}))

function candidate(
  key: string,
  kind: PlantHitCandidate['kind'],
  label: string,
  iconKey: string | null = null,
): PlantHitCandidate {
  return {
    key,
    kind,
    x: 10,
    y: 20,
    radius: 12,
    movable: kind === 'plant',
    plantId: 1,
    label,
    iconKey,
    payload: {},
  } as PlantHitCandidate
}

const candidates = [
  candidate('plant-1', 'plant', 'Rose', 'rose'),
  candidate('contained-2-in-8', 'contained', 'Mint'),
]

function mapPlant(id: number, x: number, y: number): MapPlant {
  return {
    id,
    name: `Plant ${id}`,
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: x,
    map_y: y,
    photo_path: null,
    container_id: null,
    ground_zone_id: null,
    display_radius_cm: null,
    care_status: 'good',
    temp_status: 'comfortable',
    most_urgent: null,
    sun_requirement: null,
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

function mapContainer(containedPlant: MapPlant, x: number, y: number): MapObject {
  return {
    id: 8,
    name: 'Pot',
    object_type: 'planter',
    shape: 'circle',
    diameter_cm: 100,
    width_cm: null,
    depth_cm: null,
    material: 'terracotta',
    color: null,
    map_id: 1,
    map_x: x,
    map_y: y,
    rotation: 0,
    notes: null,
    is_active: true,
    created_at: null,
    updated_at: null,
    contained_plants: [containedPlant],
    category: 'container',
    label: null,
    preset: null,
  }
}

const map = {
  id: 1,
  name: 'Test map',
  map_type: 'outdoor',
  viewbox: '0 0 200 200',
  svg_file: 'test.svg',
  canvas_data: null,
  bearing: 0,
} as MapDetail

function pointerMove(pointerType: string, x: number, y: number): MouseEvent {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  return event
}

describe('plant hit chooser model', () => {
  it('uses a pointer-anchored popover on desktop and a sheet on mobile', () => {
    expect(chooserLayout(false)).toBe('popover')
    expect(chooserLayout(true)).toBe('sheet')
  })

  it('preserves candidate instance keys and exact candidate references', () => {
    const options = chooserOptions(candidates)

    expect(options.map((option) => option.key)).toEqual([
      'plant-1',
      'contained-2-in-8',
    ])
    expect(options[1].candidate).toBe(candidates[1])
  })
})

describe('PlantHitChooser', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    mapViewMocks.handleItemSelect.mockReset()
    mapViewMocks.handleMapClick.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    })
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    host.remove()
  })

  it('renders an accessible dialog and chooses the exact candidate instance', async () => {
    const onChoose = vi.fn()

    await act(async () => {
      root!.render(createElement(PlantHitChooser, {
        candidates,
        point: { x: 100, y: 120 },
        isMobile: false,
        onChoose,
        onClose: vi.fn(),
      }))
    })

    const dialog = host.querySelector('[role="dialog"]')
    const options = host.querySelectorAll<HTMLButtonElement>('[data-plant-hit-option]')
    expect(dialog?.getAttribute('aria-label')).toBe('Choose a plant')
    expect(options[0]).toBe(document.activeElement)

    const containedOption = host.querySelector<HTMLButtonElement>(
      '[data-plant-hit-option="contained-2-in-8"]',
    )
    expect(containedOption).not.toBeNull()
    await act(async () => {
      containedOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChoose).toHaveBeenCalledWith(candidates[1])
  })

  it('closes on Escape and a mobile backdrop click', async () => {
    const onClose = vi.fn()

    await act(async () => {
      root!.render(createElement(PlantHitChooser, {
        candidates,
        point: { x: 100, y: 120 },
        isMobile: true,
        onChoose: vi.fn(),
        onClose,
      }))
    })

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = host.querySelector('[data-plant-hit-chooser-backdrop]')
    expect(backdrop).not.toBeNull()
    await act(async () => {
      backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('MapView plant hit chooser and hover', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    mapViewMocks.handleItemSelect.mockReset()
    mapViewMocks.handleMapClick.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    })
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    host.remove()
  })

  it('opens for an ambiguous hit and dispatches the exact contained instance', async () => {
    const topLevel = mapPlant(1, 100, 100)
    const contained = mapPlant(2, 100, 100)
    const onPlantTap = vi.fn()

    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [topLevel],
        objects: [mapContainer(contained, 100, 100)],
        onPlantTap,
      }))
    })
    const mapTarget = host.firstElementChild!
    await act(async () => {
      mapTarget.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
        detail: 1,
      }))
    })

    const options = host.querySelectorAll<HTMLButtonElement>('[data-plant-hit-option]')
    expect(options).toHaveLength(2)
    expect(mapViewMocks.handleMapClick).not.toHaveBeenCalled()

    const containedOption = host.querySelector<HTMLButtonElement>(
      '[data-plant-hit-option="contained-2-in-8"]',
    )
    expect(containedOption).not.toBeNull()
    await act(async () => {
      containedOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onPlantTap).toHaveBeenCalledWith(contained)
    expect(mapViewMocks.handleItemSelect).not.toHaveBeenCalled()
  })

  it('previews only a clear mouse winner and clears the preview for touch', async () => {
    const clearPlant = mapPlant(11, 40, 50)
    await act(async () => {
      root!.render(createElement(MapView, { map, plants: [clearPlant], objects: [] }))
    })
    const mapTarget = host.firstElementChild!

    await act(async () => {
      mapTarget.dispatchEvent(pointerMove('mouse', 40, 50))
    })
    expect(host.querySelector('[data-plant-hit-hover="plant-11"]')).not.toBeNull()

    await act(async () => {
      mapTarget.dispatchEvent(pointerMove('touch', 40, 50))
    })
    expect(host.querySelector('[data-plant-hit-hover]')).toBeNull()
    expect(mapViewMocks.handleItemSelect).not.toHaveBeenCalled()
  })

  it('clears an open chooser when its backing map data changes', async () => {
    const topLevel = mapPlant(21, 100, 100)
    const contained = mapPlant(22, 100, 100)
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [topLevel],
        objects: [mapContainer(contained, 100, 100)],
      }))
    })
    await act(async () => {
      host.firstElementChild!.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
        detail: 1,
      }))
    })
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()

    await act(async () => {
      root!.render(createElement(MapView, { map, plants: [], objects: [] }))
    })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })
})
