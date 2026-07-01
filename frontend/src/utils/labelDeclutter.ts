/**
 * Multi-position label placement for the map.
 *
 * Plant name labels are drawn in SVG (viewBox) space. When plants sit close
 * together their labels overlap into unreadable mush. This places each label in
 * priority order (lower `priority` first, then top-to-bottom, then
 * left-to-right for stability), trying **below** the plant first and flipping
 * **above** when below is blocked — so two horizontally-adjacent plants can both
 * show (one under, one over) instead of one vanishing. A label is hidden only
 * when neither position is free. `forced` candidates (the selected plant) always
 * show, so a tap reveals any name even in a dense cluster.
 */
export type LabelPlacement = 'below' | 'above'

export interface LabelCandidate {
  id: number
  cx: number        // label centre x, SVG units (textAnchor="middle")
  centerY: number   // plant centre y, SVG units
  iconR: number     // plant icon radius — label sits just outside it
  width: number     // estimated label width, SVG units
  priority: number  // lower wins; ties broken by position
  forced?: boolean  // always shown, even if it collides
}

// Distance from the icon edge to the label baseline (SVG units). Shared with
// PlantMarker so render and collision agree.
export const LABEL_BELOW_OFFSET = 10
export const LABEL_ABOVE_OFFSET = 6

interface Box { x0: number; x1: number; y0: number; y1: number }

function intersects(a: Box, b: Box): boolean {
  return !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1)
}

function boxFor(c: LabelCandidate, placement: LabelPlacement, font: number, gap: number): Box {
  const baseline = placement === 'above'
    ? c.centerY - c.iconR - LABEL_ABOVE_OFFSET
    : c.centerY + c.iconR + LABEL_BELOW_OFFSET
  const top = baseline - font                 // glyph top ≈ baseline − font
  const height = font * 1.2
  return {
    x0: c.cx - c.width / 2 - gap,
    x1: c.cx + c.width / 2 + gap,
    y0: top - gap,
    y1: top + height + gap,
  }
}

/**
 * Decide which labels render and where. Returns a map of id → placement
 * ('below' | 'above'); ids absent from the map are hidden.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  opts: { font: number; gap?: number },
): Map<number, LabelPlacement> {
  const font = opts.font
  const gap = opts.gap ?? 1
  const ordered = [...candidates].sort(
    (a, b) => a.priority - b.priority || a.centerY - b.centerY || a.cx - b.cx,
  )
  const placed: Box[] = []
  const result = new Map<number, LabelPlacement>()

  for (const c of ordered) {
    let chosen: LabelPlacement | null = null
    for (const placement of ['below', 'above'] as const) {
      const box = boxFor(c, placement, font, gap)
      if (!placed.some((p) => intersects(p, box))) {
        chosen = placement
        placed.push(box)
        break
      }
    }
    if (!chosen && c.forced) {
      chosen = 'below'                          // forced: show anyway, prefer below
      placed.push(boxFor(c, 'below', font, gap))
    }
    if (chosen) result.set(c.id, chosen)
  }
  return result
}
