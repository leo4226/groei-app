import { describe, it, expect } from 'vitest'
import { confidenceTone } from '../confidenceTone'

describe('confidenceTone', () => {
  it('returns non-urgent flags for high', () => {
    expect(confidenceTone('high')).toEqual({
      showBanner: false,
      showMediumSubtitle: false,
      showDetailedNoMatch: false,
      showCompareCandidates: false,
      plantnetCtaProminent: false,
    })
  })
  it('encourages verification and second opinion for medium', () => {
    expect(confidenceTone('medium')).toEqual({
      showBanner: false,
      showMediumSubtitle: true,
      showDetailedNoMatch: false,
      showCompareCandidates: true,
      plantnetCtaProminent: true,
    })
  })
  it('shows low-confidence warning and prominent second opinion for low', () => {
    expect(confidenceTone('low')).toEqual({
      showBanner: true,
      showMediumSubtitle: false,
      showDetailedNoMatch: false,
      showCompareCandidates: true,
      plantnetCtaProminent: true,
    })
  })
  it('shows detailed body and prominent second opinion for no_match', () => {
    expect(confidenceTone('no_match')).toEqual({
      showBanner: false,
      showMediumSubtitle: false,
      showDetailedNoMatch: true,
      showCompareCandidates: false,
      plantnetCtaProminent: true,
    })
  })
})
