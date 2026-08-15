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
  locale?: string,
): SuitabilityResult {
  const isEN = locale?.startsWith('en') ?? false

  if (!phenology || !phenology.months) {
    return {
      status: 'unknown',
      badgeLabel: '?',
      detailLabel: isEN ? 'No species data available' : 'Geen soortdata beschikbaar',
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
      detailLabel: isEN ? 'No month data' : 'Geen maanddata',
      sunNeeded: 0,
      sunActual: sunHoursAtSpot ?? 0,
      phaseLabel: '',
      actions: [],
    }
  }

  const { phase, phase_label_nl, phase_label_en, sun_hours_needed, description_nl, description_en, actions_nl, actions_en } = monthData
  const phaseLabel = (isEN && phase_label_en) ? phase_label_en : phase_label_nl
  const description = isEN ? (description_en ?? '') : description_nl
  const actions = isEN ? (actions_en ?? []) : actions_nl

  // Indoor / no-sun-data: skip sun deficit comparison
  if (sunHoursAtSpot == null) {
    return {
      status: ACTIVE_PHASES.has(phase) ? 'good' : 'dormant',
      badgeLabel: phaseLabel,
      detailLabel: description,
      sunNeeded: sun_hours_needed,
      sunActual: 0,
      phaseLabel,
      actions,
    }
  }

  if (!ACTIVE_PHASES.has(phase)) {
    return {
      status: 'dormant',
      badgeLabel: phaseLabel,
      detailLabel: description,
      sunNeeded: 0,
      sunActual: sunHoursAtSpot ?? 0,
      phaseLabel,
      actions,
    }
  }

  const diff = (sunHoursAtSpot ?? 0) - sun_hours_needed

  if (diff >= -0.5) {
    return {
      status: 'good',
      badgeLabel: isEN ? 'Good' : 'Goed',
      detailLabel: sunHoursAtSpot != null
        ? `${description} ${isEN ? 'This spot has enough sun.' : 'Dit punt heeft genoeg zon.'}`
        : description,
      sunNeeded: sun_hours_needed,
      sunActual: sunHoursAtSpot ?? 0,
      phaseLabel,
      actions,
    }
  }

  return {
    status: 'too_little',
    badgeLabel: isEN ? 'Too little sun' : 'Te weinig zon',
    detailLabel: sunHoursAtSpot != null
      ? isEN
        ? `${description} This spot gets ~${sunHoursAtSpot.toFixed(1)}h of sun, but the plant needs ${sun_hours_needed}h.`
        : `${description} Dit punt heeft ~${sunHoursAtSpot.toFixed(1)}u zon, maar de plant heeft ${sun_hours_needed}u nodig.`
      : description,
    sunNeeded: sun_hours_needed,
    sunActual: sunHoursAtSpot ?? 0,
    phaseLabel,
    actions,
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
