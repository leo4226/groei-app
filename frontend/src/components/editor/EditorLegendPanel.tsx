import type { ZoneStyleType, MapType } from '../../types'
import type { EditorTool } from '../../hooks/useEditorState'
import { ZONE_STYLES, GARDEN_ZONE_TYPES, HOUSE_ZONE_TYPES } from './EditorDefs'
import { ZONE_NL, KAART_TYPE_NL, TOOLBAR_NL } from '../../utils/editorStrings.nl'

interface Props {
  activeZoneType: ZoneStyleType
  activeTool: EditorTool
  mapType: MapType
  onSetZoneType: (type: ZoneStyleType) => void
  onSetTool: (tool: EditorTool) => void
  onSetMapType: (type: MapType) => void
}

export default function EditorLegendPanel({
  activeZoneType,
  activeTool,
  mapType,
  onSetZoneType,
  onSetTool,
  onSetMapType,
}: Props) {
  const zoneTypes = mapType === 'house' ? HOUSE_ZONE_TYPES : GARDEN_ZONE_TYPES

  return (
    <div className="p-3 border-b border-border flex flex-col gap-3">

      {/* ── Modus ── */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Modus
        </p>
        <div className="flex gap-1">
          <button
            onClick={() => onSetMapType('garden')}
            className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
              mapType === 'garden'
                ? 'bg-primary text-white'
                : 'bg-bg text-text-muted border border-border hover:bg-bg/80'
            }`}
          >
            {KAART_TYPE_NL.tuin}
          </button>
          <button
            onClick={() => onSetMapType('house')}
            className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
              mapType === 'house'
                ? 'bg-primary text-white'
                : 'bg-bg text-text-muted border border-border hover:bg-bg/80'
            }`}
          >
            {KAART_TYPE_NL.huis}
          </button>
        </div>
      </div>

      {/* ── Zones tekenen ── */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Zones tekenen
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

      {/* ── Plaatsen (house mode only) ── */}
      {mapType === 'house' && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Plaatsen
          </p>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onSetTool('place_door')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${
                activeTool === 'place_door' ? 'ring-2 ring-primary ring-offset-1' : ''
              }`}
              style={{ backgroundColor: '#2544a033', color: '#2544a0' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 4h3a2 2 0 0 1 2 2v14" />
                <path d="M2 20h3" />
                <path d="M13 20h9" />
                <path d="M10 12v.01" />
                <path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z" />
              </svg>
              {TOOLBAR_NL.deurPlaatsen}
            </button>
            <button
              onClick={() => onSetTool('place_window')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${
                activeTool === 'place_window' ? 'ring-2 ring-primary ring-offset-1' : ''
              }`}
              style={{ backgroundColor: '#24e34c33', color: '#24e34c' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="4" x2="12" y2="20" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
              {TOOLBAR_NL.raamPlaatsen}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
