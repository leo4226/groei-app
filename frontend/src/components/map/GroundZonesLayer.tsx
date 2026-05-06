import type { GroundZone } from '../../types'

interface Props {
  zones: GroundZone[]
  hoveredZoneId: string | null
}

const ZONE_FILL: Record<string, string> = {
  earth: '#7B5C2A',
  raised_bed: '#8B5A30',
  border: '#4A7A2A',
}

export default function GroundZonesLayer({ zones, hoveredZoneId }: Props) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {zones.map((zone) => {
        const polygon: [number, number][] = JSON.parse(zone.polygon)
        const points = polygon.map(([x, y]) => `${x},${y}`).join(' ')
        const isHovered = zone.id === hoveredZoneId
        const fill = ZONE_FILL[zone.zone_type] ?? ZONE_FILL.earth

        return (
          <g key={zone.id}>
            {/* Subtle dashed outline — always shown */}
            <polygon
              points={points}
              fill="none"
              stroke={fill}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              opacity={0.35}
            />
            {/* Warm tint fill — only during active hover */}
            {isHovered && (
              <polygon
                points={points}
                fill={fill}
                fillOpacity={0.25}
                stroke={fill}
                strokeWidth={2}
                strokeDasharray="none"
              />
            )}
          </g>
        )
      })}
    </g>
  )
}
