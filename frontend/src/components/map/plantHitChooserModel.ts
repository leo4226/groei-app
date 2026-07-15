import type { PlantHitCandidate } from '../../utils/plantHitTesting'

export type PlantHitChooserLayout = 'popover' | 'sheet'

export interface PlantHitChooserOption {
  key: string
  label: string
  iconKey: string | null
  candidate: PlantHitCandidate
}

interface Point { x: number; y: number }
interface Size { width: number; height: number }

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

export function placeChooserPopover(
  point: Point,
  popover: Size,
  viewport: Size,
): { left: number; top: number } {
  const margin = 8
  const gap = 12
  const maxLeft = Math.max(margin, viewport.width - popover.width - margin)
  const left = Math.max(margin, Math.min(point.x + gap, maxLeft))
  const below = point.y + gap
  const above = point.y - gap - popover.height
  const maxTop = Math.max(margin, viewport.height - popover.height - margin)
  const top = below + popover.height <= viewport.height - margin
    ? below
    : above >= margin
      ? above
      : Math.max(margin, Math.min(below, maxTop))

  return { left, top }
}
