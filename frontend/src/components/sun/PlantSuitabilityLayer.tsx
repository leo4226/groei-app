import type { HeatmapCell } from '../../utils/heatmapCalc'
import type { PlantSunProfile } from '../../utils/plantSunRequirements'

interface Props {
  cells: HeatmapCell[]
  profile: PlantSunProfile
}

export default function PlantSuitabilityLayer({ cells, profile }: Props) {
  const suitable = cells.filter(
    c => c.sunHours >= profile.minHours && c.sunHours <= profile.maxHours
  )

  if (suitable.length === 0) return null

  return (
    <g style={{ pointerEvents: 'none' }}>
      {suitable.map((cell, i) => (
        <rect
          key={i}
          x={cell.x}
          y={cell.y}
          width={cell.w}
          height={cell.h}
          fill={profile.color}
          fillOpacity={0.25}
          stroke={profile.color}
          strokeWidth={0.5}
          strokeOpacity={0.6}
        />
      ))}
    </g>
  )
}
