import type { MapPlant } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getSunFit, SUN_FIT_COLORS, effectiveSunHours } from '../../utils/plantSunRequirements'
import { computeSuitability } from '../../utils/suitability'
import { getHaloColor } from '../../hooks/usePlantStatus'
import { getCareDisplay } from '../../utils/careDisplay'
import { resolveIconUrl } from '../../utils/icons'
import { PX_PER_CM } from '../../utils/gardenStructures'
import { getPlantDragHitRadius } from './plantDragPermissions'
import { topLevelPlantIconRadius } from './plantMarkerGeometry'
import { isMovePointerEventHandled } from './plantMoveHitTarget'
import { LABEL_ABOVE_OFFSET, LABEL_BELOW_OFFSET, type LabelPlacement } from '../../utils/labelDeclutter'
import CareIcon, { type CareIconType } from '../ui/CareIcon'

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
  canDrag?: boolean
  isSelected?: boolean
  showLabel?: boolean
  labelPlacement?: LabelPlacement
  /** Effective label font in SVG units (semantic zoom: PLANT_LABEL_FONT_SIZE /
   *  zoom). Label offsets scale by the same ratio so text and its declutter box
   *  stay in agreement. Defaults to the base size (zoom = 1). */
  labelFontSize?: number
  showWarnings?: boolean
  showWeatherWarnings?: boolean
  /** Hide the padlock badge on locked plants (used by the public demo garden). */
  hideLockBadge?: boolean
  displayName?: string
  onPointerDown: (e: React.PointerEvent, plant: MapPlant, dragElementOverride?: SVGGElement | null) => void
  heatmapCells?: HeatmapCell[]
}

type MarkerBadge = { alert_type: string; severity: string; icon: string; care_type: string }

const GROUPED_WEATHER_TYPES = new Set(['frost_protect', 'heat_protect'])

function visibleMarkerWarnings(plant: MapPlant, showWeatherWarnings: boolean) {
  const warnings = plant.warnings?.length
    ? plant.warnings
    : plant.top_warning
      ? [plant.top_warning]
      : []
  return showWeatherWarnings
    ? warnings
    : warnings.filter((warning) => !GROUPED_WEATHER_TYPES.has(warning.care_type))
}

export function markerBadgesForPlant(
  plant: MapPlant,
  showWeatherWarnings = false,
): MarkerBadge[] {
  const warnings = visibleMarkerWarnings(plant, showWeatherWarnings)

  return warnings.map((warning) => ({
    alert_type: `${warning.care_type}-${warning.trigger}`,
    severity: warning.severity,
    icon: warning.icon,
    care_type: warning.care_type,
  }))
}

/**
 * The single most-urgent badge to render on the canvas — `top_warning` first,
 * falling back to the first warning. The full list lives in the tap sheet and
 * CareNeedsList; capping the canvas to one badge keeps a dense map legible.
 */
export function topMarkerBadge(plant: MapPlant, showWeatherWarnings = false): MarkerBadge | null {
  const w = visibleMarkerWarnings(plant, showWeatherWarnings)[0] ?? null
  if (!w) return null
  return { alert_type: `${w.care_type}-${w.trigger}`, severity: w.severity, icon: w.icon, care_type: w.care_type }
}

export function plantMarkerHaloColor(
  plant: MapPlant,
  mapType: 'outdoor' | 'indoor',
  showWarnings: boolean,
  showWeatherWarnings = false,
): string | null {
  if (!showWarnings) return null

  const isOutdoor = mapType === 'outdoor'
  const isContainer = plant.container_id != null
  // Outdoor ground plants: only weather halos. Indoor or container plants: full care halos.
  if (isOutdoor && !isContainer) {
    if (!showWeatherWarnings) return null
    return visibleMarkerWarnings(plant, true).find(
      (warning) => GROUPED_WEATHER_TYPES.has(warning.care_type),
    )?.color ?? (
      plant.temp_status === 'freezing' || plant.temp_status === 'chilling' || plant.temp_status === 'heatstress'
        ? getHaloColor(plant)
        : null
    )
  }

  const visibleWarning = visibleMarkerWarnings(plant, showWeatherWarnings)[0]
  if (visibleWarning) return visibleWarning.color
  const hasHiddenWeatherWarning = !showWeatherWarnings
    && visibleMarkerWarnings(plant, true).some((warning) => GROUPED_WEATHER_TYPES.has(warning.care_type))
  return hasHiddenWeatherWarning ? null : getHaloColor(plant)
}

export function containedPlantHaloColor(
  plant: MapPlant,
  showWarnings: boolean,
  showWeatherWarnings = false,
): string | null {
  if (!showWarnings) return null
  const visibleWarning = visibleMarkerWarnings(plant, showWeatherWarnings)[0]
  if (visibleWarning) return visibleWarning.color
  const hasHiddenWeatherWarning = !showWeatherWarnings
    && visibleMarkerWarnings(plant, true).some((warning) => GROUPED_WEATHER_TYPES.has(warning.care_type))
  return hasHiddenWeatherWarning ? null : getHaloColor(plant)
}

// Plant name label size in SVG units. Kept modest so labels don't dominate the
// map; the layer's declutter (utils/labelDeclutter) uses this to estimate boxes.
export const PLANT_LABEL_FONT_SIZE = 9

export default function PlantMarker({ plant, mapType, x, y, isDragging, canDrag = true, isSelected, showLabel = true, labelPlacement = 'below', labelFontSize = PLANT_LABEL_FONT_SIZE, showWarnings = true, showWeatherWarnings = false, hideLockBadge = false, displayName = plant.name, onPointerDown, heatmapCells }: Props) {
  const { badgeColor: color } = getCareDisplay(plant)
  const haloColor = plantMarkerHaloColor(plant, mapType, showWarnings, showWeatherWarnings)
  const topBadge = showWarnings ? topMarkerBadge(plant, showWeatherWarnings) : null

  const { ringColor, ringDashed, badgeLabel, sunHoursAtPos } = (() => {
    if (!heatmapCells) return { ringColor: null, ringDashed: false, badgeLabel: null, sunHoursAtPos: null }
    const cell = heatmapCells.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h)
    if (!cell) return { ringColor: null, ringDashed: false, badgeLabel: null, sunHoursAtPos: null }

    // A manually measured sun value overrides the modelled heatmap sun for this
    // plant's fit (utils #645); falls back to the cell value when unset.
    const { sunHours } = effectiveSunHours(plant.measured_sun_hours, cell.sunHours)

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
  const renderedIconR = topLevelPlantIconRadius(plant)
  const iconR = renderedIconR * (isDragging ? 1.3 : 1)
  const hitR = getPlantDragHitRadius(r, canDrag)
  // Semantic zoom: scale the label offsets by the same ratio as the font so the
  // text keeps a constant screen gap from its icon, and — critically — matches
  // the offsets placeLabels used to reserve space (else labels overlap/drop).
  const labelScale = labelFontSize / PLANT_LABEL_FONT_SIZE
  const belowOffset = LABEL_BELOW_OFFSET * labelScale
  const aboveOffset = LABEL_ABOVE_OFFSET * labelScale
  // Label sits below the icon by default, or above when the declutter flipped
  // it to avoid a horizontal neighbour. Offsets are shared with the declutter.
  const labelY = labelPlacement === 'above' ? -(iconR + aboveOffset) : iconR + belowOffset

  // For locked plants: cap the rendered icon so it never extends off-screen,
  // and keep the badge pinned close to center regardless of display_radius_cm.
  const lockedIconR = renderedIconR
  const lockedLabelY = labelPlacement === 'above'
    ? -(lockedIconR + aboveOffset)
    : lockedIconR + belowOffset
  const lockBadgeOffset = lockedIconR * 0.78   // scales with icon but stays small
  const lockHitR = 6

  if (plant.is_locked) {
    // ── Locked plant: capped icon, selectable centrally but never draggable ──
    return (
      <g
        data-map-plant-id={plant.id}
        transform={`translate(${x}, ${y})`}
        style={{ pointerEvents: 'none' }}
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
            <circle r={lockedIconR * 1.6} fill={`url(#halo-${plant.id})`} style={{ pointerEvents: 'none' }} />
          </>
        )}
        {/* Plant icon — capped size so it stays within the map frame */}
        {plant.icon_key ? (
          <image
            href={resolveIconUrl(plant.icon_key)!}
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
            fontSize={labelFontSize}
            fontWeight="500"
            style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.9)', strokeWidth: 3, strokeLinejoin: 'round', pointerEvents: 'none' }}
          >
            {displayName}
          </text>
        )}

        {/* Lock badge — visual only; MapView resolves the whole marker target. */}
        {!hideLockBadge && (
          <g style={{ pointerEvents: 'none' }}>
            <circle cx={lockBadgeOffset} cy={-lockBadgeOffset} r={lockHitR} fill="rgba(30,30,30,0.65)" />
            <g transform={`translate(${lockBadgeOffset}, ${-lockBadgeOffset})`} style={{ pointerEvents: 'none' }}>
              <rect x={-2.3} y={-0.4} width={4.6} height={3.4} rx={0.8} fill="#fff" />
              <path d="M-1.5 -0.4V-1.8a1.5 1.5 0 0 1 3 0V-0.4" fill="none" stroke="#fff" strokeWidth={0.7} strokeLinecap="round" />
            </g>
          </g>
        )}

      </g>
    )
  }

  // ── Unlocked plant: normal interactive rendering ──
  return (
    <g
      data-map-plant-id={plant.id}
      transform={`translate(${x}, ${y})`}
      onPointerDown={(e) => {
        if (isMovePointerEventHandled(e.nativeEvent)) return
        onPointerDown(e, plant)
      }}
      style={{ pointerEvents: 'none' }}
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
      <circle
        r={hitR}
        fill="transparent"
        style={{
          pointerEvents: 'all',
          cursor: isDragging ? 'grabbing' : canDrag ? 'grab' : 'pointer',
          touchAction: 'none',
        }}
      />

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

      {/* Multiplicity: faint stacked silhouettes behind the icon hint that this
          record represents several specimens (quantity > 1). Exact count lives
          in the tap sheet; a small chip below shows the number. */}
      {plant.quantity > 1 && plant.icon_key && (() => {
        const off = iconR * 0.22
        const href = resolveIconUrl(plant.icon_key)!
        return (
          <>
            <image
              href={href}
              x={-iconR + off * 2} y={-iconR + off * 2}
              width={iconR * 2} height={iconR * 2}
              opacity={0.22}
              style={{ pointerEvents: 'none' }}
            />
            <image
              href={href}
              x={-iconR + off} y={-iconR + off}
              width={iconR * 2} height={iconR * 2}
              opacity={0.4}
              style={{ pointerEvents: 'none' }}
            />
          </>
        )
      })()}

      {/* Plant icon or fallback dot */}
      {plant.icon_key ? (
        <image
          href={resolveIconUrl(plant.icon_key)!}
          x={-iconR} y={-iconR}
          width={iconR * 2} height={iconR * 2}
          style={{ pointerEvents: 'none' }}
        />
      ) : (
        <circle r={r * 0.25} fill={color} opacity={0.8} />
      )}

      {/* Quantity count chip — bottom-right, clear of the top-arced alerts */}
      {plant.quantity > 1 && (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={iconR * 0.72} cy={iconR * 0.72} r={7} fill="rgba(31,41,55,0.85)" />
          <text
            x={iconR * 0.72} y={iconR * 0.72}
            textAnchor="middle" dominantBaseline="central"
            fontSize={8} fontWeight={600} fill="#fff"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {plant.quantity > 99 ? '99+' : plant.quantity}
          </text>
        </g>
      )}

      {/* Label */}
      {showLabel && (
        <text
          y={labelY}
          textAnchor="middle"
          fill="#1f2937"
          fontSize={labelFontSize}
          fontWeight="500"
          style={{
            pointerEvents: 'none',
            paintOrder: 'stroke',
            stroke: 'rgba(255,255,255,0.9)',
            strokeWidth: 3,
            strokeLinejoin: 'round',
          }}
        >
          {displayName}
        </text>
      )}

      {/* Drag pill — always below the icon, independent of label placement */}
      {isDragging && ringColor && badgeLabel && sunHoursAtPos !== null && (
        <g transform={`translate(0, ${iconR + LABEL_BELOW_OFFSET + 16})`}>
          <rect x={-75} y={-10} width={150} height={20} rx={10} fill={ringColor} opacity={0.92} />
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

      {/* Single most-urgent alert badge at the top — the canvas shows one; the
          full warning list lives in the tap sheet / CareNeedsList. */}
      {topBadge && (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={0} cy={-(iconR + 5)} r={7} fill="white" stroke={haloColor ?? '#888'} strokeWidth={1.5} />
          <CareIcon
            type={topBadge.care_type as CareIconType}
            x={-4.5} y={-(iconR + 5) - 4.5} size={9}
            strokeWidth={2.2} stroke={haloColor ?? '#5a5a5a'}
          />
        </g>
      )}
    </g>
  )
}
