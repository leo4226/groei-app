import { useRef, useState, useCallback, useMemo } from 'react'
import type { EditorZone, WallElement, ZoneStyleType, RoomEdge, ShadowCaster, MapType, MapObject } from '../../types'
import type { EditorTool, ObjectPreset } from '../../hooks/useEditorState'
import { screenToSVG } from '../../utils/svgCoords'
import {
  WALL_THICKNESS_EXTERIOR_CM,
  WALL_THICKNESS_INTERIOR_CM,
  WALL_COLOR,
} from '../../constants/mapDefaults'
import EditorDefs from './EditorDefs'
import DimensionArrows from './DimensionArrows'
import { useIsMobile } from '../../hooks/useIsMobile'
import EditorZoneShape from './EditorZoneShape'
import RoomWallRenderer from './RoomWallRenderer'
import EditorResizeOverlay, { type ResizeHandle } from './EditorResizeOverlay'
import WallElementPlacementOverlay from './WallElementPlacementOverlay'

const CANVAS_W = 680
const CANVAS_H = 680
const MIN_ZONE_SIZE = 20
const MIN_PX = 10
const SNAP_THRESHOLD = 60   // px — snap when any edge is within this distance

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
 * every zone (all types) — excluding the zone currently being dragged.
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

    // Every zone contributes its outer edges as snap targets
    xTargets.push(z.x, z.x + z.width)
    yTargets.push(z.y, z.y + z.height)

    // For structures, also add inner faces (inside the wall thickness)
    if (z.type === 'structure') {
      const t = wallThicknessPx(z, scalePxPerM)
      xTargets.push(z.x + t, z.x + z.width - t)
      yTargets.push(z.y + t, z.y + z.height - t)
    }

    // Corner-cut inner faces — so other zones snap into the notch
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
 *
 * Also performs **dimension matching**: if one edge of the dragged zone
 * is close to the corresponding edge of another zone (e.g. left ≈ left),
 * the *opposite* edge of the dragged zone will also be offered as a snap
 * target against that zone's opposite edge (e.g. right ≈ right). This
 * makes it easy to match widths/heights without aggressive snapping.
 *
 * Returns adjusted position + which canvas-coordinate lines to draw.
 */
function snapPosition(
  newX: number, newY: number,
  zoneW: number, zoneH: number,
  zones: EditorZone[],
  draggingZoneId: string,
  xTargets: number[], yTargets: number[],
): { x: number; y: number; snapLines: SnapLine[] } {
  const snapLines: SnapLine[] = []
  let x = newX
  let y = newY

  // ── Extra targets for dimension matching ────────────────────────────────
  // If one edge of the dragged zone is near the same edge of another zone,
  // also offer a snap for the opposite edge so widths/heights match.
  const extraX: number[] = []
  const extraY: number[] = []
  for (const z of zones) {
    if (z.id === draggingZoneId) continue
    // X: left-near-left → also snap right to match z.right
    if (Math.abs(newX - z.x) < SNAP_THRESHOLD) {
      extraX.push(z.x + z.width - zoneW)
    }
    // X: right-near-right → also snap left to match z.left
    if (Math.abs((newX + zoneW) - (z.x + z.width)) < SNAP_THRESHOLD) {
      extraX.push(z.x)
    }
    // Y: top-near-top → also snap bottom to match z.bottom
    if (Math.abs(newY - z.y) < SNAP_THRESHOLD) {
      extraY.push(z.y + z.height - zoneH)
    }
    // Y: bottom-near-bottom → also snap top to match z.top
    if (Math.abs((newY + zoneH) - (z.y + z.height)) < SNAP_THRESHOLD) {
      extraY.push(z.y)
    }
  }

  // X axis — compare left edge and right edge to each target + extra
  const allX = [...xTargets, ...extraX]
  let bestX = SNAP_THRESHOLD
  let snapXVal: number | null = null
  for (const t of allX) {
    const dLeft  = Math.abs(newX - t)
    const dRight = Math.abs(newX + zoneW - t)
    if (dLeft < bestX)  { bestX = dLeft;  x = t;          snapXVal = t }
    if (dRight < bestX) { bestX = dRight; x = t - zoneW;  snapXVal = t }
  }
  if (snapXVal !== null) snapLines.push({ axis: 'x', value: snapXVal })

  // Y axis — compare top edge and bottom edge to each target + extra
  const allY = [...yTargets, ...extraY]
  let bestY = SNAP_THRESHOLD
  let snapYVal: number | null = null
  for (const t of allY) {
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
  objects: MapObject[]
  shadowCasters: ShadowCaster[]
  selectedZoneId: string | null
  selectedWallElementId: string | null
  selectedShadowCasterId: string | null
  activeTool: EditorTool
  activeZoneType: ZoneStyleType
  objectPreset: ObjectPreset | null
  scalePxPerM: number
  previewMode: boolean
  mapType: MapType
  mapId: number | null
  showSunPreview?: boolean
  perimeterPolygon?: [number, number][] | null
  onAddZone: (x: number, y: number, w: number, h: number, type: ZoneStyleType) => void
  onUpdateZone: (id: string, updates: Partial<EditorZone>) => void
  onUpdateWallElement: (id: string, updates: Partial<WallElement>) => void
  onSelectZone: (id: string | null) => void
  onSelectWallElement: (id: string | null) => void
  onPlaceWallElement: (zoneId: string, type: 'door' | 'window', edge: RoomEdge, position: number) => void
  onAddShadowCaster: (caster: Omit<ShadowCaster, 'id'>) => void
  onUpdateShadowCaster: (id: string, updates: Partial<ShadowCaster>) => void
  onSelectShadowCaster: (id: string | null) => void
  selectedObjectId: number | null
  onMoveObject: (objectId: number, x: number, y: number) => void
  onRotateObject: (objectId: number, rotation: number) => void
  onSelectObject: (id: number | null) => void
  onObjectCreated: () => void
}

interface DrawState {
  startX: number; startY: number; currentX: number; currentY: number
}

interface DragState {
  zoneId: string; startSvgX: number; startSvgY: number; origX: number; origY: number
  containedZones?: Array<{ id: string; origX: number; origY: number }>
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
  zones, wallElements, shadowCasters, objects,
  selectedZoneId, selectedWallElementId, selectedShadowCasterId,
  activeTool, activeZoneType, objectPreset, scalePxPerM, previewMode, mapType, mapId,
  showSunPreview, perimeterPolygon,
  onAddZone, onUpdateZone, onUpdateWallElement, onSelectZone, onSelectWallElement, onPlaceWallElement,
  onAddShadowCaster, onUpdateShadowCaster, onSelectShadowCaster,
  selectedObjectId, onMoveObject, onRotateObject, onSelectObject, onObjectCreated,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drawing, setDrawing] = useState<DrawState | null>(null)
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [resizing, setResizing] = useState<ResizeState | null>(null)
  const [wallElementDragging, setWallElementDragging] = useState<WallElementDragState | null>(null)
  const [shadowCasterDragging, setShadowCasterDragging] = useState<ShadowCasterDragState | null>(null)
  const [svgPointer, setSvgPointer] = useState<{ x: number; y: number } | null>(null)
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])
  const isMobile = useIsMobile()
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 4
  const ZOOM_STEP = 0.25

  const zoneBbox = useMemo(() => {
    if (zones.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const z of zones) {
      if (z.x < minX) minX = z.x
      if (z.y < minY) minY = z.y
      if (z.x + z.width > maxX) maxX = z.x + z.width
      if (z.y + z.height > maxY) maxY = z.y + z.height
    }
    return { zoneMinX: minX, zoneMinY: minY, zoneMaxX: maxX, zoneMaxY: maxY }
  }, [zones])
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
    } else if (activeTool === 'select') {
      setPanning({ startX: pt.x, startY: pt.y, origPanX: pan.x, origPanY: pan.y })
      onSelectZone(null)
      onSelectWallElement(null)
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
        const containedZones = zone.type === 'structure'
          ? zones
              .filter(z => z.id !== zoneId && z.x >= zone.x && z.y >= zone.y && z.x + z.width <= zone.x + zone.width && z.y + z.height <= zone.y + zone.height)
              .map(z => ({ id: z.id, origX: z.x, origY: z.y }))
          : undefined
        setDragging({ zoneId, startSvgX: pt.x, startSvgY: pt.y, origX: zone.x, origY: zone.y, containedZones })
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
      // Size-match snap: if current width/height is close to any zone's dimension, lock to it
      const SIZE_SNAP = 15
      const rawW = Math.abs(pt.x - drawing.startX)
      const rawH = Math.abs(pt.y - drawing.startY)
      let snapX = pt.x
      let snapY = pt.y
      let bestW = SIZE_SNAP
      let bestH = SIZE_SNAP
      const drawSnapLines: SnapLine[] = []
      for (const z of zones) {
        if (z.type === 'wall') continue
        const dW = Math.abs(rawW - z.width)
        if (dW < bestW) {
          bestW = dW
          snapX = drawing.startX + (pt.x >= drawing.startX ? z.width : -z.width)
        }
        const dH = Math.abs(rawH - z.height)
        if (dH < bestH) {
          bestH = dH
          snapY = drawing.startY + (pt.y >= drawing.startY ? z.height : -z.height)
        }
      }
      if (bestW < SIZE_SNAP) drawSnapLines.push({ axis: 'x', value: snapX })
      if (bestH < SIZE_SNAP) drawSnapLines.push({ axis: 'y', value: snapY })
      setSnapLines(drawSnapLines)
      setDrawing((d) => d ? { ...d, currentX: snapX, currentY: snapY } : null)
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
        let rawX = Math.max(0, Math.min(CANVAS_W - zone.width,  dragging.origX + dx))
        let rawY = Math.max(0, Math.min(CANVAS_H - zone.height, dragging.origY + dy))
        // Exclude contained zones so the structure doesn't snap to its own interior rooms
        const excludeIds = new Set([dragging.zoneId, ...(dragging.containedZones?.map(cz => cz.id) ?? [])])
        const snapZones = zones.filter(z => !excludeIds.has(z.id))
        const { xTargets, yTargets } = getSnapTargets(snapZones, dragging.zoneId, scalePxPerM)
        const { x, y, snapLines: lines } = snapPosition(rawX, rawY, zone.width, zone.height, snapZones, dragging.zoneId, xTargets, yTargets)
        setSnapLines(lines)
        const newX = Math.round(x)
        const newY = Math.round(y)
        onUpdateZone(dragging.zoneId, { x: newX, y: newY })
        if (dragging.containedZones) {
          const actualDX = newX - dragging.origX
          const actualDY = newY - dragging.origY
          for (const cz of dragging.containedZones) {
            onUpdateZone(cz.id, { x: cz.origX + actualDX, y: cz.origY + actualDY })
          }
        }
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

      // Snap resize edges to other zone edges
      const { xTargets, yTargets } = getSnapTargets(zones, resizing.zoneId, scalePxPerM)
      const snapLines: SnapLine[] = []
      const rightEdge = x + w
      const bottomEdge = y + hh

      // Show alignment lines but DON'T snap — just guide the eye
      if (h.includes('e')) {
        for (const t of xTargets) {
          if (Math.abs(rightEdge - t) < SNAP_THRESHOLD) snapLines.push({ axis: 'x', value: t })
        }
      }
      if (h.includes('w')) {
        for (const t of xTargets) {
          if (Math.abs(x - t) < SNAP_THRESHOLD) snapLines.push({ axis: 'x', value: t })
        }
      }
      if (h.includes('s')) {
        for (const t of yTargets) {
          if (Math.abs(bottomEdge - t) < SNAP_THRESHOLD) snapLines.push({ axis: 'y', value: t })
        }
      }
      if (h.includes('n')) {
        for (const t of yTargets) {
          if (Math.abs(y - t) < SNAP_THRESHOLD) snapLines.push({ axis: 'y', value: t })
        }
      }

      // Re-clamp after snap
      x = Math.max(0, x); y = Math.max(0, y)
      w = Math.max(MIN_PX, Math.min(w, CANVAS_W - x))
      hh = Math.max(MIN_PX, Math.min(hh, CANVAS_H - y))

      setSnapLines(snapLines)
      onUpdateZone(resizing.zoneId, { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(hh) })
    }

    if (panning) {
      const dx = pt.x - panning.startX
      const dy = pt.y - panning.startY
      setPan({
        x: panning.origPanX + dx,
        y: panning.origPanY + dy,
      })
      return
    }
  }

  function handlePointerLeave() {
    setSvgPointer(null)
    setSnapLines([])
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
      } else if (activeZoneType === 'wall' || activeZoneType === 'fence') {
        const wr = computeWallDrawRect(drawing, scalePxPerM)
        const length = Math.max(wr.width, wr.height)
        if (length >= MIN_ZONE_SIZE) {
          let wx = Math.max(0, Math.round(wr.x))
          let wy = Math.max(0, Math.round(wr.y))
          const ww = Math.round(Math.min(wr.width,  CANVAS_W - Math.max(0, wr.x)))
          const wh = Math.round(Math.min(wr.height, CANVAS_H - Math.max(0, wr.y)))
          // Snap new wall to existing zone edges on creation
          const { xTargets, yTargets } = getSnapTargets(zones, '', scalePxPerM)
          const snapped = snapPosition(wx, wy, ww, wh, zones, '', xTargets, yTargets)
          onAddZone(snapped.x, snapped.y, ww, wh, activeZoneType)
        }
      } else {
        const x = Math.min(drawing.startX, drawing.currentX)
        const y = Math.min(drawing.startY, drawing.currentY)
        const w = Math.abs(drawing.currentX - drawing.startX)
        const h = Math.abs(drawing.currentY - drawing.startY)
        if (w >= MIN_ZONE_SIZE && h >= MIN_ZONE_SIZE) {
          let px = Math.max(0, Math.round(x))
          let py = Math.max(0, Math.round(y))
          const pw = Math.round(Math.min(w, CANVAS_W - Math.max(0, x)))
          const ph = Math.round(Math.min(h, CANVAS_H - Math.max(0, y)))
          // Snap new zone to existing zone edges on creation
          const { xTargets, yTargets } = getSnapTargets(zones, '', scalePxPerM)
          const snapped = snapPosition(px, py, pw, ph, zones, '', xTargets, yTargets)
          onAddZone(snapped.x, snapped.y, pw, ph, activeZoneType)
        }
      }
      setDrawing(null)
      setSnapLines([])
    }
    if (shadowCasterDragging) setShadowCasterDragging(null)
    if (wallElementDragging) setWallElementDragging(null)
    if (dragging) { setDragging(null); setSnapLines([]) }
    if (resizing) { setResizing(null); setSnapLines([]) }
    if (panning) setPanning(null)
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    if (e.deltaY === 0) return
    e.preventDefault()
    const dir = e.deltaY < 0 ? 1 : -1
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + dir * ZOOM_STEP).toFixed(2))))
  }

  // Standard draw preview (non-wall, non-fence zone types)
  const drawRect = drawing && activeTool === 'draw' && activeZoneType !== 'wall' && activeZoneType !== 'fence' ? {
    x: Math.max(0, Math.min(drawing.startX, drawing.currentX)),
    y: Math.max(0, Math.min(drawing.startY, drawing.currentY)),
    width: Math.min(Math.abs(drawing.currentX - drawing.startX), CANVAS_W),
    height: Math.min(Math.abs(drawing.currentY - drawing.startY), CANVAS_H),
  } : null

  // Wall/fence draw preview — direction-locked, auto-thickness
  const wallDrawRect = drawing && activeTool === 'draw' && (activeZoneType === 'wall' || activeZoneType === 'fence')
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
    <div className="flex-1 flex items-center justify-center bg-bg overflow-hidden p-2 relative">
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
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
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

          {zones.map((zone) => {
            const isIndoorZone = zone.type === 'room' || zone.type === 'structure'
            return isIndoorZone ? (
              <RoomWallRenderer
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
            ) : (
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
            )
          })}

          {/* Resize overlay on selected zone */}
          {!previewMode && selectedZone && activeTool === 'select' && (
            <EditorResizeOverlay
              zone={selectedZone}
              onHandlePointerDown={handleResizeHandlePointerDown}
            />
          )}

          {/* Dimension arrows — after zones so they render on top in SVG */}
          {!previewMode && zoneBbox && (
            <DimensionArrows {...zoneBbox} pxPerM={scalePxPerM} zones={zones} compact={isMobile} />
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
                  stroke="#4AE8A0" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.65} pointerEvents="none" />
              : <line key={i} x1={0} y1={line.value} x2={CANVAS_W} y2={line.value}
                  stroke="#4AE8A0" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.65} pointerEvents="none" />
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

          {/* Garden perimeter preview (sun polygon) */}
          {perimeterPolygon && perimeterPolygon.length >= 3 && (
            <polygon
              points={perimeterPolygon.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="rgba(251,191,36,0.08)"
              stroke="#fbbf24"
              strokeWidth={2}
              strokeDasharray="8 4"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-surface/90 border border-border rounded-lg shadow-md backdrop-blur-sm p-1">
        <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-sm font-bold">−</button>
        <span className="text-xs text-text-muted font-medium w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-sm font-bold">+</button>
        <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1) }}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-xs border-l border-border ml-0.5 pl-1.5"
          title="Reset">⟲</button>
      </div>
    </div>
  )
}
