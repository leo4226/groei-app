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
  handlePlantResizeDown: vi.fn(),
  setRemoveTarget: vi.fn(),
  removeTarget: null as { type: 'plant'; id: number; x: number; y: number } | null,
  selectedPlant: null as MapPlant | null,
  selectedPlantPos: null as { x: number; y: number } | null,
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
    selection: {
      selectedId: mocks.selectedPlant ? `plant-${mocks.selectedPlant.id}` : null,
      mode: 'idle',
    },
    dragging: null,
    dragPositions: {},
    dragKey: null,
    hoveredContainerId: null,
    hoveredZoneName: null,
    removeTarget: mocks.removeTarget,
    setRemoveTarget: mocks.setRemoveTarget,
    plantResizeRadius: null,
    isResizing: false,
    activeResizeHandle: null,
    selectedPlant: mocks.selectedPlant,
    selectedPlantPos: mocks.selectedPlantPos,
    handlePlantPointerDown: mocks.handlePlantPointerDown,
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
    handleItemSelect: vi.fn(),
    handleMapClick: vi.fn(),
    handlePlantResizeDown: mocks.handlePlantResizeDown,
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
    measured_sun_hours: null,
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
    mocks.handlePlantResizeDown.mockReset()
    mocks.setRemoveTarget.mockReset()
    mocks.removeTarget = null
    mocks.selectedPlant = null
    mocks.selectedPlantPos = null
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

  it('preserves native container pointer propagation on empty space for pinch recognition', async () => {
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [],
        objects: [],
        moveMode: true,
      }))
    })

    const container = host.firstElementChild!
    const nativePointerDown = vi.fn()
    container.addEventListener('pointerdown', nativePointerDown)
    await act(async () => {
      container.dispatchEvent(pointerDown(8, 0))
    })

    expect(mocks.handlePlantPointerDown).not.toHaveBeenCalled()
    expect(nativePointerDown).toHaveBeenCalledTimes(1)
  })

  it('does not let the marker bubble handler overwrite the centrally resolved plant', async () => {
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [plant(2, false, 8, 0), plant(1, false, 30, 0)],
        objects: [],
        moveMode: true,
      }))
    })

    const domTopmostHitCircle = host.querySelector<SVGCircleElement>(
      '[data-map-plant-id="1"] > circle[fill="transparent"]',
    )
    expect(domTopmostHitCircle).not.toBeNull()
    await act(async () => {
      domTopmostHitCircle!.dispatchEvent(pointerDown(8, 0))
    })

    expect(mocks.handlePlantPointerDown).toHaveBeenCalledTimes(1)
    expect(mocks.handlePlantPointerDown.mock.calls[0][1].id).toBe(2)
  })

  it('keeps browse resize pointerdown but hides the overlay after entering move mode', async () => {
    const selected = plant(5, false, 100, 100)
    const plants = [selected]
    mocks.selectedPlant = selected
    mocks.selectedPlantPos = { x: 100, y: 100 }
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, { map, plants, objects: [] }))
    })

    const browseHandle = host.querySelector<SVGGElement>('g[style*="ns-resize"]')
    expect(browseHandle).not.toBeNull()
    await act(async () => {
      browseHandle!.dispatchEvent(pointerDown(100, 86.2))
    })
    expect(mocks.handlePlantResizeDown).toHaveBeenCalledTimes(1)

    await act(async () => {
      root!.render(createElement(MapView, { map, plants, objects: [], moveMode: true }))
    })

    expect(host.querySelector('g[style*="ns-resize"]')).toBeNull()
    expect(host.querySelector('g[style*="ew-resize"]')).toBeNull()

    await act(async () => {
      root!.render(createElement(MapView, { map, plants, objects: [], movePlantId: 5 }))
    })
    expect(host.querySelector('g[style*="ns-resize"]')).toBeNull()
    expect(host.querySelector('g[style*="ew-resize"]')).toBeNull()
  })

  it('lets the browse Remove control own pointerdown and click', async () => {
    const onRemoveItem = vi.fn()
    const plants = [plant(5, false, 100, 100)]
    mocks.removeTarget = { type: 'plant', id: 5, x: 100, y: 100 }
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, { map, plants, objects: [], onRemoveItem }))
    })

    const removeControl = host.querySelector<SVGRectElement>('rect[fill="#ea0706"]')
    const svg = host.querySelector<SVGSVGElement>('svg')
    expect(removeControl).not.toBeNull()
    expect(svg).not.toBeNull()
    vi.spyOn(svg!, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 200,
    } as DOMRect)
    const browseViewBox = svg!.getAttribute('viewBox')
    await act(async () => {
      removeControl!.dispatchEvent(pointerDown(100, 84))
      document.dispatchEvent(new MouseEvent('pointermove', {
        bubbles: true,
        clientX: 120,
        clientY: 84,
      }))
      document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
      removeControl!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(svg!.getAttribute('viewBox')).toBe(browseViewBox)
    expect(mocks.handlePlantPointerDown).not.toHaveBeenCalled()
    expect(onRemoveItem).toHaveBeenCalledOnce()
    expect(onRemoveItem).toHaveBeenCalledWith('plant', 5)
    expect(mocks.setRemoveTarget).toHaveBeenCalledWith(null)
  })

  it.each([
    ['global', { moveMode: true }],
    ['targeted', { movePlantId: 5 }],
  ])('hides and clears a browse Remove target after entering %s move mode', async (_mode, modeProps) => {
    const plants = [plant(5, false, 100, 100)]
    mocks.removeTarget = { type: 'plant', id: 5, x: 100, y: 100 }
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(MapView, { map, plants, objects: [] }))
    })
    expect(host.querySelector('rect[fill="#ea0706"]')).not.toBeNull()

    await act(async () => {
      root!.render(createElement(MapView, { map, plants, objects: [], ...modeProps }))
    })

    expect(host.querySelector('rect[fill="#ea0706"]')).toBeNull()
    expect(mocks.setRemoveTarget).toHaveBeenCalledWith(null)
  })
})
