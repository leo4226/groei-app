import type { EditorZone, WallElement, RoomEdge, CornerCut } from '../../types'
import {
  WALL_THICKNESS_EXTERIOR_CM,
  WALL_THICKNESS_INTERIOR_CM,
  WALL_COLOR,
  ROOM_FILL,
  STRUCTURE_FILL,
} from '../../constants/mapDefaults'
import DoorRenderer from './DoorRenderer'
import WindowRenderer from './WindowRenderer'

interface Props {
  zone: EditorZone
  scalePxPerM: number
  wallElements: WallElement[]
  zones: EditorZone[]              // all zones — needed for shared-wall detection
  isSelected: boolean
  onPointerDown: (e: React.PointerEvent, zoneId: string) => void
  onSelectWallElement: (id: string) => void
  onWallElementPointerDown: (e: React.PointerEvent, elementId: string) => void
  selectedWallElementId: string | null
}

interface Segment {
  start: number
  end: number
}

function getWallThicknessPx(zone: EditorZone, scalePxPerM: number): number {
  const cm =
    zone.type === 'structure' || zone.wallThickness !== 'interior'
      ? WALL_THICKNESS_EXTERIOR_CM
      : WALL_THICKNESS_INTERIOR_CM
  return (cm * scalePxPerM) / 100
}

function splitWallForGaps(
  edgeLength: number,
  gaps: { start: number; end: number }[]
): Segment[] {
  if (gaps.length === 0) return [{ start: 0, end: edgeLength }]
  const sorted = [...gaps].sort((a, b) => a.start - b.start)
  const segments: Segment[] = []
  let cursor = 0
  for (const gap of sorted) {
    const gStart = Math.max(0, gap.start)
    const gEnd = Math.min(edgeLength, gap.end)
    if (gStart > cursor) segments.push({ start: cursor, end: gStart })
    cursor = Math.max(cursor, gEnd)
  }
  if (cursor < edgeLength) segments.push({ start: cursor, end: edgeLength })
  return segments
}

function getEdgeGaps(
  zone: EditorZone,
  edge: RoomEdge,
  wallElements: WallElement[],
  scalePxPerM: number
): { start: number; end: number; element: WallElement }[] {
  const edgeElements = wallElements.filter(w => w.zoneId === zone.id && w.edge === edge)
  const edgeLength = edge === 'top' || edge === 'bottom' ? zone.width : zone.height
  return edgeElements.map((w) => {
    const widthPx = (w.widthCm * scalePxPerM) / 100
    const center = w.position * edgeLength
    return { start: center - widthPx / 2, end: center + widthPx / 2, element: w }
  })
}

// ── Shared-wall helpers ──────────────────────────────────────────────────────

const FLUSH_TOL = 3  // px

/**
 * Fix 2 — Should wall RECTS be suppressed on this room edge?
 *
 * Returns true when a structure has an outer or inner face at the same coordinate
 * on the SAME side as this edge (left↔left, right↔right, …) and the two zones
 * overlap in the perpendicular direction.  The structure's wall already covers
 * the physical space, so we skip rendering the thinner room wall over it.
 */
function isEdgeFlushWithStructure(
  zone: EditorZone,
  edge: RoomEdge,
  allZones: EditorZone[],
  scalePxPerM: number,
): boolean {
  const isVert = edge === 'left' || edge === 'right'
  let edgeCoord: number, perpMin: number, perpMax: number
  switch (edge) {
    case 'left':   edgeCoord = zone.x;               perpMin = zone.y; perpMax = zone.y + zone.height; break
    case 'right':  edgeCoord = zone.x + zone.width;   perpMin = zone.y; perpMax = zone.y + zone.height; break
    case 'top':    edgeCoord = zone.y;               perpMin = zone.x; perpMax = zone.x + zone.width;  break
    case 'bottom': edgeCoord = zone.y + zone.height;  perpMin = zone.x; perpMax = zone.x + zone.width;  break
  }

  for (const s of allZones) {
    if (s.type !== 'structure') continue
    const t = getWallThicknessPx(s, scalePxPerM)

    // Only "same-side" faces (left edge → check structure's left outer & inner faces, etc.)
    let faces: number[]
    switch (edge) {
      case 'left':   faces = [s.x,           s.x + t];           break
      case 'right':  faces = [s.x + s.width,  s.x + s.width - t]; break
      case 'top':    faces = [s.y,            s.y + t];           break
      case 'bottom': faces = [s.y + s.height, s.y + s.height - t]; break
    }

    for (const f of faces) {
      if (Math.abs(f - edgeCoord) <= FLUSH_TOL) {
        const sPerpMin = isVert ? s.y : s.x
        const sPerpMax = isVert ? s.y + s.height : s.x + s.width
        if (Math.min(perpMax, sPerpMax) > Math.max(perpMin, sPerpMin)) return true
      }
    }
  }
  return false
}

/**
 * Fix 1 — For a STRUCTURE zone, collect gaps borrowed from rooms that are flush
 * against this edge's inner face.  This makes room door/window elements punch
 * through the outer structure wall as well.
 *
 * Gap positions are returned in the same coordinate space as getEdgeGaps
 * (origin = zone.x or zone.y, range = zone.width or zone.height).
 */
function getInheritedGaps(
  struct: EditorZone,
  edge: RoomEdge,
  allZones: EditorZone[],
  allWallElements: WallElement[],
  scalePxPerM: number,
): { start: number; end: number; element: WallElement }[] {
  const t = getWallThicknessPx(struct, scalePxPerM)
  const isVert = edge === 'left' || edge === 'right'

  // Where the structure's inner wall face sits on this edge
  let innerFace: number
  // Axis along the edge: absolute origin of the edge coordinate (struct.x or struct.y)
  let edgeAbsOrigin: number
  let edgeLength: number
  let perpMin: number, perpMax: number

  switch (edge) {
    case 'left':
      innerFace = struct.x + t;           edgeAbsOrigin = struct.y; edgeLength = struct.height
      perpMin = struct.y; perpMax = struct.y + struct.height; break
    case 'right':
      innerFace = struct.x + struct.width - t; edgeAbsOrigin = struct.y; edgeLength = struct.height
      perpMin = struct.y; perpMax = struct.y + struct.height; break
    case 'top':
      innerFace = struct.y + t;           edgeAbsOrigin = struct.x; edgeLength = struct.width
      perpMin = struct.x; perpMax = struct.x + struct.width; break
    case 'bottom':
      innerFace = struct.y + struct.height - t; edgeAbsOrigin = struct.x; edgeLength = struct.width
      perpMin = struct.x; perpMax = struct.x + struct.width; break
  }

  const result: { start: number; end: number; element: WallElement }[] = []

  for (const room of allZones) {
    if (room.id === struct.id || room.type !== 'room') continue

    // Room's outer edge on the same side must sit at the structure's inner face
    let roomEdgeCoord: number
    let roomEdge: RoomEdge
    let roomAbsOrigin: number
    let roomEdgeLength: number

    switch (edge) {
      case 'left':
        roomEdgeCoord = room.x;               roomEdge = 'left';
        roomAbsOrigin = room.y; roomEdgeLength = room.height; break
      case 'right':
        roomEdgeCoord = room.x + room.width;   roomEdge = 'right';
        roomAbsOrigin = room.y; roomEdgeLength = room.height; break
      case 'top':
        roomEdgeCoord = room.y;               roomEdge = 'top';
        roomAbsOrigin = room.x; roomEdgeLength = room.width; break
      case 'bottom':
        roomEdgeCoord = room.y + room.height;  roomEdge = 'bottom';
        roomAbsOrigin = room.x; roomEdgeLength = room.width; break
    }

    if (Math.abs(roomEdgeCoord - innerFace) > FLUSH_TOL) continue

    // Perpendicular overlap
    const rPerpMin = isVert ? room.y : room.x
    const rPerpMax = isVert ? room.y + room.height : room.x + room.width
    if (Math.min(perpMax, rPerpMax) <= Math.max(perpMin, rPerpMin)) continue

    // Translate room element positions → structure edge coordinate space
    const elements = allWallElements.filter(w => w.zoneId === room.id && w.edge === roomEdge)
    for (const el of elements) {
      const widthPx = (el.widthCm * scalePxPerM) / 100
      // Absolute center of this element along the shared axis
      const absCenter = roomAbsOrigin + el.position * roomEdgeLength
      // Relative to structure's edge origin
      const localCenter = absCenter - edgeAbsOrigin
      if (localCenter + widthPx / 2 <= 0 || localCenter - widthPx / 2 >= edgeLength) continue
      result.push({ start: localCenter - widthPx / 2, end: localCenter + widthPx / 2, element: el })
    }
  }
  return result
}

// ── Clip-path helpers (corner cut) ─────────────────────────────────────────

function computeClipPoints(
  x: number, y: number, w: number, h: number,
  cut: CornerCut
): string {
  const { corner, widthPx: cw, heightPx: ch } = cut
  const safeW = Math.min(cw, w * 0.9)
  const safeH = Math.min(ch, h * 0.9)

  switch (corner) {
    case 'tl': return [
      [x + safeW, y], [x + w, y], [x + w, y + h], [x, y + h],
      [x, y + safeH], [x + safeW, y + safeH],
    ].map(p => p.join(',')).join(' ')
    case 'tr': return [
      [x, y], [x + w - safeW, y], [x + w - safeW, y + safeH],
      [x + w, y + safeH], [x + w, y + h], [x, y + h],
    ].map(p => p.join(',')).join(' ')
    case 'br': return [
      [x, y], [x + w, y], [x + w, y + h - safeH],
      [x + w - safeW, y + h - safeH], [x + w - safeW, y + h], [x, y + h],
    ].map(p => p.join(',')).join(' ')
    case 'bl': return [
      [x, y], [x + w, y], [x + w, y + h],
      [x + safeW, y + h], [x + safeW, y + h - safeH], [x, y + h - safeH],
    ].map(p => p.join(',')).join(' ')
  }
}

function getCornerCutWallRects(
  x: number, y: number, w: number, h: number,
  cut: CornerCut, t: number
): { x: number; y: number; width: number; height: number }[] {
  const { corner, widthPx: cw, heightPx: ch } = cut
  const safeW = Math.min(cw, w * 0.9)
  const safeH = Math.min(ch, h * 0.9)

  switch (corner) {
    case 'tl': return [
      { x,             y: y + safeH - t, width: safeW,  height: t },
      { x: x + safeW - t, y,             width: t,      height: safeH },
    ]
    case 'tr': return [
      { x: x + w - safeW, y: y + safeH - t, width: safeW, height: t },
      { x: x + w - safeW, y,                width: t,     height: safeH },
    ]
    case 'br': return [
      { x: x + w - safeW, y: y + h - safeH, width: safeW, height: t },
      { x: x + w - safeW, y: y + h - safeH, width: t,     height: safeH },
    ]
    case 'bl': return [
      { x,             y: y + h - safeH, width: safeW,  height: t },
      { x: x + safeW - t, y: y + h - safeH, width: t,   height: safeH },
    ]
  }
}

// ── Main component ──────────────────────────────────────────────────────────

export default function RoomWallRenderer({
  zone, scalePxPerM, wallElements, zones, isSelected,
  onPointerDown, onSelectWallElement, onWallElementPointerDown, selectedWallElementId,
}: Props) {
  const t = getWallThicknessPx(zone, scalePxPerM)
  const { x, y, width: w, height: h } = zone
  const isStructure = zone.type === 'structure'
  const interiorFill = isStructure ? STRUCTURE_FILL : ROOM_FILL
  const cut = zone.cornerCut
  const clipId = `clip-${zone.id}`

  const edges: { edge: RoomEdge; rx: number; ry: number; rw: number; rh: number; len: number }[] = [
    { edge: 'top',    rx: x,         ry: y,         rw: w, rh: t,         len: w },
    { edge: 'bottom', rx: x,         ry: y + h - t, rw: w, rh: t,         len: w },
    { edge: 'left',   rx: x,         ry: y + t,     rw: t, rh: h - 2 * t, len: h - 2 * t },
    { edge: 'right',  rx: x + w - t, ry: y + t,     rw: t, rh: h - 2 * t, len: h - 2 * t },
  ]

  const widthM  = scalePxPerM > 0 ? (w / scalePxPerM).toFixed(1) : null
  const heightM = scalePxPerM > 0 ? (h / scalePxPerM).toFixed(1) : null

  let areaM2: string | null = null
  if (scalePxPerM > 0) {
    const totalPx2 = w * h
    const cutPx2 = cut ? cut.widthPx * cut.heightPx : 0
    areaM2 = ((totalPx2 - cutPx2) / (scalePxPerM * scalePxPerM)).toFixed(1)
  }

  const clipPoints = cut ? computeClipPoints(x, y, w, h, cut) : null
  const cornerWalls = cut ? getCornerCutWallRects(x, y, w, h, cut, t) : []

  // Pre-compute suppressions for ALL four edges so vertical walls can fill the
  // corner caps that would otherwise be left empty when an adjacent horizontal
  // wall is suppressed (the cap gap bug).
  const topSup    = !isStructure && isEdgeFlushWithStructure(zone, 'top',    zones, scalePxPerM)
  const bottomSup = !isStructure && isEdgeFlushWithStructure(zone, 'bottom', zones, scalePxPerM)
  const leftSup   = !isStructure && isEdgeFlushWithStructure(zone, 'left',   zones, scalePxPerM)
  const rightSup  = !isStructure && isEdgeFlushWithStructure(zone, 'right',  zones, scalePxPerM)

  function edgeSuppressed(edge: RoomEdge) {
    return edge === 'top' ? topSup : edge === 'bottom' ? bottomSup
         : edge === 'left' ? leftSup : rightSup
  }

  return (
    <g>
      {/* Clip path definition */}
      {clipPoints && (
        <defs>
          <clipPath id={clipId}>
            <polygon points={clipPoints} />
          </clipPath>
        </defs>
      )}

      {/* Click target covering entire bounding box */}
      <rect
        x={x} y={y} width={w} height={h}
        fill="transparent"
        onPointerDown={(e) => onPointerDown(e, zone.id)}
        style={{ cursor: 'pointer' }}
      />

      {/* Clipped group: interior fill + walls */}
      <g clipPath={clipPoints ? `url(#${clipId})` : undefined}>
        {/* Interior fill */}
        <rect
          x={x + t} y={y + t}
          width={Math.max(0, w - 2 * t)}
          height={Math.max(0, h - 2 * t)}
          fill={interiorFill}
          pointerEvents="none"
        />

        {/* 4 wall edges */}
        {edges.map(({ edge, rx, ry, rw, rh, len }) => {
          const ownGaps = getEdgeGaps(zone, edge, wallElements, scalePxPerM)

          // Fix 2: suppress room wall rects when a structure wall covers this edge
          const suppressWalls = edgeSuppressed(edge)

          // Fix 1: structure inherits gaps from rooms flush against its inner face
          const inheritedGaps = isStructure
            ? getInheritedGaps(zone, edge, zones, wallElements, scalePxPerM)
            : []

          const allGaps = [...ownGaps, ...inheritedGaps]
          const segments = suppressWalls ? [] : splitWallForGaps(len, allGaps)
          const isHorizontal = edge === 'top' || edge === 'bottom'

          return (
            <g key={edge}>
              {/* Solid wall segments */}
              {segments.map((seg, i) => {
                const segRect = isHorizontal
                  ? { x: rx + seg.start, y: ry, width: seg.end - seg.start, height: rh }
                  : { x: rx, y: ry + seg.start, width: rw, height: seg.end - seg.start }
                return <rect key={i} {...segRect} fill={WALL_COLOR} pointerEvents="none" />
              })}

              {/* Corner cap extension — vertical walls only.
                  When an adjacent horizontal wall is suppressed (covered by structure),
                  the normal left/right wall misses a t-high cap at that end. Fill it so
                  the room wall connects flush to the structure's outer wall with no gap. */}
              {!isHorizontal && !suppressWalls && topSup && (
                <rect x={rx} y={y} width={rw} height={t} fill={WALL_COLOR} pointerEvents="none" />
              )}
              {!isHorizontal && !suppressWalls && bottomSup && (
                <rect x={rx} y={y + h - t} width={rw} height={t} fill={WALL_COLOR} pointerEvents="none" />
              )}

              {/* Door/window graphics — only for this zone's OWN elements.
                  Inherited gaps only cut the wall; graphics are rendered by the owner zone. */}
              {ownGaps.map((gap) => {
                const el = gap.element
                const isHoriz = edge === 'top' || edge === 'bottom'
                const isWallElemSelected = el.id === selectedWallElementId
                const hitRect = isHoriz
                  ? { x: rx + gap.start, y: ry, width: gap.end - gap.start, height: rh }
                  : { x: rx, y: ry + gap.start, width: rw, height: gap.end - gap.start }

                return (
                  <g key={el.id}>
                    {el.type === 'door'
                      ? <DoorRenderer element={el} zone={zone} wallThicknessPx={t} scalePxPerM={scalePxPerM} />
                      : <WindowRenderer element={el} zone={zone} wallThicknessPx={t} scalePxPerM={scalePxPerM} />
                    }
                    <rect
                      x={hitRect.x - 4} y={hitRect.y - 4}
                      width={hitRect.width + 8} height={hitRect.height + 8}
                      fill={isWallElemSelected ? 'rgba(37,68,160,0.15)' : 'transparent'}
                      stroke={isWallElemSelected ? '#2544a0' : 'none'}
                      strokeWidth={1.5}
                      strokeDasharray={isWallElemSelected ? '4 2' : undefined}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        ;(e.target as Element).setPointerCapture(e.pointerId)
                        onSelectWallElement(el.id)
                        onWallElementPointerDown(e, el.id)
                      }}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </g>

      {/* Inner corner walls (not clipped) */}
      {cornerWalls.map((r, i) => (
        <rect key={`cw-${i}`} {...r} fill={WALL_COLOR} pointerEvents="none" />
      ))}

      {/* Room label + dimensions + area — fits dynamically inside the interior */}
      {!isStructure && (
        <g pointerEvents="none">
          {(() => {
            const iw = Math.max(0, w - 2 * t)
            const ih = Math.max(0, h - 2 * t)
            if (iw < 24 || ih < 10) return null

            const cx = x + w / 2
            const cy = y + h / 2   // = y + t + ih/2

            const labelFs = Math.min(11, iw / 8,  ih / 2.0)
            const infoFs  = Math.min( 9, iw / 10, ih / 3.0)
            const GAP = 3

            type Row = { text: string; fs: number; bold: boolean; color: string }
            const rows: Row[] = []
            if (zone.label)        rows.push({ text: zone.label, fs: labelFs, bold: true,  color: '#554' })
            if (widthM && heightM) rows.push({ text: `${widthM} × ${heightM} m${cut ? '*' : ''}`, fs: infoFs, bold: false, color: '#887' })
            if (areaM2)            rows.push({ text: `${areaM2} m²`, fs: infoFs, bold: false, color: '#998' })

            // Drop rows from the bottom until they fit
            while (rows.length > 0) {
              const totalH = rows.reduce((s, r, i) => s + r.fs + (i > 0 ? GAP : 0), 0)
              if (totalH <= ih) break
              rows.pop()
            }
            if (rows.length === 0) return null

            const totalH = rows.reduce((s, r, i) => s + r.fs + (i > 0 ? GAP : 0), 0)
            let curY = cy - totalH / 2

            return rows.map((row, i) => {
              const ty = curY + row.fs / 2
              curY += row.fs + (i < rows.length - 1 ? GAP : 0)
              return (
                <text key={i} x={cx} y={ty}
                  textAnchor="middle" dominantBaseline="central"
                  fill={row.color} fontSize={row.fs} fontWeight={row.bold ? 600 : 400}
                >
                  {row.text}
                </text>
              )
            })
          })()}
        </g>
      )}

      {/* Selection border */}
      {isSelected && (
        <rect
          x={x} y={y} width={w} height={h}
          fill="none" stroke="#2544a0"
          strokeWidth={2} strokeDasharray="6 3"
          pointerEvents="none"
        />
      )}
    </g>
  )
}
