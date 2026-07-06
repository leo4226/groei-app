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
        plantnetCtaProminent: true,
      }
    case 'low':
      return {
        showBanner: true,
        showMediumSubtitle: false,
        showDetailedNoMatch: false,
        showCompareCandidates: true,
        plantnetCtaProminent: true,
      }
    case 'no_match':
      return {
        showBanner: false,
        showMediumSubtitle: false,
        showDetailedNoMatch: true,
        showCompareCandidates: false,
        plantnetCtaProminent: true,
      }
  }
}
