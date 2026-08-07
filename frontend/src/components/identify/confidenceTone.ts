import type { IdentifyConfidence } from '../../types'

export type ConfidenceTone = {
  showBanner: boolean          // render the yellow "low confidence" banner
  showMediumSubtitle: boolean  // render the "Fairly confident" subtitle on top candidate
  showDetailedNoMatch: boolean // use the more-detailed bodyDetailed text in the no-match view
  showCompareCandidates: boolean // encourage checking alternatives for uncertain matches
  plantnetCtaProminent: boolean  // make the PlantNet second-opinion CTA visually stronger
}

export function confidenceTone(confidence: IdentifyConfidence): ConfidenceTone {
  switch (confidence) {
    case 'high':
      return {
        showBanner: false,
        showMediumSubtitle: false,
        showDetailedNoMatch: false,
        showCompareCandidates: false,
        plantnetCtaProminent: false,
      }
    case 'medium':
      return {
        showBanner: false,
        showMediumSubtitle: true,
        showDetailedNoMatch: false,
        showCompareCandidates: true,
        // PlantNet is a normal secondary option on a plausible match — the
        // green rescue CTA is reserved for a genuine no_match (#808, audit §3.3).
        plantnetCtaProminent: false,
      }
    case 'low':
      return {
        showBanner: true,
        showMediumSubtitle: false,
        showDetailedNoMatch: false,
        showCompareCandidates: true,
        // Same rule: don't reflexively push PlantNet on every uncertain match.
        plantnetCtaProminent: false,
      }
    case 'no_match':
      return {
        showBanner: false,
        showMediumSubtitle: false,
        showDetailedNoMatch: true,
        showCompareCandidates: false,
        // Genuine no-match is the one case where a second opinion is the
        // primary action.
        plantnetCtaProminent: true,
      }
  }
}
