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
