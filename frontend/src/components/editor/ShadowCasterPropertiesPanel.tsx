import { useT } from '../../context/LanguageContext'
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
  const t = useT()
  const isRect = caster.type === 'rect'

  const KANT_OPTIONS: { value: Kant; label: string }[] = [
    { value: 'links', label: t.editor.props.left },
    { value: 'rechts', label: t.editor.props.right },
    { value: 'boven', label: t.editor.top },
    { value: 'onder', label: t.editor.bottom },
  ]

  const PRESET_LABELS: Record<DichtheidPreset, string> = {
    'lichte-boom': t.editor.props.lightTree,
    'dichte-boom': t.editor.denseTree,
    'gebouw': t.editor.buildingWall,
  }

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
          {t.editor.shadowObject}
        </p>
        <button
          onClick={onDelete}
          className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
        >
          {t.common.delete}
        </button>
      </div>

      {/* Type toggle */}
      <div className="mb-3">
        <p className="text-xs text-text-muted block mb-1">{t.mapSettings.typeLabel}</p>
        <div className="flex gap-1">
          <button
            onClick={() => handleTypeChange('rect')}
            className={`flex-1 text-xs py-1.5 rounded-lg border ${
              isRect ? 'bg-primary text-white border-primary' : 'bg-bg text-text-muted border-border'
            }`}
          >
            {t.editor.shadowCasterBuilding}
          </button>
          <button
            onClick={() => handleTypeChange('circle')}
            className={`flex-1 text-xs py-1.5 rounded-lg border ${
              !isRect ? 'bg-primary text-white border-primary' : 'bg-bg text-text-muted border-border'
            }`}
          >
            {t.editor.shadowCasterTree}
          </button>
        </div>
      </div>

      {/* Naam */}
      <label className="mb-3 block">
        <span className="text-xs text-text-muted block mb-1">{t.editor.shadowCasterName}</span>
        <input
          value={caster.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={isRect ? t.editor.rectPlaceholder : t.editor.circlePlaceholder}
          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
        />
      </label>

      {/* Position — Gebouw */}
      {isRect && rectDisplay && (
        <div className="mb-3">
          <p className="text-xs text-text-muted block mb-1">{t.editor.shadowCasterPosition}</p>
          <label className="mb-1.5 block">
            <span className="text-[10px] text-text-muted block">{t.editor.shadowCasterSide}</span>
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
              <span className="text-[10px] text-text-muted block">{t.editor.shadowCasterDistance}</span>
              <NumInput value={Math.round(rectDisplay.afstandM * 10) / 10} onChange={handleAfstandChange} opts={{ min: 0, step: 0.5 }} />
            </label>
            <label className="block">
              <span className="text-[10px] text-text-muted block">{t.editor.shadowCasterThickness}</span>
              <NumInput value={Math.round(rectDisplay.dikteM * 10) / 10} onChange={handleDikteChange} opts={{ min: 0.5, step: 0.5 }} />
            </label>
          </div>
        </div>
      )}

      {/* Position — Boom */}
      {!isRect && circleDisplay && (
        <div className="mb-3">
          <p className="text-xs text-text-muted block mb-1">{t.editor.shadowCasterPosSize}</p>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[10px] text-text-muted block">{t.editor.props.xM}</span>
              <NumInput value={Math.round(circleDisplay.xM * 10) / 10} onChange={(v) => handleCircleChange('xM', v)} opts={{ step: 0.5 }} />
            </label>
            <label className="block">
              <span className="text-[10px] text-text-muted block">{t.editor.props.yM}</span>
              <NumInput value={Math.round(circleDisplay.yM * 10) / 10} onChange={(v) => handleCircleChange('yM', v)} opts={{ step: 0.5 }} />
            </label>
            <label className="block">
              <span className="text-[10px] text-text-muted block">{t.editor.shadowCasterRadius}</span>
              <NumInput value={Math.round(circleDisplay.straalM * 10) / 10} onChange={(v) => handleCircleChange('straalM', v)} opts={{ min: 0.5, step: 0.5 }} />
            </label>
          </div>
        </div>
      )}

      {/* Hoogte */}
      <label className="mb-3 block">
        <span className="text-xs text-text-muted block mb-1">{t.editor.props.height}</span>
        <NumInput
          value={Math.round(heightM * 10) / 10}
          onChange={(v) => onUpdate({ heightCm: Math.max(50, Math.round(v * 100)) })}
          opts={{ min: 0.5, max: 30, step: 0.5 }}
        />
      </label>

      {/* Dichtheid presets */}
      <div>
        <p className="text-xs text-text-muted block mb-1">{t.editor.shadowDensity}</p>
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
