import type { IdentifyConfidence } from '../../types'

export type ConfidenceTone = {
  showBanner: boolean
  subtitleKey: string | null
  bannerKey: string | null
  noMatchBodyKey?: string
}

export function confidenceTone(confidence: IdentifyConfidence): ConfidenceTone {
  switch (confidence) {
    case 'high':
      return { showBanner: false, subtitleKey: null, bannerKey: null }
    case 'medium':
      return { showBanner: false, subtitleKey: 'confidence.medium', bannerKey: null }
    case 'low':
      return { showBanner: true, subtitleKey: null, bannerKey: 'confidence.low' }
    case 'no_match':
      return {
        showBanner: false,
        subtitleKey: null,
        bannerKey: null,
        noMatchBodyKey: 'noMatch.bodyDetailed',
      }
  }
}
