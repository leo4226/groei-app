import { useRef, useState } from 'react'

interface Props {
  title: string
  defaultBottom?: boolean   // true = start anchored bottom-centre, false = top-left
  children: React.ReactNode
  onDelete?: () => void
  deleteLabel?: string
}

interface PanelPos {
  x: number
  y: number
}

export default function DraggablePanel({ title, defaultBottom = true, children, onDelete, deleteLabel = 'Delete' }: Props) {
  const [pos, setPos] = useState<PanelPos | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{
    startMouseX: number
    startMouseY: number
    startPanelX: number
    startPanelY: number
  } | null>(null)

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    const panel = panelRef.current
    if (!panel) return
    const parentRect = panel.offsetParent?.getBoundingClientRect()
    if (!parentRect) return
    const panelRect = panel.getBoundingClientRect()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragState.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPanelX: panelRect.left - parentRect.left,
      startPanelY: panelRect.top - parentRect.top,
    }
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startMouseX
    const dy = e.clientY - dragState.current.startMouseY
    setPos({
      x: dragState.current.startPanelX + dx,
      y: dragState.current.startPanelY + dy,
    })
  }

  function handleDragEnd() {
    dragState.current = null
  }

  const positionStyle: React.CSSProperties = pos
    ? { position: 'absolute', left: pos.x, top: pos.y, bottom: 'auto', transform: 'none' }
    : defaultBottom
    ? { position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)' }
    : { position: 'absolute', top: '1rem', left: '1rem' }

  return (
    <div
      ref={panelRef}
      className="w-76 bg-surface border border-border rounded-xl shadow-lg z-10 select-none"
      style={{ ...positionStyle, width: '19rem' }}
    >
      {/* Drag handle header */}
      <div
        className="flex items-center justify-between px-3 pt-3 pb-2 cursor-grab active:cursor-grabbing"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="flex items-center gap-1.5">
          {/* Drag grip dots */}
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="text-text-muted/40 shrink-0">
            <circle cx="2" cy="2"  r="1.2" fill="currentColor"/>
            <circle cx="8" cy="2"  r="1.2" fill="currentColor"/>
            <circle cx="2" cy="7"  r="1.2" fill="currentColor"/>
            <circle cx="8" cy="7"  r="1.2" fill="currentColor"/>
            <circle cx="2" cy="12" r="1.2" fill="currentColor"/>
            <circle cx="8" cy="12" r="1.2" fill="currentColor"/>
          </svg>
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{title}</span>
        </div>
        {onDelete && (
          <button
            onPointerDown={(e) => e.stopPropagation()}   // don't start drag on delete click
            onClick={onDelete}
            className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
          >
            {deleteLabel}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-3 pb-3">
        {children}
      </div>
    </div>
  )
}
