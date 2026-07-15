import { describe, expect, it } from 'vitest'
import { plantPassportSwipeDirection } from './plantPassportSwipe'

describe('plantPassportSwipeDirection', () => {
  it('identifies deliberate horizontal swipes', () => {
    expect(plantPassportSwipeDirection(100, 100, 180, 110)).toBe('prev')
    expect(plantPassportSwipeDirection(180, 100, 100, 110)).toBe('next')
  })

  it('ignores short movements and vertical or diagonal scrolling', () => {
    expect(plantPassportSwipeDirection(100, 100, 150, 100)).toBeNull()
    expect(plantPassportSwipeDirection(100, 100, 120, 240)).toBeNull()
    expect(plantPassportSwipeDirection(100, 100, 180, 190)).toBeNull()
  })
})