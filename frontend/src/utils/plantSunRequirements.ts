export interface PlantSunProfile {
  id: string
  label: string
  labelNl: string
  emoji: string
  minHours: number
  maxHours: number
  color: string
}

export type SunFit = 'good' | 'partial' | 'poor'

export const SUN_FIT_COLORS: Record<SunFit, string> = {
  good:    '#24e34c',
  partial: '#ff7701',
  poor:    '#ea0706',
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
    emoji: '☀️',
    minHours: 6,
    maxHours: 14,
    color: '#f0a020',
  },
  {
    id: 'partial_sun',
    label: 'Partial sun',
    labelNl: 'Half zon',
    emoji: '⛅',
    minHours: 3,
    maxHours: 6,
    color: '#7ab87a',
  },
  {
    id: 'shade',
    label: 'Shade',
    labelNl: 'Schaduw',
    emoji: '🌿',
    minHours: 0,
    maxHours: 3,
    color: '#4a8c9f',
  },
]
