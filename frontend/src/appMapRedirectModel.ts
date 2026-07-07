import type { MapInfo } from './types'

const STORAGE_KEY = 'floreren-default-map-slug'

export function defaultMapRedirectSlug(maps: Pick<MapInfo, 'slug' | 'map_type'>[]): string | null {
  if (maps.length === 0) return null

  // Check localStorage for a user-chosen default map
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && maps.some((m) => m.slug === stored)) {
      return stored
    }
  } catch {
    // localStorage not available — fall through
  }

  // Fall back to first indoor map, or first map overall
  return (maps.find((m) => m.map_type === 'indoor') ?? maps[0]).slug
}

export { STORAGE_KEY }
