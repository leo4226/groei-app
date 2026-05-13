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

export type HaloStatus = 'freezing' | 'dry' | 'chilling' | 'thirsty' | null

export const HALO_COLORS: Record<NonNullable<HaloStatus>, string> = {
  freezing: '#2544a0',
  dry:      '#FF7A2E',
  chilling: '#24e3dc',
  thirsty:  '#FFC233',
}

export function getHaloStatus(plant: { care_status?: 'overdue' | 'due_today' | 'good' | null; temp_status?: TempStatus | null }): HaloStatus {
  const temp  = plant.temp_status  ?? ''
  const water = plant.care_status  ?? ''
  if (temp  === 'freezing')   return 'freezing'
  if (water === 'overdue')    return 'dry'
  if (temp  === 'heatstress') return 'dry'
  if (temp  === 'chilling')   return 'chilling'
  if (water === 'due_today')  return 'thirsty'
  return null
}

export const SEVERITY_HALO_COLORS: Record<'urgent' | 'warning' | 'info', string> = {
  urgent:  '#ea0706',
  warning: '#ff7701',
  info:    '#FFC233',
}

/**
 * Returns the halo colour for a map plant marker based on its top_alert severity.
 * Falls back to the legacy getHaloStatus path if top_alert is absent (e.g. stale cache).
 */
export function getHaloColor(plant: MapPlant): string | null {
  if (plant.top_alert) return SEVERITY_HALO_COLORS[plant.top_alert.severity]
  // Legacy fallback — remove once all API responses include top_alert
  const legacy = getHaloStatus(plant)
  return legacy ? HALO_COLORS[legacy] : null
}
