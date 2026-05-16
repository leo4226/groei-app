import type { MapPlant } from '../types'

export type WaterStatus = 'hydrated' | 'thirsty' | 'dry'
export type TempStatus = 'comfortable' | 'chilling' | 'freezing' | 'heatstress'

export interface PlantStatus {
  waterStatus: WaterStatus
  tempStatus: TempStatus
}

export function getPlantStatus(plant: MapPlant): PlantStatus {
  const waterStatus: WaterStatus =
    plant.care_status === 'overdue'   ? 'dry' :
    plant.care_status === 'due_today' ? 'thirsty' :
    'hydrated'

  return { waterStatus, tempStatus: plant.temp_status }
}

/** Aggregates status counts across a list of map plants. */
export function aggregatePlantStatuses(plants: MapPlant[]) {
  const counts = { dry: 0, thirsty: 0, chilling: 0, freezing: 0, heatstress: 0 }
  for (const p of plants) {
    const { waterStatus, tempStatus } = getPlantStatus(p)
    if (waterStatus === 'dry')        counts.dry++
    else if (waterStatus === 'thirsty') counts.thirsty++
    if (tempStatus === 'freezing')    counts.freezing++
    else if (tempStatus === 'chilling') counts.chilling++
    else if (tempStatus === 'heatstress') counts.heatstress++
  }
  return counts
}

export type HaloStatus = 'freezing' | 'heat' | 'needs_care' | null

export const HALO_COLORS: Record<NonNullable<HaloStatus>, string> = {
  freezing:  '#2544a0',
  heat:      '#ea0706',
  needs_care: '#FFC233',
}

export function getHaloStatus(plant: { care_status?: 'overdue' | 'due_today' | 'good' | null; temp_status?: TempStatus | null }): HaloStatus {
  const temp  = plant.temp_status  ?? ''
  const water = plant.care_status  ?? ''
  // Weather alerts take priority
  if (temp === 'freezing' || temp === 'chilling') return 'freezing'
  if (temp === 'heatstress') return 'heat'
  // Any care need → amber (overdue, due today — all one level)
  if (water === 'overdue' || water === 'due_today') return 'needs_care'
  return null
}

export const SEVERITY_HALO_COLORS: Record<'urgent' | 'warning' | 'info', string> = {
  urgent:  '#ea0706',
  warning: '#ff7701',
  info:    '#FFC233',
}

/**
 * Returns the halo colour for a map plant marker.
 * Blue=cold/frost, red=heat stress, amber=care needed.
 * Falls back to top_alert severity when the plant is otherwise healthy.
 */
export function getHaloColor(plant: MapPlant): string | null {
  const legacy = getHaloStatus(plant)
  if (legacy) return HALO_COLORS[legacy]
  // Server-driven top_alert — only for info-level alerts on healthy plants
  if (plant.top_alert) return SEVERITY_HALO_COLORS[plant.top_alert.severity]
  return null
}
