import type { MapObject } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { STATUS_COLORS, StatusBadge } from './PlantMarker'
import { getPlantStatus } from '../../hooks/usePlantStatus'
import { getSunFit, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'
import { useMapRotation } from '../../context/MapRotationContext'

const PX_PER_CM = 0.46 // 46px per meter = 0.46px per cm

interface Props {
  object: MapObject
  x: number
  y: number
  isDragging: boolean
  isSelected?: boolean
  isHoverTarget?: boolean
  showLabel?: boolean
  heatmapCells?: HeatmapCell[]
  onTap: (object: MapObject) => void
  onPointerDown: (e: React.PointerEvent, object: MapObject) => void
}

function labelForObject(obj: MapObject): string {
  const plants = obj.contained_plants
  if (!plants || plants.length === 0) return obj.name
  if (plants.length === 1) return plants[0].name
  return `${plants[0].name} +${plants.length - 1}`
}

export default function ObjectShape({ object, x, y, isDragging, isSelected, isHoverTarget, showLabel = true, heatmapCells, onTap, onPointerDown }: Props) {
  const counterRot = useMapRotation()
  const color = object.color || '#888888'
  const fill = color + '33'
  const stroke = color
  const sw = isDragging ? 2 : isSelected ? 1.8 : 1.2

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
      const dotColor = STATUS_COLORS[plant.care_status] ?? STATUS_COLORS.good
      const sunFit = heatCell && plant.sun_requirement
        ? getSunFit(plant.sun_requirement, heatCell.sunHours)
        : null
      const { tempStatus } = getPlantStatus(plant)
      const badgeOffset = iconHalf * 0.72
      return (
        <g key={plant.id} transform={`translate(${pos.x}, ${pos.y})`}>
          {/* Sun-fit ring — only visible in Zonkaart mode */}
          {sunFit && (
            <circle
              r={iconHalf + 3}
              fill="none"
              stroke={SUN_FIT_COLORS[sunFit]}
              strokeWidth={isDragging ? 2 : 1.2}
              strokeDasharray={sunFit === 'good' ? 'none' : '2 2'}
              opacity={0.85}
            />
          )}
          <g transform={counterRot ? `rotate(${counterRot})` : undefined}>
            {plant.icon_key ? (
              <image
                href={`/api/icons/${plant.icon_key}.svg`}
                x={-iconHalf}
                y={-iconHalf}
                width={iconHalf * 2}
                height={iconHalf * 2}
                style={{ pointerEvents: 'none' }}
              />
            ) : (
              <circle r={dotR} fill={dotColor} opacity={0.8} />
            )}
          </g>
          <StatusBadge cx={badgeOffset} cy={badgeOffset} tempStatus={tempStatus} />
        </g>
      )
    })
  }

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${object.rotation || 0})`}
      onClick={(e) => { e.stopPropagation(); if (!isDragging) onTap(object) }}
      onPointerDown={(e) => onPointerDown(e, object)}
      style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
    >
      {/* Transparent hit area */}
      <circle r={hitR} fill="transparent" />

      {renderShape()}

      {/* Pulsing highlight ring when a plant is dragged over this container */}
      {isHoverTarget && (() => {
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

      {renderContainedPlants()}

      {/* Label: counter-rotate by object's own rotation + SVG orientation so text is always upright */}
      {showLabel && (
        <g transform={`rotate(${counterRot - (object.rotation || 0)})`}>
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

      {/* Drag pill — worst sun-fit among contained plants */}
      {isDragging && heatCell && (() => {
        const plants = (object.contained_plants ?? []).filter(p => p.sun_requirement)
        if (plants.length === 0) return null
        const fits = plants.map(p => getSunFit(p.sun_requirement!, heatCell.sunHours))
        const order = { poor: 0, partial: 1, good: 2 }
        const worstFit = fits.reduce((a, b) =>
          (order[a ?? 'good'] ?? 2) <= (order[b ?? 'good'] ?? 2) ? a : b
        )
        if (!worstFit) return null
        const pillY = getShapeBound(object) + 28
        return (
          <g transform={`rotate(${counterRot - (object.rotation || 0)})`}>
            <rect x={-54} y={pillY - 9} width={108} height={18} rx={9}
              fill={SUN_FIT_COLORS[worstFit]} opacity={0.92} />
            <text
              y={pillY}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="9"
              fontWeight="600"
              style={{ pointerEvents: 'none' }}
            >
              {`~${heatCell.sunHours.toFixed(1)}u · ${
                worstFit === 'good' ? 'Goed' :
                worstFit === 'partial' ? 'Deels' : 'Te weinig'
              }`}
            </text>
          </g>
        )
      })()}
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
