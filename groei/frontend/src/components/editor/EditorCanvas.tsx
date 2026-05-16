import { useRef, useState, useCallback } from 'react'
import type { EditorZone, WallElement, ZoneStyleType, RoomEdge, ShadowCaster } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import { screenToSVG } from '../../utils/svgCoords'
import {
  WALL_THICKNESS_EXTERIOR_CM,
  WALL_THICKNESS_INTERIOR_CM,
  WALL_COLOR,
} from '../../constants/mapDefaults'
import EditorDefs from './EditorDefs'
import EditorZoneShape from './EditorZoneShape'
import EditorResizeOverlay, { type ResizeHandle } from './EditorResizeOverlay'
import WallElementPlacementOverlay from './WallElementPlacementOverlay'

const CANVAS_W = 680
const CANVAS_H = 680
const MIN_ZONE_SIZE = 20
const MIN_PX = 10
const SNAP_THRESHOLD = 12   // px — snap when any edge is within this distance

// ── Snap helpers ────────────────────────────────────────────────────────────

interface SnapLine {
  axis: 'x' | 'y'   // 'x' = vertical line, 'y' = horizontal line
  value: number
}

function wallThicknessPx(zone: EditorZone, scalePxPerM: number): number {
  const cm =
    zone.type === 'structure' || zone.wallThickness !== 'interior'
      ? WALL_THICKNESS_EXTERIOR_CM
      : WALL_THICKNESS_INTERIOR_CM
  return (cm * scalePxPerM) / 100
}

/**
 * Collect all horizontal (y) and vertical (x) snap target values from
 * structures, rooms and walls — excluding the zone currently being dragged.
 */
function getSnapTargets(
  zones: EditorZone[],
  draggingZoneId: string,
  scalePxPerM: number,
): { xTargets: number[]; yTargets: number[] } {
  const xTargets: number[] = []
  const yTargets: number[] = []

  for (const z of zones) {
    if (z.id === draggingZoneId) continue

    if (z.type === 'structure') {
      const t = wallThicknessPx(z, scalePxPerM)
      // Outer faces
      xTargets.push(z.x, z.x + z.width)
      yTargets.push(z.y, z.y + z.height)
      // Inner faces (inside the wall)
      xTargets.push(z.x + t, z.x + z.width - t)
      yTargets.push(z.y + t, z.y + z.height - t)
    } else if (z.type === 'room' || z.type === 'wall') {
      // Outer edges of sibling rooms/walls
      xTargets.push(z.x, z.x + z.width)
      yTargets.push(z.y, z.y + z.height)
    }

    // Fix 3: corner-cut inner faces — so other zones snap into the notch
    if (z.cornerCut) {
      const { corner, widthPx: cw, heightPx: ch } = z.cornerCut
      switch (corner) {
        case 'tl': xTargets.push(z.x + cw);            yTargets.push(z.y + ch); break
        case 'tr': xTargets.push(z.x + z.width - cw);  yTargets.push(z.y + ch); break
        case 'br': xTargets.push(z.x + z.width - cw);  yTargets.push(z.y + z.height - ch); break
        case 'bl': xTargets.push(z.x + cw);            yTargets.push(z.y + z.height - ch); break
      }
    }
  }

  return { xTargets, yTargets }
}

/**
 * Snap newX/newY so that the nearest edge of the zone aligns with the
 * nearest snap target within SNAP_THRESHOLD.
 * Returns adjusted position + which canvas-coordinate lines to draw.
 */
function snapPosition(
  newX: number, newY: number,
  zoneW: number, zoneH: number,
  xTargets: number[], yTargets: number[],
): { x: number; y: number; snapLines: SnapLine[] } {
  const snapLines: SnapLine[] = []
  let x = newX
  let y = newY

  // X axis — compare left edge and right edge to each target
  let bestX = SNAP_THRESHOLD
  let snapXVal: number | null = null
  for (const t of xTargets) {
    const dLeft  = Math.abs(newX - t)
    const dRight = Math.abs(newX + zoneW - t)
    if (dLeft < bestX)  { bestX = dLeft;  x = t;          snapXVal = t }
    if (dRight < bestX) { bestX = dRight; x = t - zoneW;  snapXVal = t }
  }
  if (snapXVal !== null) snapLines.push({ axis: 'x', value: snapXVal })

  // Y axis — compare top edge and bottom edge to each target
  let bestY = SNAP_THRESHOLD
  let snapYVal: number | null = null
  for (const t of yTargets) {
    const dTop    = Math.abs(newY - t)
    const dBottom = Math.abs(newY + zoneH - t)
    if (dTop < bestY)    { bestY = dTop;    y = t;          snapYVal = t }
    if (dBottom < bestY) { bestY = dBottom; y = t - zoneH;  snapYVal = t }
  }
  if (snapYVal !== null) snapLines.push({ axis: 'y', value: snapYVal })

  return { x, y, snapLines }
}

/**
 * When drawing a wall zone, lock direction to H or V and auto-set the thin
 * dimension to the exterior wall thickness.
 */
function computeWallDrawRect(
  drawing: DrawState,
  scalePxPerM: number,
): { x: number; y: number; width: number; height: number } {
  const dx = drawing.currentX - drawing.startX
  const dy = drawing.currentY - drawing.startY
  const wallT = Math.max(4, Math.round((WALL_THICKNESS_EXTERIOR_CM * scalePxPerM) / 100))

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal wall — lock height to wallT, centered on start Y
    const x = Math.min(drawing.startX, drawing.currentX)
    return { x, y: drawing.startY - wallT / 2, width: Math.abs(dx), height: wallT }
  } else {
    // Vertical wall — lock width to wallT, centered on start X
    const y = Math.min(drawing.startY, drawing.currentY)
    return { x: drawing.startX - wallT / 2, y, width: wallT, height: Math.abs(dy) }
  }
}

interface Props {
  zones: EditorZone[]
  wallElements: WallElement[]
  shadowCasters: ShadowCaster[]
  selectedZoneId: string | null
  selectedWallElementId: string | null
  selectedShadowCasterId: string | null
  activeTool: EditorTool
  activeZoneType: ZoneStyleType
  scalePxPerM: number
  previewMode: boolean
  onAddZone: (x: number, y: number, w: number, h: number, type: ZoneStyleType) => void
  onUpdateZone: (id: string, updates: Partial<EditorZone>) => void
  onUpdateWallElement: (id: string, updates: Partial<WallElement>) => void
  onSelectZone: (id: string | null) => void
  onSelectWallElement: (id: string | null) => void
  onPlaceWallElement: (zoneId: string, type: 'door' | 'window', edge: RoomEdge, position: number) => void
  onAddShadowCaster: (caster: Omit<ShadowCaster, 'id'>) => void
  onUpdateShadowCaster: (id: string, updates: Partial<ShadowCaster>) => void
  onSelectShadowCaster: (id: string | null) => void
}

interface DrawState {
  startX: number; startY: number; currentX: number; currentY: number
}

interface DragState {
  zoneId: string; startSvgX: number; startSvgY: number; origX: number; origY: number
}

interface ResizeState {
  zoneId: string
  handle: ResizeHandle
  startSvgX: number; startSvgY: number
  origX: number; origY: number; origW: number; origH: number
}

interface WallElementDragState {
  elementId: string
  zoneId: string
  edge: RoomEdge
  origPosition: number
  startSvgX: number
  startSvgY: number
}

interface ShadowCasterDragState {
  casterId: string
  startSvgX: number
  startSvgY: number
  origX: number  // rect: x, circle: cx
  origY: number  // rect: y, circle: cy
}

export default function EditorCanvas({
  zones, wallElements, shadowCasters,
  selectedZoneId, selectedWallElementId, selectedShadowCasterId,
  activeTool, activeZoneType, scalePxPerM, previewMode,
  onAddZone, onUpdateZone, onUpdateWallElement, onSelectZone, onSelectWallElement, onPlaceWallElement,
  onAddShadowCaster, onUpdateShadowCaster, onSelectShadowCaster,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drawing, setDrawing] = useState<DrawState | null>(null)
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [resizing, setResizing] = useState<ResizeState | null>(null)
  const [wallElementDragging, setWallElementDragging] = useState<WallElementDragState | null>(null)
  const [shadowCasterDragging, setShadowCasterDragging] = useState<ShadowCasterDragState | null>(null)
  const [svgPointer, setSvgPointer] = useState<{ x: number; y: number } | null>(null)
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])

  const getSvgPoint = useCallback((e: React.PointerEvent) => {
    if (!svgRef.current) return null
    return screenToSVG(svgRef.current, e.clientX, e.clientY)
  }, [])

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null
  const isPlacingWallElement = activeTool === 'place_door' || activeTool === 'place_window'

  function handlePointerDown(e: React.PointerEvent) {
    const pt = getSvgPoint(e)
    if (!pt) return

    if (isPlacingWallElement) {
      // handled by WallElementPlacementOverlay click
      return
    }

    if (activeTool === 'draw' || activeTool === 'shadow_caster') {
      e.preventDefault()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      setDrawing({ startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y })
      onSelectZone(null)
      onSelectShadowCaster(null)
    } else {
      onSelectZone(null)
      onSelectWallElement(null)
      onSelectShadowCaster(null)
    }
  }

  function handleZonePointerDown(e: React.PointerEvent, zoneId: string) {
    if (isPlacingWallElement) return
    e.stopPropagation()
    const pt = getSvgPoint(e)
    if (!pt) return
    if (activeTool === 'select') {
      onSelectZone(zoneId)
      const zone = zones.find((z) => z.id === zoneId)
      if (zone) {
        ;(e.target as Element).setPointerCapture(e.pointerId)
        setDragging({ zoneId, startSvgX: pt.x, startSvgY: pt.y, origX: zone.x, origY: zone.y })
      }
    } else {
      onSelectZone(zoneId)
    }
  }

  function handleWallElementPointerDown(e: React.PointerEvent, elementId: string) {
    if (activeTool !== 'select') return
    const pt = getSvgPoint(e)
    if (!pt) return
    const el = wallElements.find((w) => w.id === elementId)
    if (!el) return
    setWallElementDragging({
      elementId,
      zoneId: el.zoneId,
      edge: el.edge,
      origPosition: el.position,
      startSvgX: pt.x,
      startSvgY: pt.y,
    })
  }

  function handleShadowCasterPointerDown(e: React.PointerEvent, casterId: string) {
    if (isPlacingWallElement) return
    e.stopPropagation()
    const pt = getSvgPoint(e)
    if (!pt) return
    onSelectShadowCaster(casterId)
    onSelectZone(null)
    onSelectWallElement(null)
    if (activeTool === 'select') {
      const caster = shadowCasters.find((sc) => sc.id === casterId)
      if (caster) {
        ;(e.target as Element).setPointerCapture(e.pointerId)
        const origX = caster.type === 'rect' ? caster.x : caster.type === 'circle' ? caster.cx : (caster.points[0]?.[0] ?? 0)
        const origY = caster.type === 'rect' ? caster.y : caster.type === 'circle' ? caster.cy : (caster.points[0]?.[1] ?? 0)
        setShadowCasterDragging({ casterId, startSvgX: pt.x, startSvgY: pt.y, origX, origY })
      }
    }
  }

  function handleResizeHandlePointerDown(e: React.PointerEvent, handle: ResizeHandle) {
    if (!selectedZone) return
    const pt = getSvgPoint(e)
    if (!pt) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setResizing({
      zoneId: selectedZone.id,
      handle,
      startSvgX: pt.x, startSvgY: pt.y,
      origX: selectedZone.x, origY: selectedZone.y,
      origW: selectedZone.width, origH: selectedZone.height,
    })
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pt = getSvgPoint(e)
    if (!pt) return

    // Always track pointer for placement overlay
    setSvgPointer(pt)

    if (drawing) {
      setDrawing((d) => d ? { ...d, currentX: pt.x, currentY: pt.y } : null)
      return
    }

    if (shadowCasterDragging) {
      const caster = shadowCasters.find((sc) => sc.id === shadowCasterDragging.casterId)
      if (caster) {
        const dx = pt.x - shadowCasterDragging.startSvgX
        const dy = pt.y - shadowCasterDragging.startSvgY
        const newX = Math.round(shadowCasterDragging.origX + dx)
        const newY = Math.round(shadowCasterDragging.origY + dy)
        if (caster.type === 'rect') {
          onUpdateShadowCaster(shadowCasterDragging.casterId, { x: newX, y: newY })
        } else if (caster.type === 'circle') {
          onUpdateShadowCaster(shadowCasterDragging.casterId, { cx: newX, cy: newY })
        }
      }
      return
    }

    if (wallElementDragging) {
      const zone = zones.find((z) => z.id === wallElementDragging.zoneId)
      const el   = wallElements.find((w) => w.id === wallElementDragging.elementId)
      if (zone && el) {
        const isH = wallElementDragging.edge === 'top' || wallElementDragging.edge === 'bottom'
        const edgeLen = isH ? zone.width : zone.height
        const delta = isH
          ? (pt.x - wallElementDragging.startSvgX) / edgeLen
          : (pt.y - wallElementDragging.startSvgY) / edgeLen
        const halfW = (el.widthCm * scalePxPerM) / 100 / 2
        const margin = halfW / edgeLen
        const newPos = Math.max(margin, Math.min(1 - margin, wallElementDragging.origPosition + delta))
        onUpdateWallElement(wallElementDragging.elementId, { position: newPos })
      }
      return
    }

    if (dragging) {
      const dx = pt.x - dragging.startSvgX
      const dy = pt.y - dragging.startSvgY
      const zone = zones.find((z) => z.id === dragging.zoneId)
      if (zone) {
        const rawX = Math.max(0, Math.min(CANVAS_W - zone.width,  dragging.origX + dx))
        const rawY = Math.max(0, Math.min(CANVAS_H - zone.height, dragging.origY + dy))
        const { xTargets, yTargets } = getSnapTargets(zones, dragging.zoneId, scalePxPerM)
        const { x, y, snapLines: lines } = snapPosition(rawX, rawY, zone.width, zone.height, xTargets, yTargets)
        setSnapLines(lines)
        onUpdateZone(dragging.zoneId, { x: Math.round(x), y: Math.round(y) })
      }
      return
    }

    if (resizing) {
      const dx = pt.x - resizing.startSvgX
      const dy = pt.y - resizing.startSvgY
      const h = resizing.handle
      let { origX: x, origY: y, origW: w, origH: hh } = resizing

      if (h.includes('e')) { w = Math.max(MIN_PX, w + dx) }
      if (h.includes('s')) { hh = Math.max(MIN_PX, hh + dy) }
      if (h.includes('w')) { const dw = Math.min(dx, w - MIN_PX); x += dw; w -= dw }
      if (h.includes('n')) { const dh = Math.min(dy, hh - MIN_PX); y += dh; hh -= dh }

      x = Math.max(0, x); y = Math.max(0, y)
      w = Math.min(w, CANVAS_W - x); hh = Math.min(hh, CANVAS_H - y)

      onUpdateZone(resizing.zoneId, { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(hh) })
    }
  }

  function handlePointerLeave() {
    setSvgPointer(null)
  }

  function handlePointerUp() {
    if (drawing) {
      if (activeTool === 'shadow_caster') {
        const x = Math.min(drawing.startX, drawing.currentX)
        const y = Math.min(drawing.startY, drawing.currentY)
        const w = Math.abs(drawing.currentX - drawing.startX)
        const h = Math.abs(drawing.currentY - drawing.startY)
        if (w >= MIN_ZONE_SIZE && h >= MIN_ZONE_SIZE) {
          onAddShadowCaster({
            label: '',
            type: 'rect',
            x: Math.max(0, Math.round(x)),
            y: Math.max(0, Math.round(y)),
            width: Math.round(Math.min(w, CANVAS_W - Math.max(0, x))),
            height: Math.round(Math.min(h, CANVAS_H - Math.max(0, y))),
            heightCm: 500,
            opacity: 1,
            // Omit<ShadowCaster, 'id'> doesn't distribute over the union, so TypeScript
            // loses rect-specific fields. The cast is safe — addShadowCaster appends the id.
          } as unknown as Omit<ShadowCaster, 'id'>)
        }
      } else if (activeZoneType === 'wall') {
        const wr = computeWallDrawRect(drawing, scalePxPerM)
        const length = Math.max(wr.width, wr.height)
        if (length >= MIN_ZONE_SIZE) {
          onAddZone(
            Math.max(0, Math.round(wr.x)),
            Math.max(0, Math.round(wr.y)),
            Math.round(Math.min(wr.width,  CANVAS_W - Math.max(0, wr.x))),
            Math.round(Math.min(wr.height, CANVAS_H - Math.max(0, wr.y))),
            activeZoneType,
          )
        }
      } else {
        const x = Math.min(drawing.startX, drawing.currentX)
        const y = Math.min(drawing.startY, drawing.currentY)
        const w = Math.abs(drawing.currentX - drawing.startX)
        const h = Math.abs(drawing.currentY - drawing.startY)
        if (w >= MIN_ZONE_SIZE && h >= MIN_ZONE_SIZE) {
          onAddZone(
            Math.max(0, Math.round(x)),
            Math.max(0, Math.round(y)),
            Math.round(Math.min(w, CANVAS_W - Math.max(0, x))),
            Math.round(Math.min(h, CANVAS_H - Math.max(0, y))),
            activeZoneType,
          )
        }
      }
      setDrawing(null)
    }
    if (shadowCasterDragging) setShadowCasterDragging(null)
    if (wallElementDragging) setWallElementDragging(null)
    if (dragging) { setDragging(null); setSnapLines([]) }
    if (resizing) setResizing(null)
  }

  // Standard draw preview (non-wall zone types)
  const drawRect = drawing && activeTool === 'draw' && activeZoneType !== 'wall' ? {
    x: Math.max(0, Math.min(drawing.startX, drawing.currentX)),
    y: Math.max(0, Math.min(drawing.startY, drawing.currentY)),
    width: Math.min(Math.abs(drawing.currentX - drawing.startX), CANVAS_W),
    height: Math.min(Math.abs(drawing.currentY - drawing.startY), CANVAS_H),
  } : null

  // Wall draw preview — direction-locked, auto-thickness
  const wallDrawRect = drawing && activeTool === 'draw' && activeZoneType === 'wall'
    ? computeWallDrawRect(drawing, scalePxPerM)
    : null

  // Shadow caster draw preview
  const shadowCasterDrawRect = drawing && activeTool === 'shadow_caster' ? {
    x: Math.max(0, Math.min(drawing.startX, drawing.currentX)),
    y: Math.max(0, Math.min(drawing.startY, drawing.currentY)),
    width: Math.min(Math.abs(drawing.currentX - drawing.startX), CANVAS_W),
    height: Math.min(Math.abs(drawing.currentY - drawing.startY), CANVAS_H),
  } : null

  return (
    <div className="flex-1 flex items-center justify-center bg-bg overflow-hidden p-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="max-w-full max-h-full border border-border rounded-lg bg-[#f5f3ee]"
        style={{ aspectRatio: '1', touchAction: 'none', cursor: isPlacingWallElement ? 'crosshair' : activeTool === 'shadow_caster' ? 'crosshair' : 'default' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <EditorDefs />
        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#editor-grid)" />

        {/* Shadow casters — drawn below zones so garden zones overlay them */}
        {shadowCasters.map((sc) => {
          const isSelected = !previewMode && sc.id === selectedShadowCasterId
          const fill = 'rgba(107, 114, 128, 0.18)'
          const stroke = isSelected ? '#4A90D9' : '#6b7280'
          const strokeWidth = isSelected ? 2 : 1.5
          const strokeDasharray = isSelected ? undefined : '6 3'
          const cursor = activeTool === 'select' ? 'move' : 'default'
          if (sc.type === 'rect') {
            return (
              <rect
                key={sc.id}
                x={sc.x} y={sc.y}
                width={sc.width} height={sc.height}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                style={{ cursor }}
                onPointerDown={(e) => handleShadowCasterPointerDown(e, sc.id)}
              />
            )
          } else if (sc.type === 'circle') {
            return (
              <circle
                key={sc.id}
                cx={sc.cx} cy={sc.cy}
                r={sc.radius}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                style={{ cursor }}
                onPointerDown={(e) => handleShadowCasterPointerDown(e, sc.id)}
              />
            )
          }
          return null
        })}

        {zones.map((zone) => (
          <EditorZoneShape
            key={zone.id}
            zone={zone}
            zones={zones}
            isSelected={!previewMode && zone.id === selectedZoneId}
            scalePxPerM={scalePxPerM}
            wallElements={wallElements}
            selectedWallElementId={previewMode ? null : selectedWallElementId}
            onPointerDown={handleZonePointerDown}
            onSelectWallElement={onSelectWallElement}
            onWallElementPointerDown={handleWallElementPointerDown}
          />
        ))}

        {/* Resize overlay on selected zone */}
        {!previewMode && selectedZone && activeTool === 'select' && (
          <EditorResizeOverlay
            zone={selectedZone}
            onHandlePointerDown={handleResizeHandlePointerDown}
          />
        )}

        {/* Wall element placement overlay */}
        {!previewMode && isPlacingWallElement && (
          <WallElementPlacementOverlay
            zones={zones}
            activeTool={activeTool}
            scalePxPerM={scalePxPerM}
            svgPoint={svgPointer}
            onPlace={(zoneId, edge, position) => {
              const type = activeTool === 'place_door' ? 'door' : 'window'
              onPlaceWallElement(zoneId, type, edge, position)
            }}
          />
        )}

        {/* Snap indicator lines */}
        {snapLines.map((line, i) =>
          line.axis === 'x'
            ? <line key={i} x1={line.value} y1={0} x2={line.value} y2={CANVAS_H}
                stroke="#4A90D9" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} pointerEvents="none" />
            : <line key={i} x1={0} y1={line.value} x2={CANVAS_W} y2={line.value}
                stroke="#4A90D9" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} pointerEvents="none" />
        )}

        {/* Draw preview (regular zones) */}
        {drawRect && drawRect.width > 2 && drawRect.height > 2 && (
          <rect
            x={drawRect.x} y={drawRect.y}
            width={drawRect.width} height={drawRect.height}
            fill="rgba(74,144,217,0.15)" stroke="#4A90D9"
            strokeWidth={1.5} strokeDasharray="6 3" pointerEvents="none"
          />
        )}

        {/* Draw preview (wall zone — direction-locked solid bar) */}
        {wallDrawRect && Math.max(wallDrawRect.width, wallDrawRect.height) > 4 && (
          <rect
            x={wallDrawRect.x} y={wallDrawRect.y}
            width={wallDrawRect.width} height={wallDrawRect.height}
            fill={WALL_COLOR} opacity={0.55}
            stroke="#4A90D9" strokeWidth={1} strokeDasharray="4 2"
            pointerEvents="none"
          />
        )}

        {/* Draw preview (shadow caster) */}
        {shadowCasterDrawRect && shadowCasterDrawRect.width > 2 && shadowCasterDrawRect.height > 2 && (
          <rect
            x={shadowCasterDrawRect.x} y={shadowCasterDrawRect.y}
            width={shadowCasterDrawRect.width} height={shadowCasterDrawRect.height}
            fill="rgba(107,114,128,0.2)" stroke="#6b7280"
            strokeWidth={1.5} strokeDasharray="6 3" pointerEvents="none"
          />
        )}

      </svg>
    </div>
  )
}
