import type { ZoneStyleType } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import { ZONE_STYLES, GARDEN_ZONE_TYPES, HOUSE_ZONE_TYPES } from './EditorDefs'
import { ZONE_NL, EDITOR_NL } from '../../utils/editorStrings.nl'

interface Props {
  activeZoneType: ZoneStyleType
  activeTool: EditorTool
  mapType: string
  onSetZoneType: (type: ZoneStyleType) => void
  onSetTool: (tool: EditorTool) => void
}

export default function EditorLegendPanel({
  activeZoneType,
  activeTool,
  mapType,
  onSetZoneType,
  onSetTool,
}: Props) {
  const zoneTypes = mapType === 'house' ? HOUSE_ZONE_TYPES : GARDEN_ZONE_TYPES

  return (
    <div className="p-3 border-b border-border">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
        {EDITOR_NL.legenda}
      </p>
      <div className="flex flex-col gap-1">
        {zoneTypes.map((type) => {
          const style = ZONE_STYLES[type]
          const nl = ZONE_NL[type]
          const isActive = activeZoneType === type && activeTool === 'draw'
          return (
            <button
              key={type}
              onClick={() => {
                onSetZoneType(type)
                onSetTool('draw')
              }}
              className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-primary/10 ring-1 ring-primary/30'
                  : 'hover:bg-bg'
              }`}
            >
              <span
                className="w-3 h-3 rounded-sm shrink-0 mt-0.5"
                style={{ backgroundColor: style.chipColor }}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-text leading-tight">
                  {nl.naam}
                </div>
                <div className="text-[10px] text-text-muted leading-tight mt-0.5">
                  {nl.beschrijving}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
