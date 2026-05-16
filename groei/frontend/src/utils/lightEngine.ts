import { getSunPosition } from './sunCalc'
import { computeShadows } from './shadowGeometry'
import { computeHeatmap } from './heatmapCalc'
import type { SunPosition } from './sunCalc'
import type { ShadowPolygon } from './shadowGeometry'
import type { HeatmapCell, GardenBounds } from './heatmapCalc'
import type { ShadowCaster } from './gardenStructures'

export interface MapLightConfig {
  lat: number
  lon: number
  bearing: number
  shadowCasters: ShadowCaster[]
  gardenBounds: GardenBounds
  gardenPerimeter: [number, number][]
}

export interface LightEngine {
  getSunPosition(month: number, hour: number): SunPosition | null
  getShadows(sunPosition: SunPosition): ShadowPolygon[]
  computeHeatmap(month: number): Promise<HeatmapCell[]>
  getSunHoursAtPosition(x: number, y: number, month: number): number | null
}

export function createLightEngine(config: MapLightConfig): LightEngine {
  const { lat, lon, bearing, shadowCasters, gardenBounds, gardenPerimeter } = config
  const cache = new Map<number, HeatmapCell[]>()

  function findCell(cells: HeatmapCell[], x: number, y: number): HeatmapCell | undefined {
    return cells.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h)
  }

  return {
    getSunPosition(month, hour) {
      const h = Math.floor(hour)
      const m = Math.round((hour - h) * 60)
      const date = new Date(new Date().getFullYear(), month - 1, 15, h, m, 0, 0)
      return getSunPosition(date, lat, lon)
    },

    getShadows(sunPosition) {
      return computeShadows(sunPosition, shadowCasters, bearing)
    },

    computeHeatmap(month) {
      if (cache.has(month)) return Promise.resolve(cache.get(month)!)
      return new Promise(resolve =>
        setTimeout(() => {
          const cells = computeHeatmap(month, 0.15, 10, lat, lon, bearing, shadowCasters, gardenBounds, gardenPerimeter)
          cache.set(month, cells)
          resolve(cells)
        }, 0)
      )
    },

    getSunHoursAtPosition(x, y, month) {
      const cells = cache.get(month)
      if (!cells) return null
      return findCell(cells, x, y)?.sunHours ?? null
    },
  }
}
