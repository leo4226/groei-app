import { describe, it, expect } from 'vitest'
import { nearestPlant, type NearestCandidate } from '../nearestPlant'

const cands: NearestCandidate[] = [
  { id: 1, x: 0, y: 0 },
  { id: 2, x: 100, y: 0 },
  { id: 3, x: 0, y: 100 },
]

describe('nearestPlant', () => {
  it('picks the closest candidate to the tap point', () => {
    expect(nearestPlant({ x: 10, y: 5 }, cands, 50)).toBe(1)
    expect(nearestPlant({ x: 95, y: 5 }, cands, 50)).toBe(2)
    expect(nearestPlant({ x: 5, y: 95 }, cands, 50)).toBe(3)
  })

  it('returns null when nothing is within maxDist (empty-ground tap)', () => {
    // Tap in the middle, far from every plant.
    expect(nearestPlant({ x: 50, y: 50 }, cands, 20)).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    expect(nearestPlant({ x: 0, y: 0 }, [], 100)).toBeNull()
  })

  it('includes a candidate sitting exactly on the maxDist boundary', () => {
    expect(nearestPlant({ x: 0, y: 0 }, [{ id: 7, x: 30, y: 40 }], 50)).toBe(7)
  })

  it('breaks exact ties toward the earlier candidate in array order', () => {
    const tied: NearestCandidate[] = [
      { id: 10, x: -5, y: 0 },
      { id: 20, x: 5, y: 0 },
    ]
    // Tap dead-centre: both are distance 5. Earlier (id 10) wins.
    expect(nearestPlant({ x: 0, y: 0 }, tied, 50)).toBe(10)
  })

  it('is density-independent: a far-but-lone plant still wins over a slightly-nearer crowd member', () => {
    // Closest wins regardless of how many others cluster nearby.
    const crowd: NearestCandidate[] = [
      { id: 1, x: 40, y: 0 },
      { id: 2, x: 41, y: 0 },
      { id: 3, x: 42, y: 0 },
      { id: 4, x: 20, y: 0 },
    ]
    expect(nearestPlant({ x: 0, y: 0 }, crowd, 100)).toBe(4)
  })
})
