import { useRef, useState, useCallback, useEffect } from 'react'
import type { EditorZone, WallElement, ZoneStyleType, RoomEdge, MapObject, ShadowCaster } from '../../types'
import type { EditorTool, ObjectPreset } from '../../hooks/useEditorState'
import { createObject } from '../../api/client'
import { screenToSVG } from '../../utils/svgCoords'
import {
  WALL_THICKNESS_EXTERIOR_CM,
  WALL_THICKNESS_INTERIOR_CM,
  WALL_COLOR,
  FENCE_THICKNESS_CM,
  FENCE_COLOR_WOOD,
  FENCE_COLOR_BRICK,
} from '../../constants/mapDefaults'
import { computeZoneUnion } from '../../utils/computeZoneUnion'
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
 * When a zone is snapped flush against a zone with a corner cut, extend the
 * zone into the cut so it fills the notch. Only extends on the first matching
 * side to avoid growing in multiple directions.
 */
function expandIntoCornerCuts(
  x: number, y: number, w: number, h: number,
  ownId: string,
  zones: EditorZone[],
): { x: number; y: number; w: number; h: number } {
  let rx = x, ry = y, rw = w, rh = h
  let extended = false
  for (const z of zones) {
    if (z.id === ownId || !z.cornerCut || extended) continue
    const { corner, widthPx: cw, heightPx: ch } = z.cornerCut

    // Zone touches the LEFT side of the cut zone (right edge = z.x)
    if (Math.abs(rx + rw - z.x) < 1) {
      if (corner === 'tl' && Math.abs(ry - z.y) < 1)  { rw += cw; extended = true }
      else if (corner === 'bl' && Math.abs(ry + rh - (z.y + z.height)) < 1) { rw += cw; extended = true }
    }
    // Zone touches the RIGHT side of the cut zone (left edge = z.x + z.width)
    else if (Math.abs(rx - (z.x + z.width)) < 1) {
      if (corner === 'tr' && Math.abs(ry - z.y) < 1)  { rx -= cw; rw += cw; extended = true }
      else if (corner === 'br' && Math.abs(ry + rh - (z.y + z.height)) < 1) { rx -= cw; rw += cw; extended = true }
    }
    // Zone touches the TOP of the cut zone (bottom edge = z.y)
    else if (Math.abs(ry + rh - z.y) < 1) {
      if (corner === 'tl' && Math.abs(rx - z.x) < 1)  { rh += ch; extended = true }
      else if (corner === 'tr' && Math.abs(rx + rw - (z.x + z.width)) < 1) { rh += ch; extended = true }
    }
    // Zone touches the BOTTOM of the cut zone (top edge = z.y + z.height)
    else if (Math.abs(ry - (z.y + z.height)) < 1) {
      if (corner === 'bl' && Math.abs(rx - z.x) < 1)  { ry -= ch; rh += ch; extended = true }
      else if (corner === 'br' && Math.abs(rx + rw - (z.x + z.width)) < 1) { ry -= ch; rh += ch; extended = true }
    }
  }
  return { x: rx, y: ry, w: rw, h: rh }
}

/** Snap a single edge value to the nearest target within SNAP_THRESHOLD, or null. */
function snapEdge(value: number, targets: number[]): number | null {
  let best = SNAP_THRESHOLD
  let result: number | null = null
  for (const t of targets) {
    const d = Math.abs(value - t)
    if (d < best) { best = d; result = t }
  }
  return result
}

/**
 * Collect all horizontal (y) and vertical (x) snap target values from
 * all zone types — excluding the zone currently being operated on.
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
    } else {
      // Outer edges of all non-structure zones (rooms, walls, garden zones)
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
 * When drawing a wall or fence zone, lock direction to H or V and auto-set
 * the thin dimension to the given thickness.
 */
function computeDirectedDrawRect(
  drawing: DrawState,
  scalePxPerM: number,
  thicknessCm: number,
): { x: number; y: number; width: number; height: number } {
  const dx = drawing.currentX - drawing.startX
  const dy = drawing.currentY - drawing.startY
  const t = Math.max(4, Math.round((thicknessCm * scalePxPerM) / 100))

  if (Math.abs(dx) >= Math.abs(dy)) {
    const x = Math.min(drawing.startX, drawing.currentX)
    return { x, y: drawing.startY - t / 2, width: Math.abs(dx), height: t }
  } else {
    const y = Math.min(drawing.startY, drawing.currentY)
    return { x: drawing.startX - t / 2, y, width: t, height: Math.abs(dy) }
  }
}

interface Props {
  zones: EditorZone[]
  wallElements: WallElement[]
  selectedZoneId: string | null
  selectedWallElementId: string | null
  activeTool: EditorTool
  activeZoneType: ZoneStyleType
  objectPreset: ObjectPreset | null
  scalePxPerM: number
  previewMode: boolean
  mapId: number | null
  objects: MapObject[]
  selectedObjectId: number | null
  onMoveObject: (objectId: number, x: number, y: number) => void
  onObjectCreated: () => void
  onSelectObject: (id: number | null) => void
  onAddZone: (x: number, y: number, w: number, h: number, type: ZoneStyleType) => void
  onUpdateZone: (id: string, updates: Partial<EditorZone>) => void
  onUpdateWallElement: (id: string, updates: Partial<WallElement>) => void
  onSelectZone: (id: string | null) => void
  onSelectWallElement: (id: string | null) => void
  onPlaceWallElement: (zoneId: string, type: 'door' | 'window', edge: RoomEdge, position: number) => void
  shadowCasters?: ShadowCaster[]
  selectedShadowCasterId?: string | null
  onAddShadowCaster?: (x: number, y: number, w: number, h: number) => void
  onUpdateShadowCaster?: (id: string, updates: Partial<ShadowCaster>) => void
  onSelectShadowCaster?: (id: string | null) => void
}

interface DrawState {
  startX: number; startY: number; currentX: number; currentY: number
}

interface DragState {
  zoneId: string
  startSvgX: number
  startSvgY: number
  origX: number
  origY: number
  children: Array<{ zoneId: string; origX: number; origY: number }>
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

export default function EditorCanvas({
  zones, wallElements, objects, selectedZoneId, selectedWallElementId, selectedObjectId,
  activeTool, activeZoneType, objectPreset, scalePxPerM, previewMode, mapId,
  onAddZone, onUpdateZone, onUpdateWallElement, onSelectZone, onSelectWallElement, onPlaceWallElement, onMoveObject, onObjectCreated, onSelectObject,
  shadowCasters = [], selectedShadowCasterId = null, onAddShadowCaster, onUpdateShadowCaster, onSelectShadowCaster,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drawing, setDrawing] = useState<DrawState | null>(null)
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [resizing, setResizing] = useState<ResizeState | null>(null)
  const [wallElementDragging, setWallElementDragging] = useState<WallElementDragState | null>(null)
  const [objectDragging, setObjectDragging] = useState<{ objectId: number; startSvgX: number; startSvgY: number; origX: number; origY: number } | null>(null)
  const [shadowCasterDragging, setShadowCasterDragging] = useState<{ casterId: string; startSvgX: number; startSvgY: number; origX: number; origY: number } | null>(null)
  const [shadowCasterResizing, setShadowCasterResizing] = useState<{ casterId: string; handle: ResizeHandle; startSvgX: number; startSvgY: number; origX: number; origY: number; origW: number; origH: number } | null>(null)
  const [svgPointer, setSvgPointer] = useState<{ x: number; y: number } | null>(null)
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])

  const getSvgPoint = useCallback((e: React.PointerEvent) => {
    if (!svgRef.current) return null
    return screenToSVG(svgRef.current, e.clientX, e.clientY)
  }, [])

  useEffect(() => {
    setDrawing(null)
    setDragging(null)
    setResizing(null)
    setWallElementDragging(null)
    setSnapLines([])
  }, [activeTool])

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null
  const isPlacingWallElement = activeTool === 'place_door' || activeTool === 'place_window'
  const isPlacingObject = activeTool === 'place_object' && objectPreset !== null
  const isPlacingShadowCaster = activeTool === 'shadow_caster'

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
      onSelectShadowCaster?.(null)
    } else {
      onSelectZone(null)
      onSelectWallElement(null)
      onSelectShadowCaster?.(null)
      onSelectObject(null)
      setShadowCasterDragging(null)
      setShadowCasterResizing(null)
    }
  }

  function handleZonePointerDown(e: React.PointerEvent, zoneId: string) {
    if (isPlacingWallElement) return
    e.stopPropagation()
    const pt = getSvgPoint(e)
    if (!pt) return
    if (activeTool === 'select') {
      onSelectObject(null)
      onSelectZone(zoneId)
      const zone = zones.find((z) => z.id === zoneId)
      if (zone) {
        ;(e.target as Element).setPointerCapture(e.pointerId)
        const children: DragState['children'] =
          zone.type === 'structure'
            ? zones
                .filter(
                  (z) =>
                    z.id !== zoneId &&
                    z.x >= zone.x &&
                    z.y >= zone.y &&
                    z.x + z.width <= zone.x + zone.width &&
                    z.y + z.height <= zone.y + zone.height,
                )
                .map((z) => ({ zoneId: z.id, origX: z.x, origY: z.y }))
            : []
        setDragging({ zoneId, startSvgX: pt.x, startSvgY: pt.y, origX: zone.x, origY: zone.y, children })
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
        // Children use raw dx/dy (not snap-adjusted), so relative positions stay
        // consistent. Minor drift can occur at canvas edges when the parent snaps.
        for (const child of dragging.children) {
          const childZone = zones.find((z) => z.id === child.zoneId)
          if (!childZone) continue
          const childRawX = Math.max(0, Math.min(CANVAS_W - childZone.width,  child.origX + dx))
          const childRawY = Math.max(0, Math.min(CANVAS_H - childZone.height, child.origY + dy))
          onUpdateZone(child.zoneId, { x: Math.round(childRawX), y: Math.round(childRawY) })
        }
      }
      return
    }

    if (objectDragging) {
      const dx = pt.x - objectDragging.startSvgX
      const dy = pt.y - objectDragging.startSvgY
      const newX = Math.max(0, Math.min(CANVAS_W, objectDragging.origX + dx))
      const newY = Math.max(0, Math.min(CANVAS_H, objectDragging.origY + dy))
      onMoveObject(objectDragging.objectId, newX, newY)
      return
    }

    if (shadowCasterDragging) {
      const dx = pt.x - shadowCasterDragging.startSvgX
      const dy = pt.y - shadowCasterDragging.startSvgY
      const sc = shadowCasters.find(s => s.id === shadowCasterDragging.casterId)
      if (sc?.type === 'circle') {
        onUpdateShadowCaster?.(shadowCasterDragging.casterId, {
          cx: Math.round(shadowCasterDragging.origX + dx),
          cy: Math.round(shadowCasterDragging.origY + dy),
        })
      } else {
        onUpdateShadowCaster?.(shadowCasterDragging.casterId, {
          x: Math.round(shadowCasterDragging.origX + dx),
          y: Math.round(shadowCasterDragging.origY + dy),
        })
      }
      return
    }

    if (shadowCasterResizing) {
      const dx = pt.x - shadowCasterResizing.startSvgX
      const dy = pt.y - shadowCasterResizing.startSvgY
      const h = shadowCasterResizing.handle
      let { origX: x, origY: y, origW: w, origH: hh } = shadowCasterResizing
      let nw = w, nh = hh, nx = x, ny = y
      if (h.includes('e')) { nw = Math.max(MIN_PX, w + dx) }
      if (h.includes('w')) { nw = Math.max(MIN_PX, w - dx); nx = x + w - nw }
      if (h.includes('s')) { nh = Math.max(MIN_PX, hh + dy) }
      if (h.includes('n')) { nh = Math.max(MIN_PX, hh - dy); ny = y + hh - nh }
      onUpdateShadowCaster?.(shadowCasterResizing.casterId, {
        x: Math.round(nx),
        y: Math.round(ny),
        width: Math.round(nw),
        height: Math.round(nh),
      })
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

      // Snap the edge(s) being dragged to nearby zone edges
      const { xTargets, yTargets } = getSnapTargets(zones, resizing.zoneId, scalePxPerM)
      const lines: SnapLine[] = []
      if (h.includes('e')) { const s = snapEdge(x + w, xTargets); if (s !== null) { w = s - x; lines.push({ axis: 'x', value: s }) } }
      if (h.includes('w')) { const s = snapEdge(x, xTargets); if (s !== null) { w += x - s; x = s; lines.push({ axis: 'x', value: s }) } }
      if (h.includes('s')) { const s = snapEdge(y + hh, yTargets); if (s !== null) { hh = s - y; lines.push({ axis: 'y', value: s }) } }
      if (h.includes('n')) { const s = snapEdge(y, yTargets); if (s !== null) { hh += y - s; y = s; lines.push({ axis: 'y', value: s }) } }
      setSnapLines(lines)

      onUpdateZone(resizing.zoneId, { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(hh) })
    }
  }

  function handlePointerLeave() {
    setSvgPointer(null)
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (drawing) {
      if (activeZoneType === 'wall' || activeZoneType === 'fence') {
        const thickness = activeZoneType === 'fence' ? FENCE_THICKNESS_CM : WALL_THICKNESS_EXTERIOR_CM
        const wr = computeDirectedDrawRect(drawing, scalePxPerM, thickness)
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
      } else if (activeTool === 'shadow_caster') {
        const x = Math.round(Math.min(drawing.startX, drawing.currentX))
        const y = Math.round(Math.min(drawing.startY, drawing.currentY))
        const w = Math.round(Math.abs(drawing.currentX - drawing.startX))
        const h = Math.round(Math.abs(drawing.currentY - drawing.startY))
        if (w >= MIN_PX && h >= MIN_PX) {
          onAddShadowCaster?.(x, y, w, h)
        }
      } else {
        let x = Math.min(drawing.startX, drawing.currentX)
        let y = Math.min(drawing.startY, drawing.currentY)
        const w = Math.abs(drawing.currentX - drawing.startX)
        const h = Math.abs(drawing.currentY - drawing.startY)
        if (w >= MIN_ZONE_SIZE && h >= MIN_ZONE_SIZE) {
          // Snap to edges of existing zones, preserving drawn w/h
          const clampX = Math.max(0, Math.min(CANVAS_W - w, x))
          const clampY = Math.max(0, Math.min(CANVAS_H - h, y))
          const { xTargets, yTargets } = getSnapTargets(zones, '', scalePxPerM)
          const snapped = snapPosition(clampX, clampY, w, h, xTargets, yTargets)
          x = Math.max(0, Math.round(snapped.x))
          y = Math.max(0, Math.round(snapped.y))
          const expanded = expandIntoCornerCuts(x, y, w, h, '', zones)
          x = expanded.x; y = expanded.y
          onAddZone(
            x,
            y,
            Math.round(Math.min(expanded.w, CANVAS_W - x)),
            Math.round(Math.min(expanded.h, CANVAS_H - y)),
            activeZoneType,
          )
        }
      }
      setDrawing(null)
    }
    // Object placement — click on canvas with place_object tool
    if (isPlacingObject && !drawing && !wallElementDragging && !dragging && !resizing && mapId) {
      const pt = getSvgPoint(e)
      if (pt) {
        const p = objectPreset!
        createObject({
          name: p.label,
          map_id: mapId,
          map_x: Math.round(pt.x),
          map_y: Math.round(pt.y),
          object_type: p.object_type,
          shape: p.shape,
          category: p.category,
          material: p.material,
          color: p.color,
          ...(p.diameter_cm ? { diameter_cm: p.diameter_cm } : {}),
          ...(p.width_cm ? { width_cm: p.width_cm } : {}),
          ...(p.depth_cm ? { depth_cm: p.depth_cm } : {}),
          ...(p.preset ? { preset: p.preset } : {}),
        }).then(() => onObjectCreated()).catch(() => {})
      }
    }

    if (wallElementDragging) setWallElementDragging(null)
    if (objectDragging) setObjectDragging(null)
    if (shadowCasterDragging) setShadowCasterDragging(null)
    if (shadowCasterResizing) setShadowCasterResizing(null)
    if (dragging) {
      // On release, expand into adjacent corner cuts (once — avoids snap-extension cascade)
      const dz = zones.find((z) => z.id === dragging!.zoneId)
      if (dz) {
        const expanded = expandIntoCornerCuts(dz.x, dz.y, dz.width, dz.height, dz.id, zones)
        if (expanded.x !== dz.x || expanded.y !== dz.y || expanded.w !== dz.width || expanded.h !== dz.height) {
          onUpdateZone(dz.id, {
            x: Math.round(expanded.x), y: Math.round(expanded.y),
            width: Math.round(expanded.w), height: Math.round(expanded.h),
          })
        }
      }
      setDragging(null); setSnapLines([])
    }
    if (resizing) {
      const rz = zones.find((z) => z.id === resizing!.zoneId)
      if (rz) {
        const expanded = expandIntoCornerCuts(rz.x, rz.y, rz.width, rz.height, rz.id, zones)
        if (expanded.x !== rz.x || expanded.y !== rz.y || expanded.w !== rz.width || expanded.h !== rz.height) {
          onUpdateZone(rz.id, {
            x: Math.round(expanded.x), y: Math.round(expanded.y),
            width: Math.round(expanded.w), height: Math.round(expanded.h),
          })
        }
      }
      setResizing(null)
    }
  }

  // Standard draw preview (non-wall types)
  const drawRect = drawing && activeZoneType !== 'wall' && activeZoneType !== 'fence' ? {
    x: Math.max(0, Math.min(drawing.startX, drawing.currentX)),
    y: Math.max(0, Math.min(drawing.startY, drawing.currentY)),
    width: Math.min(Math.abs(drawing.currentX - drawing.startX), CANVAS_W),
    height: Math.min(Math.abs(drawing.currentY - drawing.startY), CANVAS_H),
  } : null

  // Wall/fence draw preview — direction-locked, auto-thickness
  const directedDrawRect = drawing && (activeZoneType === 'wall' || activeZoneType === 'fence')
    ? computeDirectedDrawRect(drawing, scalePxPerM, activeZoneType === 'fence' ? FENCE_THICKNESS_CM : WALL_THICKNESS_EXTERIOR_CM)
    : null

  return (
    <div className="flex-1 flex items-center justify-center bg-bg overflow-hidden p-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="max-w-full max-h-full border border-border rounded-lg bg-[#fef9ee]"
        style={{ aspectRatio: '1', touchAction: 'none', cursor: isPlacingWallElement || isPlacingObject || isPlacingShadowCaster ? 'crosshair' : 'default' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <EditorDefs />
        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#editor-grid)" />

        {/* Outer footprint silhouette */}
        {zones.length > 0 && (() => {
          const d = computeZoneUnion(zones)
          return d ? (
            <path
              d={d}
              fill="#f1f5f9"
              stroke="#94a3b8"
              strokeWidth={2}
              pointerEvents="none"
            />
          ) : null
        })()}

        {[...zones].sort((a, b) => (a.cornerCut ? 1 : 0) - (b.cornerCut ? 1 : 0)).map((zone) => (
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

        {/* Shadow casters */}
        {!previewMode && shadowCasters.map((sc) => {
          const isSelected = sc.id === selectedShadowCasterId
          const isRect = sc.type === 'rect'
          const scx = isRect ? sc.x + sc.width / 2 : sc.cx
          const scy = isRect ? sc.y + sc.height / 2 : sc.cy
          const sr = isRect ? 0 : sc.radius

          function handleScPointerDown(e: React.PointerEvent) {
            if (previewMode || activeTool !== 'select') return
            e.stopPropagation()
            const pt = getSvgPoint(e)
            if (!pt) return
            ;(e.target as Element).setPointerCapture(e.pointerId)
            onSelectShadowCaster?.(sc.id)
            onSelectZone(null)
            onSelectWallElement(null)
            onSelectObject(null)
            if (isRect) {
              setShadowCasterDragging({ casterId: sc.id, startSvgX: pt.x, startSvgY: pt.y, origX: sc.x, origY: sc.y })
            } else {
              setShadowCasterDragging({ casterId: sc.id, startSvgX: pt.x, startSvgY: pt.y, origX: sc.cx, origY: sc.cy })
            }
          }

          return (
            <g key={sc.id}>
              {isRect ? (
                <rect
                  x={sc.x} y={sc.y}
                  width={sc.width} height={sc.height}
                  fill="rgba(100, 100, 100, 0.15)"
                  stroke={isSelected ? '#2544a0' : 'rgba(100, 100, 100, 0.5)'}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeDasharray="6 3"
                  style={{ cursor: !previewMode && activeTool === 'select' ? 'move' : 'default' }}
                  onPointerDown={handleScPointerDown}
                />
              ) : (
                <>
                  <circle
                    cx={sc.cx} cy={sc.cy} r={sc.radius}
                    fill="rgba(100, 160, 100, 0.18)"
                    stroke={isSelected ? '#2544a0' : 'rgba(100, 160, 100, 0.5)'}
                    strokeWidth={isSelected ? 2 : 1.5}
                    strokeDasharray="4 3"
                    style={{ cursor: !previewMode && activeTool === 'select' ? 'move' : 'default' }}
                    onPointerDown={handleScPointerDown}
                  />
                  {/* Trunk dot */}
                  <circle cx={sc.cx} cy={sc.cy} r={3} fill="rgba(100,130,80,0.6)" style={{ pointerEvents: 'none' }} />
                </>
              )}
              {isSelected && isRect && (
                <EditorResizeOverlay
                  zone={{ id: sc.id, type: 'fence', shape: 'rect', x: sc.x, y: sc.y, width: sc.width, height: sc.height, label: sc.label || '' }}
                  onHandlePointerDown={(e, handle) => {
                    e.stopPropagation()
                    const pt = getSvgPoint(e)
                    if (!pt) return
                    ;(e.target as Element).setPointerCapture?.(e.pointerId)
                    setShadowCasterResizing({ casterId: sc.id, handle, startSvgX: pt.x, startSvgY: pt.y, origX: sc.x, origY: sc.y, origW: sc.width, origH: sc.height })
                  }}
                />
              )}
              {sc.label ? (
                <text
                  x={scx}
                  y={isRect ? sc.y - 4 : sc.cy - sr - 6}
                  textAnchor="middle"
                  fill="rgba(100,100,100,0.8)"
                  fontSize="8"
                  style={{ pointerEvents: 'none' }}
                >
                  {sc.label}
                </text>
              ) : null}
            </g>
          )
        })}

        {/* Placed objects */}
        {objects.filter(o => o.category !== 'container').map((obj) => {
          const ox = obj.map_x ?? 0
          const oy = obj.map_y ?? 0
          const color = obj.color || '#888888'
          const dim = obj.shape === 'circle'
            ? ((obj.diameter_cm || 30) * scalePxPerM) / 100
            : ((obj.width_cm || 60) * scalePxPerM) / 100
          const dim2 = obj.shape === 'rectangle'
            ? ((obj.depth_cm || 40) * scalePxPerM) / 100
            : dim
          const isSelected = selectedObjectId === obj.id
          return (
            <g key={`obj-${obj.id}`} style={{ cursor: activeTool === 'select' && !previewMode ? 'grab' : 'default' }}
              onPointerDown={(e) => {
                if (activeTool !== 'select' || previewMode) return
                e.stopPropagation()
                onSelectObject(obj.id)
                onSelectZone(null)
                const pt = getSvgPoint(e)
                if (!pt) return
                ;(e.target as Element).setPointerCapture(e.pointerId)
                setObjectDragging({ objectId: obj.id, startSvgX: pt.x, startSvgY: pt.y, origX: ox, origY: oy })
              }}
            >
              {obj.shape === 'circle' ? (
                <circle cx={ox} cy={oy} r={dim / 2} fill={color + '55'} stroke={isSelected ? '#2544a0' : color}
                  strokeWidth={isSelected ? 2 : 1} strokeDasharray={isSelected ? '6 3' : undefined} />
              ) : (
                <rect x={ox - dim / 2} y={oy - dim2 / 2} width={dim} height={dim2} rx={3}
                  fill={color + '55'} stroke={isSelected ? '#2544a0' : color}
                  strokeWidth={isSelected ? 2 : 1} strokeDasharray={isSelected ? '6 3' : undefined} />
              )}
            </g>
          )
        })}

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
                stroke="#2544a0" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} pointerEvents="none" />
            : <line key={i} x1={0} y1={line.value} x2={CANVAS_W} y2={line.value}
                stroke="#2544a0" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} pointerEvents="none" />
        )}

        {/* Draw preview (regular zones) */}
        {drawRect && drawRect.width > 2 && drawRect.height > 2 && (
          <rect
            x={drawRect.x} y={drawRect.y}
            width={drawRect.width} height={drawRect.height}
            fill="rgba(37,68,160,0.15)" stroke="#2544a0"
            strokeWidth={1.5} strokeDasharray="6 3" pointerEvents="none"
          />
        )}

        {/* Draw preview (wall/fence — direction-locked solid bar) */}
        {directedDrawRect && Math.max(directedDrawRect.width, directedDrawRect.height) > 4 && (
          <rect
            x={directedDrawRect.x} y={directedDrawRect.y}
            width={directedDrawRect.width} height={directedDrawRect.height}
            fill={activeZoneType === 'fence' ? FENCE_COLOR_WOOD : WALL_COLOR} opacity={0.55}
            stroke="#2544a0" strokeWidth={1} strokeDasharray="4 2"
            pointerEvents="none"
          />
        )}

      </svg>
    </div>
  )
}
