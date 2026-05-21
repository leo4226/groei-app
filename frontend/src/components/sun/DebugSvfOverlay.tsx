/**
 * Debug overlay for Sky View Factor validation (?debug=svf).
 *
 * Green line = ray escaped (contributes to SVF)
 * Red line   = ray blocked by a shadow-caster
 * Line length is proportional to sqrt(dx²+dy²), i.e. the horizontal component
 * of the ray direction — near-zenith rays appear as short stubs.
 */

import { useMemo } from 'react'
import { computeSkyOpennessDebug } from '../../utils/skyViewFactor'
import type { Obstruction } from '../../utils/skyViewFactor'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { GARDEN_CLIP } from '../../utils/gardenStructures'

const RAY_LEN = 50
const DOT_R   = 3

const BOX_W = 150
const BOX_H = 33

// SVG viewBox bounds — used to clamp the info box so it never leaves the canvas
const VB_MIN_X = GARDEN_CLIP.x - 15
const VB_MAX_X = GARDEN_CLIP.x - 15 + GARDEN_CLIP.width  + 30
const VB_MIN_Y = GARDEN_CLIP.y - 15
const VB_MAX_Y = GARDEN_CLIP.y - 15 + GARDEN_CLIP.height + 30

interface Props {
  cell: HeatmapCell
  obstructions: Obstruction[]
}

export default function DebugSvfOverlay({ cell, obstructions }: Props) {
  const cx = cell.x + cell.w / 2
  const cy = cell.y + cell.h / 2

  const result = useMemo(
    () => computeSkyOpennessDebug({ x: cx, y: cy, z: 0 }, obstructions),
    [cx, cy, obstructions],
  )

  const blocked = result.rays.filter(r => r.blocked).length
  const total   = result.rays.length
  const clear   = total - blocked
  const pct     = Math.round(result.svf * 100)

  // Default position: above-right of the cell centre, clamped inside viewBox
  const boxX = Math.min(Math.max(cx + 10, VB_MIN_X + 2), VB_MAX_X - BOX_W - 2)
  const boxY = Math.min(Math.max(cy - BOX_H - 8, VB_MIN_Y + 2), VB_MAX_Y - BOX_H - 2)

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Ray lines */}
      {result.rays.map((ray, i) => (
        <line
          key={i}
          x1={cx} y1={cy}
          x2={cx + ray.dir.x * RAY_LEN}
          y2={cy + ray.dir.y * RAY_LEN}
          stroke={ray.blocked ? '#f87171' : '#4ade80'}
          strokeWidth={1.1}
          strokeOpacity={0.75}
        />
      ))}

      {/* Cell-centre dot */}
      <circle
        cx={cx} cy={cy} r={DOT_R}
        fill="white" stroke="#1a1a2e" strokeWidth={1} fillOpacity={0.9}
      />

      {/* Info box */}
      <g>
        <rect
          x={boxX} y={boxY}
          width={BOX_W} height={BOX_H}
          rx={5} ry={5}
          fill="#0f172a" fillOpacity={0.9}
          stroke="#334155" strokeWidth={1}
        />
        <text
          x={boxX + 8} y={boxY + 13}
          fill="#fde725" fontSize={10.5} fontWeight="bold" fontFamily="monospace"
        >
          Hemelzicht: {pct}%
        </text>
        <text
          x={boxX + 8} y={boxY + 25}
          fill="#94a3b8" fontSize={8} fontFamily="monospace"
        >
          {clear} vrij · {blocked} blok. · {total} str.
        </text>
      </g>
    </g>
  )
}
