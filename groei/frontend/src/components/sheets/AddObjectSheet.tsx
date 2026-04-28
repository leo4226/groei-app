import { useState } from 'react'
import type { ObjectShapeType, ObjectType } from '../../types'
import { createObject } from '../../api/client'

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
}

const PRESETS: Preset[] = [
  { label: 'Round pot', object_type: 'pot', shape: 'circle', diameter_cm: 30, material: 'terracotta', color: '#B7654B' },
  { label: 'Square pot', object_type: 'pot', shape: 'square', width_cm: 30, material: 'plastic', color: '#888888' },
  { label: 'Planter', object_type: 'planter', shape: 'rectangle', width_cm: 80, depth_cm: 30, material: 'wood', color: '#8B6914' },
  { label: 'Corten ring', object_type: 'pot', shape: 'circle', diameter_cm: 100, material: 'corten', color: '#A0522D' },
  { label: 'Raised bed', object_type: 'raised_bed', shape: 'rectangle', width_cm: 200, depth_cm: 80, material: 'wood', color: '#8B5A30' },
]

const MATERIALS = ['terracotta', 'plastic', 'wood', 'corten', 'stone']
const COLOR_SWATCHES = ['#B7654B', '#888888', '#8B6914', '#A0522D', '#8B5A30', '#5B9A6F', '#333333', '#D4A843']

export default function AddObjectSheet({ mapId, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [objectType, setObjectType] = useState<ObjectType>('pot')
  const [shape, setShape] = useState<ObjectShapeType>('circle')
  const [diameterCm, setDiameterCm] = useState(30)
  const [widthCm, setWidthCm] = useState(30)
  const [depthCm, setDepthCm] = useState(30)
  const [material, setMaterial] = useState('terracotta')
  const [color, setColor] = useState('#B7654B')
  const [saving, setSaving] = useState(false)

  const applyPreset = (preset: Preset) => {
    setName(preset.label)
    setObjectType(preset.object_type)
    setShape(preset.shape)
    if (preset.diameter_cm) setDiameterCm(preset.diameter_cm)
    if (preset.width_cm) setWidthCm(preset.width_cm)
    if (preset.depth_cm) setDepthCm(preset.depth_cm)
    setMaterial(preset.material)
    setColor(preset.color)
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createObject({
        name: name.trim(),
        object_type: objectType,
        shape,
        diameter_cm: shape === 'circle' ? diameterCm : undefined,
        width_cm: shape !== 'circle' ? widthCm : undefined,
        depth_cm: shape === 'rectangle' ? depthCm : undefined,
        material,
        color,
        map_id: mapId,
        map_x: 300,
        map_y: 300,
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
        <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-4 shrink-0" />

        <div className="px-5 overflow-y-auto flex-1">
          <h3 className="text-lg font-semibold text-text mb-4">Add object</h3>

          {/* Presets */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
            {PRESETS.map((preset) => (
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
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Front deck pot"
              className="mt-1 w-full bg-bg text-text rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary focus:outline-none"
            />
          </label>

          {/* Shape */}
          <div className="mb-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Shape</span>
            <div className="flex gap-2 mt-1">
              {(['circle', 'square', 'rectangle'] as ObjectShapeType[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setShape(s)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    shape === s ? 'bg-primary text-white' : 'bg-bg text-text-muted'
                  }`}
                >
                  {s === 'circle' ? 'Round' : s === 'square' ? 'Square' : 'Rect'}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div className="mb-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Dimensions (cm)</span>
            <div className="flex gap-2 mt-1">
              {shape === 'circle' ? (
                <label className="flex-1">
                  <span className="text-xs text-text-muted">Diameter</span>
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
                    <span className="text-xs text-text-muted">Width</span>
                    <input
                      type="number"
                      value={widthCm}
                      onChange={(e) => setWidthCm(Number(e.target.value))}
                      className="w-full bg-bg text-text rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary focus:outline-none"
                    />
                  </label>
                  {shape === 'rectangle' && (
                    <label className="flex-1">
                      <span className="text-xs text-text-muted">Depth</span>
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

          {/* Material */}
          <label className="block mb-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Material</span>
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

          {/* Color */}
          <div className="mb-5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Color</span>
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

        </div>

        {/* Sticky action buttons */}
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-border shrink-0 flex gap-2 bg-surface">
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add to map'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
