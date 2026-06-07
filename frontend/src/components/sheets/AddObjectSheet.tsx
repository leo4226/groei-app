import { useState } from 'react'
import type { ObjectShapeType, ObjectType, ObjectCategory } from '../../types'
import { objects } from '../../api/client'
import { useT } from '../../context/LanguageContext'

interface Props {
  mapId: number
  onClose: () => void
  onCreated: () => void
}

interface Preset {
  label: string
  object_type: ObjectType
  shape: ObjectShapeType
  diameter_cm?: number
  width_cm?: number
  depth_cm?: number
  material: string
  color: string
  category: ObjectCategory
  preset?: string
}

const CONTAINER_PRESETS: Preset[] = [
  { label: 'Round pot', object_type: 'pot', shape: 'circle', diameter_cm: 30, material: 'terracotta', color: '#B7654B', category: 'container' },
  { label: 'Square pot', object_type: 'pot', shape: 'square', width_cm: 30, material: 'plastic', color: '#888888', category: 'container' },
  { label: 'Planter', object_type: 'planter', shape: 'rectangle', width_cm: 80, depth_cm: 30, material: 'wood', color: '#8B6914', category: 'container' },
  { label: 'Corten ring', object_type: 'pot', shape: 'circle', diameter_cm: 100, material: 'corten', color: '#A0522D', category: 'container' },
  { label: 'Raised bed', object_type: 'raised_bed', shape: 'rectangle', width_cm: 200, depth_cm: 80, material: 'wood', color: '#8B5A30', category: 'container' },
]

const HARDSCAPE_PRESETS: Preset[] = [
  { label: 'Stepping stone', object_type: 'furniture', shape: 'rectangle', width_cm: 60, depth_cm: 40, material: 'stone', color: '#a8a090', category: 'hardscape', preset: 'stepping_stone' },
  { label: 'Bench', object_type: 'furniture', shape: 'rectangle', width_cm: 180, depth_cm: 40, material: 'wood', color: '#8b7355', category: 'hardscape', preset: 'bench' },
  { label: 'Table', object_type: 'furniture', shape: 'rectangle', width_cm: 80, depth_cm: 80, material: 'wood', color: '#8b7355', category: 'hardscape', preset: 'table' },
  { label: 'Chair', object_type: 'furniture', shape: 'rectangle', width_cm: 50, depth_cm: 50, material: 'wood', color: '#8b7355', category: 'hardscape', preset: 'chair' },
  { label: 'Rain barrel', object_type: 'furniture', shape: 'circle', diameter_cm: 60, material: 'plastic', color: '#3d5a6b', category: 'utility', preset: 'rain_barrel' },
]

const MATERIALS = ['terracotta', 'plastic', 'wood', 'corten', 'stone']
const COLOR_SWATCHES = ['#B7654B', '#888888', '#8B6914', '#A0522D', '#8B5A30', '#5B9A6F', '#333333', '#D4A843']

export default function AddObjectSheet({ mapId, onClose, onCreated }: Props) {
  const t = useT()
  const [name, setName] = useState('')
  const [objectType, setObjectType] = useState<ObjectType>('pot')
  const [shape, setShape] = useState<ObjectShapeType>('circle')
  const [diameterCm, setDiameterCm] = useState(30)
  const [widthCm, setWidthCm] = useState(30)
  const [depthCm, setDepthCm] = useState(30)
  const [material, setMaterial] = useState('terracotta')
  const [color, setColor] = useState('#B7654B')
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState<ObjectCategory>('container')
  const [presetKey, setPresetKey] = useState<string | undefined>(undefined)

  const isContainer = category === 'container'

  const applyPreset = (preset: Preset) => {
    setName(preset.label)
    setObjectType(preset.object_type)
    setShape(preset.shape)
    if (preset.diameter_cm) setDiameterCm(preset.diameter_cm)
    if (preset.width_cm) setWidthCm(preset.width_cm)
    if (preset.depth_cm) setDepthCm(preset.depth_cm)
    setMaterial(preset.material)
    setColor(preset.color)
    setCategory(preset.category)
    setPresetKey(preset.preset)
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await objects.create({
        name: name.trim(),
        object_type: objectType,
        shape,
        diameter_cm: shape === 'circle' ? diameterCm : undefined,
        width_cm: shape !== 'circle' ? widthCm : undefined,
        depth_cm: shape === 'rectangle' ? depthCm : undefined,
        material: isContainer ? material : undefined,
        color,
        map_id: mapId,
        map_x: 300,
        map_y: 300,
        category,
        label: !isContainer ? name.trim() : undefined,
        preset: presetKey,
      })
      onCreated()
    } catch (e) {
      console.error('Failed to create object:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-[60] animate-slide-up max-h-[85vh] overflow-hidden flex flex-col">
        <button
        onClick={onClose}
        aria-label="Sluiten"
        className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group shrink-0"
      >
        <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors shrink-0" />
      </button>

        <div className="px-5 overflow-y-auto flex-1">
          <h3 className="text-lg font-semibold text-text mb-4">{t.addObject.title}</h3>

          {/* Container presets */}
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{t.addObject.containers}</span>
          <div className="flex gap-2 overflow-x-auto pb-2 mt-1 mb-3 -mx-1 px-1">
            {CONTAINER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                style={{
                  backgroundColor: preset.color + '22',
                  color: preset.color,
                  border: `1.5px solid ${preset.color}44`,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Hardscape & utility presets */}
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{t.addObject.hardscape}</span>
          <div className="flex gap-2 overflow-x-auto pb-3 mt-1 mb-4 -mx-1 px-1">
            {HARDSCAPE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                style={{
                  backgroundColor: preset.color + '22',
                  color: preset.color,
                  border: `1.5px solid ${preset.color}44`,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Name */}
          <label className="block mb-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{t.addObject.name}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.addObject.namePlaceholder}
              className="mt-1 w-full bg-bg text-text rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary focus:outline-none"
            />
          </label>

          {/* Shape — containers only */}
          {isContainer && (
            <div className="mb-3">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{t.addObject.shape}</span>
              <div className="flex gap-2 mt-1">
                {(['circle', 'square', 'rectangle'] as ObjectShapeType[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setShape(s)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      shape === s ? 'bg-primary text-white' : 'bg-bg text-text-muted'
                    }`}
                  >
                    {s === 'circle' ? t.addObject.round : s === 'square' ? t.addObject.square : t.addObject.rect}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dimensions */}
          <div className="mb-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{t.addObject.dimensions}</span>
            <div className="flex gap-2 mt-1">
              {shape === 'circle' ? (
                <label className="flex-1">
                  <span className="text-xs text-text-muted">{t.addObject.diameter}</span>
                  <input
                    type="number"
                    value={diameterCm}
                    onChange={(e) => setDiameterCm(Number(e.target.value))}
                    className="w-full bg-bg text-text rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary focus:outline-none"
                  />
                </label>
              ) : (
                <>
                  <label className="flex-1">
                    <span className="text-xs text-text-muted">{t.addObject.width}</span>
                    <input
                      type="number"
                      value={widthCm}
                      onChange={(e) => setWidthCm(Number(e.target.value))}
                      className="w-full bg-bg text-text rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary focus:outline-none"
                    />
                  </label>
                  {shape === 'rectangle' && (
                    <label className="flex-1">
                      <span className="text-xs text-text-muted">{t.addObject.depth}</span>
                      <input
                        type="number"
                        value={depthCm}
                        onChange={(e) => setDepthCm(Number(e.target.value))}
                        className="w-full bg-bg text-text rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary focus:outline-none"
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Material — containers only */}
          {isContainer && (
            <label className="block mb-3">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{t.addObject.material}</span>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="mt-1 w-full bg-bg text-text rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary focus:outline-none"
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </label>
          )}

          {/* Color — containers only */}
          {isContainer && (
            <div className="mb-5">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{t.addObject.color}</span>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-full transition-transform"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? '2px solid white' : 'none',
                      outlineOffset: '2px',
                      transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {!isContainer && <div className="mb-5" />}

        </div>

        {/* Sticky action buttons */}
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-border shrink-0 flex gap-2 bg-surface">
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-50"
          >
            {saving ? t.addObject.adding : t.addObject.addToMap}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
          >
            {t.addObject.cancel}
          </button>
        </div>
      </div>
    </>
  )
}
