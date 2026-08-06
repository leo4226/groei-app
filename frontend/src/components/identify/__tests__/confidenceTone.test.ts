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
  it('encourages verification but keeps PlantNet secondary for medium', () => {
    expect(confidenceTone('medium')).toEqual({
      showBanner: false,
      showMediumSubtitle: true,
      showDetailedNoMatch: false,
      showCompareCandidates: true,
      plantnetCtaProminent: false,
    })
  })
  it('shows low-confidence warning but keeps PlantNet secondary for low', () => {
    expect(confidenceTone('low')).toEqual({
      showBanner: true,
      showMediumSubtitle: false,
      showDetailedNoMatch: false,
      showCompareCandidates: true,
      plantnetCtaProminent: false,
    })
  })
  it('promotes PlantNet only on genuine no_match', () => {
    expect(confidenceTone('no_match')).toEqual({
      showBanner: false,
      showMediumSubtitle: false,
      showDetailedNoMatch: true,
      showCompareCandidates: false,
      plantnetCtaProminent: true,
    })
  })
})
