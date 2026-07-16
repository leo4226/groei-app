// @vitest-environment jsdom

import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapObject, MapPlant } from '../../types'
import {
  useMapInteraction,
  type MapInteraction,
} from '../useMapInteraction'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  plantSetPosition: vi.fn(),
  objectSetPosition: vi.fn(),
  dispatch: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  plants: {
    setPosition: mocks.plantSetPosition,
    setContainer: vi.fn(),
    setGroundZone: vi.fn(),
    setRadius: vi.fn(),
  },
  objects: { setPosition: mocks.objectSetPosition },
}))

vi.mock('../useMapSelection', () => ({
  useMapSelection: () => ({
    selection: {
      selectedId: null,
      selectedType: null,
      mode: 'idle',
      resizeHandle: null,
    },
    dispatch: mocks.dispatch,
  }),
}))

vi.mock('../../utils/svgCoords', () => ({
  screenToSVG: (_svg: SVGSVGElement, x: number, y: number) => ({ x, y }),
  resolveDropTarget: () => ({ type: 'none' }),
}))

const plant: MapPlant = {
  id: 7,
  name: 'Plant 7',
  species: null,
  species_common_name_nl: null,
  species_common_name_en: null,
  map_x: 10,
  map_y: 10,
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

const container: MapObject = {
  id: 9,
  name: 'Pot',
  object_type: 'planter',
  shape: 'circle',
  diameter_cm: 40,
  width_cm: null,
  depth_cm: null,
  material: null,
  color: null,
  map_id: 1,
  map_x: 20,
  map_y: 20,
  rotation: 0,
  notes: null,
  is_active: true,
  created_at: null,
  updated_at: null,
  contained_plants: [],
  category: 'container',
  label: null,
  preset: null,
}

let interaction: MapInteraction | null = null

function Harness() {
  const svgRef = useRef<SVGSVGElement>(null) as React.RefObject<SVGSVGElement>
  interaction = useMapInteraction({
    svgRef,
    plants: [plant],
    objects: [container],
    soilGroundZones: [],
    mapId: 1,
    isHouseMap: false,
    canvasData: null,
    isMobile: false,
    moveMode: true,
  })
  return createElement('svg', { ref: svgRef })
}

function reactPointer(
  pointerId: number,
  x: number,
  y: number,
  currentTarget: Element,
): React.PointerEvent {
  return {
    pointerId,
    pointerType: 'touch',
    isPrimary: pointerId === 11,
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget,
    target: currentTarget,
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent
}

function documentPointer(
  type: 'pointermove' | 'pointerup' | 'pointercancel',
  pointerId: number,
  x: number,
  y: number,
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    isPrimary: { value: pointerId === 11 },
  })
  return event
}

async function dispatchDocumentPointer(event: MouseEvent): Promise<void> {
  await act(async () => {
    document.dispatchEvent(event)
    await Promise.resolve()
  })
}

describe('useMapInteraction drag pointer ownership', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    mocks.plantSetPosition.mockReset().mockResolvedValue({ icon_key: null, container_id: null })
    mocks.objectSetPosition.mockReset().mockResolvedValue(undefined)
    mocks.dispatch.mockReset()
    interaction = null
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => root.render(createElement(Harness)))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('keeps a plant drag owned by its initiating pointer', async () => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.setAttribute('transform', 'translate(10, 10)')
    await act(async () => {
      interaction!.handlePlantPointerDown(reactPointer(11, 10, 10, group), plant, group)
    })

    await dispatchDocumentPointer(documentPointer('pointermove', 22, 120, 130))
    await dispatchDocumentPointer(documentPointer('pointerup', 22, 120, 130))

    expect(group.getAttribute('transform')).toBe('translate(10, 10)')
    expect(interaction!.dragging).toEqual({ type: 'plant', id: 7 })
    expect(mocks.plantSetPosition).not.toHaveBeenCalled()

    await dispatchDocumentPointer(documentPointer('pointermove', 11, 50, 60))
    await dispatchDocumentPointer(documentPointer('pointerup', 11, 50, 60))

    expect(group.getAttribute('transform')).toBe('translate(50, 60)')
    expect(mocks.plantSetPosition).toHaveBeenCalledTimes(1)
    expect(interaction!.dragging).toBeNull()
  })

  it('keeps a container drag owned by its initiating pointer through cancel noise', async () => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.setAttribute('transform', 'translate(20, 20)')
    await act(async () => {
      interaction!.handleContainerPointerDown(reactPointer(11, 20, 20, group), container)
    })

    await dispatchDocumentPointer(documentPointer('pointermove', 22, 140, 150))
    await dispatchDocumentPointer(documentPointer('pointercancel', 22, 140, 150))

    expect(group.getAttribute('transform')).toBe('translate(20, 20)')
    expect(interaction!.dragging).toEqual({ type: 'container', id: 9 })
    expect(mocks.objectSetPosition).not.toHaveBeenCalled()

    await dispatchDocumentPointer(documentPointer('pointermove', 11, 70, 80))
    await dispatchDocumentPointer(documentPointer('pointerup', 11, 70, 80))

    expect(group.getAttribute('transform')).toBe('translate(70, 80)')
    expect(mocks.objectSetPosition).toHaveBeenCalledTimes(1)
    expect(interaction!.dragging).toBeNull()
  })
})
