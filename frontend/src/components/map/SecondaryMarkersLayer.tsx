import type { SecondaryMarker } from '../../types'
import { resolveIconUrl } from '../../utils/icons'

interface Props {
  markers: SecondaryMarker[]
  onTap?: (plantId: number) => void
}

/**
 * Extra placements of plants whose primary marker lives elsewhere. Rendered as
 * small dots (with a faint icon when available) that open the parent plant —
 * deliberately lighter than a full PlantMarker so a dense map stays calm.
 */
export default function SecondaryMarkersLayer({ markers, onTap }: Props) {
  if (markers.length === 0) return null
  const R = 9
  return (
    <g>
      {markers.map((m) => {
        const href = m.icon_key ? resolveIconUrl(m.icon_key) : null
        return (
          <g
            key={m.id}
            transform={`translate(${m.map_x}, ${m.map_y})`}
            onClick={(e) => { e.stopPropagation(); onTap?.(m.plant_id) }}
            style={{ cursor: 'pointer' }}
          >
            {/* Tap target + dot background */}
            <circle r={R} fill="var(--color-surface, #fff)" stroke="var(--color-primary, #2f5d3a)" strokeWidth={1.5} opacity={0.95} />
            {href ? (
              <image
                href={href}
                x={-R * 0.7} y={-R * 0.7}
                width={R * 1.4} height={R * 1.4}
                opacity={0.85}
                style={{ pointerEvents: 'none' }}
              />
            ) : (
              <circle r={R * 0.4} fill="var(--color-primary, #2f5d3a)" style={{ pointerEvents: 'none' }} />
            )}
          </g>
        )
      })}
    </g>
  )
}
