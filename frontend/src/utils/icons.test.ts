// frontend/src/utils/icons.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveIconUrl, indexIconUrls } from './icons'

describe('resolveIconUrl', () => {
  beforeEach(() => indexIconUrls([]))

  it('falls back to /icons/<key>.svg for unknown keys', () => {
    expect(resolveIconUrl('monstera')).toBe('/icons/monstera.svg')
  })

  it('uses the catalog url for indexed (generated) icons', () => {
    indexIconUrls([
      { id: 'gen_rosa', url: 'https://r2/icons/generated/gen_rosa.svg' } as any,
    ])
    expect(resolveIconUrl('gen_rosa')).toBe('https://r2/icons/generated/gen_rosa.svg')
  })

  it('returns null for empty key', () => {
    expect(resolveIconUrl(null)).toBeNull()
  })
})
