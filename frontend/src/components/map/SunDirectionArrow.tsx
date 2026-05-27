import type { SunPosition } from '../../utils/sunCalc'

interface Props {
  sunPosition: SunPosition
  /** Garden bounding rectangle in SVG coordinates */
  clipRect: { x: number; y: number; width: number; height: number }
  /** Map bearing — compass direction of the map's "up" in degrees CW from north */
  bearing: number
}

/**
 * Yellow circle indicator on the garden edge showing where the sun is.
 * Positioned at the point on the garden boundary closest to the sun's direction.
 */
export default function SunDirectionArrow({ sunPosition, clipRect, bearing }: Props) {
  if (!sunPosition.isUp) return null

  const { x, y: clipY, width, height } = clipRect
  const cx = x + width / 2
  const cy = clipY + height / 2

  const svgAngleRad = (sunPosition.azimuthDeg - bearing) * Math.PI / 180
  const sunDirX = Math.sin(svgAngleRad)
  const sunDirY = -Math.cos(svgAngleRad)

  // Cast ray from center to garden boundary edge
  const halfW = width / 2
  const halfH = height / 2
  let t = Infinity
  if (sunDirX !== 0) t = Math.min(t, Math.abs((sunDirX > 0 ? halfW : -halfW) / sunDirX))
  if (sunDirY !== 0) t = Math.min(t, Math.abs((sunDirY > 0 ? halfH : -halfH) / sunDirY))

  const px = cx + sunDirX * t
  const py = cy + sunDirY * t

  // Size based on altitude (bigger when higher)
  const r = 6 + sunPosition.altitudeDeg / 10

  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle
        cx={px}
        cy={py}
        r={r + 4}
        fill="rgba(255, 200, 50, 0.15)"
      />
      <circle
        cx={px}
        cy={py}
        r={r}
        fill="rgba(255, 180, 30, 0.7)"
        stroke="rgba(255, 220, 80, 0.9)"
        strokeWidth={1.5}
      />
    </g>
  )
}
