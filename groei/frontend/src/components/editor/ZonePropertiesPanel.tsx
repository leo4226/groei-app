import type { EditorZone, ZoneStyleType } from '../../types'
import { ZONE_STYLES, ZONE_TYPE_ORDER } from './EditorDefs'

interface Props {
  zone: EditorZone
  scalePxPerM: number
  onUpdate: (updates: Partial<EditorZone>) => void
  onSetScale: (pxPerM: number) => void
  onDelete: () => void
}

export default function ZonePropertiesPanel({ zone, scalePxPerM, onUpdate, onSetScale, onDelete }: Props) {
  const realW = scalePxPerM > 0 ? (zone.width / scalePxPerM).toFixed(1) : null
  const realH = scalePxPerM > 0 ? (zone.height / scalePxPerM).toFixed(1) : null

  function handleRealWidthChange(val: string) {
    const m = parseFloat(val)
    if (m > 0) {
      const newScale = Math.round(zone.width / m)
      if (newScale > 0) onSetScale(newScale)
    }
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-72 bg-surface border border-border rounded-xl shadow-lg p-3 z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Zone</span>
        <button
          onClick={onDelete}
          className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
        >
          Delete
        </button>
      </div>

      {/* Label */}
      <div className="mb-2">
        <label className="text-xs text-text-muted block mb-1">Label</label>
        <input
          value={zone.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="e.g. Front deck..."
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

      {/* Dimensions */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-text-muted block mb-1">
            {realW ? `Width (${realW}m)` : 'Real width (m)'}
          </label>
          <input
            type="number"
            min="0.1"
            step="0.1"
            placeholder={realW ?? 'e.g. 3.0'}
            defaultValue={realW ?? ''}
            key={zone.id}
            onBlur={(e) => handleRealWidthChange(e.target.value)}
            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
          />
        </div>
        {realH && (
          <div className="flex-1">
            <label className="text-xs text-text-muted block mb-1">Height ({realH}m)</label>
            <div className="border border-border rounded-lg px-2.5 py-1.5 text-sm text-text-muted bg-bg/50">
              {realH}m
            </div>
          </div>
        )}
      </div>

      {scalePxPerM > 0 && (
        <p className="text-[10px] text-text-muted mt-2 text-center">
          Scale: {scalePxPerM} px/m · {zone.width}×{zone.height} px
        </p>
      )}
    </div>
  )
}
