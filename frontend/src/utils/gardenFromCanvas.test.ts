import { describe, expect, it } from 'vitest'
import { deriveViewBoxString } from './gardenFromCanvas'
import type { EditorZone } from '../types'

const zone = (patch: Partial<EditorZone>): EditorZone => ({
  id: 'zone-1',
  type: 'lawn',
  x: 100,
  y: 200,
  width: 300,
  height: 150,
  label: '',
  ...patch,
}) as EditorZone

describe('deriveViewBoxString', () => {
  it('frames drawn garden zones with responsive padding instead of the full canvas', () => {
    expect(deriveViewBoxString([zone({})], 680, 680)).toBe('76 176 348 198')
  })

  it('caps padding for very large gardens', () => {
    expect(deriveViewBoxString([zone({ x: 10, y: 20, width: 2000, height: 1000 })], 2400, 1600))
      .toBe('-110 -100 2240 1240')
  })
})
