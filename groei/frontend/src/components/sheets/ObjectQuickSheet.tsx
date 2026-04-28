import type { MapObject, MapPlant, ObjectShapeType } from '../../types'
import { archiveObject, updatePlantContainer, updateObject } from '../../api/client'
import { STATUS_COLORS } from '../map/PlantMarker'
import { useState } from 'react'

interface Props {
  object: MapObject
  mapPlants: MapPlant[]
  onClose: () => void
  onAction: () => void
}

const MATERIAL_LABELS: Record<string, string> = {
  terracotta: 'Terracotta',
  plastic: 'Plastic',
  wood: 'Wood',
  corten: 'Corten steel',
  stone: 'Stone',
}

const SHAPE_LABELS: Record<string, string> = {
  circle: 'Round',
  square: 'Square',
  rectangle: 'Rectangular',
}

const MATERIALS = ['terracotta', 'plastic', 'wood', 'corten', 'stone']
const COLOR_SWATCHES = ['#B7654B', '#888888', '#8B6914', '#A0522D', '#8B5A30', '#5B9A6F', '#333333', '#D4A843']

export default function ObjectQuickSheet({ object, mapPlants, onClose, onAction }: Props) {
  const [showPlantPicker, setShowPlantPicker] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  // Edit state
  const [name, setName] = useState(object.name)
  const [shape, setShape] = useState<ObjectShapeType>(object.shape)
  const [diameterCm, setDiameterCm] = useState(object.diameter_cm || 30)
  const [widthCm, setWidthCm] = useState(object.width_cm || 30)
  const [depthCm, setDepthCm] = useState(object.depth_cm || 30)
  const [material, setMaterial] = useState(object.material || 'terracotta')
  const [color, setColor] = useState(object.color || '#888888')

  const dimensions = object.shape === 'circle'
    ? `${object.diameter_cm}cm diameter`
    : object.shape === 'square'
    ? `${object.width_cm}\u00d7${object.width_cm}cm`
    : `${object.width_cm}\u00d7${object.depth_cm}cm`

  const handleSave = async () => {
    setBusy(true)
    try {
      await updateObject(object.id, {
        name,
        shape,
        diameter_cm: shape === 'circle' ? diameterCm : undefined,
        width_cm: shape !== 'circle' ? widthCm : undefined,
        depth_cm: shape === 'rectangle' ? depthCm : undefined,
        material,
        color,
      } as any)
      onAction()
    } catch (e) {
      console.error('Failed to update object:', e)
    } finally {
      setBusy(false)
    }
  }

  const handleArchive = async () => {
    if (!confirm(`Archive "${object.name}"? Contained plants will be released.`)) return
    try {
      await archiveObject(object.id)
      onAction()
    } catch (e) {
      console.error('Failed to archive object:', e)
    }
  }

  const handleAssignPlant = async (plantId: number) => {
    setBusy(true)
    try {
      await updatePlantContainer(plantId, object.id)
      onAction()
    } catch (e) {
      console.error('Failed to assign plant:', e)
    } finally {
      setBusy(false)
    }
  }

  const handleReleasePlant = async (plantId: number) => {
    setBusy(true)
    try {
      await updatePlantContainer(plantId, null)
      onAction()
    } catch (e) {
      console.error('Failed to release plant:', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[calc(4rem+env(safe-area-inset-bottom))] animate-slide-up max-h-[80vh] overflow-y-auto">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-4" />

        <div className="px-5 pb-5">
          {!editing ? (
            <>
              {/* View mode */}
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
                  style={{ backgroundColor: (object.color || '#888') + '22' }}
                >
                  🪴
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-text truncate">{object.name}</h3>
                  <p className="text-sm text-text-muted">
                    {SHAPE_LABELS[object.shape] || object.shape} {object.object_type} — {dimensions}
                  </p>
                  {object.material && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {MATERIAL_LABELS[object.material] || object.material}
                    </p>
                  )}
                </div>
              </div>

              {/* Contained plants */}
              {object.contained_plants.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Plants inside ({object.contained_plants.length})
                  </h4>
                  <div className="space-y-2">
                    {object.contained_plants.map((plant) => (
                      <div key={plant.id} className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[plant.care_status] || STATUS_COLORS.good }}
                        />
                        <span className="flex-1 text-sm text-text">{plant.name}</span>
                        <button
                          onClick={() => handleReleasePlant(plant.id)}
                          disabled={busy}
                          className="text-xs text-text-muted hover:text-overdue transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {object.notes && (
                <div className="bg-bg rounded-xl px-4 py-3 mb-4 text-sm text-text-muted">
                  {object.notes}
                </div>
              )}

              {/* Plant picker */}
              {showPlantPicker && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Assign a plant
                  </h4>
                  {mapPlants.length === 0 ? (
                    <p className="text-sm text-text-muted">No free-standing plants on this map</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {mapPlants.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAssignPlant(p.id)}
                          disabled={busy}
                          className="w-full flex items-center gap-2 bg-bg rounded-lg px-3 py-2 text-left hover:bg-border/50 transition-colors"
                        >
                          <span className="text-sm">🌱</span>
                          <span className="flex-1 text-sm text-text">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPlantPicker(!showPlantPicker)}
                  className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
                >
                  🌱 {showPlantPicker ? 'Hide' : 'Add plant'}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
                >
                  Edit
                </button>
                <button
                  onClick={handleArchive}
                  className="flex-1 bg-overdue/10 text-overdue rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
                >
                  🗑 Remove
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Edit mode */}
              <h3 className="text-lg font-semibold text-text mb-4">Edit object</h3>

              <label className="block mb-3">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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

              {/* Save / Cancel */}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!name.trim() || busy}
                  className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
