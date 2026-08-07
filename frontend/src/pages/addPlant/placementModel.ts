import type { MapInfo } from '../../types'

/**
 * Pure decision rule for auto-selecting the default map in the add-plant
 * flow. Priority:
 *
 * 1. The map the user came from (`fromMap` slug in navigation state) — when
 *    they tapped "add plant" on a specific map, that map is the answer.
 * 2. The last map they visited (`lastMapSlug` in localStorage, kept in sync
 *    by BottomNav and MapPage).
 * 3. Fallback to the first map (indoor-first ordering already applied by the
 *    caller) so a brand-new user without any history still gets a sensible
 *    pre-selection instead of an empty picker.
 *
 * Returns the matching map id, or null when there is no plausible default.
 */
export function resolveDefaultMapId(
  maps: Pick<MapInfo, 'id' | 'slug'>[],
  fromMapSlug: string | null,
  lastMapSlug: string | null,
): number | null {
  if (maps.length === 0) return null

  // Single-map account: the answer is unambiguous, skip history lookups.
  if (maps.length === 1) return maps[0].id

  if (fromMapSlug) {
    const fromMap = maps.find(m => m.slug === fromMapSlug)
    if (fromMap) return fromMap.id
  }

  if (lastMapSlug) {
    const lastMap = maps.find(m => m.slug === lastMapSlug)
    if (lastMap) return lastMap.id
  }

  return null
}

export interface MapPos {
  x: number
  y: number
}

/** Round raw SVG coords to the same 1-decimal precision the DB stores. */
export function roundMapPos(x: number, y: number): MapPos {
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  }
}
