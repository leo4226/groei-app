import { useRef, useState, useCallback } from 'react'
import type { EditorZone, ZoneStyleType } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import { screenToSVG } from '../../utils/svgCoords'
import EditorDefs from './EditorDefs'
import EditorZoneShape from './EditorZoneShape'
import EditorResizeOverlay, { type ResizeHandle } from './EditorResizeOverlay'

const CANVAS_W = 680
const CANVAS_H = 680
const MIN_ZONE_SIZE = 20
const MIN_PX = 10

interface Props {
  zones: EditorZone[]
  selectedZoneId: string | null
  activeTool: EditorTool
  activeZoneType: ZoneStyleType
  scalePxPerM: number
  previewMode: boolean
  onAddZone: (x: number, y: number, w: number, h: number, type: ZoneStyleType) => void
  onUpdateZone: (id: string, updates: Partial<EditorZone>) => void
  onSelectZone: (id: string | null) => void
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

export default function EditorCanvas({
  zones, selectedZoneId, activeTool, activeZoneType, scalePxPerM, previewMode,
  onAddZone, onUpdateZone, onSelectZone,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drawing, setDrawing] = useState<DrawState | null>(null)
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [resizing, setResizing] = useState<ResizeState | null>(null)

  const getSvgPoint = useCallback((e: React.PointerEvent) => {
    if (!svgRef.current) return null
    return screenToSVG(svgRef.current, e.clientX, e.clientY)
  }, [])

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null

  function handlePointerDown(e: React.PointerEvent) {
    const pt = getSvgPoint(e)
    if (!pt) return
    if (activeTool === 'draw') {
      e.preventDefault()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      setDrawing({ startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y })
      onSelectZone(null)
    } else {
      onSelectZone(null)
    }
  }

  function handleZonePointerDown(e: React.PointerEvent, zoneId: string) {
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

    if (drawing) {
      setDrawing((d) => d ? { ...d, currentX: pt.x, currentY: pt.y } : null)
      return
    }

    if (dragging) {
      const dx = pt.x - dragging.startSvgX
      const dy = pt.y - dragging.startSvgY
      const zone = zones.find((z) => z.id === dragging.zoneId)
      if (zone) {
        const newX = Math.max(0, Math.min(CANVAS_W - zone.width, dragging.origX + dx))
        const newY = Math.max(0, Math.min(CANVAS_H - zone.height, dragging.origY + dy))
        onUpdateZone(dragging.zoneId, { x: Math.round(newX), y: Math.round(newY) })
      }
      return
    }

    if (resizing) {
      const dx = pt.x - resizing.startSvgX
      const dy = pt.y - resizing.startSvgY
      const h = resizing.handle
      let { origX: x, origY: y, origW: w, origH: hh } = resizing

      // Apply deltas per handle
      if (h.includes('e')) { w = Math.max(MIN_PX, w + dx) }
      if (h.includes('s')) { hh = Math.max(MIN_PX, hh + dy) }
      if (h.includes('w')) { const dw = Math.min(dx, w - MIN_PX); x += dw; w -= dw }
      if (h.includes('n')) { const dh = Math.min(dy, hh - MIN_PX); y += dh; hh -= dh }

      // Clamp to canvas
      x = Math.max(0, x); y = Math.max(0, y)
      w = Math.min(w, CANVAS_W - x); hh = Math.min(hh, CANVAS_H - y)

      onUpdateZone(resizing.zoneId, { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(hh) })
    }
  }

  function handlePointerUp() {
    if (drawing) {
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
      setDrawing(null)
    }
    if (dragging) setDragging(null)
    if (resizing) setResizing(null)
  }

  const drawRect = drawing ? {
    x: Math.max(0, Math.min(drawing.startX, drawing.currentX)),
    y: Math.max(0, Math.min(drawing.startY, drawing.currentY)),
    width: Math.min(Math.abs(drawing.currentX - drawing.startX), CANVAS_W),
    height: Math.min(Math.abs(drawing.currentY - drawing.startY), CANVAS_H),
  } : null

  // Scale bar — show once scale is set (default 46 is always set, so always show)
  const scaleBarM = 2
  const scaleBarPx = scaleBarM * scalePxPerM
  const barX = 16; const barY = CANVAS_H - 20

  return (
    <div className="flex-1 flex items-center justify-center bg-bg overflow-hidden p-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="max-w-full max-h-full border border-border rounded-lg bg-[#f5f3ee]"
        style={{ aspectRatio: '1', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <EditorDefs />
        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#editor-grid)" />

        {zones.map((zone) => (
          <EditorZoneShape
            key={zone.id}
            zone={zone}
            isSelected={!previewMode && zone.id === selectedZoneId}
            onPointerDown={handleZonePointerDown}
          />
        ))}

        {/* Resize overlay on selected zone */}
        {!previewMode && selectedZone && activeTool === 'select' && (
          <EditorResizeOverlay
            zone={selectedZone}
            onHandlePointerDown={handleResizeHandlePointerDown}
          />
        )}

        {/* Draw preview */}
        {drawRect && drawRect.width > 2 && drawRect.height > 2 && (
          <rect
            x={drawRect.x} y={drawRect.y}
            width={drawRect.width} height={drawRect.height}
            fill="rgba(74,144,217,0.15)" stroke="#4A90D9"
            strokeWidth={1.5} strokeDasharray="6 3" pointerEvents="none"
          />
        )}

        {/* Scale bar */}
        <g pointerEvents="none">
          <line x1={barX} y1={barY} x2={barX + scaleBarPx} y2={barY} stroke="rgba(100,90,70,0.7)" strokeWidth={1.5} />
          <line x1={barX} y1={barY - 4} x2={barX} y2={barY + 4} stroke="rgba(100,90,70,0.7)" strokeWidth={1.5} />
          <line x1={barX + scaleBarPx} y1={barY - 4} x2={barX + scaleBarPx} y2={barY + 4} stroke="rgba(100,90,70,0.7)" strokeWidth={1.5} />
          <text x={barX + scaleBarPx / 2} y={barY - 7} textAnchor="middle" fill="rgba(100,90,70,0.8)" fontSize={9}>{scaleBarM}m</text>
        </g>
      </svg>
    </div>
  )
}
