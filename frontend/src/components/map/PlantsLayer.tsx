import type { MapPlant } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import PlantMarker from './PlantMarker'

interface Props {
  plants: MapPlant[]
  dragPositions: Record<string, { x: number; y: number }>
  draggingKey: string | null
  selectedId: string | null
  showLabels?: boolean
  onPlantTap: (plant: MapPlant) => void
  onPointerDown: (e: React.PointerEvent, plant: MapPlant) => void
  heatmapCells?: HeatmapCell[]
}

export default function PlantsLayer({ plants, dragPositions, draggingKey, selectedId, showLabels = true, onPlantTap, onPointerDown, heatmapCells }: Props) {
  return (
    <g>
      {plants.map((plant) => {
        const key = `plant-${plant.id}`
        const pos = dragPositions[key] ?? { x: plant.map_x, y: plant.map_y }
        return (
          <PlantMarker
            key={plant.id}
            plant={plant}
            x={pos.x}
            y={pos.y}
            isDragging={draggingKey === key}
            isSelected={selectedId === key}
            showLabel={showLabels}
            onTap={onPlantTap}
            onPointerDown={onPointerDown}
            heatmapCells={heatmapCells}
          />
        )
      })}
    </g>
  )
}
