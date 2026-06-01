import type { EditorTool } from '../../hooks/useEditorState'
import { useT } from '../../context/LanguageContext'

interface Props {
  activeTool: EditorTool
  selectedZoneId: string | null
  selectedWallElementId: string | null
  selectedShadowCasterId: string | null
  selectedObjectId: number | null
  onSetTool: (tool: EditorTool) => void
  onDelete: () => void
  /** Render as a floating rounded dock (mobile) instead of a full-width top bar. */
  floating?: boolean
}

export default function EditorToolbar({
  activeTool,
  selectedZoneId,
  selectedWallElementId,
  selectedShadowCasterId,
  selectedObjectId,
  onSetTool,
  onDelete,
  floating = false,
}: Props) {
  const t = useT()
  const hasSelection = !!(selectedZoneId || selectedWallElementId || selectedShadowCasterId || selectedObjectId !== null)

  return (
    <div className={
      floating
        ? 'flex items-center gap-2 px-3 py-2 bg-surface/90 backdrop-blur-md rounded-2xl border border-border shadow-lg'
        : 'flex items-center gap-2 px-3 py-2 bg-surface/95 backdrop-blur-md border-b border-border overflow-x-auto'
    }>
      {/* Tool buttons */}
      <button
        onClick={() => onSetTool('select')}
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
          activeTool === 'select' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
        }`}
        title={t.editor.toolbar.select}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        </svg>
      </button>
      <button
        onClick={() => onSetTool('draw')}
        data-tour-id="tool-draw"
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
          activeTool === 'draw' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
        }`}
        title={t.editor.toolbar.draw}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      </button>
      <button
        onClick={() => onSetTool('shadow_caster')}
        data-tour-id="tool-shadow-caster"
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
          activeTool === 'shadow_caster' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
        }`}
        title="Schaduw object"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="10" width="12" height="10" rx="1" />
          <polygon points="14,10 22,16 22,20 14,20" opacity="0.35" />
        </svg>
      </button>

      {/* Delete button */}
      {hasSelection && (
        <>
          <div className="w-px h-6 bg-border shrink-0" />
          <button
            onClick={onDelete}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-overdue/10 text-overdue border border-overdue/20"
            title={t.editor.toolbar.delete}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
