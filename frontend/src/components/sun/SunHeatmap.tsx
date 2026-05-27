import type { HeatmapCell } from '../../utils/heatmapCalc'
import { sunHoursToColor, skyOpennessToColor } from '../../utils/heatmapCalc'
import { bucketFor, bucketColor, type HeatmapLayer } from '../../utils/lightQuality'

interface Props {
  cells: HeatmapCell[]
  isCalculating: boolean
  layer: HeatmapLayer
  bounds: { x: number; y: number; width: number; height: number }
  onCellTap?: (cell: HeatmapCell) => void
  maskPolygon?: [number, number][] | null
}

function cellColor(cell: HeatmapCell, layer: HeatmapLayer): string {
  switch (layer) {
    case 'sun_hours':     return sunHoursToColor(cell.sunHours)
    case 'sky_openness':  return skyOpennessToColor(cell.skyOpenness)
    case 'light_quality': return bucketColor(bucketFor(cell.sunHours, cell.skyOpenness))
  }
}

const CLIP_ID = 'heatmap-clip'

export default function SunHeatmap({ cells, isCalculating, layer, bounds, onCellTap, maskPolygon }: Props) {
  if (isCalculating) {
    return (
      <g>
        <rect
          x={bounds.x} y={bounds.y}
          width={bounds.width} height={bounds.height}
          fill="rgba(200,168,48,0.15)"
          style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
        />
      </g>
    )
  }

  if (cells.length === 0) return null

  return (
    <g>
      <defs>
        <clipPath id={CLIP_ID}>
          {maskPolygon && maskPolygon.length >= 3 ? (
            <polygon points={maskPolygon.map(([x, y]) => `${x},${y}`).join(' ')} />
          ) : (
            <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} />
          )}
        </clipPath>
      </defs>
      <g clipPath={`url(#${CLIP_ID})`} style={{ pointerEvents: onCellTap ? 'all' : 'none' }}>
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
    </g>
  )
}
