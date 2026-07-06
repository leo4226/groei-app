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

export const SUN_FIT_COLORS: Record<SunFit, string> = {
  good:    '#5B9A6F',
  partial: '#D4A843',
  poor:    '#C1443E',
}

// Returns how well a plant's sun requirement matches actual sun hours.
// ±1h from the threshold is considered 'partial' rather than an immediate 'poor'.
export function getSunFit(sunRequirement: string | null, sunHours: number): SunFit | null {
  if (!sunRequirement) return null
  const profile = PLANT_SUN_PROFILES.find(p => p.id === sunRequirement)
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
    minHours: 6,
    maxHours: 14,
    color: '#f0a020',
  },
  {
    id: 'partial_sun',
    label: 'Partial sun',
    labelNl: 'Half zon',
    icon: 'cloud',
    minHours: 3,
    maxHours: 6,
    color: '#7ab87a',
  },
  {
    id: 'shade',
    label: 'Shade',
    labelNl: 'Schaduw',
    icon: 'leaf',
    minHours: 0,
    maxHours: 3,
    color: '#4a8c9f',
  },
]
