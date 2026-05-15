import type { EditorZone, WallElement } from '../../types'
import { ZONE_STYLES } from './EditorDefs'
import { WALL_COLOR } from '../../constants/mapDefaults'
import RoomWallRenderer from './RoomWallRenderer'

interface Props {
  zone: EditorZone
  zones: EditorZone[]          // all zones — forwarded to RoomWallRenderer
  isSelected: boolean
  scalePxPerM: number
  wallElements: WallElement[]
  selectedWallElementId: string | null
  onPointerDown: (e: React.PointerEvent, zoneId: string) => void
  onSelectWallElement: (id: string) => void
  onWallElementPointerDown: (e: React.PointerEvent, elementId: string) => void
}

export default function EditorZoneShape({ zone, zones, isSelected, scalePxPerM, wallElements, selectedWallElementId, onPointerDown, onSelectWallElement, onWallElementPointerDown }: Props) {
  if (zone.type === 'room' || zone.type === 'structure') {
    return (
      <RoomWallRenderer
        zone={zone}
        zones={zones}
        scalePxPerM={scalePxPerM}
        wallElements={wallElements}
        isSelected={isSelected}
        onPointerDown={onPointerDown}
        onSelectWallElement={onSelectWallElement}
        onWallElementPointerDown={onWallElementPointerDown}
        selectedWallElementId={selectedWallElementId}
      />
    )
  }

  // Wall zones render as a solid architectural wall block
  if (zone.type === 'wall') {
    return (
      <g>
        <rect
          x={zone.x} y={zone.y}
          width={zone.width} height={zone.height}
          fill={WALL_COLOR}
          onPointerDown={(e) => onPointerDown(e, zone.id)}
          style={{ cursor: 'pointer' }}
        />
        {isSelected && (
          <rect
            x={zone.x} y={zone.y}
            width={zone.width} height={zone.height}
            fill="none" stroke="#4A90D9"
            strokeWidth={2} strokeDasharray="6 3"
            pointerEvents="none"
          />
        )}
      </g>
    )
  }

  const style = ZONE_STYLES[zone.type]

  return (
    <g>
      {/* Base fill */}
      <rect
        x={zone.x}
        y={zone.y}
        width={zone.width}
        height={zone.height}
        fill={style.fill}
        opacity={style.opacity}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        onPointerDown={(e) => onPointerDown(e, zone.id)}
        style={{ cursor: 'pointer' }}
      />
      {/* Pattern overlay */}
      {style.patternId && (
        <rect
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          fill={`url(#${style.patternId})`}
          opacity={style.patternOpacity ?? 1}
          pointerEvents="none"
        />
      )}
      {/* Selection border */}
      {isSelected && (
        <rect
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          fill="none"
          stroke="#4A90D9"
          strokeWidth={2}
          strokeDasharray="6 3"
          pointerEvents="none"
        />
      )}
      {/* Label */}
      {zone.label && zone.width > 40 && zone.height > 20 && (
        <text
          x={zone.x + zone.width / 2}
          y={zone.y + zone.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.8)"
          fontSize={Math.min(12, zone.width / 8)}
          fontWeight={500}
          pointerEvents="none"
        >
          {zone.label}
        </text>
      )}
    </g>
  )
}
