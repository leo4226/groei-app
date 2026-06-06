import type { Plant } from '../../types'

/** Active plants not yet placed on any map. */
export function selectUnplacedPlants(plants: Plant[]): Plant[] {
  return plants.filter((p) => p.is_active && p.map_id == null)
}

/** Centre of an SVG viewbox string ("minX minY width height"), rounded to
 *  integers. Returns {x:0,y:0} for malformed input. */
export function viewboxCenter(viewbox: string): { x: number; y: number } {
  const parts = viewbox.trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return { x: 0, y: 0 }
  }
  const [x0, y0, w, h] = parts
  return { x: Math.round(x0 + w / 2), y: Math.round(y0 + h / 2) }
}
