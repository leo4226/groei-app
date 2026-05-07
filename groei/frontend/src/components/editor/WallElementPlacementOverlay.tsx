import type { EditorZone, RoomEdge } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import {
  WALL_THICKNESS_EXTERIOR_CM,
  WALL_THICKNESS_INTERIOR_CM,
  DEFAULT_DOOR_WIDTH_CM,
  DEFAULT_WINDOW_WIDTH_CM,
} from '../../constants/mapDefaults'

interface HoverTarget {
  zoneId: string
  edge: RoomEdge
  position: number
}

interface Props {
  zones: EditorZone[]
  activeTool: EditorTool
  scalePxPerM: number
  svgPoint: { x: number; y: number } | null
  onPlace: (zoneId: string, edge: RoomEdge, position: number) => void
}

function getWallThicknessPx(zone: EditorZone, scalePxPerM: number): number {
  const cm =
    zone.type === 'structure' || zone.wallThickness !== 'interior'
      ? WALL_THICKNESS_EXTERIOR_CM
      : WALL_THICKNESS_INTERIOR_CM
  return (cm * scalePxPerM) / 100
}

function hitTestWalls(
  px: number,
  py: number,
  zones: EditorZone[],
  scalePxPerM: number
): HoverTarget | null {
  for (const zone of zones) {
    if (zone.type !== 'room' && zone.type !== 'structure') continue

    const t = getWallThicknessPx(zone, scalePxPerM)
    const { x, y, width: w, height: h } = zone

    const walls: { edge: RoomEdge; rx: number; ry: number; rw: number; rh: number }[] = [
      { edge: 'top',    rx: x,         ry: y,         rw: w, rh: t },
      { edge: 'bottom', rx: x,         ry: y + h - t, rw: w, rh: t },
      { edge: 'left',   rx: x,         ry: y + t,     rw: t, rh: h - 2 * t },
      { edge: 'right',  rx: x + w - t, ry: y + t,     rw: t, rh: h - 2 * t },
    ]

    for (const wall of walls) {
      if (
        px >= wall.rx && px <= wall.rx + wall.rw &&
        py >= wall.ry && py <= wall.ry + wall.rh
      ) {
        const isHorizontal = wall.edge === 'top' || wall.edge === 'bottom'
        const rawPos = isHorizontal
          ? (px - x) / w
          : (py - (y + t)) / (h - 2 * t)
        return {
          zoneId: zone.id,
          edge: wall.edge,
          position: Math.max(0.05, Math.min(0.95, rawPos)),
        }
      }
    }
  }
  return null
}

export default function WallElementPlacementOverlay({
  zones,
  activeTool,
  scalePxPerM,
  svgPoint,
  onPlace,
}: Props) {
  const target = svgPoint
    ? hitTestWalls(svgPoint.x, svgPoint.y, zones, scalePxPerM)
    : null

  if (!target) return null

  const zone = zones.find((z) => z.id === target.zoneId)
  if (!zone) return null

  const t = getWallThicknessPx(zone, scalePxPerM)
  const isDoor = activeTool === 'place_door'
  const widthCm = isDoor ? DEFAULT_DOOR_WIDTH_CM : DEFAULT_WINDOW_WIDTH_CM
  const widthPx = (widthCm * scalePxPerM) / 100

  const { x, y, width: w, height: h } = zone
  const isHorizontal = target.edge === 'top' || target.edge === 'bottom'
  const edgeLength = isHorizontal ? w : h
  const center = target.position * edgeLength
  const gapStart = center - widthPx / 2

  let highlightRect: { x: number; y: number; width: number; height: number }
  if (target.edge === 'top') {
    highlightRect = { x: x + gapStart, y, width: widthPx, height: t }
  } else if (target.edge === 'bottom') {
    highlightRect = { x: x + gapStart, y: y + h - t, width: widthPx, height: t }
  } else if (target.edge === 'left') {
    highlightRect = { x, y: y + t + gapStart, width: t, height: widthPx }
  } else {
    highlightRect = { x: x + w - t, y: y + t + gapStart, width: t, height: widthPx }
  }

  const accentColor = isDoor ? '#4A90D9' : '#5B9A6F'
  const fillColor = isDoor ? 'rgba(74,144,217,0.35)' : 'rgba(91,154,111,0.35)'

  return (
    <g onClick={() => onPlace(target.zoneId, target.edge, target.position)}>
      {/* Highlighted gap preview */}
      <rect
        x={highlightRect.x}
        y={highlightRect.y}
        width={highlightRect.width}
        height={highlightRect.height}
        fill={fillColor}
        stroke={accentColor}
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />
      {/* Label */}
      <text
        x={highlightRect.x + highlightRect.width / 2}
        y={highlightRect.y - 5}
        textAnchor="middle"
        fill={accentColor}
        fontSize={8}
        fontWeight={500}
        pointerEvents="none"
      >
        {isDoor ? `Deur ${widthCm}cm` : `Raam ${widthCm}cm`}
      </text>
      {/* Invisible hit area covering the whole canvas to capture clicks while hovering a wall */}
      <rect
        x={0} y={0} width={680} height={680}
        fill="transparent"
        style={{ cursor: 'crosshair' }}
      />
    </g>
  )
}
