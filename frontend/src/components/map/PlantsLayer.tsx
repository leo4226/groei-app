import { useMemo } from 'react'
import type { MapPlant } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import PlantMarker, { PLANT_LABEL_FONT_SIZE } from './PlantMarker'
import { canStartPlantDrag, resolveDisplayedDragPosition } from './plantDragPermissions'
import { useT } from '../../context/LanguageContext'
import { plantDisplayName } from '../../utils/plantDisplayName'
import { PX_PER_CM } from '../../utils/gardenStructures'
import { pickVisibleLabels, type LabelCandidate } from '../../utils/labelDeclutter'

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

// Label baseline sits this far below the plant icon (mirrors PlantMarker).
const LABEL_OFFSET_BELOW_ICON = 10
// Rough average glyph width as a fraction of font size for a 500-weight sans.
const AVG_CHAR_WIDTH_RATIO = 0.55

export default function PlantsLayer({ plants, mapType, dragPositions, draggingKey, selectedId, moveMode = false, movePlantId = null, showLabels = true, showWarnings = true, onPlantTap, onPointerDown, heatmapCells }: Props) {
  const t = useT()

  // When labels are on, decide which ones actually render so they don't overlap
  // into unreadable mush in dense clusters. The selected plant is forced (a tap
  // always reveals a name). When labels are off, this stays empty and only the
  // selected plant's contextual label shows.
  const visibleLabelIds = useMemo(() => {
    if (!showLabels) return new Set<number>()
    const candidates: LabelCandidate[] = plants.map((plant) => {
      const pos = resolveDisplayedDragPosition(
        `plant-${plant.id}`, dragPositions, { x: plant.map_x, y: plant.map_y },
      )
      const baseR = plant.display_radius_cm ? plant.display_radius_cm * PX_PER_CM : 14
      const iconR0 = baseR * 0.85
      const iconR = plant.is_locked ? Math.min(iconR0, 28) : iconR0
      const baselineY = pos.y + iconR + LABEL_OFFSET_BELOW_ICON
      const name = plantDisplayName(plant, t.locale)
      const isSel = selectedId === `plant-${plant.id}`
      return {
        id: plant.id,
        cx: pos.x,
        topY: baselineY - PLANT_LABEL_FONT_SIZE,   // baseline → box top
        width: Math.max(name.length * PLANT_LABEL_FONT_SIZE * AVG_CHAR_WIDTH_RATIO, PLANT_LABEL_FONT_SIZE * 2),
        height: PLANT_LABEL_FONT_SIZE + 3,
        priority: isSel ? 0 : 1,
        forced: isSel,
      }
    })
    // Tight gap: only drop a label on a real overlap, so as many names as
    // possible survive at the current zoom.
    return pickVisibleLabels(candidates, 1)
  }, [plants, dragPositions, selectedId, showLabels, t.locale])

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
            showLabel={visibleLabelIds.has(plant.id) || isSelected}
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
