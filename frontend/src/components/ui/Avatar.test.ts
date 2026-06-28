import { describe, it, expect } from 'vitest'
import { isIconKey } from './Avatar'

describe('isIconKey', () => {
  it('treats plant-icon catalog slugs as icon keys', () => {
    expect(isIconKey('fern_2')).toBe(true)
    expect(isIconKey('rose-bush')).toBe(true)
    expect(isIconKey('houseplant1')).toBe(true)
  })

  it('treats emoji and empty values as not icon keys', () => {
    expect(isIconKey('🌱')).toBe(false)
    expect(isIconKey('👩‍🌾')).toBe(false)
    expect(isIconKey('')).toBe(false)
    expect(isIconKey(null)).toBe(false)
    expect(isIconKey(undefined)).toBe(false)
  })
})
