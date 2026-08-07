import { describe, expect, it } from 'vitest'
import { resolveDefaultMapId } from './placementModel'

const MAPS = [
  { id: 1, slug: 'garden' },
  { id: 2, slug: 'living-room' },
  { id: 3, slug: 'balcony' },
]

describe('resolveDefaultMapId', () => {
  it('returns null with no maps', () => {
    expect(resolveDefaultMapId([], 'garden', 'garden')).toBeNull()
  })

  it('auto-selects the only map for single-map accounts', () => {
    expect(resolveDefaultMapId([{ id: 7, slug: 'garden' }], null, null)).toBe(7)
  })

  it('prefers the map the user came from', () => {
    expect(resolveDefaultMapId(MAPS, 'balcony', 'living-room')).toBe(3)
  })

  it('falls back to the last visited map', () => {
    expect(resolveDefaultMapId(MAPS, null, 'living-room')).toBe(2)
  })

  it('fromMap wins even when lastMap points elsewhere', () => {
    expect(resolveDefaultMapId(MAPS, 'garden', 'balcony')).toBe(1)
  })

  it('returns null when neither slug matches', () => {
    expect(resolveDefaultMapId(MAPS, null, 'nonexistent')).toBeNull()
  })

  it('ignores a fromMap slug that no longer exists', () => {
    expect(resolveDefaultMapId(MAPS, 'deleted-map', 'balcony')).toBe(3)
  })
})
