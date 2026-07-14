// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDetail, MapPlant } from '../../../types'
import {
  resolvePlantHit,
  type PlantHitCandidate,
  type PlantPointerType,
} from '../../../utils/plantHitTesting'
import {
  filterMovablePlantHitCandidates,
  resolveMovablePlantHit,
} from '../plantMoveHitTarget'
import MapView from '../MapView'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  handlePlantPointerDown: vi.fn(),
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
    handlePlantPointerDown: mocks.handlePlantPointerDown,
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
    handleItemSelect: vi.fn(),
    handleMapClick: vi.fn(),
    handlePlantResizeDown: vi.fn(),
  }),
}))

function plant(id: number, isLocked = false, x = 0, y = 0): MapPlant {
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
    is_locked: isLocked,
    quantity: 1,
    top_alert: null,
    alerts: [],
    top_warning: null,
    warnings: [],
  }
}

function candidate(
  id: number,
  x: number,
  options: Partial<PlantHitCandidate> = {},
): PlantHitCandidate {
  const payload = plant(id, options.movable === false)
  return {
    key: `plant-${id}`,
    kind: 'plant',
    x,
    y: 0,
    radius: 20,
    movable: true,
    plantId: id,
    label: payload.name,
    iconKey: null,
    payload,
    ...options,
  } as PlantHitCandidate
}

function resolveAt(
  candidates: readonly PlantHitCandidate[],
  movePlantId: number | null = null,
  pointerType: PlantPointerType = 'mouse',
): PlantHitCandidate | null {
  const result = resolvePlantHit(
    { x: 0, y: 0 },
    filterMovablePlantHitCandidates(candidates, movePlantId),
    pointerType,
  )
  const resultCandidates = result.type === 'none'
    ? []
    : result.type === 'selected'
      ? [result.candidate]
      : result.candidates
  return resolveMovablePlantHit(resultCandidates, movePlantId)
}

describe('movable plant hit targeting', () => {
  it('moves the nearest overlapping top-level plant independent of candidate order', () => {
    const nearest = candidate(2, 0)
    const farther = candidate(1, 12)

    expect(resolveAt([farther, nearest])?.plantId).toBe(2)
    expect(resolveAt([nearest, farther])?.plantId).toBe(2)
  })

  it('skips a closer locked plant in favor of an eligible top-level plant', () => {
    const locked = candidate(1, 0, { movable: false })
    const movable = candidate(2, 10)

    expect(resolveAt([locked, movable])?.plantId).toBe(2)
  })

  it('skips a closer contained plant in favor of an eligible top-level plant', () => {
    const contained = candidate(1, 0, {
      key: 'contained-1-in-8',
      kind: 'contained',
      movable: false,
    })
    const movable = candidate(2, 10)

    expect(resolveAt([contained, movable])?.plantId).toBe(2)
  })

  it('never admits locked, contained, secondary, or fixed candidates', () => {
    const ineligible = [
      candidate(1, 0, { movable: false }),
      candidate(2, 0, { kind: 'contained', movable: false }),
      candidate(3, 0, { kind: 'secondary', movable: false }),
      candidate(4, 0, { kind: 'fixed', movable: false, plantId: null }),
    ]

    expect(filterMovablePlantHitCandidates(ineligible, null)).toEqual([])
    expect(resolveMovablePlantHit(ineligible, null)).toBeNull()
  })

  it('allows only the requested plant in targeted one-plant mode', () => {
    const other = candidate(1, 0)
    const target = candidate(2, 12)

    expect(resolveAt([other, target], 2)?.plantId).toBe(2)
    expect(resolveAt([other], 2)).toBeNull()
    expect(resolveMovablePlantHit([other], 2)).toBeNull()
  })
})

const map = {
  id: 1,
  name: 'Test map',
  map_type: 'outdoor',
  viewbox: '0 0 200 200',
  svg_file: 'test.svg',
  canvas_data: null,
  bearing: 0,
} as MapDetail

function pointerDown(x: number, y: number): MouseEvent {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperties(event, {
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  })
  return event
}

describe('MapView move pointer-down routing', () => {
  let host: HTMLDivElement
  let root: Root | null
  let screenMatrix: { a: number; b: number; c: number; d: number; e: number; f: number }

  beforeEach(() => {
    mocks.handlePlantPointerDown.mockReset()
    root = null
    host = document.createElement('div')
    document.body.appendChild(host)
    screenMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: () => screenMatrix,
    })
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    host.remove()
  })

  it.each([
    [[plant(1, false, 30, 0), plant(2, false, 8, 0)]],
    [[plant(2, false, 8, 0), plant(1, false, 30, 0)]],
  ])('starts the same nearest plant from the map boundary regardless of render order', async (plants) => {
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, { map, plants, objects: [], moveMode: true }))
    })

    await act(async () => {
      host.firstElementChild!.dispatchEvent(pointerDown(8, 0))
    })

    const draggedGroup = host.querySelector<SVGGElement>('[data-map-plant-id="2"]')
    expect(mocks.handlePlantPointerDown).toHaveBeenCalledTimes(1)
    expect(mocks.handlePlantPointerDown.mock.calls[0][1].id).toBe(2)
    expect(mocks.handlePlantPointerDown.mock.calls[0][2]).toBe(draggedGroup)
  })

  it('starts a projected hit from outside the marker DOM circle at low zoom', async () => {
    screenMatrix = { a: 0.1, b: 0, c: 0, d: 0.1, e: 0, f: 0 }
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [plant(2, false, 80, 0)],
        objects: [],
        moveMode: true,
      }))
    })

    // The draggable SVG circle projects to 3.2px here. Five CSS pixels from
    // centre is outside that DOM circle but inside the shared +6px mouse hit.
    await act(async () => {
      host.firstElementChild!.dispatchEvent(pointerDown(13, 0))
    })

    expect(mocks.handlePlantPointerDown).toHaveBeenCalledTimes(1)
    expect(mocks.handlePlantPointerDown.mock.calls[0][1].id).toBe(2)
  })

  it('does not let a nearer permission-denied plant replace the targeted plant', async () => {
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [plant(1, false, 0, 0), plant(2, false, 12, 0)],
        objects: [],
        movePlantId: 2,
      }))
    })

    await act(async () => {
      host.firstElementChild!.dispatchEvent(pointerDown(0, 0))
    })

    expect(mocks.handlePlantPointerDown).toHaveBeenCalledTimes(1)
    expect(mocks.handlePlantPointerDown.mock.calls[0][1].id).toBe(2)
  })

  it('does not start a plant drag through a descendant map control', async () => {
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [plant(2, false, 8, 0)],
        objects: [],
        moveMode: true,
      }))
    })

    const zoomButton = host.querySelector<HTMLButtonElement>('button[title="Zoom in"]')
    expect(zoomButton).not.toBeNull()
    await act(async () => {
      zoomButton!.dispatchEvent(pointerDown(8, 0))
    })

    expect(mocks.handlePlantPointerDown).not.toHaveBeenCalled()
  })
})
