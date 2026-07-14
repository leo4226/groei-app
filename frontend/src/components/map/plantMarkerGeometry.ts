import type { MapObject, MapPlant } from '../../types'
import { PX_PER_CM } from '../../utils/gardenStructures'

type RadiusPlant = Pick<MapPlant, 'display_radius_cm' | 'is_locked'>
type ShapeObject = Pick<MapObject, 'shape' | 'diameter_cm' | 'width_cm' | 'depth_cm'>

export function topLevelPlantIconRadius(plant: RadiusPlant): number {
  const base = plant.display_radius_cm ? plant.display_radius_cm * PX_PER_CM : 14
  const radius = base * 0.85
  return plant.is_locked ? Math.min(radius, 28) : radius
}

export function objectShapeBound(object: ShapeObject): number {
  switch (object.shape) {
    case 'circle':
      return ((object.diameter_cm || 30) * PX_PER_CM) / 2
    case 'square':
      return ((object.width_cm || 30) * PX_PER_CM) / 2
    case 'rectangle':
      return ((object.depth_cm || 40) * PX_PER_CM) / 2
  }
}

export function containedPlantLayout(count: number, bound: number, shape: MapObject['shape']): Array<{ x: number; y: number; radius: number }> {
  const radius = count === 1
    ? bound * (shape === 'circle' ? 1 : 0.65)
    : bound / (count <= 2 ? 2.4 : count <= 4 ? 3.2 : 4.2)

  return containedPlantPositions(count, bound * (count === 1 ? 0 : 0.55))
    .map((position) => ({ ...position, radius }))
}

function containedPlantPositions(count: number, spread: number): Array<{ x: number; y: number }> {
  if (count === 1) return [{ x: 0, y: 0 }]
  if (count === 2) return [{ x: -spread * 0.5, y: 0 }, { x: spread * 0.5, y: 0 }]
  if (count === 3) return [{ x: -spread * 0.45, y: -spread * 0.3 }, { x: spread * 0.45, y: -spread * 0.3 }, { x: 0, y: spread * 0.4 }]

  const positions: Array<{ x: number; y: number }> = []
  const cols = 2
  const gap = spread * 0.7
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.push({ x: (col - 0.5) * gap, y: (row - (Math.ceil(count / cols) - 1) / 2) * gap })
  }
  return positions
}
