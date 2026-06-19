type DraggablePlant = {
  id: number
  is_locked: boolean
}

export type PlantDragMode = {
  /** Global intentional repositioning mode. */
  moveMode: boolean
  /** Optional one-plant move target from the quick sheet. */
  movePlantId: number | null
}

export function canStartPlantDrag(plant: DraggablePlant, mode: PlantDragMode): boolean {
  if (plant.is_locked) return false
  if (mode.movePlantId !== null) return plant.id === mode.movePlantId
  return mode.moveMode
}

export function canStartContainerDrag(mode: PlantDragMode): boolean {
  return mode.moveMode && mode.movePlantId === null
}
