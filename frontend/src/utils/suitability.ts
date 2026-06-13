import type { Phenology } from '../types'

export const PHASE_COLORS: Record<string, string> = {
  growing:      '#5B9A6F',
  flowering:    '#D4829A',
  fruiting:     '#D9A418',
  harvest:      '#C6873A',
  establishing: '#8FA882',
  evergreen:    '#2F5D3A',
  unknown:      '#C8C8C8',
}

export type SuitabilityStatus =
  | 'good'
  | 'too_little'
  | 'too_much'
  | 'dormant'
  | 'not_planted'
  | 'unknown'

export interface SuitabilityResult {
  status: SuitabilityStatus
  badgeLabel: string
  detailLabel: string
  sunNeeded: number
  sunActual: number
  phaseLabel: string
  actions: string[]
}

const ACTIVE_PHASES = new Set([
  'growing', 'flowering', 'fruiting', 'harvest', 'establishing', 'evergreen',
])

export function computeSuitability(
  phenology: Phenology | null | undefined,
  sunHoursAtSpot: number | null,
  month: number,
): SuitabilityResult {
  if (!phenology || !phenology.months) {
    return {
      status: 'unknown',
      badgeLabel: '?',
      detailLabel: 'Geen soortdata beschikbaar',
      sunNeeded: 0,
      sunActual: sunHoursAtSpot ?? 0,
      phaseLabel: '',
      actions: [],
    }
  }

  const monthData = phenology.months.find(m => m.month === month)
  if (!monthData) {
    return {
      status: 'unknown',
      badgeLabel: '?',
      detailLabel: 'Geen maanddata',
      sunNeeded: 0,
      sunActual: sunHoursAtSpot ?? 0,
      phaseLabel: '',
      actions: [],
    }
  }

  const { phase, phase_label_nl, sun_hours_needed, description_nl, actions_nl } = monthData

  if (!ACTIVE_PHASES.has(phase)) {
    return {
      status: 'dormant',
      badgeLabel: phase_label_nl,
      detailLabel: description_nl,
      sunNeeded: 0,
      sunActual: sunHoursAtSpot ?? 0,
      phaseLabel: phase_label_nl,
      actions: actions_nl,
    }
  }

  const diff = (sunHoursAtSpot ?? 0) - sun_hours_needed

  if (diff >= -0.5) {
    return {
      status: 'good',
      badgeLabel: 'Goed',
      detailLabel: sunHoursAtSpot != null
        ? `${description_nl} Dit punt heeft genoeg zon.`
        : description_nl,
      sunNeeded: sun_hours_needed,
      sunActual: sunHoursAtSpot ?? 0,
      phaseLabel: phase_label_nl,
      actions: actions_nl,
    }
  }

  return {
    status: 'too_little',
    badgeLabel: 'Te weinig zon',
    detailLabel: sunHoursAtSpot != null
      ? `${description_nl} Dit punt heeft ~${sunHoursAtSpot.toFixed(1)}u zon, maar de plant heeft ${sun_hours_needed}u nodig.`
      : description_nl,
    sunNeeded: sun_hours_needed,
    sunActual: sunHoursAtSpot ?? 0,
    phaseLabel: phase_label_nl,
    actions: actions_nl,
  }
}

export function getActiveMonths(phenology: Phenology): number[] {
  if (!phenology.months) return []
  return phenology.months
    .filter(m => ACTIVE_PHASES.has(m.phase))
    .map(m => m.month)
}

export function getPeakSunNeed(phenology: Phenology): number {
  if (!phenology.months) return 0
  const active = phenology.months.filter(m => ACTIVE_PHASES.has(m.phase))
  if (!active.length) return 0
  return Math.max(...active.map(m => m.sun_hours_needed))
}
