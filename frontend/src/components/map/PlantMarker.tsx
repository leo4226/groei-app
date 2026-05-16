import type { MapPlant } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getSunFit, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'
import { computeSuitability } from '../../utils/suitability'
import { useMapRotation } from '../../context/MapRotationContext'
import { getHaloColor } from '../../hooks/usePlantStatus'
import { getCareDisplay } from '../../utils/careDisplay'

export const STATUS_COLORS: Record<string, string> = {
  overdue:   'var(--color-overdue)',
  due_today: 'var(--color-due)',
  good:      'var(--color-good)',
}

const SUITABILITY_RING_COLORS: Record<string, string> = {
  good:        '#24e34c',
  too_little:  '#ea0706',
  too_much:    '#ff7701',
  dormant:     '#909090',
  not_planted: '#24e3dc',
  unknown:     '#f2ebe6',
}

interface Props {
  plant: MapPlant
  mapType: 'outdoor' | 'indoor'
  x: number
  y: number
  isDragging: boolean
  isSelected?: boolean
  showLabel?: boolean
  onTap: (plant: MapPlant) => void
  onPointerDown: (e: React.PointerEvent, plant: MapPlant) => void
  heatmapCells?: HeatmapCell[]
}

const PX_PER_CM = 0.46


export default function PlantMarker({ plant, mapType, x, y, isDragging, isSelected, showLabel = true, onTap, onPointerDown, heatmapCells }: Props) {
  const counterRot = useMapRotation()
  const rot = counterRot ? `rotate(${counterRot})` : undefined
  const { badgeColor: color } = getCareDisplay(plant)
  const isOutdoor = mapType === 'outdoor'
  const isContainer = plant.container_id != null
  // Outdoor ground plants: only weather halos. Indoor or container plants: full care halos.
  const haloColor = isOutdoor && !isContainer
    ? (plant.temp_status === 'freezing' || plant.temp_status === 'chilling' || plant.temp_status === 'heatstress'
        ? getHaloColor(plant)
        : null)
    : getHaloColor(plant)
  const alerts = plant.alerts ?? []
  if (!alerts.length && plant.top_alert) {
    alerts.push(plant.top_alert)
  }

  const { ringColor, ringDashed, badgeLabel, sunHoursAtPos } = (() => {
    if (!heatmapCells) return { ringColor: null, ringDashed: false, badgeLabel: null, sunHoursAtPos: null }
    const cell = heatmapCells.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h)
    if (!cell) return { ringColor: null, ringDashed: false, badgeLabel: null, sunHoursAtPos: null }

    const sunHours = cell.sunHours

    if (plant.phenology) {
      const month = new Date().getMonth() + 1
      const s = computeSuitability(plant.phenology, sunHours, month)
      return {
        ringColor: s.status === 'unknown' ? null : SUITABILITY_RING_COLORS[s.status],
        ringDashed: s.status !== 'good',
        badgeLabel: `~${sunHours.toFixed(1)}u · ${s.badgeLabel}`,
        sunHoursAtPos: sunHours,
      }
    }

    if (!plant.sun_requirement) return { ringColor: null, ringDashed: false, badgeLabel: null, sunHoursAtPos: null }
    const fit = getSunFit(plant.sun_requirement, sunHours)
    if (!fit) return { ringColor: null, ringDashed: false, badgeLabel: null, sunHoursAtPos: null }
    return {
      ringColor: SUN_FIT_COLORS[fit],
      ringDashed: fit !== 'good',
      badgeLabel: `~${sunHours.toFixed(1)}u · ${fit === 'good' ? 'Goed' : fit === 'partial' ? 'Deels' : 'Te weinig'}`,
      sunHoursAtPos: sunHours,
    }
  })()

  const baseR = plant.display_radius_cm ? plant.display_radius_cm * PX_PER_CM : 14
  const r = isDragging ? baseR * 1.3 : baseR
  const iconR = r * 0.85
  const hitR = Math.max(20, r + 6)
  const labelY = iconR + 10

  // For locked plants: cap the rendered icon so it never extends off-screen,
  // and keep the badge pinned close to center regardless of display_radius_cm.
  const lockedIconR = Math.min(iconR, 28)
  const lockedLabelY = lockedIconR + 10
  const lockBadgeOffset = lockedIconR * 0.78   // scales with icon but stays small
  const lockHitR = 6

  if (plant.is_locked) {
    // ── Locked plant: capped icon, tiny top-right lock badge as sole tap target ──
    return (
      <g transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
        {/* Status halo */}
        {haloColor && (
          <>
            <defs>
              <radialGradient id={`halo-${plant.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor={haloColor} stopOpacity={0.70} />
                <stop offset="100%" stopColor={haloColor} stopOpacity={0}    />
              </radialGradient>
            </defs>
            <circle r={lockedIconR * 1.6} fill={`url(#halo-${plant.id})`} style={{ pointerEvents: 'none' }} />
          </>
        )}
        <g transform={rot}>
        {/* Plant icon — capped size so it stays within the map frame */}
        {plant.icon_key ? (
          <image
            href={`/api/icons/${plant.icon_key}.svg`}
            x={-lockedIconR} y={-lockedIconR}
            width={lockedIconR * 2} height={lockedIconR * 2}
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          <circle r={lockedIconR * 0.3} fill={color} opacity={0.8} />
        )}

        {/* Label */}
        {showLabel && (
          <text
            y={lockedLabelY}
            textAnchor="middle"
            fill="#1f2937"
            fontSize="9"
            fontWeight="500"
            style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.9)', strokeWidth: 3, strokeLinejoin: 'round', pointerEvents: 'none' }}
          >
            {plant.name}
          </text>
        )}
        </g>

        {/* Lock badge — top-right of icon, sole interactive tap target */}
        <g
          style={{ pointerEvents: 'all', cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); onTap(plant) }}
        >
          <circle cx={lockBadgeOffset} cy={-lockBadgeOffset} r={lockHitR} fill="rgba(30,30,30,0.65)" />
          <text
            x={lockBadgeOffset} y={-lockBadgeOffset}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="6"
            style={{ pointerEvents: 'none' }}
          >
            🔒
          </text>
        </g>

      </g>
    )
  }

  // ── Unlocked plant: normal interactive rendering ──
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={(e) => { e.stopPropagation(); if (!isDragging) onTap(plant) }}
      onPointerDown={(e) => onPointerDown(e, plant)}
      style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
    >
      {/* Status halo */}
      {haloColor && (
        <>
          <defs>
            <radialGradient id={`halo-${plant.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={haloColor} stopOpacity={0.70} />
              <stop offset="100%" stopColor={haloColor} stopOpacity={0}    />
            </radialGradient>
          </defs>
          <circle r={iconR * 1.6} fill={`url(#halo-${plant.id})`} style={{ pointerEvents: 'none' }} />
        </>
      )}

      {/* Transparent hit area for mobile tap targets */}
      <circle r={hitR} fill="transparent" />

      {/* Sun-fit ring */}
      {ringColor && (
        <circle
          r={iconR + 5}
          fill="none"
          stroke={ringColor}
          strokeWidth={isDragging ? (ringDashed ? 3.5 : 2.5) : (ringDashed ? 2 : 1.5)}
          strokeDasharray={ringDashed ? '3 3' : 'none'}
          opacity={0.85}
        />
      )}

      {/* Selection ring */}
      {isSelected && (
        <circle r={iconR + 4} fill="none" stroke={color} strokeWidth={1} strokeDasharray="3 2" opacity={0.7} />
      )}

      <g transform={rot}>
      {/* Plant icon or fallback dot */}
      {plant.icon_key ? (
        <image
          href={`/api/icons/${plant.icon_key}.svg`}
          x={-iconR} y={-iconR}
          width={iconR * 2} height={iconR * 2}
          style={{ pointerEvents: 'none' }}
        />
      ) : (
        <circle r={r * 0.25} fill={color} opacity={0.8} />
      )}

      {/* Label */}
      {showLabel && (
        <text
          y={labelY}
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
          {plant.name}
        </text>
      )}

      {/* Drag pill */}
      {isDragging && ringColor && badgeLabel && sunHoursAtPos !== null && (
        <g transform={`translate(0, ${labelY + 16})`}>
          <rect x={-54} y={-9} width={108} height={18} rx={9} fill={ringColor} opacity={0.92} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize="9"
            fontWeight="600"
            style={{ pointerEvents: 'none' }}
          >
            {badgeLabel}
          </text>
        </g>
      )}
      </g>

      {/* Alert badges — arc around top of plant */}
      {alerts.length > 0 && alerts.map((a, i) => {
        const count = alerts.length
        const totalArc = Math.min(count * 30, 140) // degrees
        const startDeg = -(totalArc / 2)
        const step = count > 1 ? totalArc / (count - 1) : 0
        const deg = startDeg + i * step
        const rad = (deg * Math.PI) / 180
        const orbitR = iconR + 5
        const bx = orbitR * Math.sin(rad)
        const by = -(orbitR * Math.cos(rad))
        return (
        <g key={a.alert_type} style={{ pointerEvents: 'none' }}>
          <circle
            cx={bx}
            cy={by}
            r={7}
            fill="white"
            stroke={haloColor ?? '#888'}
            strokeWidth={1.5}
          />
          <text
            x={bx}
            y={by}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {a.icon}
          </text>
        </g>
        )
      })}
    </g>
  )
}
