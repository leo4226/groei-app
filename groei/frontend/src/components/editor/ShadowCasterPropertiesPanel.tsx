import type { ShadowCaster } from '../../types'
import {
  rectToDisplay,
  displayToRect,
  circleToDisplay,
  displayToCircle,
  opacityToPreset,
  PRESET_OPACITIES,
  type Kant,
  type GardenBounds,
  type DichtheidPreset,
} from '../../utils/shadowCasterConversions'

interface Props {
  caster: ShadowCaster
  scalePxPerM: number
  gardenBounds: GardenBounds
  onUpdate: (updates: Partial<ShadowCaster>) => void
  onDelete: () => void
}

const KANT_OPTIONS: { value: Kant; label: string }[] = [
  { value: 'links', label: 'Links' },
  { value: 'rechts', label: 'Rechts' },
  { value: 'boven', label: 'Boven' },
  { value: 'onder', label: 'Onder' },
]

const PRESET_LABELS: Record<DichtheidPreset, string> = {
  'lichte-boom': 'Lichte boom',
  'dichte-boom': 'Dichte boom',
  'gebouw': 'Gebouw / Muur',
}

function NumInput({
  value,
  onChange,
  opts = {},
}: {
  value: number
  onChange: (v: number) => void
  opts?: { min?: number; max?: number; step?: number }
}) {
  return (
    <input
      type="number"
      step={opts.step ?? 0.5}
      min={opts.min ?? 0}
      max={opts.max}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (!isNaN(v)) onChange(v)
      }}
      className="w-full border border-border rounded-lg px-2 py-1 text-xs bg-bg text-text"
    />
  )
}

export default function ShadowCasterPropertiesPanel({ caster, scalePxPerM, gardenBounds, onUpdate, onDelete }: Props) {
  const isRect = caster.type === 'rect'

  function handleTypeChange(type: 'rect' | 'circle') {
    if (type === caster.type) return
    if (type === 'circle' && caster.type === 'rect') {
      const cx = caster.x + caster.width / 2
      const cy = caster.y + caster.height / 2
      const radius = Math.max(10, Math.min(caster.width, caster.height) / 2)
      onUpdate({ type: 'circle', cx, cy, radius, x: undefined as never, y: undefined as never, width: undefined as never, height: undefined as never })
    } else if (type === 'rect' && caster.type === 'circle') {
      onUpdate({
        type: 'rect',
        x: Math.round(caster.cx - caster.radius),
        y: Math.round(caster.cy - caster.radius),
        width: caster.radius * 2,
        height: caster.radius * 2,
        cx: undefined as never,
        cy: undefined as never,
        radius: undefined as never,
      })
    }
  }

  const heightM = caster.heightCm / 100
  const activePreset = opacityToPreset(caster.opacity ?? 1)

  // ── Gebouw (rect) display values ──
  const rectDisplay = isRect
    ? rectToDisplay(caster as ShadowCaster & { type: 'rect' }, gardenBounds, scalePxPerM)
    : null

  function handleKantChange(kant: Kant) {
    if (!rectDisplay) return
    const px = displayToRect(kant, rectDisplay.afstandM, rectDisplay.dikteM, gardenBounds, scalePxPerM)
    onUpdate(px)
  }

  function handleAfstandChange(afstandM: number) {
    if (!rectDisplay) return
    const px = displayToRect(rectDisplay.kant, Math.max(0, afstandM), rectDisplay.dikteM, gardenBounds, scalePxPerM)
    onUpdate(px)
  }

  function handleDikteChange(dikteM: number) {
    if (!rectDisplay) return
    const px = displayToRect(rectDisplay.kant, rectDisplay.afstandM, Math.max(0.5, dikteM), gardenBounds, scalePxPerM)
    onUpdate(px)
  }

  // ── Boom (circle) display values ──
  const circleDisplay = !isRect
    ? circleToDisplay(caster as ShadowCaster & { type: 'circle' }, scalePxPerM)
    : null

  function handleCircleChange(field: 'xM' | 'yM' | 'straalM', v: number) {
    if (!circleDisplay) return
    const next = { ...circleDisplay, [field]: v }
    const px = displayToCircle(next.xM, next.yM, next.straalM, scalePxPerM)
    onUpdate(px)
  }

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Schaduw object
        </p>
        <button
          onClick={onDelete}
          className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
        >
          Verwijderen
        </button>
      </div>

      {/* Type toggle */}
      <div className="mb-3">
        <p className="text-xs text-text-muted block mb-1">Type</p>
        <div className="flex gap-1">
          <button
            onClick={() => handleTypeChange('rect')}
            className={`flex-1 text-xs py-1.5 rounded-lg border ${
              isRect ? 'bg-primary text-white border-primary' : 'bg-bg text-text-muted border-border'
            }`}
          >
            Gebouw
          </button>
          <button
            onClick={() => handleTypeChange('circle')}
            className={`flex-1 text-xs py-1.5 rounded-lg border ${
              !isRect ? 'bg-primary text-white border-primary' : 'bg-bg text-text-muted border-border'
            }`}
          >
            Boom
          </button>
        </div>
      </div>

      {/* Naam */}
      <label className="mb-3 block">
        <span className="text-xs text-text-muted block mb-1">Naam</span>
        <input
          value={caster.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={isRect ? "bijv. Buurman's huis" : 'bijv. Eik, Spar...'}
          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
        />
      </label>

      {/* Position — Gebouw */}
      {isRect && rectDisplay && (
        <div className="mb-3">
          <p className="text-xs text-text-muted block mb-1">Positie</p>
          <label className="mb-1.5 block">
            <span className="text-[10px] text-text-muted block">Kant</span>
            <select
              value={rectDisplay.kant}
              onChange={(e) => handleKantChange(e.target.value as Kant)}
              className="w-full border border-border rounded-lg px-2 py-1 text-xs bg-bg text-text"
            >
              {KANT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[10px] text-text-muted block">Afstand van tuin (m)</span>
              <NumInput value={Math.round(rectDisplay.afstandM * 10) / 10} onChange={handleAfstandChange} opts={{ min: 0, step: 0.5 }} />
            </label>
            <label className="block">
              <span className="text-[10px] text-text-muted block">Dikte (m)</span>
              <NumInput value={Math.round(rectDisplay.dikteM * 10) / 10} onChange={handleDikteChange} opts={{ min: 0.5, step: 0.5 }} />
            </label>
          </div>
        </div>
      )}

      {/* Position — Boom */}
      {!isRect && circleDisplay && (
        <div className="mb-3">
          <p className="text-xs text-text-muted block mb-1">Positie &amp; grootte</p>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[10px] text-text-muted block">X (m)</span>
              <NumInput value={Math.round(circleDisplay.xM * 10) / 10} onChange={(v) => handleCircleChange('xM', v)} opts={{ step: 0.5 }} />
            </label>
            <label className="block">
              <span className="text-[10px] text-text-muted block">Y (m)</span>
              <NumInput value={Math.round(circleDisplay.yM * 10) / 10} onChange={(v) => handleCircleChange('yM', v)} opts={{ step: 0.5 }} />
            </label>
            <label className="block">
              <span className="text-[10px] text-text-muted block">Straal (m)</span>
              <NumInput value={Math.round(circleDisplay.straalM * 10) / 10} onChange={(v) => handleCircleChange('straalM', v)} opts={{ min: 0.5, step: 0.5 }} />
            </label>
          </div>
        </div>
      )}

      {/* Hoogte */}
      <label className="mb-3 block">
        <span className="text-xs text-text-muted block mb-1">Hoogte (m)</span>
        <NumInput
          value={Math.round(heightM * 10) / 10}
          onChange={(v) => onUpdate({ heightCm: Math.max(50, Math.round(v * 100)) })}
          opts={{ min: 0.5, max: 30, step: 0.5 }}
        />
      </label>

      {/* Dichtheid presets */}
      <div>
        <p className="text-xs text-text-muted block mb-1">Schaduwdichtheid</p>
        <div className="flex gap-1">
          {(Object.keys(PRESET_OPACITIES) as Array<keyof typeof PRESET_OPACITIES>).map((preset) => (
            <button
              key={preset}
              onClick={() => onUpdate({ opacity: PRESET_OPACITIES[preset] })}
              className={`flex-1 text-[10px] py-1.5 px-1 rounded-lg border leading-tight ${
                activePreset === preset
                  ? 'bg-primary text-white border-primary'
                  : 'bg-bg text-text-muted border-border hover:bg-surface'
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
