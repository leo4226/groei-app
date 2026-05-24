import { describe, it, expect } from 'vitest'
import { confidenceTone } from '../confidenceTone'

describe('confidenceTone', () => {
  it('returns no-banner tone for high', () => {
    expect(confidenceTone('high')).toEqual({ showBanner: false, subtitleKey: null, bannerKey: null })
  })
  it('returns subtitle key for medium', () => {
    expect(confidenceTone('medium')).toEqual({
      showBanner: false,
      subtitleKey: 'confidence.medium',
      bannerKey: null,
    })
  })
  it('returns banner key for low', () => {
    expect(confidenceTone('low')).toEqual({
      showBanner: true,
      subtitleKey: null,
      bannerKey: 'confidence.low',
    })
  })
  it('returns special body for no_match', () => {
    expect(confidenceTone('no_match')).toEqual({
      showBanner: false,
      subtitleKey: null,
      bannerKey: null,
      noMatchBodyKey: 'noMatch.bodyDetailed',
    })
  })
})
