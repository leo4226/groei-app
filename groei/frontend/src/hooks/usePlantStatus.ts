import type { MapPlant } from '../types'

export type WaterStatus = 'hydrated' | 'thirsty' | 'dry'
export type TempStatus = 'comfortable' | 'chilling' | 'freezing' | 'heatstress'
export type HaloStatus = 'dry' | 'thirsty' | 'chilling' | 'freezing' | 'heatstress'

export interface PlantStatus {
  waterStatus: WaterStatus
  tempStatus: TempStatus
}

export const HALO_COLORS: Record<HaloStatus | 'needs_care', string> = {
  needs_care: '#B2664A',
  dry: '#B2664A',
  thirsty: '#E8A838',
  chilling: '#6A9FD4',
  freezing: '#3C7DC4',
  heatstress: '#E07040',
}

/** Returns a halo color for a plant's most urgent warning, or null. */
export function getHaloColor(plant: MapPlant): string | null {
  if (plant.top_warning?.color) return plant.top_warning.color
  if (plant.care_status === 'overdue') return HALO_COLORS.dry
  if (plant.care_status === 'due_today') return HALO_COLORS.thirsty
  if (plant.temp_status === 'freezing') return HALO_COLORS.freezing
  if (plant.temp_status === 'chilling') return HALO_COLORS.chilling
  if (plant.temp_status === 'heatstress') return HALO_COLORS.heatstress
  return null
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
