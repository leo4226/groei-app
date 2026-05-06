import type { EditorZone, ZoneStyleType, CornerPosition } from '../../types'
import { ZONE_STYLES, ZONE_TYPE_ORDER } from './EditorDefs'
import { EIGENSCHAPPEN_NL } from '../../utils/editorStrings.nl'

interface Props {
  zone: EditorZone
  scalePxPerM: number
  onUpdate: (updates: Partial<EditorZone>) => void
  onSetScale: (pxPerM: number) => void
  onDelete: () => void
}

export default function ZonePropertiesPanel({ zone, scalePxPerM, onUpdate, onSetScale, onDelete }: Props) {
  const lenM   = scalePxPerM > 0 ? (zone.width  / scalePxPerM).toFixed(1) : null
  const breedM = scalePxPerM > 0 ? (zone.height / scalePxPerM).toFixed(1) : null
  const isRoom = zone.type === 'room'

  function handleLengteChange(val: string) {
    const m = parseFloat(val)
    if (m > 0 && scalePxPerM > 0)
      onUpdate({ width: Math.max(10, Math.round(m * scalePxPerM)) })
  }

  function handleBreedteChange(val: string) {
    const m = parseFloat(val)
    if (m > 0 && scalePxPerM > 0)
      onUpdate({ height: Math.max(10, Math.round(m * scalePxPerM)) })
  }

  function handleHoogteChange(val: string) {
    const m = parseFloat(val)
    onUpdate({ roomHeightM: !isNaN(m) && m > 0 ? m : undefined })
  }

  function handleCalibrateScale(val: string) {
    const m = parseFloat(val)
    if (m > 0) {
      const newScale = Math.round(zone.width / m)
      if (newScale > 0) onSetScale(newScale)
    }
  }

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          {EIGENSCHAPPEN_NL.zone}
        </p>
        <button
          onClick={onDelete}
          className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
        >
          {EIGENSCHAPPEN_NL.verwijderen}
        </button>
      </div>
      {/* Label */}
      <div className="mb-2">
        <label className="text-xs text-text-muted block mb-1">{EIGENSCHAPPEN_NL.label}</label>
        <input
          value={zone.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="bijv. Woonkamer..."
          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
        />
      </div>

      {/* Type */}
      <div className="mb-2">
        <label className="text-xs text-text-muted block mb-1">Type</label>
        <select
          value={zone.type}
          onChange={(e) => onUpdate({ type: e.target.value as ZoneStyleType })}
          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
        >
          {ZONE_TYPE_ORDER.map((t) => (
            <option key={t} value={t}>{ZONE_STYLES[t].label}</option>
          ))}
        </select>
      </div>

      {/* Wall thickness toggle for rooms */}
      {isRoom && (
        <div className="mb-2">
          <label className="text-xs text-text-muted block mb-1">Muurtype</label>
          <div className="flex gap-1">
            <button
              onClick={() => onUpdate({ wallThickness: 'exterior' })}
              className={`flex-1 text-xs py-1.5 rounded-lg border ${
                (zone.wallThickness ?? 'exterior') === 'exterior'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-bg text-text-muted border-border'
              }`}
            >
              Buitenmuur
            </button>
            <button
              onClick={() => onUpdate({ wallThickness: 'interior' })}
              className={`flex-1 text-xs py-1.5 rounded-lg border ${
                zone.wallThickness === 'interior'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-bg text-text-muted border-border'
              }`}
            >
              Binnenmuur
            </button>
          </div>
        </div>
      )}

      {/* Lengte × Breedte — both editable */}
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <label className="text-xs text-text-muted block mb-1">
            Lengte{lenM ? ` (${lenM}m)` : ''}
          </label>
          <input
            type="number" min="0.1" step="0.1"
            placeholder={lenM ?? 'bijv. 4.5'}
            defaultValue={lenM ?? ''}
            key={`len-${zone.id}`}
            onBlur={(e) => handleLengteChange(e.target.value)}
            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-text-muted block mb-1">
            Breedte{breedM ? ` (${breedM}m)` : ''}
          </label>
          <input
            type="number" min="0.1" step="0.1"
            placeholder={breedM ?? 'bijv. 3.0'}
            defaultValue={breedM ?? ''}
            key={`breed-${zone.id}`}
            onBlur={(e) => handleBreedteChange(e.target.value)}
            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
          />
        </div>
      </div>

      {/* Hoogte — rooms only, informational */}
      {isRoom && (
        <div className="mb-2">
          <label className="text-xs text-text-muted block mb-1">
            Hoogte (m)
            <span className="ml-1 text-[10px] text-text-muted/60">info only</span>
          </label>
          <input
            type="number" min="1" max="6" step="0.05"
            placeholder="bijv. 2.60"
            defaultValue={zone.roomHeightM ?? ''}
            key={`hoogte-${zone.id}`}
            onBlur={(e) => handleHoogteChange(e.target.value)}
            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
          />
        </div>
      )}

      {/* Corner cut — rooms only */}
      {isRoom && (
        <details className="mb-2">
          <summary className="text-xs text-text-muted cursor-pointer select-none py-0.5">
            {zone.cornerCut
              ? `✂ Hoek afgesneden (${zone.cornerCut.corner.toUpperCase()})`
              : '✂ Hoek afsnijden…'}
          </summary>
          <div className="mt-2 space-y-2">
            {/* Corner picker */}
            <div>
              <label className="text-xs text-text-muted block mb-1">Welke hoek</label>
              <div className="grid grid-cols-2 gap-1">
                {(['tl','tr','bl','br'] as CornerPosition[]).map((c) => {
                  const labels: Record<CornerPosition, string> = {
                    tl: '↖ Links boven', tr: '↗ Rechts boven',
                    bl: '↙ Links onder', br: '↘ Rechts onder',
                  }
                  const active = zone.cornerCut?.corner === c
                  return (
                    <button
                      key={c}
                      onClick={() => onUpdate({
                        cornerCut: {
                          corner: c,
                          widthPx: zone.cornerCut?.widthPx ?? Math.round(zone.width * 0.3),
                          heightPx: zone.cornerCut?.heightPx ?? Math.round(zone.height * 0.3),
                        }
                      })}
                      className={`text-xs py-1.5 rounded-lg border ${
                        active
                          ? 'bg-primary text-white border-primary'
                          : 'bg-bg text-text-muted border-border'
                      }`}
                    >
                      {labels[c]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Cut dimensions (only when corner is chosen) */}
            {zone.cornerCut && scalePxPerM > 0 && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-text-muted block mb-1">
                    Breedte ({(zone.cornerCut.widthPx / scalePxPerM).toFixed(2)}m)
                  </label>
                  <input
                    type="number" min="0.1" step="0.1"
                    defaultValue={(zone.cornerCut.widthPx / scalePxPerM).toFixed(2)}
                    key={`cw-${zone.id}-${zone.cornerCut.corner}`}
                    onBlur={(e) => {
                      const m = parseFloat(e.target.value)
                      if (m > 0 && zone.cornerCut)
                        onUpdate({ cornerCut: { ...zone.cornerCut, widthPx: Math.round(m * scalePxPerM) } })
                    }}
                    className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-bg text-text"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text-muted block mb-1">
                    Diepte ({(zone.cornerCut.heightPx / scalePxPerM).toFixed(2)}m)
                  </label>
                  <input
                    type="number" min="0.1" step="0.1"
                    defaultValue={(zone.cornerCut.heightPx / scalePxPerM).toFixed(2)}
                    key={`ch-${zone.id}-${zone.cornerCut.corner}`}
                    onBlur={(e) => {
                      const m = parseFloat(e.target.value)
                      if (m > 0 && zone.cornerCut)
                        onUpdate({ cornerCut: { ...zone.cornerCut, heightPx: Math.round(m * scalePxPerM) } })
                    }}
                    className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-bg text-text"
                  />
                </div>
              </div>
            )}

            {/* Remove cut */}
            {zone.cornerCut && (
              <button
                onClick={() => onUpdate({ cornerCut: undefined })}
                className="w-full text-xs py-1 rounded-lg border border-overdue/20 bg-overdue/5 text-overdue"
              >
                Hoek herstellen
              </button>
            )}
          </div>
        </details>
      )}

      {/* Scale calibration — collapsed by default */}
      <details>
        <summary className="text-[10px] text-text-muted cursor-pointer select-none">
          Schaal kalibreren…
        </summary>
        <div className="mt-1.5">
          <label className="text-[10px] text-text-muted block mb-1">
            Stel schaal in via lengte van deze zone (m)
          </label>
          <input
            type="number" min="0.1" step="0.1"
            placeholder={lenM ?? ''}
            key={`scale-${zone.id}`}
            onBlur={(e) => handleCalibrateScale(e.target.value)}
            className="w-full border border-border rounded-lg px-2 py-1 text-xs bg-bg text-text"
          />
          <p className="text-[10px] text-text-muted mt-1">
            Schaal: {scalePxPerM} px/m · {zone.width}×{zone.height} px
          </p>
        </div>
      </details>
    </div>
  )
}
