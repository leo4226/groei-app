import type { MapObject } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import ObjectShape from './ObjectShape'

interface Props {
  objects: MapObject[]
  hoveredContainerId: number | null
  showLabels?: boolean
  showWarnings?: boolean
  heatmapCells?: HeatmapCell[]
  onObjectTap: (object: MapObject) => void
  onContainerPointerDown?: (e: React.PointerEvent, object: MapObject) => void
  dragPositions?: Record<string, { x: number; y: number }>
}

export default function ObjectsLayer({
  objects,
  hoveredContainerId,
  showLabels = true,
  showWarnings = true,
  heatmapCells,
  onObjectTap,
  onContainerPointerDown,
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
            heatmapCells={heatmapCells}
            onTap={onObjectTap}
            onPointerDown={isContainer ? onContainerPointerDown : undefined}
            isDragging={!!dragPos}
          />
        )
      })}
    </g>
  )
}
