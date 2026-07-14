import type { PlantHitCandidate } from '../../utils/plantHitTesting'

export type PlantHitChooserLayout = 'popover' | 'sheet'

export interface PlantHitChooserOption {
  key: string
  label: string
  iconKey: string | null
  candidate: PlantHitCandidate
}

export function chooserLayout(isMobile: boolean): PlantHitChooserLayout {
  return isMobile ? 'sheet' : 'popover'
}

export function chooserOptions(
  candidates: readonly PlantHitCandidate[],
): PlantHitChooserOption[] {
  return candidates.map((candidate) => ({
    key: candidate.key,
    label: candidate.label,
    iconKey: candidate.iconKey,
    candidate,
  }))
}
