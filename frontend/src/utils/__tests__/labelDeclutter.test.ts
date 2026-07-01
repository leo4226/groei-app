import { describe, it, expect } from 'vitest'
import { pickVisibleLabels, type LabelCandidate } from '../labelDeclutter'

const c = (over: Partial<LabelCandidate> & { id: number }): LabelCandidate => ({
  cx: 0, topY: 0, width: 20, height: 10, priority: 1, ...over,
})

describe('pickVisibleLabels', () => {
  it('shows every label when none overlap', () => {
    const cands = [
      c({ id: 1, cx: 0, topY: 0 }),
      c({ id: 2, cx: 100, topY: 0 }),
      c({ id: 3, cx: 0, topY: 100 }),
    ]
    expect(pickVisibleLabels(cands)).toEqual(new Set([1, 2, 3]))
  })

  it('hides the lower-priority label of an overlapping pair', () => {
    const cands = [
      c({ id: 1, cx: 0, topY: 0, priority: 0 }),  // higher priority
      c({ id: 2, cx: 5, topY: 0, priority: 1 }),  // overlaps id 1
    ]
    const shown = pickVisibleLabels(cands)
    expect(shown.has(1)).toBe(true)
    expect(shown.has(2)).toBe(false)
  })

  it('always shows a forced label even when it collides', () => {
    const cands = [
      c({ id: 1, cx: 0, topY: 0, priority: 0 }),
      c({ id: 2, cx: 3, topY: 0, priority: 1, forced: true }),  // overlaps but forced
    ]
    const shown = pickVisibleLabels(cands)
    expect(shown.has(1)).toBe(true)
    expect(shown.has(2)).toBe(true)
  })

  it('breaks ties top-to-bottom so the choice is stable regardless of input order', () => {
    const top = c({ id: 1, cx: 0, topY: 0 })
    const bottom = c({ id: 2, cx: 0, topY: 6 })  // overlaps top
    expect(pickVisibleLabels([bottom, top])).toEqual(new Set([1]))
    expect(pickVisibleLabels([top, bottom])).toEqual(new Set([1]))
  })

  it('respects the gap padding when deciding overlap', () => {
    // Boxes are width 20 centred at 0 and 24 → 4px apart edge-to-edge.
    const near = [c({ id: 1, cx: 0 }), c({ id: 2, cx: 24 })]
    // gap 0 → no overlap, both show
    expect(pickVisibleLabels(near, 0)).toEqual(new Set([1, 2]))
    // gap 3 → padded boxes overlap, second hidden
    expect(pickVisibleLabels(near, 3)).toEqual(new Set([1]))
  })
})
