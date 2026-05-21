import { useState } from 'react'
import type { ZoneStyleType } from '../../types'
import type { EditorTool, ObjectPreset } from '../../hooks/useEditorState'
import { HARDSCAPE_PRESETS } from '../../hooks/useEditorState'
import { ZONE_STYLES, GARDEN_ZONE_TYPES, HOUSE_ZONE_TYPES } from './EditorDefs'
import { useT } from '../../context/LanguageContext'

interface Props {
  activeZoneType: ZoneStyleType
  activeTool: EditorTool
  mapType: string
  objectPreset: ObjectPreset | null
  onSetZoneType: (type: ZoneStyleType) => void
  onSetTool: (tool: EditorTool) => void
  onSetMapType: (type: string) => void
  onSetObjectPreset: (preset: ObjectPreset | null) => void
}

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full text-left py-0.5"
    >
      <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
        {label}
      </span>
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={`transition-transform text-text-muted ${open ? 'rotate-90' : ''}`}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  )
}

export default function EditorLegendPanel({
  activeZoneType,
  activeTool,
  mapType,
  objectPreset,
  onSetZoneType,
  onSetTool,
  onSetMapType,
  onSetObjectPreset,
}: Props) {
  const t = useT()
  const zoneTypes = mapType === 'indoor' ? HOUSE_ZONE_TYPES : GARDEN_ZONE_TYPES
  const [open, setOpen] = useState<Record<string, boolean>>({ zones: true, objects: false, shadows: false, place: false })

  function toggle(key: string) { setOpen(o => ({ ...o, [key]: !o[key] })) }

  return (
    <div className="p-3 border-b border-border flex flex-col gap-3">

      {/* ── Modus (always open) ── */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Modus
        </p>
        <div className="flex gap-1">
          <button
            onClick={() => onSetMapType('outdoor')}
            className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
              mapType === 'outdoor'
                ? 'bg-primary text-white'
                : 'bg-bg text-text-muted border border-border hover:bg-bg/80'
            }`}
          >
            {t.editor.mapType.garden}
          </button>
          <button
            onClick={() => onSetMapType('indoor')}
            className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
              mapType === 'indoor'
                ? 'bg-primary text-white'
                : 'bg-bg text-text-muted border border-border hover:bg-bg/80'
            }`}
          >
            {t.editor.mapType.house}
          </button>
        </div>
      </div>

      {/* ── Zones tekenen ── */}
      <div>
        <SectionHeader label="Zones tekenen" open={open.zones} onToggle={() => toggle('zones')} />
        {open.zones && (
          <div className="flex flex-col gap-1 mt-2">
            {zoneTypes.map((type) => {
              const style = ZONE_STYLES[type]
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
                      {t.editor.zones[type]?.name ?? type}
                    </div>
                    <div className="text-[10px] text-text-muted leading-tight mt-0.5">
                      {t.editor.zones[type]?.description ?? ''}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Objecten plaatsen (outdoor mode only) ── */}
      {mapType === 'outdoor' && (
        <div>
          <SectionHeader label="Objecten" open={open.objects} onToggle={() => toggle('objects')} />
          {open.objects && (
            <div className="flex flex-col gap-1 mt-2">
              {HARDSCAPE_PRESETS.map((p) => {
                const isActive = objectPreset?.label === p.label && activeTool === 'place_object'
                return (
                  <button
                    key={p.label}
                    onClick={() => onSetObjectPreset(isActive ? null : p)}
                    className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-primary/10 ring-1 ring-primary/30'
                        : 'hover:bg-bg'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-sm shrink-0 mt-0.5"
                      style={{ backgroundColor: p.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-text leading-tight">
                        {p.label}
                      </div>
                      <div className="text-[10px] text-text-muted leading-tight mt-0.5">
                        {p.category === 'container' ? 'Pot / Bak' : p.category === 'hardscape' ? 'Tuinobject' : 'Nutsvoorziening'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Shadows (outdoor mode only) ── */}
      {mapType === 'outdoor' && (
        <div>
          <SectionHeader label={t.editor.legendShadows} open={open.shadows} onToggle={() => toggle('shadows')} />
          {open.shadows && (
            <div className="mt-2">
              <button
                onClick={() => onSetTool('shadow_caster')}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors w-full ${
                  activeTool === 'shadow_caster'
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-bg'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-sm shrink-0 mt-0.5"
                  style={{ backgroundColor: '#6b7280' }}
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text leading-tight">
                    {t.editor.shadowObject}
                  </div>
                  <div className="text-[10px] text-text-muted leading-tight mt-0.5">
                    Plaats een gebouw of boom die schaduw werpt
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Plaatsen (indoor mode only) ── */}
      {mapType === 'indoor' && (
        <div>
          <SectionHeader label={t.editor.legendPlace} open={open.place} onToggle={() => toggle('place')} />
          {open.place && (
            <div className="flex flex-col gap-1 mt-2">
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
                {t.editor.toolbar.placeDoor}
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
                {t.editor.toolbar.placeWindow}
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
