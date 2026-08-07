import { useRef, useState } from 'react'
import type { ZoneStyleType, MapUnderlay } from '../../types'
import type { EditorTool, ObjectPreset } from '../../hooks/useEditorState'
import { HARDSCAPE_PRESETS } from '../../hooks/useEditorState'
import { ZONE_STYLES, GARDEN_ZONE_TYPES, HOUSE_ZONE_TYPES } from './EditorDefs'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'

interface Props {
  activeZoneType: ZoneStyleType
  activeTool: EditorTool
  mapType: string
  objectPreset: ObjectPreset | null
  shadowCasterPreset: 'building' | 'tree'
  onSetZoneType: (type: ZoneStyleType) => void
  onSetTool: (tool: EditorTool) => void
  onSetMapType: (type: string) => void
  onSetObjectPreset: (preset: ObjectPreset | null) => void
  onSetShadowCasterPreset: (preset: 'building' | 'tree') => void
  shadowMode: boolean
  onSetShadowMode: (on: boolean) => void
  canFenceGarden: boolean
  onFenceGarden: () => void
  // Trace-over background (#647)
  underlay: MapUnderlay | null
  scalePxPerM: number
  underlayBusy?: boolean
  onAddUnderlayFile: (file: File) => void
  onUpdateUnderlay: (updates: Partial<MapUnderlay>) => void
  onRemoveUnderlay: () => void
  onCalibrateWidthM: (metres: number) => void
  /** Drives the warning on the map-type switch — flipping the type swaps the
   *  whole zone vocabulary under whatever is already drawn. */
  zoneCount: number
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
  shadowMode,
  onSetShadowMode,
  shadowCasterPreset,
  onSetShadowCasterPreset,
  canFenceGarden,
  onFenceGarden,
  underlay,
  scalePxPerM,
  underlayBusy = false,
  onAddUnderlayFile,
  onUpdateUnderlay,
  onRemoveUnderlay,
  onCalibrateWidthM,
  zoneCount,
}: Props) {
  const t = useT()
  const zoneTypes = mapType === 'indoor' ? HOUSE_ZONE_TYPES : GARDEN_ZONE_TYPES
  const [open, setOpen] = useState<Record<string, boolean>>({ zones: true, objects: false, shadows: false, place: false, background: false, mode: false })
  const fileInputRef = useRef<HTMLInputElement>(null)

  function toggle(key: string) { setOpen(o => ({ ...o, [key]: !o[key] })) }

  return (
    <div className="p-3 border-b border-border flex flex-col gap-3">

      {/* ── Zones tekenen ── */}
      <div>
        <SectionHeader label={t.editor.drawZones} open={open.zones} onToggle={() => toggle('zones')} />
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
                      {(type === 'structure' && mapType === 'outdoor'
                        ? t.editor.zones['structureGarden']
                        : t.editor.zones[type])?.description ?? ''}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Achtergrond (trace-over background image, #647) ── */}
      <div>
        <SectionHeader label={t.editor.background.title} open={open.background} onToggle={() => toggle('background')} />
        {open.background && (
          <div className="mt-2 flex flex-col gap-2">
            {!underlay ? (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={underlayBusy}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg bg-bg hover:bg-primary/10 border border-border text-xs font-semibold text-text disabled:opacity-50"
                >
                  <Glyph name="camera" size={15} className="text-text-muted shrink-0" />
                  {underlayBusy ? t.editor.background.uploading : t.editor.background.add}
                </button>
                <p className="text-[10px] text-text-muted leading-snug">{t.editor.background.hint}</p>
              </>
            ) : (
              <>
                <label className="text-[10px] text-text-muted uppercase tracking-wide">{t.editor.background.opacity}</label>
                <input
                  type="range" min={10} max={100} value={Math.round(underlay.opacity * 100)}
                  onChange={(e) => onUpdateUnderlay({ opacity: Number(e.target.value) / 100 })}
                  className="w-full"
                />
                <button
                  onClick={() => onUpdateUnderlay({ locked: !underlay.locked })}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs font-medium ${
                    underlay.locked ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  <Glyph name={underlay.locked ? 'lock' : 'unlock'} size={14} className="shrink-0" />
                  {underlay.locked ? t.editor.background.locked : t.editor.background.unlocked}
                </button>
                <label className="text-[10px] text-text-muted uppercase tracking-wide mt-1">{t.editor.background.widthM}</label>
                <input
                  type="number" min="0.5" step="0.5"
                  defaultValue={(underlay.width / scalePxPerM).toFixed(1)}
                  key={`${underlay.width}-${scalePxPerM}`}
                  onChange={(e) => { const m = parseFloat(e.target.value); if (m > 0) onCalibrateWidthM(m) }}
                  className="w-full border border-border rounded-lg px-2 py-1 text-xs bg-bg text-text"
                />
                <p className="text-[10px] text-text-muted leading-snug">{t.editor.background.calibrateHint}</p>
                <button
                  onClick={onRemoveUnderlay}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border text-xs font-medium text-overdue hover:bg-overdue/10"
                >
                  <Glyph name="trash" size={14} className="shrink-0" />
                  {t.editor.background.remove}
                </button>
              </>
            )}
            <input
              ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAddUnderlayFile(f) }}
            />
          </div>
        )}
      </div>

      {/* ── Omhein de tuin automatisch (outdoor only) ── */}
      {mapType === 'outdoor' && (
        <div className="p-3 border-b border-border">
          <button
            onClick={onFenceGarden}
            disabled={!canFenceGarden}
            className="flex items-center gap-2 px-2 py-2 w-full rounded-lg text-left transition-colors bg-bg hover:bg-primary/10 border border-border disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Glyph name="brick" size={16} className="shrink-0 text-text-muted" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text leading-tight">{t.editor.fenceGarden}</div>
              <div className="text-[10px] text-text-muted leading-tight mt-0.5">
                {canFenceGarden ? t.editor.fenceGardenDesc : t.editor.fenceGardenBlocked}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ── Objecten plaatsen (outdoor mode only) ── */}
      {mapType === 'outdoor' && (
        <div>
          <SectionHeader label={t.editor.legendObjects} open={open.objects} onToggle={() => toggle('objects')} />
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
                        {p.category === 'container' ? t.editor.legendLabels.container : p.category === 'hardscape' ? t.editor.legendLabels.hardscape : t.editor.legendLabels.utility}
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
          <button
            onClick={() => { onSetShadowMode(!shadowMode); toggle('shadows') }}
            className={`flex items-center justify-between w-full text-left py-0.5 rounded transition-colors ${
              shadowMode ? 'text-amber-400' : ''
            }`}
          >
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              shadowMode ? 'text-amber-400' : 'text-text-muted'
            }`}>
              {t.editor.legendShadows}
            </span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform text-text-muted ${open.shadows ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          {open.shadows && (
            <div className="mt-2 space-y-1">
              {/* Building shadow caster */}
              <button
                onClick={() => { onSetShadowCasterPreset('building'); onSetTool('shadow_caster') }}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors w-full ${
                  activeTool === 'shadow_caster' && shadowCasterPreset === 'building'
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-bg'
                }`}
              >
                <span className="w-3 h-3 rounded-sm shrink-0 mt-0.5" style={{ backgroundColor: '#6b7280' }} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text leading-tight">
                    {t.editor.shadowCasterBuilding}
                  </div>
                  <div className="text-[10px] text-text-muted leading-tight mt-0.5">
                    {t.editor.shadowCasterBuildingDesc}
                  </div>
                </div>
              </button>

              {/* Tree / Plant shadow caster */}
              <button
                onClick={() => { onSetShadowCasterPreset('tree'); onSetTool('shadow_caster') }}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors w-full ${
                  activeTool === 'shadow_caster' && shadowCasterPreset === 'tree'
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-bg'
                }`}
              >
                <span className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: '#4ade80' }} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text leading-tight">
                    {t.editor.shadowCasterTree}
                  </div>
                  <div className="text-[10px] text-text-muted leading-tight mt-0.5">
                    {t.editor.shadowCasterTreeDesc}
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
                data-tour-id="tool-place-door"
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
                data-tour-id="tool-place-window"
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

      {/* ── Kaarttype ──
          Last, and collapsed. This used to be the first thing in the panel,
          above everything else: the most consequential and least-often-needed
          control in the drawer, in its most prominent position. Flipping it
          swaps the entire zone vocabulary, walls and sun handling under
          whatever is already drawn, so on a map with content it asks first. */}
      <div>
        <SectionHeader label={t.editor.mode} open={open.mode} onToggle={() => toggle('mode')} />
        {open.mode && (
          <div className="mt-2">
            <div className="flex gap-1">
              {(['outdoor', 'indoor'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    if (type === mapType) return
                    if (zoneCount > 0 && !window.confirm(t.editor.mapType.switchWarning(zoneCount))) return
                    onSetMapType(type)
                  }}
                  className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
                    mapType === type
                      ? 'bg-primary text-white'
                      : 'bg-bg text-text-muted border border-border hover:bg-bg/80'
                  }`}
                >
                  {type === 'outdoor' ? t.editor.mapType.garden : t.editor.mapType.house}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-text-muted">
              {t.editor.mapType.hint}
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
