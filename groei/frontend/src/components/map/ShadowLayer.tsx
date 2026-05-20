import type { ShadowPolygon } from '../../utils/shadowGeometry'

interface Props {
  shadows: ShadowPolygon[]
  clipPolygon?: [number, number][]
}

export default function ShadowLayer({ shadows, clipPolygon }: Props) {
  if (shadows.length === 0) return null

  const clipId = 'garden-shadow-clip'

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          {clipPolygon && clipPolygon.length >= 3 ? (
            <polygon points={clipPolygon.map(([x, y]) => `${x},${y}`).join(' ')} />
          ) : (
            <rect x={0} y={0} width={680} height={680} />
          )}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {shadows.map(s => (
          <path
            key={s.id}
            d={s.pathD}
            fill={`rgba(20, 40, 70, ${s.opacity * 0.35})`}
            style={{ pointerEvents: 'none', transition: 'd 0.15s ease, opacity 0.15s ease' }}
          />
        ))}
      </g>
    </g>
  )
}
