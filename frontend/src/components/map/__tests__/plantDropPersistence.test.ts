import { describe, expect, it } from 'vitest'
import { resolvePlantDropPersistenceAction } from '../plantDropPersistence'
import type { GroundZone, MapObject } from '../../../types'

const baseContainer: MapObject = {
  id: 7,
  name: 'Terracotta pot',
  object_type: 'pot',
  shape: 'circle',
  diameter_cm: 60,
  width_cm: null,
  depth_cm: null,
  material: 'terracotta',
  color: '#c75f2b',
  map_id: 3,
  map_x: 80,
  map_y: 80,
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

const soilZone: GroundZone = {
  id: 'bed-1',
  map_id: 3,
  name: 'Border',
  zone_type: 'soil',
  polygon: JSON.stringify([[100, 100], [220, 100], [220, 220], [100, 220]]),
  soil_note: null,
}

describe('resolvePlantDropPersistenceAction', () => {
  it('uses the final dropped coordinate to persist an in-ground placement', () => {
    const action = resolvePlantDropPersistenceAction({
      finalPosition: { x: 150.04, y: 160.06 },
      mapId: 3,
      objects: [baseContainer],
      soilGroundZones: [soilZone],
    })

    expect(action).toEqual({
      type: 'ground-zone',
      groundZoneId: 'bed-1',
      map_x: 150,
      map_y: 160.1,
    })
  })

  it('prefers a container under the final coordinate over the underlying soil zone', () => {
    const action = resolvePlantDropPersistenceAction({
      finalPosition: { x: 80, y: 80 },
      mapId: 3,
      objects: [baseContainer],
      soilGroundZones: [
        {
          ...soilZone,
          polygon: JSON.stringify([[0, 0], [200, 0], [200, 200], [0, 200]]),
        },
      ],
    })

    expect(action).toEqual({ type: 'container', containerId: 7 })
  })

  it('persists a normal bare map position when the final coordinate is outside targets', () => {
    const action = resolvePlantDropPersistenceAction({
      finalPosition: { x: 301.26, y: 44.14 },
      mapId: 3,
      objects: [baseContainer],
      soilGroundZones: [soilZone],
    })

    expect(action).toEqual({
      type: 'map-position',
      mapId: 3,
      map_x: 301.3,
      map_y: 44.1,
      ground_zone_id: null,
    })
  })
})
