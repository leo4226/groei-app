import type { FixedPlant } from '../../constants/fixedPlants'
import type { MapPlant } from '../../types'
import type { PlantHitCandidate } from '../../utils/plantHitTesting'

export interface PlantHitDispatchHandlers {
  onPlantTap: (plant: MapPlant) => void
  onSecondaryMarkerTap?: (plantId: number) => void
  onFixedPlantTap?: (plant: FixedPlant) => void
}

export function dispatchPlantHit(
  candidate: PlantHitCandidate,
  handlers: PlantHitDispatchHandlers,
): void {
  switch (candidate.kind) {
    case 'plant':
    case 'contained':
      handlers.onPlantTap(candidate.payload)
      break
    case 'secondary':
      handlers.onSecondaryMarkerTap?.(candidate.payload.plant_id)
      break
    case 'fixed':
      handlers.onFixedPlantTap?.(candidate.payload)
      break
  }
}
