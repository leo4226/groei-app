import type { HeatmapCell } from '../../utils/heatmapCalc'
import { sunHoursToColor, skyOpennessToColor } from '../../utils/heatmapCalc'
import { bucketFor, bucketColor, type HeatmapLayer } from '../../utils/lightQuality'
import { GARDEN_CLIP } from '../../utils/gardenStructures'

interface Props {
  cells: HeatmapCell[]
  isCalculating: boolean
  layer: HeatmapLayer
  onCellTap?: (cell: HeatmapCell) => void
}

function cellColor(cell: HeatmapCell, layer: HeatmapLayer): string {
  switch (layer) {
    case 'sun_hours':     return sunHoursToColor(cell.sunHours)
    case 'sky_openness':  return skyOpennessToColor(cell.skyOpenness)
    case 'light_quality': return bucketColor(bucketFor(cell.sunHours, cell.skyOpenness))
  }
}

export default function SunHeatmap({ cells, isCalculating, layer, onCellTap }: Props) {
  if (isCalculating) {
    return (
      <g>
        <rect
          x={GARDEN_CLIP.x} y={GARDEN_CLIP.y}
          width={GARDEN_CLIP.width} height={GARDEN_CLIP.height}
          fill="rgba(200,168,48,0.15)"
          style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
        />
      </g>
    )
  }

  if (cells.length === 0) return null

  return (
    <g style={{ pointerEvents: onCellTap ? 'all' : 'none' }}>
      {cells.map((cell, i) => (
        <rect
          key={i}
          x={cell.x}
          y={cell.y}
          width={cell.w}
          height={cell.h}
          fill={cellColor(cell, layer)}
          opacity={0.72}
          onClick={onCellTap ? (e) => { e.stopPropagation(); onCellTap(cell) } : undefined}
        />
      ))}
    </g>
  )
}
