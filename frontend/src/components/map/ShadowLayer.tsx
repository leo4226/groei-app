import type { ShadowPolygon } from '../../utils/shadowGeometry'
import { GARDEN_CLIP } from '../../utils/gardenStructures'

interface Props {
  shadows: ShadowPolygon[]
}

export default function ShadowLayer({ shadows }: Props) {
  if (shadows.length === 0) return null

  return (
    <g>
      <defs>
        <clipPath id="garden-shadow-clip">
          <rect
            x={GARDEN_CLIP.x}
            y={GARDEN_CLIP.y}
            width={GARDEN_CLIP.width}
            height={GARDEN_CLIP.height}
          />
        </clipPath>
      </defs>
      <g clipPath="url(#garden-shadow-clip)">
        {shadows.map(s => (
          <path
            key={s.id}
            d={s.pathD}
            fill={`rgba(15, 25, 40, ${s.opacity})`}
            style={{ pointerEvents: 'none', transition: 'd 0.15s ease, opacity 0.15s ease' }}
          />
        ))}
      </g>
    </g>
  )
}
