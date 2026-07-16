// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDetail, MapObject, MapPlant } from '../../../types'
import type { PlantHitCandidate } from '../../../utils/plantHitTesting'
import MapView from '../MapView'
import PlantHitChooser from '../PlantHitChooser'
import { chooserLayout, chooserOptions, placeChooserPopover } from '../plantHitChooserModel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mapViewMocks = vi.hoisted(() => ({
  dragPositions: {},
  dragging: null as { type: 'plant'; id: number } | null,
  handlePlantPointerDown: vi.fn(),
  handleItemSelect: vi.fn(),
  handleMapClick: vi.fn(),
  isMobile: false,
  pinchHandler: null as ((event: Record<string, unknown>) => unknown) | null,
}))

vi.mock('@use-gesture/react', () => ({
  usePinch: (handler: (event: Record<string, unknown>) => unknown) => {
    mapViewMocks.pinchHandler = handler
  },
}))
vi.mock('../../../hooks/useContainerSize', () => ({
  useContainerSize: () => ({ ref: { current: null }, width: 200, height: 200 }),
}))
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => mapViewMocks.isMobile }))
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
    dragging: mapViewMocks.dragging,
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
    handlePlantPointerDown: mapViewMocks.handlePlantPointerDown,
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

function pointerDown(pointerType: string, x: number, y: number): MouseEvent {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    isPrimary: { value: true },
  })
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

  it('clamps a desktop popover inside the right and top viewport edges', () => {
    expect(placeChooserPopover(
      { x: 390, y: 2 },
      { width: 272, height: 180 },
      { width: 400, height: 300 },
    )).toEqual({ left: 120, top: 14 })
  })

  it('places a bottom-edge desktop popover above its pointer', () => {
    expect(placeChooserPopover(
      { x: 100, y: 290 },
      { width: 272, height: 180 },
      { width: 400, height: 300 },
    )).toEqual({ left: 112, top: 98 })
  })
})

describe('PlantHitChooser', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    mapViewMocks.handleItemSelect.mockReset()
    mapViewMocks.handleMapClick.mockReset()
    mapViewMocks.handlePlantPointerDown.mockReset()
    mapViewMocks.dragging = null
    mapViewMocks.isMobile = false
    mapViewMocks.pinchHandler = null
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({}) }),
    })
    Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y } },
      }),
    })
    Object.defineProperty(SVGSVGElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200 }),
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
    const trigger = document.createElement('button')
    document.body.insertBefore(trigger, host)
    trigger.focus()

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
    expect(document.activeElement).toBe(trigger)

    const backdrop = host.querySelector('[data-plant-hit-chooser-backdrop]')
    expect(backdrop).not.toBeNull()
    host.querySelector<HTMLButtonElement>('[data-plant-hit-option]')!.focus()
    await act(async () => {
      backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('keeps forward and backward Tab focus inside the modal chooser', async () => {
    await act(async () => {
      root!.render(createElement(PlantHitChooser, {
        candidates,
        point: { x: 100, y: 120 },
        isMobile: true,
        onChoose: vi.fn(),
        onClose: vi.fn(),
      }))
    })

    const dialog = host.querySelector('[role="dialog"]')!
    const focusable = dialog.querySelectorAll<HTMLButtonElement>('button')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    last.focus()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(document.activeElement).toBe(first)

    first.focus()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    })
    expect(document.activeElement).toBe(last)
  })

  it('restores focus for close, selection, and unmount and isolates modal background', async () => {
    const trigger = document.createElement('button')
    document.body.insertBefore(trigger, host)
    trigger.focus()
    const onChoose = vi.fn()

    await act(async () => {
      root!.render(createElement(PlantHitChooser, {
        candidates,
        point: { x: 100, y: 120 },
        isMobile: true,
        onChoose,
        onClose: vi.fn(),
      }))
    })
    expect(trigger.inert).toBe(true)

    const close = host.querySelector<HTMLButtonElement>('[aria-label="Close chooser"]')!
    close.focus()
    await act(async () => close.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(document.activeElement).toBe(trigger)

    const option = host.querySelector<HTMLButtonElement>('[data-plant-hit-option]')!
    option.focus()
    await act(async () => option.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onChoose).toHaveBeenCalledWith(candidates[0])
    expect(document.activeElement).toBe(trigger)

    option.focus()
    await act(async () => {
      root?.unmount()
      root = null
    })
    expect(trigger.inert).toBe(false)
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('keeps long desktop and mobile option lists inside a scrollable viewport-safe panel', async () => {
    const manyCandidates = Array.from({ length: 20 }, (_, index) => (
      candidate(`plant-${index + 1}`, 'plant', `Plant ${index + 1}`)
    ))
    await act(async () => {
      root!.render(createElement(PlantHitChooser, {
        candidates: manyCandidates,
        point: { x: 100, y: 120 },
        isMobile: true,
        onChoose: vi.fn(),
        onClose: vi.fn(),
      }))
    })

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    const optionRegion = host.querySelector<HTMLElement>('[data-plant-hit-options]')
    expect(dialog.style.maxHeight).toContain('100dvh')
    expect(dialog.style.maxHeight).toContain('safe-area-inset-top')
    expect(optionRegion?.className).toContain('overflow-y-auto')
    expect(optionRegion?.className).toContain('min-h-0')

    await act(async () => {
      root!.render(createElement(PlantHitChooser, {
        candidates: manyCandidates,
        point: { x: 390, y: 290 },
        isMobile: false,
        onChoose: vi.fn(),
        onClose: vi.fn(),
      }))
    })
    expect(host.querySelector<HTMLElement>('[role="dialog"]')!.style.maxHeight).toBe(
      'calc(100dvh - 16px)',
    )
    expect(host.querySelector<HTMLElement>('[data-plant-hit-options]')?.className).toContain(
      'overflow-y-auto',
    )
  })
})

describe('MapView plant hit chooser and hover', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    mapViewMocks.handleItemSelect.mockReset()
    mapViewMocks.handleMapClick.mockReset()
    mapViewMocks.dragging = null
    mapViewMocks.isMobile = false
    mapViewMocks.pinchHandler = null
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({}) }),
    })
    Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y } },
      }),
    })
    Object.defineProperty(SVGSVGElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200 }),
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

  it('previews only a clear mouse winner and never keeps touch or pen hover', async () => {
    const clearPlant = mapPlant(11, 40, 50)
    await act(async () => {
      root!.render(createElement(MapView, { map, plants: [clearPlant], objects: [] }))
    })
    const mapTarget = host.firstElementChild!

    await act(async () => {
      mapTarget.dispatchEvent(pointerMove('mouse', 40, 50))
    })
    expect(host.querySelector('[data-plant-hit-hover="plant-11"]')).not.toBeNull()

    for (const pointerType of ['touch', 'pen']) {
      await act(async () => {
        mapTarget.dispatchEvent(pointerMove('mouse', 40, 50))
        mapTarget.dispatchEvent(pointerMove(pointerType, 40, 50))
      })
      expect(host.querySelector('[data-plant-hit-hover]')).toBeNull()
    }
    expect(mapViewMocks.handleItemSelect).not.toHaveBeenCalled()
  })

  it('does not preview an ambiguous mouse resolver result', async () => {
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [mapPlant(31, 70, 70), mapPlant(32, 70, 70)],
        objects: [],
      }))
    })
    await act(async () => {
      host.firstElementChild!.dispatchEvent(pointerMove('mouse', 70, 70))
    })
    expect(host.querySelector('[data-plant-hit-hover]')).toBeNull()
  })

  it.each(['touch', 'pen'])('opens an ambiguous %s click as a modal mobile sheet', async (pointerType) => {
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [mapPlant(41, 90, 90), mapPlant(42, 90, 90)],
        objects: [],
      }))
    })
    const mapTarget = host.firstElementChild!
    await act(async () => {
      mapTarget.dispatchEvent(pointerDown(pointerType, 90, 90))
      mapTarget.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 90,
        clientY: 90,
        detail: 1,
      }))
    })
    expect(host.querySelector('[data-plant-hit-chooser-backdrop]')).not.toBeNull()
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
  })

  it('dismisses the mobile backdrop in move mode without dragging an underlying plant', async () => {
    const overlappingPlants = [mapPlant(43, 100, 100), mapPlant(44, 100, 100)]
    const objects: MapObject[] = []
    mapViewMocks.isMobile = true
    await act(async () => {
      root!.render(createElement(MapView, { map, plants: overlappingPlants, objects }))
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
    expect(host.querySelector('[data-plant-hit-chooser-backdrop]')).not.toBeNull()

    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: overlappingPlants,
        objects,
        moveMode: true,
      }))
    })
    const backdrop = host.querySelector<HTMLElement>('[data-plant-hit-chooser-backdrop]')
    expect(backdrop).not.toBeNull()
    await act(async () => {
      backdrop!.dispatchEvent(pointerDown('touch', 100, 100))
      backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mapViewMocks.handlePlantPointerDown).not.toHaveBeenCalled()
    expect(host.querySelector('[data-plant-hit-chooser-backdrop]')).toBeNull()
  })

  it('suppresses mouse hover during active drag and placement', async () => {
    const clearPlant = mapPlant(51, 40, 50)
    mapViewMocks.dragging = { type: 'plant', id: 51 }
    await act(async () => {
      root!.render(createElement(MapView, { map, plants: [clearPlant], objects: [] }))
    })
    await act(async () => host.firstElementChild!.dispatchEvent(pointerMove('mouse', 40, 50)))
    expect(host.querySelector('[data-plant-hit-hover]')).toBeNull()

    mapViewMocks.dragging = null
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [clearPlant],
        objects: [],
        placingPlantId: 51,
      }))
    })
    await act(async () => host.firstElementChild!.dispatchEvent(pointerMove('mouse', 40, 50)))
    expect(host.querySelector('[data-plant-hit-hover]')).toBeNull()
  })

  it('suppresses mouse hover during active pan and pinch', async () => {
    const clearPlant = mapPlant(61, 40, 50)
    await act(async () => {
      root!.render(createElement(MapView, { map, plants: [clearPlant], objects: [] }))
    })
    const mapTarget = host.firstElementChild!
    await act(async () => {
      mapTarget.dispatchEvent(pointerDown('mouse', 10, 10))
      mapTarget.dispatchEvent(pointerMove('mouse', 40, 50))
    })
    expect(host.querySelector('[data-plant-hit-hover]')).toBeNull()
    await act(async () => document.dispatchEvent(pointerMove('mouse', 20, 20)))
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))

    expect(mapViewMocks.pinchHandler).not.toBeNull()
    await act(async () => {
      mapViewMocks.pinchHandler!({
        origin: [40, 50],
        offset: [1],
        memo: null,
        first: true,
        last: false,
      })
      mapTarget.dispatchEvent(pointerMove('mouse', 40, 50))
    })
    expect(host.querySelector('[data-plant-hit-hover]')).toBeNull()
  })

  it('suppresses mouse hover while an ambiguity chooser is open', async () => {
    await act(async () => {
      root!.render(createElement(MapView, {
        map,
        plants: [mapPlant(71, 100, 100), mapPlant(72, 100, 100), mapPlant(73, 40, 50)],
        objects: [],
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
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => mapTarget.dispatchEvent(pointerMove('mouse', 40, 50)))
    expect(host.querySelector('[data-plant-hit-hover]')).toBeNull()
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
