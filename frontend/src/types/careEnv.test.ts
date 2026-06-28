import { describe, it, expect } from 'vitest'
import { isCareTypeValidForEnv, INDOOR_ONLY_CARE_TYPES } from './index'

describe('isCareTypeValidForEnv', () => {
  it('drops indoor-only care types outdoors', () => {
    for (const ct of INDOOR_ONLY_CARE_TYPES) {
      expect(isCareTypeValidForEnv(ct, false)).toBe(false)
      expect(isCareTypeValidForEnv(ct, true)).toBe(true)
    }
  })

  it('keeps rotate and mist for indoor plants', () => {
    expect(isCareTypeValidForEnv('rotate', true)).toBe(true)
    expect(isCareTypeValidForEnv('mist', true)).toBe(true)
  })

  it('keeps generally-valid care types in both environments', () => {
    for (const ct of ['water', 'fertilize', 'prune', 'photo'] as const) {
      expect(isCareTypeValidForEnv(ct, true)).toBe(true)
      expect(isCareTypeValidForEnv(ct, false)).toBe(true)
    }
  })
})
