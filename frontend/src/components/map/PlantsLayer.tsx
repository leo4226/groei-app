import type { MapPlant } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import PlantMarker from './PlantMarker'
import { canStartPlantDrag, resolveDisplayedDragPosition } from './plantDragPermissions'
import { useT } from '../../context/LanguageContext'
import { plantDisplayName } from '../../utils/plantDisplayName'

interface Props {
  plants: MapPlant[]
  mapType: 'outdoor' | 'indoor'
  dragPositions: Record<string, { x: number; y: number }>
  draggingKey: string | null
  selectedId: string | null
  moveMode?: boolean
  movePlantId?: number | null
  showLabels?: boolean
  showWarnings?: boolean
  onPlantTap: (plant: MapPlant) => void
  onPointerDown: (e: React.PointerEvent, plant: MapPlant) => void
  heatmapCells?: HeatmapCell[]
}

export default function PlantsLayer({ plants, mapType, dragPositions, draggingKey, selectedId, moveMode = false, movePlantId = null, showLabels = true, showWarnings = true, onPlantTap, onPointerDown, heatmapCells }: Props) {
  const t = useT()

  return (
    <g>
      {plants.map((plant) => {
        const key = `plant-${plant.id}`
        const pos = resolveDisplayedDragPosition(key, dragPositions, { x: plant.map_x, y: plant.map_y })
        const canDrag = canStartPlantDrag(plant, { moveMode, movePlantId })
        // Contextual labels: when global labels are off, still show the name of
        // the selected plant so tapping reveals it without crowding the canvas.
        const isSelected = selectedId === key
        return (
          <PlantMarker
            key={plant.id}
            plant={plant}
            mapType={mapType}
            x={pos.x}
            y={pos.y}
            isDragging={draggingKey === key}
            canDrag={canDrag}
            isSelected={isSelected}
            showLabel={showLabels || isSelected}
            showWarnings={showWarnings}
            displayName={plantDisplayName(plant, t.locale)}
            onTap={onPlantTap}
            onPointerDown={onPointerDown}
            heatmapCells={heatmapCells}
          />
        )
      })}
    </g>
  )
}
