import { describe, expect, it } from 'vitest'
import { flowerBarHeights, monthShortNames } from './atlasModel'

describe('atlasModel', () => {
  describe('flowerBarHeights', () => {
    it('returns 12 all-zero bars for an empty garden', () => {
      expect(flowerBarHeights([])).toEqual(Array(12).fill(0))
    })

    it('marks flowering months as 1 and others 0', () => {
      expect(flowerBarHeights([5, 6, 7])).toEqual([
        0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0,
      ])
    })

    it('ignores out-of-range and non-integer values', () => {
      // 0 (out of range), 13 (out of range), -1 (out of range), 3.7 (non-integer)
      expect(flowerBarHeights([0, 13, -1, 3.7])).toEqual(Array(12).fill(0))
    })

    it('still marks valid integer months alongside invalid entries', () => {
      expect(flowerBarHeights([0, 3, 13])).toEqual([
        0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ])
    })
  })

  describe('monthShortNames', () => {
    it('localizes to the given locale', () => {
      const nl = monthShortNames('nl-NL')
      const en = monthShortNames('en-GB')
      expect(nl).toHaveLength(12)
      expect(en).toHaveLength(12)
      expect(en[0]).toMatch(/jan/i)
      expect(en[11]).toMatch(/dec/i)
      expect(nl[0]).toMatch(/jan/i)
      expect(nl[11]).toMatch(/dec/i)
    })
  })
})
