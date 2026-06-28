import type { MapInfo } from './types'

export function defaultMapRedirectSlug(maps: Pick<MapInfo, 'slug' | 'map_type'>[]): string | null {
  if (maps.length === 0) return null
  return (maps.find((m) => m.map_type === 'indoor') ?? maps[0]).slug
}
