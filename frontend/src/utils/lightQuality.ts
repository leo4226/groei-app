/**
 * Light-quality bucketing — combines direct sun hours and sky openness (SVF)
 * into four plant-relevant categories.
 *
 * Thresholds are intentionally top-of-file constants so they're easy to tune
 * after a season of observation.
 */

export const FULL_SUN_HOURS   = 4    // h/day — ≥ this → full sun
export const PART_SUN_HOURS   = 2    // h/day — ≥ this (and < FULL) → part sun
export const BRIGHT_SHADE_SVF = 0.5  // SVF   — ≥ this when < PART_SUN → bright shade, else deep shade

export type LightBucket = 'full' | 'part' | 'bright_shade' | 'deep_shade'

/**
 * Classify a garden cell into one of four light-quality buckets.
 * Direct sun hours take precedence; SVF only matters when sun < 2 h/day.
 */
export function bucketFor(directHours: number, svf: number): LightBucket {
  if (directHours >= FULL_SUN_HOURS)  return 'full'
  if (directHours >= PART_SUN_HOURS)  return 'part'
  return svf >= BRIGHT_SHADE_SVF ? 'bright_shade' : 'deep_shade'
}

/** Fill colour for each bucket (used in heatmap cells and legend swatches). */
export function bucketColor(bucket: LightBucket): string {
  switch (bucket) {
    case 'full':        return '#f59e0b'  // amber  — full sun
    case 'part':        return '#fb923c'  // orange — part sun / dappled
    case 'bright_shade': return '#4ade80' // bright green — open sky, no direct sun
    case 'deep_shade':  return '#166534'  // dark green  — enclosed, little sky
  }
}

/** Display label for each bucket via i18n. Pass in a `useT()` result. */
export function bucketLabel(bucket: LightBucket, t: { sun: { bucketFull: string; bucketPart: string; bucketBrightShade: string; bucketDeepShade: string } }): string {
  switch (bucket) {
    case 'full':        return t.sun.bucketFull
    case 'part':        return t.sun.bucketPart
    case 'bright_shade': return t.sun.bucketBrightShade
    case 'deep_shade':  return t.sun.bucketDeepShade
  }
}

/** The three data-layer options for the heatmap. */
export type HeatmapLayer = 'sun_hours' | 'sky_openness' | 'light_quality'
