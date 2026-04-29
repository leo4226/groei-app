import type { EditorZone } from '../../types'
import { ZONE_STYLES } from './EditorDefs'

interface Props {
  zone: EditorZone
  isSelected: boolean
  onPointerDown: (e: React.PointerEvent, zoneId: string) => void
}

export default function EditorZoneShape({ zone, isSelected, onPointerDown }: Props) {
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
