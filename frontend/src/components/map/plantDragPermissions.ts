type DraggablePlant = {
  id: number
  is_locked: boolean
}

type DragPosition = { x: number; y: number }

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

export function resolveDisplayedDragPosition(
  key: string,
  dragPositions: Record<string, DragPosition>,
  fallback: DragPosition,
): DragPosition {
  return dragPositions[key] ?? fallback
}

export function shouldStartMapPan(mode: PlantDragMode): boolean {
  return !mode.moveMode && mode.movePlantId === null
}

export function getPlantDragHitRadius(baseRadius: number, canDrag: boolean): number {
  return canDrag ? Math.max(32, baseRadius + 12) : Math.max(20, baseRadius + 6)
}
