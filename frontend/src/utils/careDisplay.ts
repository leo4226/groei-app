import type { MapPlant } from '../types'
import { CARE_TYPE_INFO } from '../types'

export interface CareDisplay {
  tier: 'overdue' | 'due_today' | 'good'
  label: string
  colorClass: string
  badgeColor: string
  urgentLabel: string | null
  lastDoneBy: string | null
  watchlisted: boolean  // stub — wire to plant.is_watchlisted once backend field exists
}

export function getCareDisplay(plant: MapPlant): CareDisplay {
  const tier = plant.care_status
  const urgent = plant.most_urgent

  let urgentLabel: string | null = null
  if (urgent) {
    const info = CARE_TYPE_INFO[urgent.care_type as keyof typeof CARE_TYPE_INFO]
    const icon = info?.icon ?? '🌿'
    const typeLabel = info?.label.toLowerCase() ?? urgent.care_type
    urgentLabel = urgent.days_overdue > 0
      ? `${icon} ${typeLabel} — ${urgent.days_overdue} day${urgent.days_overdue !== 1 ? 's' : ''} overdue`
      : `${icon} ${typeLabel} due today`
  }

  return {
    tier,
    label:      tier === 'overdue' ? 'Needs attention' : tier === 'due_today' ? 'Due today' : 'All good',
    colorClass: tier === 'overdue' ? 'text-overdue'    : tier === 'due_today' ? 'text-due'  : 'text-good',
    badgeColor: tier === 'overdue' ? '#ea0706'         : tier === 'due_today' ? '#ff7701'   : '#24e34c',
    urgentLabel,
    lastDoneBy: urgent?.last_done_by ?? null,
    watchlisted: false,
  }
}
