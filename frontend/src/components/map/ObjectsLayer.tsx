import type { MapObject } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import ObjectShape from './ObjectShape'

interface Props {
  objects: MapObject[]
  hoveredContainerId: number | null
  showLabels?: boolean
  showWarnings?: boolean
  highlightedWeatherPlantIds?: ReadonlySet<number>
  heatmapCells?: HeatmapCell[]
  dragPositions?: Record<string, { x: number; y: number }>
}

export default function ObjectsLayer({
  objects,
  hoveredContainerId,
  showLabels = true,
  showWarnings = true,
  highlightedWeatherPlantIds,
  heatmapCells,
  dragPositions,
}: Props) {
  return (
    <g>
      {objects.map((obj) => {
        const isContainer = obj.category === 'container'
        const key = `container-${obj.id}`
        const dragPos = isContainer ? dragPositions?.[key] : undefined
        return (
          <ObjectShape
            key={obj.id}
            object={obj}
            x={dragPos?.x ?? obj.map_x ?? 0}
            y={dragPos?.y ?? obj.map_y ?? 0}
            isHoverTarget={hoveredContainerId === obj.id}
            showLabel={showLabels}
            showWarnings={showWarnings}
            highlightedWeatherPlantIds={highlightedWeatherPlantIds}
            heatmapCells={heatmapCells}
          />
        )
      })}
    </g>
  )
}
