import { describe, expect, it } from 'vitest'
import { roundMapPos } from '../../pages/addPlant/placementModel'

describe('roundMapPos', () => {
  it('rounds raw SVG coords to one decimal', () => {
    expect(roundMapPos(12.3456, 67.8912)).toEqual({ x: 12.3, y: 67.9 })
  })

  it('keeps integers intact', () => {
    expect(roundMapPos(12, 67)).toEqual({ x: 12, y: 67 })
  })

  it('handles negative viewbox origins', () => {
    expect(roundMapPos(-1.24, -3.76)).toEqual({ x: -1.2, y: -3.8 })
  })
})
