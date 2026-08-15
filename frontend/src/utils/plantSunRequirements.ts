import type { GlyphName } from '../components/ui/Glyph'

export interface PlantSunProfile {
  id: string
  label: string
  labelNl: string
  icon: GlyphName
  minHours: number
  maxHours: number
  color: string
}

export type SunFit = 'good' | 'partial' | 'poor'

/**
 * The only sun-requirement values that exist. They are the ids of
 * `PLANT_SUN_PROFILES`, the species-ecology `sun_preference` vocabulary and the
 * `plants.sun_requirement` column all at once — one vocabulary, no translation
 * layer.
 *
 * The forms used to offer a five-option *tile* vocabulary
 * (`dark | shade | indirect | bright | full-sun`) that was mapped down to these
 * three on save. Only three of the five had a mapping, so picking "dark" or
 * "bright" persisted a literal string no profile matched: `getSunFit` returned
 * null and the sun-fit card silently vanished from the passport, the quick
 * sheet and the map marker (#886).
 */
export const SUN_REQUIREMENT_IDS = ['shade', 'partial_sun', 'full_sun'] as const

export type SunRequirementId = (typeof SUN_REQUIREMENT_IDS)[number]

/**
 * Legacy spellings → canonical id. Covers both the retired tile vocabulary and
 * the two values that were never mappable: `dark` is shade with less light
 * still, and `bright` (10–25k lx) is bright-but-indirect, i.e. partial sun.
 *
 * Migration `0071` rewrites the stored rows, but reads normalize too so a plant
 * saved by an older client — or by a cached bundle mid-deploy — still renders a
 * fit instead of nothing.
 */
const LEGACY_SUN_REQUIREMENTS: Record<string, SunRequirementId> = {
  dark: 'shade',
  indirect: 'partial_sun',
  bright: 'partial_sun',
  'full-sun': 'full_sun',
}

/** Canonical id for any stored/legacy value, or null when we know nothing. */
export function normalizeSunRequirement(
  value: string | null | undefined,
): SunRequirementId | null {
  if (!value) return null
  if ((SUN_REQUIREMENT_IDS as readonly string[]).includes(value)) {
    return value as SunRequirementId
  }
  return LEGACY_SUN_REQUIREMENTS[value] ?? null
}

export type SunHoursSource = 'measured' | 'estimated'

// Resolves the sun-hours a plant's fit should be judged against. A manually
// measured value (utils #645) wins over the modelled heatmap value at the
// plant's position, and the caller can surface which source was used.
export function effectiveSunHours(
  measured: number | null | undefined,
  modelled: number,
): { sunHours: number; source: SunHoursSource } {
  return measured != null
    ? { sunHours: measured, source: 'measured' }
    : { sunHours: modelled, source: 'estimated' }
}

/** The profile behind a stored/legacy sun requirement, or null when unknown. */
export function sunProfileFor(
  sunRequirement: string | null | undefined,
): PlantSunProfile | null {
  const id = normalizeSunRequirement(sunRequirement)
  return id ? PLANT_SUN_PROFILES.find(p => p.id === id) ?? null : null
}

export const SUN_FIT_COLORS: Record<SunFit, string> = {
  good:    '#5B9A6F',
  partial: '#D4A843',
  poor:    '#C1443E',
}

// Returns how well a plant's sun requirement matches actual sun hours.
// ±1h from the threshold is considered 'partial' rather than an immediate 'poor'.
export function getSunFit(sunRequirement: string | null, sunHours: number): SunFit | null {
  const id = normalizeSunRequirement(sunRequirement)
  if (!id) return null
  const profile = PLANT_SUN_PROFILES.find(p => p.id === id)
  if (!profile) return null
  if (sunHours >= profile.minHours && sunHours <= profile.maxHours) return 'good'
  const dist = sunHours < profile.minHours ? profile.minHours - sunHours : sunHours - profile.maxHours
  return dist <= 1 ? 'partial' : 'poor'
}

export const PLANT_SUN_PROFILES: PlantSunProfile[] = [
  {
    id: 'full_sun',
    label: 'Full sun',
    labelNl: 'Volle zon',
    icon: 'sun',
    minHours: 4,
    maxHours: 14,
    color: '#f0a020',
  },
  {
    id: 'partial_sun',
    label: 'Partial sun',
    labelNl: 'Half zon',
    icon: 'cloud',
    minHours: 2,
    maxHours: 4,
    color: '#7ab87a',
  },
  {
    id: 'shade',
    label: 'Shade',
    labelNl: 'Schaduw',
    icon: 'leaf',
    minHours: 0,
    maxHours: 2,
    color: '#4a8c9f',
  },
]
