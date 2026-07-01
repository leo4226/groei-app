/**
 * Greedy label decluttering for the map.
 *
 * Plant name labels are drawn in SVG (viewBox) space. When plants sit close
 * together their labels overlap into unreadable mush. This picks a
 * non-overlapping subset: candidates are placed in priority order (lower
 * `priority` first, then top-to-bottom, then left-to-right for stability) and a
 * candidate is shown only if its padded box doesn't intersect one already
 * placed. `forced` candidates (e.g. the selected plant) are always shown, so a
 * tap still reveals a name even in a dense cluster.
 *
 * Geometry is zoom-invariant: labels and plants share the same SVG units, so a
 * subset chosen once reads cleanly at every zoom level, and tapping surfaces
 * any name that was decluttered.
 */
export interface LabelCandidate {
  id: number
  cx: number       // label centre x, SVG units (textAnchor="middle")
  topY: number     // top edge of the label box, SVG units
  width: number    // estimated label width, SVG units
  height: number   // label box height, SVG units
  priority: number // lower wins; ties broken by position
  forced?: boolean // always shown, even if it collides
}

interface Box { x0: number; x1: number; y0: number; y1: number }

function intersects(a: Box, b: Box): boolean {
  return !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1)
}

/**
 * Return the ids whose labels should render. `gap` pads each box so labels
 * don't just barely kiss.
 */
export function pickVisibleLabels(candidates: LabelCandidate[], gap = 2): Set<number> {
  const ordered = [...candidates].sort(
    (a, b) => a.priority - b.priority || a.topY - b.topY || a.cx - b.cx,
  )
  const placed: Box[] = []
  const shown = new Set<number>()
  for (const c of ordered) {
    const box: Box = {
      x0: c.cx - c.width / 2 - gap,
      x1: c.cx + c.width / 2 + gap,
      y0: c.topY - gap,
      y1: c.topY + c.height + gap,
    }
    if (c.forced || !placed.some((p) => intersects(p, box))) {
      shown.add(c.id)
      placed.push(box)
    }
  }
  return shown
}
