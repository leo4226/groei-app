import type { MapPlant, ShadowCaster } from '../types'

// Auto-shade from plant height (#648): at heatmap-build time, tall plants emit
// a soft circular shadow so shorter neighbours correctly read as shadier — no
// manual marking. Emitted at view time only; never persisted to canvas_data.

export const PLANT_SHADE_MIN_HEIGHT_CM = 120
const MAX_PLANT_CASTERS = 40
const PLANT_SHADE_OPACITY = 0.3

// Canopy radius as a fraction of plant height, by botanical growth form. Used
// only when phenology has no explicit max_spread_cm. Rough field estimates,
// pending validation against real gardens (see #648).
const CANOPY_RADIUS_FRACTION: Record<string, number> = {
  tree: 0.35,
  shrub: 0.5,
  grass: 0.22,
  herb: 0.28,
  flower: 0.25,
  climber: 0.3,
  perennial: 0.3,
}
const DEFAULT_CANOPY_FRACTION = 0.3

/** Canopy radius (cm): half the known spread, else a growth-form estimate from height. */
export function plantCanopyRadiusCm(
  plant: Pick<MapPlant, 'plant_type' | 'phenology'>,
  heightCm: number,
): number {
  const spread = plant.phenology?.max_spread_cm
  if (spread && spread > 0) return spread / 2
  const frac = (plant.plant_type && CANOPY_RADIUS_FRACTION[plant.plant_type]) ?? DEFAULT_CANOPY_FRACTION
  return Math.max(10, heightCm * frac)
}

export interface PlantShadeOptions {
  scalePxPerM: number
  minHeightCm?: number
  maxCasters?: number
}

/**
 * Soft circle shadow casters for tall plants. Plants with a manual measured-sun
 * override (#645) are skipped so the manual value always wins. Tallest plants
 * win when the count is capped (perf: N extra casters hit the SVF ray-march).
 */
export function derivePlantShadowCasters(plants: MapPlant[], opts: PlantShadeOptions): ShadowCaster[] {
  const minHeight = opts.minHeightCm ?? PLANT_SHADE_MIN_HEIGHT_CM
  const cap = opts.maxCasters ?? MAX_PLANT_CASTERS

  return plants
    .filter((p) => p.measured_sun_hours == null)          // #645 wins
    .filter((p) => p.map_x != null && p.map_y != null)
    .map((p) => ({ p, height: p.phenology?.max_height_cm ?? 0 }))
    .filter((x) => x.height > minHeight)
    .sort((a, b) => b.height - a.height)                  // tallest first, then cap
    .slice(0, cap)
    .map(({ p, height }): ShadowCaster => {
      const radiusCm = plantCanopyRadiusCm(p, height)
      const radiusPx = Math.max(6, Math.round((radiusCm / 100) * opts.scalePxPerM))
      return {
        id: `plant-shade-${p.id}`,
        label: p.name,
        type: 'circle',
        cx: Math.round(p.map_x as number),
        cy: Math.round(p.map_y as number),
        radius: radiusPx,
        heightCm: Math.round(height),
        opacity: PLANT_SHADE_OPACITY,
        excludeSelf: true,   // a plant must not shade its own cell
      }
    })
}
