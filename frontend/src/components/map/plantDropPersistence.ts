import type { GroundZone, MapObject } from '../../types'
import { resolveDropTarget } from '../../utils/svgCoords'

export type DragPosition = { x: number; y: number }

export type PlantDropPersistenceAction =
  | { type: 'container'; containerId: number }
  | { type: 'ground-zone'; groundZoneId: string; map_x: number; map_y: number }
  | { type: 'map-position'; mapId: number; map_x: number; map_y: number; ground_zone_id: null }

export function roundMapCoordinate(value: number): number {
  return Math.round(value * 10) / 10
}

export function resolvePlantDropPersistenceAction({
  finalPosition,
  mapId,
  objects,
  soilGroundZones,
}: {
  finalPosition: DragPosition
  mapId: number
  objects: MapObject[]
  soilGroundZones: GroundZone[]
}): PlantDropPersistenceAction {
  const finalTarget = resolveDropTarget(finalPosition.x, finalPosition.y, objects, soilGroundZones)

  if (finalTarget.type === 'container') {
    return { type: 'container', containerId: finalTarget.target.id }
  }

  const rounded = {
    map_x: roundMapCoordinate(finalPosition.x),
    map_y: roundMapCoordinate(finalPosition.y),
  }

  if (finalTarget.type === 'zone') {
    return {
      type: 'ground-zone',
      groundZoneId: finalTarget.target.id,
      ...rounded,
    }
  }

  return {
    type: 'map-position',
    mapId,
    ...rounded,
    ground_zone_id: null,
  }
}
