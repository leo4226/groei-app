import { FIXED_PLANTS } from '../../constants/fixedPlants'
import type { FixedPlant } from '../../constants/fixedPlants'
import { useMapRotation } from '../../context/MapRotationContext'

const PX_PER_CM = 0.46

interface Props {
  onTap: (plant: FixedPlant) => void
}

function LockIcon({ r }: { r: number }) {
  // Positioned at bottom-right of the marker circle
  const ox = r * 0.6
  const oy = r * 0.6
  return (
    <g transform={`translate(${ox}, ${oy})`}>
      {/* White backing circle */}
      <circle r={5} fill="rgba(255,255,255,0.85)" />
      {/* Lock body */}
      <rect x={-3} y={-1} width={6} height={5} rx={1} fill="rgba(60,40,20,0.75)" />
      {/* Shackle */}
      <path
        d="M-1.5,-1 L-1.5,-3 A1.5,1.5,0,0,1,1.5,-3 L1.5,-1"
        fill="none"
        stroke="rgba(60,40,20,0.75)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {/* Keyhole dot */}
      <circle cx={0} cy={1.5} r={0.8} fill="rgba(255,255,255,0.7)" />
    </g>
  )
}

export default function FixedPlantsLayer({ onTap }: Props) {
  const counterRot = useMapRotation()
  const rot = counterRot ? `rotate(${counterRot})` : undefined

  return (
    <g>
      {FIXED_PLANTS.map((plant) => {
        const r = plant.displayRadiusCm * PX_PER_CM
        const dotR = r * 0.7
        const innerR = r * 0.3
        const hitR = Math.max(20, r + 6)
        const labelY = r + 10

        return (
          <g
            key={plant.id}
            transform={`translate(${plant.x}, ${plant.y})`}
            onClick={(e) => { e.stopPropagation(); onTap(plant) }}
            style={{ cursor: 'pointer', touchAction: 'none' }}
          >
            {/* Transparent hit area */}
            <circle r={hitR} fill="transparent" />

            {/* Canopy fill — subtle green wash */}
            <circle r={dotR} fill={`${plant.markerColor}22`} stroke={plant.markerColor} strokeWidth={2} strokeDasharray="3 2" opacity={0.7} />
            <circle r={innerR} fill={plant.markerColor} opacity={0.85} />

            {/* Permanent marker ring — darker + dashed to signal "fixed" */}
            <circle r={r} fill="none" stroke={plant.markerColor} strokeWidth={2.5} opacity={0.5} />

            <g transform={rot}>
              {/* Lock glyph */}
              <LockIcon r={r} />

              {/* Label */}
              <text
                y={labelY}
                textAnchor="middle"
                fill="#1f2937"
                fontSize="11"
                fontWeight="500"
                style={{
                  pointerEvents: 'none',
                  paintOrder: 'stroke',
                  stroke: 'rgba(255,255,255,0.9)',
                  strokeWidth: 3,
                  strokeLinejoin: 'round',
                }}
              >
                {plant.name}
              </text>
            </g>
          </g>
        )
      })}
    </g>
  )
}
