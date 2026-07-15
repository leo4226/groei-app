// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDetail, MapObject, MapPlant } from '../../../types'
import MapView from '../MapView'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  handleItemSelect: vi.fn(),
  handleMapClick: vi.fn(),
}))

vi.mock('@use-gesture/react', () => ({ usePinch: vi.fn() }))
vi.mock('../../../hooks/useContainerSize', () => ({
  useContainerSize: () => ({ ref: { current: null }, width: 200, height: 200 }),
}))
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../../hooks/useLandscapeMobile', () => ({ useLandscapeMobile: () => false }))
vi.mock('../../../context/LanguageContext', () => ({ useT: () => ({ locale: 'nl' }) }))
vi.mock('../../../hooks/useMapInteraction', () => ({
  useMapInteraction: () => ({
    selection: { selectedId: null, mode: 'idle' },
    dragging: null,
    dragPositions: {},
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
    handleItemSelect: mocks.handleItemSelect,
    handleMapClick: mocks.handleMapClick,
    handlePlantResizeDown: vi.fn(),
  }),
}))

function plant(id: number): MapPlant {
  return {
    id,
    name: `Plant ${id}`,
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: 0,
    map_y: 0,
    photo_path: null,
    container_id: 8,
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

function container(containedPlant: MapPlant): MapObject {
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
    map_x: 110,
    map_y: 100,
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

describe('MapView plant hit dispatch', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    mocks.handleItemSelect.mockReset()
    mocks.handleMapClick.mockReset()
    root = null
    host = document.createElement('div')
    document.body.appendChild(host)
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    })
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    host.remove()
  })

  it('routes a selected contained candidate to the supplied plant callback', async () => {
    const containedPlant = plant(81)
    const onPlantTap = vi.fn()
    root = createRoot(host)

    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [],
        objects: [container(containedPlant)],
        onPlantTap,
      }))
    })

    const clickTarget = host.firstElementChild
    expect(clickTarget).not.toBeNull()
    await act(async () => {
      clickTarget!.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 110,
        clientY: 100,
        detail: 1,
      }))
    })

    expect(onPlantTap).toHaveBeenCalledWith(containedPlant)
    expect(mocks.handleItemSelect).not.toHaveBeenCalled()
  })
})
