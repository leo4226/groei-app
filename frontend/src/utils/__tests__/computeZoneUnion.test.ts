import { describe, it, expect } from 'vitest'
import { computeZoneUnion } from '../computeZoneUnion'
import type { EditorZone } from '../../types'

function makeZone(id: string, x: number, y: number, width: number, height: number): EditorZone {
  return { id, type: 'room', shape: 'rect', x, y, width, height, label: '' }
}

describe('computeZoneUnion', () => {
  it('returns empty string for empty zones array', () => {
    expect(computeZoneUnion([])).toBe('')
  })

  it('returns a closed path for a single zone', () => {
    const result = computeZoneUnion([makeZone('a', 10, 20, 100, 80)])
    expect(result).toContain('M')
    expect(result).toContain('Z')
    expect(result).toMatch(/10/)
    expect(result).toMatch(/20/)
  })

  it('merges two horizontally adjacent zones into one outline', () => {
    const zones = [
      makeZone('a', 10, 10, 100, 80),
      makeZone('b', 110, 10, 100, 80),
    ]
    const result = computeZoneUnion(zones)
    const mCount = (result.match(/M /g) ?? []).length
    expect(mCount).toBe(1)
    expect(result).toContain('10')
    expect(result).toContain('210')
  })

  it('produces separate paths for two non-adjacent zones', () => {
    const zones = [
      makeZone('a', 0, 0, 50, 50),
      makeZone('b', 200, 200, 50, 50),
    ]
    const result = computeZoneUnion(zones)
    const mCount = (result.match(/M /g) ?? []).length
    expect(mCount).toBe(2)
  })

  it('traces a single polygon for an L-shaped layout', () => {
    const zones = [
      makeZone('a', 0, 0, 100, 100),
      makeZone('b', 0, 100, 200, 100),
    ]
    const result = computeZoneUnion(zones)
    const mCount = (result.match(/M /g) ?? []).length
    expect(mCount).toBe(1)
  })
})
