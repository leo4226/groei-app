// Deprecated — replaced by top_warning / warnings from the plant warnings system (Phase C).
// Kept for backward compat with existing imports; prefer CareWarningOut.color when available.
import type { MapPlant } from '../types'

export interface CareDisplay {
  badgeColor: string
}

export function getCareDisplay(plant: MapPlant): CareDisplay {
  if (plant.top_warning?.color) return { badgeColor: plant.top_warning.color }
  if (plant.care_status === 'overdue')  return { badgeColor: '#B2664A' }
  if (plant.care_status === 'due_today') return { badgeColor: '#E8A838' }
  if (plant.temp_status === 'freezing')  return { badgeColor: '#3C7DC4' }
  if (plant.temp_status === 'chilling')  return { badgeColor: '#6A9FD4' }
  if (plant.temp_status === 'heatstress') return { badgeColor: '#E07040' }
  return { badgeColor: '#888' }
}
