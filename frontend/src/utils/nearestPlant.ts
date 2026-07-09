/**
 * Nearest-neighbour tap selection (#452).
 *
 * On phone, plants sit close together and are hard to tap precisely. Rather
 * than require a tap to land inside a marker's own hit circle, the map picks
 * the *closest* plant to the tap point — so precision stops mattering and
 * selection is independent of visual density. A `maxDist` bounds the pick so a
 * tap on clearly-empty ground still returns null (the caller then deselects).
 */
export interface NearestCandidate {
  id: number
  x: number
  y: number
}

/**
 * Return the id of the candidate closest to `point` within `maxDist` (same
 * units as the coordinates — SVG/viewBox units here), or null when none is in
 * range. Distances are compared squared to avoid a sqrt per candidate.
 *
 * Ties (two candidates at exactly the same distance) resolve to the earlier
 * one in array order, so the result is deterministic given a stable plant list.
 * TODO: disambiguation chooser for near-tied plants.
 */
export function nearestPlant(
  point: { x: number; y: number },
  candidates: NearestCandidate[],
  maxDist: number,
): number | null {
  const maxDistSq = maxDist * maxDist
  let bestId: number | null = null
  let bestDistSq = Infinity
  for (const c of candidates) {
    const dx = c.x - point.x
    const dy = c.y - point.y
    const distSq = dx * dx + dy * dy
    // Strictly nearer wins; an exact tie keeps the earlier candidate.
    if (distSq <= maxDistSq && distSq < bestDistSq) {
      bestId = c.id
      bestDistSq = distSq
    }
  }
  return bestId
}
