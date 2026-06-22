import type { MapObject, HardscapePreset } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getCareDisplay } from '../../utils/careDisplay'
import { getSunFit, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'
import { getHaloColor } from '../../hooks/usePlantStatus'
import { resolveIconUrl } from '../../utils/icons'
import { markerBadgesForPlant } from './PlantMarker'

const PX_PER_CM = 0.46 // 46px per meter = 0.46px per cm

interface Props {
  object: MapObject
  x: number
  y: number
  isHoverTarget?: boolean
  showLabel?: boolean
  heatmapCells?: HeatmapCell[]
  onTap?: (object: MapObject) => void
  onPointerDown?: (e: React.PointerEvent, object: MapObject) => void
  isDragging?: boolean
}

function labelForObject(obj: MapObject): string {
  if (obj.category !== 'container') return obj.label || obj.name
  const plants = obj.contained_plants
  if (!plants || plants.length === 0) return obj.name
  if (plants.length === 1) return plants[0].name
  return `${plants[0].name} +${plants.length - 1}`
}

function renderHardscapeShape(preset: HardscapePreset, color: string, w: number, h: number, sw: number) {
  switch (preset) {
    case 'stepping_stone':
      return (
        <rect
          x={-w / 2} y={-h / 2}
          width={w} height={h}
          rx={8} ry={8}
          fill={color} fillOpacity={0.85}
          stroke="#8a8070" strokeWidth={sw}
        />
      )
    case 'bench':
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} rx={3} />
          <rect x={-w / 2} y={-h / 2 - 6} width={8} height={h + 12} rx={2} fill={color} />
          <rect x={w / 2 - 8} y={-h / 2 - 6} width={8} height={h + 12} rx={2} fill={color} />
        </g>
      )
    case 'chair':
      return (
        <g>
          <rect x={-w / 2} y={-h * 0.65 / 2} width={w} height={h * 0.65} fill={color} rx={3} />
          <rect x={-w / 2} y={-h * 0.65 / 2 - h * 0.3} width={w} height={h * 0.3}
            fill={color} fillOpacity={0.7} rx={2} />
        </g>
      )
    case 'table':
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} rx={4} />
          <rect x={-w / 2 + 4} y={-h / 2 + 4} width={w - 8} height={h - 8}
            fill="none" stroke="#fff" strokeOpacity={0.2} strokeWidth={1} rx={2} />
        </g>
      )
    case 'rain_barrel': {
      const r = w / 2
      return (
        <g>
          <circle r={r} fill={color} />
          <line x1={-r + 4} x2={r - 4} y1={-r * 0.3} y2={-r * 0.3}
            stroke="#fff" strokeOpacity={0.2} strokeWidth={1.5} />
          <line x1={-r + 4} x2={r - 4} y1={r * 0.3} y2={r * 0.3}
            stroke="#fff" strokeOpacity={0.2} strokeWidth={1.5} />
        </g>
      )
    }
  }
}

export default function ObjectShape({ object, x, y, isHoverTarget, showLabel = true, heatmapCells, onTap, onPointerDown, isDragging = false }: Props) {
  const color = object.color || '#888888'
  const effectiveRotation = object.rotation || 0
  const fill = color + '33'
  const stroke = color
  const sw = 1.2

  const renderShape = () => {
    switch (object.shape) {
      case 'circle': {
        const r = ((object.diameter_cm || 30) * PX_PER_CM) / 2
        return <circle r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
      }
      case 'square': {
        const size = (object.width_cm || 30) * PX_PER_CM
        return (
          <rect
            x={-size / 2} y={-size / 2}
            width={size} height={size}
            rx={2}
            fill={fill} stroke={stroke} strokeWidth={sw}
          />
        )
      }
      case 'rectangle': {
        const w = (object.width_cm || 80) * PX_PER_CM
        const d = (object.depth_cm || 40) * PX_PER_CM
        return (
          <rect
            x={-w / 2} y={-d / 2}
            width={w} height={d}
            rx={2}
            fill={fill} stroke={stroke} strokeWidth={sw}
          />
        )
      }
    }
  }

  // Compute hit area size
  const hitR = Math.max(
    20,
    object.shape === 'circle'
      ? ((object.diameter_cm || 30) * PX_PER_CM) / 2 + 5
      : Math.max((object.width_cm || 30), (object.depth_cm || object.width_cm || 30)) * PX_PER_CM / 2 + 5
  )

  // Sun-fit cell at this object's SVG position (shared by all contained plants)
  const heatCell = heatmapCells?.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) ?? null

  // Render contained plants as icons inside the shape
  const renderContainedPlants = () => {
    const plants = object.contained_plants
    if (!plants || plants.length === 0) return null

    const bound = getShapeBound(object)
    const count = plants.length
    // Circles can be filled more aggressively; rectangles/squares must stay within bounds
    const singleMultiplier = object.shape === 'circle' ? 1.00 : 0.65
    const iconHalf = count === 1
      ? bound * singleMultiplier
      : bound / (count <= 2 ? 2.4 : count <= 4 ? 3.2 : 4.2)
    const dotR = iconHalf * 0.35
    const positions = getContainedPositions(count, bound * (count === 1 ? 0 : 0.55))

    return plants.map((plant, i) => {
      const pos = positions[i]
      const dotColor = getCareDisplay(plant).badgeColor
      const sunFit = heatCell && plant.sun_requirement
        ? getSunFit(plant.sun_requirement, heatCell.sunHours)
        : null
      const haloColor = getHaloColor(plant)
      const alerts = markerBadgesForPlant(plant)
      return (
        <g key={plant.id} transform={`translate(${pos.x}, ${pos.y})`}>
          {/* Status halo — extends beyond pot outline to shine through */}
          {haloColor && (
            <>
              <defs>
                <radialGradient id={`halo-${plant.id}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={haloColor} stopOpacity={0.70} />
                  <stop offset="100%" stopColor={haloColor} stopOpacity={0}    />
                </radialGradient>
              </defs>
              <circle r={iconHalf * 1.6} fill={`url(#halo-${plant.id})`} style={{ pointerEvents: 'none' }} />
            </>
          )}
          {/* Sun-fit ring — only visible in Zonkaart mode */}
          {sunFit && (
            <circle
              r={iconHalf + 3}
              fill="none"
              stroke={SUN_FIT_COLORS[sunFit]}
              strokeWidth={1.2}
              strokeDasharray={sunFit === 'good' ? 'none' : '2 2'}
              opacity={0.85}
            />
          )}
          {plant.icon_key ? (
            <image
              href={resolveIconUrl(plant.icon_key)!}
              x={-iconHalf}
              y={-iconHalf}
              width={iconHalf * 2}
              height={iconHalf * 2}
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <circle r={dotR} fill={dotColor} opacity={0.8} />
          )}
          {/* Alert badges — arc around top of plant */}
          {alerts.length > 0 && alerts.map((a, i) => {
            const count = alerts.length
            const totalArc = Math.min(count * 30, 140)
            const startDeg = -(totalArc / 2)
            const step = count > 1 ? totalArc / (count - 1) : 0
            const deg = startDeg + i * step
            const rad = (deg * Math.PI) / 180
            const orbitR = iconHalf + 4
            const bx = orbitR * Math.sin(rad)
            const by = -(orbitR * Math.cos(rad))
            return (
            <g key={a.alert_type} style={{ pointerEvents: 'none' }}>
              <circle
                cx={bx}
                cy={by}
                r={6}
                fill="white"
                stroke={haloColor ?? '#888'}
                strokeWidth={1.5}
              />
              <text
                x={bx}
                y={by}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={7}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {a.icon}
              </text>
            </g>
            )
          })}
        </g>
      )
    })
  }

  const interactive = !!(onTap || onPointerDown)

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${effectiveRotation})`}
      onClick={onTap ? (e) => { e.stopPropagation(); if (!isDragging) onTap(object) } : undefined}
      onPointerDown={onPointerDown ? (e) => { e.stopPropagation(); onPointerDown(e, object) } : undefined}
      style={{
        cursor: onPointerDown ? (isDragging ? 'grabbing' : 'grab') : onTap ? 'pointer' : undefined,
        touchAction: onPointerDown ? 'none' : undefined,
        opacity: isDragging ? 0.75 : 1,
        pointerEvents: interactive ? undefined : 'none',
      }}
    >
      {/* Transparent hit area — only when interactive */}
      {interactive && <circle r={hitR} fill="transparent" />}

      {object.category !== 'container' && object.preset
        ? renderHardscapeShape(
            object.preset as HardscapePreset, color,
            object.shape === 'circle'
              ? (object.diameter_cm || 60) * PX_PER_CM
              : (object.width_cm || 80) * PX_PER_CM,
            (object.depth_cm || object.width_cm || 60) * PX_PER_CM,
            sw,
          )
        : renderShape()
      }

      {/* Pulsing highlight ring when a plant is dragged over this container */}
      {isHoverTarget && object.category === 'container' && (() => {
        const pad = 4
        switch (object.shape) {
          case 'circle': {
            const r = ((object.diameter_cm || 30) * PX_PER_CM) / 2 + pad
            return (
              <circle r={r} fill="none" stroke="var(--color-primary)" strokeWidth={2}>
                <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite" />
              </circle>
            )
          }
          case 'square': {
            const s = (object.width_cm || 30) * PX_PER_CM + pad * 2
            return (
              <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={4} fill="none" stroke="var(--color-primary)" strokeWidth={2}>
                <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite" />
              </rect>
            )
          }
          case 'rectangle': {
            const w = (object.width_cm || 80) * PX_PER_CM + pad * 2
            const d = (object.depth_cm || 40) * PX_PER_CM + pad * 2
            return (
              <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={4} fill="none" stroke="var(--color-primary)" strokeWidth={2}>
                <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite" />
              </rect>
            )
          }
        }
      })()}

      {object.category === 'container' && renderContainedPlants()}

      {/* Label: counter-rotate by the object's own rotation so text reads upright */}
      {showLabel && object.category === 'container' && (
        <g transform={`rotate(${-effectiveRotation})`}>
          <text
            y={getShapeBound(object) + 12}
            textAnchor="middle"
            fill="#1f2937"
            fontSize="9"
            fontWeight="500"
            style={{
              pointerEvents: 'none',
              paintOrder: 'stroke',
              stroke: 'rgba(255,255,255,0.9)',
              strokeWidth: 3,
              strokeLinejoin: 'round',
            }}
          >
            {labelForObject(object)}
          </text>
        </g>
      )}

    </g>
  )
}

function getShapeBound(object: MapObject): number {
  switch (object.shape) {
    case 'circle':
      return ((object.diameter_cm || 30) * PX_PER_CM) / 2
    case 'square':
      return ((object.width_cm || 30) * PX_PER_CM) / 2
    case 'rectangle':
      return ((object.depth_cm || 40) * PX_PER_CM) / 2
  }
}

function getContainedPositions(count: number, spread: number): { x: number; y: number }[] {
  if (count === 1) return [{ x: 0, y: 0 }]
  if (count === 2) return [{ x: -spread * 0.5, y: 0 }, { x: spread * 0.5, y: 0 }]
  if (count === 3) return [{ x: -spread * 0.45, y: -spread * 0.3 }, { x: spread * 0.45, y: -spread * 0.3 }, { x: 0, y: spread * 0.4 }]
  // 4+ in a 2xN grid
  const positions: { x: number; y: number }[] = []
  const cols = 2
  const gap = spread * 0.7
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.push({ x: (col - 0.5) * gap, y: (row - (Math.ceil(count / cols) - 1) / 2) * gap })
  }
  return positions
}
