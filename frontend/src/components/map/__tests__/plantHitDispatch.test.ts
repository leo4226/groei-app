import { describe, expect, it, vi } from 'vitest'
import type { FixedPlant } from '../../../constants/fixedPlants'
import type { MapPlant, SecondaryMarker } from '../../../types'
import type { PlantHitCandidate } from '../../../utils/plantHitTesting'
import { dispatchPlantHit, type PlantHitDispatchHandlers } from '../plantHitDispatch'

function plant(id: number, isLocked = false): MapPlant {
  return {
    id,
    name: `Plant ${id}`,
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: 10,
    map_y: 20,
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

function handlers(): {
  handlers: PlantHitDispatchHandlers
  onPlantTap: ReturnType<typeof vi.fn>
  onSecondaryMarkerTap: ReturnType<typeof vi.fn>
  onFixedPlantTap: ReturnType<typeof vi.fn>
} {
  const onPlantTap = vi.fn()
  const onSecondaryMarkerTap = vi.fn()
  const onFixedPlantTap = vi.fn()
  return {
    handlers: { onPlantTap, onSecondaryMarkerTap, onFixedPlantTap },
    onPlantTap,
    onSecondaryMarkerTap,
    onFixedPlantTap,
  }
}

function expectOnlyCalled(
  spies: ReturnType<typeof handlers>,
  expected: 'onPlantTap' | 'onSecondaryMarkerTap' | 'onFixedPlantTap',
): void {
  expect(spies[expected]).toHaveBeenCalledTimes(1)
  for (const name of ['onPlantTap', 'onSecondaryMarkerTap', 'onFixedPlantTap'] as const) {
    if (name !== expected) expect(spies[name]).not.toHaveBeenCalled()
  }
}

describe('dispatchPlantHit', () => {
  it('dispatches an unlocked top-level plant through the normal plant handler', () => {
    const payload = plant(1)
    const candidate: PlantHitCandidate = {
      key: 'plant-1', kind: 'plant', x: 10, y: 20, radius: 14,
      movable: true, plantId: 1, label: payload.name, iconKey: null, payload,
    }
    const spies = handlers()

    dispatchPlantHit(candidate, spies.handlers)

    expect(spies.onPlantTap).toHaveBeenCalledWith(payload)
    expectOnlyCalled(spies, 'onPlantTap')
  })

  it('dispatches a locked top-level plant through the normal plant handler', () => {
    const payload = plant(2, true)
    const candidate: PlantHitCandidate = {
      key: 'plant-2', kind: 'plant', x: 10, y: 20, radius: 14,
      movable: false, plantId: 2, label: payload.name, iconKey: null, payload,
    }
    const spies = handlers()

    dispatchPlantHit(candidate, spies.handlers)

    expect(spies.onPlantTap).toHaveBeenCalledWith(payload)
    expectOnlyCalled(spies, 'onPlantTap')
  })

  it('dispatches a contained plant through the normal plant handler', () => {
    const payload = plant(3)
    const candidate: PlantHitCandidate = {
      key: 'contained-3-in-9', kind: 'contained', x: 15, y: 25, radius: 9,
      movable: false, plantId: 3, label: payload.name, iconKey: null, payload,
    }
    const spies = handlers()

    dispatchPlantHit(candidate, spies.handlers)

    expect(spies.onPlantTap).toHaveBeenCalledWith(payload)
    expectOnlyCalled(spies, 'onPlantTap')
  })

  it('dispatches a secondary marker through the secondary-marker handler', () => {
    const payload: SecondaryMarker = {
      id: 4,
      plant_id: 40,
      map_x: 30,
      map_y: 40,
      ground_zone_id: null,
      phase: null,
      name: 'Secondary 4',
      icon_key: null,
    }
    const candidate: PlantHitCandidate = {
      key: 'secondary-4', kind: 'secondary', x: 30, y: 40, radius: 9,
      movable: false, plantId: 40, label: payload.name, iconKey: null, payload,
    }
    const spies = handlers()

    dispatchPlantHit(candidate, spies.handlers)

    expect(spies.onSecondaryMarkerTap).toHaveBeenCalledWith(40)
    expectOnlyCalled(spies, 'onSecondaryMarkerTap')
  })

  it('dispatches a fixed plant through the fixed-plant handler', () => {
    const payload: FixedPlant = {
      id: 'oak',
      name: 'Oak',
      x: 50,
      y: 60,
      displayRadiusCm: 40,
      markerColor: '#345612',
    }
    const candidate: PlantHitCandidate = {
      key: 'fixed-oak', kind: 'fixed', x: 50, y: 60, radius: 18.4,
      movable: false, plantId: null, label: payload.name, iconKey: null, payload,
    }
    const spies = handlers()

    dispatchPlantHit(candidate, spies.handlers)

    expect(spies.onFixedPlantTap).toHaveBeenCalledWith(payload)
    expectOnlyCalled(spies, 'onFixedPlantTap')
  })
})
