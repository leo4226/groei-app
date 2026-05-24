import type { IdentifyConfidence } from '../../types'

export type ConfidenceTone = {
  showBanner: boolean          // render the yellow "low confidence" banner
  showMediumSubtitle: boolean  // render the "Fairly confident" subtitle on top candidate
  showDetailedNoMatch: boolean // use the more-detailed bodyDetailed text in the no-match view
}

export function confidenceTone(confidence: IdentifyConfidence): ConfidenceTone {
  switch (confidence) {
    case 'high':
      return { showBanner: false, showMediumSubtitle: false, showDetailedNoMatch: false }
    case 'medium':
      return { showBanner: false, showMediumSubtitle: true, showDetailedNoMatch: false }
    case 'low':
      return { showBanner: true, showMediumSubtitle: false, showDetailedNoMatch: false }
    case 'no_match':
      return { showBanner: false, showMediumSubtitle: false, showDetailedNoMatch: true }
  }
}
