import type { MapObject } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import ObjectShape from './ObjectShape'

interface Props {
  objects: MapObject[]
  dragPositions: Record<string, { x: number; y: number }>
  draggingKey: string | null
  selectedId: string | null
  hoveredContainerId: number | null
  showLabels?: boolean
  heatmapCells?: HeatmapCell[]
  onObjectTap: (object: MapObject) => void
  onPointerDown: (e: React.PointerEvent, object: MapObject) => void
  liveRotationId?: string
  liveRotation?: number
}

export default function ObjectsLayer({ objects, dragPositions, draggingKey, selectedId, hoveredContainerId, showLabels = true, heatmapCells, onObjectTap, onPointerDown, liveRotationId, liveRotation }: Props) {
  return (
    <g>
      {objects.map((obj) => {
        const key = `object-${obj.id}`
        const pos = dragPositions[key] ?? { x: obj.map_x ?? 0, y: obj.map_y ?? 0 }
        return (
          <ObjectShape
            key={obj.id}
            object={obj}
            x={pos.x}
            y={pos.y}
            isDragging={draggingKey === key}
            isSelected={selectedId === key}
            isHoverTarget={hoveredContainerId === obj.id}
            showLabel={showLabels}
            heatmapCells={heatmapCells}
            onTap={onObjectTap}
            onPointerDown={onPointerDown}
            liveRotation={liveRotationId === key ? liveRotation : undefined}
          />
        )
      })}
    </g>
  )
}
