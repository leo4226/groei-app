export const PX_PER_CM = 0.46
export const PX_PER_M = 46

/**
 * Compass bearing (degrees CW from north) of the SVG's "up" direction.
 *
 * Brick fence (long NNW side) is SVG-top in landscape orientation.
 * Calibrated from two suncalc.org data points (2026-04-25/26):
 *   1. At az=100.33° alt=24.94° the neighbours' building shadow just reaches the
 *      garden NW corner (x=54), clearing by 9:15. Requires θ≈347°.
 *   2. At az=212° alt≈40° the own building shadow covers the garden center.
 *      Both constraints satisfied only by θ≈347° (NNW), not θ≈34° (NNE).
 * House is WSW (~257°) of garden; back fence ENE (~77°); brick fence NNW (~347°).
 */
export const GARDEN_SVG_TOP_AZIMUTH = 347

/** Garden boundary in landscape SVG coordinates (for clipping shadows) */
export const GARDEN_CLIP = { x: 40, y: 157, width: 585, height: 285 }

export type ShadowCaster =
  | { id: string; label: string; type: 'rect'; x: number; y: number; width: number; height: number; heightCm: number; opacity?: number }
  | { id: string; label: string; type: 'circle'; cx: number; cy: number; radius: number; heightCm: number; opacity?: number }
  | { id: string; label: string; type: 'polygon'; points: [number, number][]; heightCm: number; opacity?: number }
