import type { EditorZone, WallElement } from '../../types'
import { ZONE_STYLES } from './EditorDefs'
import { WALL_COLOR, ROOM_FILL, WALL_THICKNESS_EXTERIOR_CM } from '../../constants/mapDefaults'
import { computeClipPoints } from '../../utils/clipPath'
import DoorRenderer from './DoorRenderer'
import WindowRenderer from './WindowRenderer'

interface Props {
  zone: EditorZone
  zones: EditorZone[]
  isSelected: boolean
  scalePxPerM: number
  wallElements: WallElement[]
  selectedWallElementId: string | null
  onPointerDown: (e: React.PointerEvent, zoneId: string) => void
  onSelectWallElement: (id: string) => void
  onWallElementPointerDown: (e: React.PointerEvent, elementId: string) => void
}

/**
 * Wraps children in a clip‑path group when the zone has a corner cut.
 * If there's no cut, renders children directly (no extra SVG overhead).
 */
function ClipWrap({ zone, children }: { zone: EditorZone; children: React.ReactNode }) {
  if (!zone.cornerCut) return <>{children}</>
  const clipId = `shape-clip-${zone.id}`
  const points = computeClipPoints(zone.x, zone.y, zone.width, zone.height, zone.cornerCut)
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <polygon points={points} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {children}
      </g>
    </g>
  )
}

/**
 * Render a zone label + selection border (shared by structure and room).
 */
function ZoneDecorations({ zone, isSelected }: { zone: EditorZone; isSelected: boolean }) {
  return (
    <>
      {/* Selection border */}
      {isSelected && (
        <rect
          x={zone.x - 4} y={zone.y - 4}
          width={zone.width + 8} height={zone.height + 8}
          fill="none" stroke="#4A90D9"
          strokeWidth={2} strokeDasharray="6 3"
          pointerEvents="none"
        />
      )}
      {/* Label */}
      {zone.label && zone.width > 40 && zone.height > 20 && (
        <text
          x={zone.x + zone.width / 2}
          y={zone.y + zone.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(0,0,0,0.5)"
          fontSize={Math.min(12, zone.width / 8)}
          fontWeight={500}
          pointerEvents="none"
        >
          {zone.label}
        </text>
      )}
    </>
  )
}

export default function EditorZoneShape({ zone, isSelected, scalePxPerM, wallElements, selectedWallElementId, onPointerDown, onSelectWallElement, onWallElementPointerDown }: Props) {
  // ── Structure: rendered like a room but with no interior fill ──
  if (zone.type === 'structure') {
    const wallPx = Math.max(6, Math.round((WALL_THICKNESS_EXTERIOR_CM * scalePxPerM) / 100))

    return (
      <g>
        <ClipWrap zone={zone}>
          {/* Thin wall outline — empty interior (shed, etc.) */}
          <rect
            x={zone.x - wallPx} y={zone.y - wallPx}
            width={zone.width + wallPx * 2} height={zone.height + wallPx * 2}
            fill="none" stroke={WALL_COLOR} strokeWidth={wallPx * 2} rx={1}
            onPointerDown={(e) => onPointerDown(e, zone.id)}
            style={{ cursor: 'pointer' }}
          />
          {/* Transparent hit area — so clicking interior selects the zone */}
          <rect
            x={zone.x} y={zone.y}
            width={zone.width} height={zone.height}
            fill="transparent"
            onPointerDown={(e) => onPointerDown(e, zone.id)}
            style={{ cursor: 'pointer' }}
          />
          {/* Selection border */}
          {isSelected && (
            <rect
              x={zone.x - 4} y={zone.y - 4}
              width={zone.width + 8} height={zone.height + 8}
              fill="none" stroke="#4A90D9"
              strokeWidth={2} strokeDasharray="6 3"
              pointerEvents="none"
            />
          )}
        </ClipWrap>
      </g>
    )
  }

  // ── Room: interior space with thin walls + doors and windows ──
  if (zone.type === 'room') {
    const wallPx = Math.max(6, Math.round((WALL_THICKNESS_EXTERIOR_CM * scalePxPerM) / 100))
    const zoneWallElements = wallElements.filter(el => el.zoneId === zone.id)

    return (
      <g>
        <ClipWrap zone={zone}>
          {/* Thin wall border */}
          <rect
            x={zone.x - wallPx} y={zone.y - wallPx}
            width={zone.width + wallPx * 2} height={zone.height + wallPx * 2}
            fill={WALL_COLOR} rx={1}
            onPointerDown={(e) => onPointerDown(e, zone.id)}
            style={{ cursor: 'pointer' }}
          />
          {/* Room fill */}
          <rect
            x={zone.x} y={zone.y}
            width={zone.width} height={zone.height}
            fill={ROOM_FILL}
            pointerEvents="none"
          />
          <ZoneDecorations zone={zone} isSelected={isSelected} />
        </ClipWrap>

        {/* Doors & Windows */}
        {zoneWallElements.map(el => (
          <g
            key={el.id}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              onSelectWallElement(el.id)
              onWallElementPointerDown(e, el.id)
            }}
          >
            {el.type === 'door' ? (
              <DoorRenderer element={el} zone={zone} wallThicknessPx={wallPx} scalePxPerM={scalePxPerM} />
            ) : (
              <WindowRenderer element={el} zone={zone} wallThicknessPx={wallPx} scalePxPerM={scalePxPerM} />
            )}
            {/* Selection highlight for wall element */}
            {el.id === selectedWallElementId && (
              <rect
                x={zone.x - 3} y={zone.y - 3}
                width={zone.width + 6} height={zone.height + 6}
                fill="none" stroke="#FF6B35"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                pointerEvents="none"
              />
            )}
          </g>
        ))}
      </g>
    )
  }

  // ── Wall zones render as a solid architectural wall block ──
  if (zone.type === 'wall') {
    return (
      <g>
        <ClipWrap zone={zone}>
          <rect
            x={zone.x} y={zone.y}
            width={zone.width} height={zone.height}
            fill={WALL_COLOR}
            onPointerDown={(e) => onPointerDown(e, zone.id)}
            style={{ cursor: 'pointer' }}
          />
          {isSelected && (
            <rect
              x={zone.x} y={zone.y}
              width={zone.width} height={zone.height}
              fill="none" stroke="#4A90D9"
              strokeWidth={2} strokeDasharray="6 3"
              pointerEvents="none"
            />
          )}
        </ClipWrap>
      </g>
    )
  }

  // ── Garden zones (deck, soil, gravel, lawn, path, water, fence) ──
  const style = ZONE_STYLES[zone.type]

  return (
    <g>
      <ClipWrap zone={zone}>
        {/* Base fill */}
        <rect
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          fill={style.fill}
          opacity={style.opacity}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          onPointerDown={(e) => onPointerDown(e, zone.id)}
          style={{ cursor: 'pointer' }}
        />
        {/* Pattern overlay */}
        {style.patternId && (
          <rect
            x={zone.x}
            y={zone.y}
            width={zone.width}
            height={zone.height}
            fill={`url(#${style.patternId})`}
            opacity={style.patternOpacity ?? 1}
            pointerEvents="none"
          />
        )}
        {/* Selection border */}
        {isSelected && (
          <rect
            x={zone.x}
            y={zone.y}
            width={zone.width}
            height={zone.height}
            fill="none"
            stroke="#4A90D9"
            strokeWidth={2}
            strokeDasharray="6 3"
            pointerEvents="none"
          />
        )}
        {/* Label */}
        {zone.label && zone.width > 40 && zone.height > 20 && (
          <text
            x={zone.x + zone.width / 2}
            y={zone.y + zone.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.8)"
            fontSize={Math.min(12, zone.width / 8)}
            fontWeight={500}
            pointerEvents="none"
          >
            {zone.label}
          </text>
        )}
      </ClipWrap>
    </g>
  )
}
