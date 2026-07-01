import { describe, it, expect } from 'vitest'
import { placeLabels, type LabelCandidate } from '../labelDeclutter'

const c = (over: Partial<LabelCandidate> & { id: number }): LabelCandidate => ({
  cx: 0, centerY: 0, iconR: 5, width: 40, priority: 1, ...over,
})

const OPTS = { font: 7, gap: 1 }

describe('placeLabels', () => {
  it('places every non-overlapping label below', () => {
    const cands = [
      c({ id: 1, cx: 0, centerY: 0 }),
      c({ id: 2, cx: 200, centerY: 0 }),
      c({ id: 3, cx: 0, centerY: 200 }),
    ]
    const m = placeLabels(cands, OPTS)
    expect([...m.entries()].sort()).toEqual([[1, 'below'], [2, 'below'], [3, 'below']])
  })

  it('flips a horizontally-adjacent neighbour above instead of hiding it', () => {
    // Two plants side by side: their below-labels would overlap.
    const cands = [
      c({ id: 1, cx: 0, centerY: 0, priority: 0 }),
      c({ id: 2, cx: 10, centerY: 0, priority: 1 }),
    ]
    const m = placeLabels(cands, OPTS)
    expect(m.get(1)).toBe('below')
    expect(m.get(2)).toBe('above')   // shown, not hidden
  })

  it('hides a label only when both below and above are blocked', () => {
    // Three stacked so a middle plant has neighbours above and below.
    const cands = [
      c({ id: 1, cx: 0, centerY: 0, priority: 0 }),
      c({ id: 2, cx: 6, centerY: 0, priority: 1 }),   // → above
      c({ id: 3, cx: 3, centerY: 0, priority: 2 }),   // below & above both taken → hidden
    ]
    const m = placeLabels(cands, OPTS)
    expect(m.get(1)).toBe('below')
    expect(m.get(2)).toBe('above')
    expect(m.has(3)).toBe(false)
  })

  it('always shows a forced label — flipping above, or staying even when both slots are blocked', () => {
    // below taken but above free → forced flips above (still shown)
    const flip = placeLabels([
      c({ id: 1, cx: 0, centerY: 0, priority: 0 }),
      c({ id: 2, cx: 2, centerY: 0, priority: 1, forced: true }),
    ], OPTS)
    expect(flip.get(2)).toBe('above')

    // both slots blocked (a neighbour above occupies the above slot) → forced
    // still shows via the below fallback; a non-forced one would be hidden.
    const boxed = placeLabels([
      c({ id: 1, cx: 0, centerY: 0, priority: 0 }),       // takes 2's below slot
      c({ id: 3, cx: 0, centerY: -26, priority: 0 }),     // its below sits in 2's above slot
      c({ id: 2, cx: 0, centerY: 0, priority: 1, forced: true }),
    ], OPTS)
    expect(boxed.get(2)).toBe('below')
    expect(boxed.has(2)).toBe(true)
  })

  it('is stable regardless of input order (top plant wins the below slot)', () => {
    const top = c({ id: 1, cx: 0, centerY: 0 })
    const bottom = c({ id: 2, cx: 0, centerY: 4 })   // overlaps top's below box
    expect(placeLabels([bottom, top], OPTS).get(1)).toBe('below')
    expect(placeLabels([top, bottom], OPTS).get(1)).toBe('below')
  })
})
