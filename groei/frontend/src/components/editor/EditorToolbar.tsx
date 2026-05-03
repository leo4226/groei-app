import type { ZoneStyleType, MapType } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import { ZONE_STYLES, GARDEN_ZONE_TYPES, HOUSE_ZONE_TYPES } from './EditorDefs'

interface Props {
  activeTool: EditorTool
  activeZoneType: ZoneStyleType
  selectedZoneId: string | null
  selectedWallElementId: string | null
  mapType: MapType
  onSetTool: (tool: EditorTool) => void
  onSetZoneType: (type: ZoneStyleType) => void
  onDelete: () => void
}

export default function EditorToolbar({
  activeTool,
  activeZoneType,
  selectedZoneId,
  selectedWallElementId,
  mapType,
  onSetTool,
  onSetZoneType,
  onDelete,
}: Props) {
  const zoneTypes = mapType === 'house' ? HOUSE_ZONE_TYPES : GARDEN_ZONE_TYPES
  const hasSelection = selectedZoneId || selectedWallElementId

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface/95 backdrop-blur-md border-b border-border overflow-x-auto">
      {/* Tool buttons */}
      <button
        onClick={() => onSetTool('select')}
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
          activeTool === 'select' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
        }`}
        title="Select"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        </svg>
      </button>
      <button
        onClick={() => onSetTool('draw')}
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
          activeTool === 'draw' ? 'bg-primary text-white' : 'bg-bg text-text-muted border border-border'
        }`}
        title="Draw"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      </button>

      <div className="w-px h-6 bg-border shrink-0" />

      {/* Zone type chips */}
      {zoneTypes.map((type) => {
        const style = ZONE_STYLES[type]
        return (
          <button
            key={type}
            onClick={() => {
              onSetZoneType(type)
              onSetTool('draw')
            }}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              activeZoneType === type && activeTool === 'draw'
                ? 'ring-2 ring-primary ring-offset-1'
                : ''
            }`}
            style={{
              backgroundColor: style.chipColor + '33',
              color: style.chipColor === '#E8E0D0' || style.chipColor === '#D4C9A8' || style.chipColor === '#bbbbbb'
                ? '#665' : style.chipColor,
            }}
          >
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: style.chipColor }}
            />
            {style.label}
          </button>
        )
      })}

      {/* Door/Window tools (house mode only) */}
      {mapType === 'house' && (
        <>
          <div className="w-px h-6 bg-border shrink-0" />
          <button
            onClick={() => onSetTool('place_door')}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              activeTool === 'place_door' ? 'ring-2 ring-primary ring-offset-1' : ''
            }`}
            style={{ backgroundColor: '#8B735533', color: '#8B7355' }}
            title="Place door on wall"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 4h3a2 2 0 0 1 2 2v14" />
              <path d="M2 20h3" />
              <path d="M13 20h9" />
              <path d="M10 12v.01" />
              <path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z" />
            </svg>
            Door
          </button>
          <button
            onClick={() => onSetTool('place_window')}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              activeTool === 'place_window' ? 'ring-2 ring-primary ring-offset-1' : ''
            }`}
            style={{ backgroundColor: '#5B9A6F33', color: '#5B9A6F' }}
            title="Place window on wall"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
            Window
          </button>
        </>
      )}

      {/* Delete button */}
      {hasSelection && (
        <>
          <div className="w-px h-6 bg-border shrink-0" />
          <button
            onClick={onDelete}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-overdue/10 text-overdue border border-overdue/20"
            title="Delete"
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
