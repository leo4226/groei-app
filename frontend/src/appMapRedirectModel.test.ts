import { describe, expect, it } from 'vitest'

import { defaultMapRedirectSlug } from './appMapRedirectModel'

describe('defaultMapRedirectSlug', () => {
  it('returns null when there are no maps yet', () => {
    expect(defaultMapRedirectSlug([])).toBeNull()
  })

  it('prefers an indoor map when available', () => {
    expect(defaultMapRedirectSlug([
      { slug: 'garden', map_type: 'outdoor' },
      { slug: 'house', map_type: 'indoor' },
    ])).toBe('house')
  })

  it('falls back to the first map when no indoor map exists', () => {
    expect(defaultMapRedirectSlug([
      { slug: 'front-garden', map_type: 'outdoor' },
      { slug: 'back-garden', map_type: 'outdoor' },
    ])).toBe('front-garden')
  })
})
