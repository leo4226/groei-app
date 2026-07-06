import type { MapObject, MapPlant, ObjectShapeType } from '../../types'
import { objects, plants as plantsApi } from '../../api/client'
import { STATUS_COLORS } from '../map/PlantMarker'
import { useState } from 'react'
import { useT } from '../../context/LanguageContext'
import { plantDisplayName } from '../../utils/plantDisplayName'
import Glyph, { type GlyphName } from '../ui/Glyph'

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

const CATEGORY_GLYPH: Record<string, GlyphName> = {
  container: 'pot',
  hardscape: 'rock',
  utility: 'wrench',
}

const PRESET_LABELS: Record<string, string> = {
  stepping_stone: 'Stepping stone',
  bench: 'Bench',
  table: 'Table',
  chair: 'Chair',
  rain_barrel: 'Rain barrel',
}

export default function ObjectQuickSheet({ object, mapPlants, onClose, onAction }: Props) {
  const t = useT()
  const [showPlantPicker, setShowPlantPicker] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const isContainer = (object.category || 'container') === 'container'

  // Edit state
  const [name, setName] = useState(object.label || object.name)
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
      await objects.update(object.id, {
        name,
        shape: isContainer ? shape : undefined,
        diameter_cm: shape === 'circle' ? diameterCm : undefined,
        width_cm: shape !== 'circle' ? widthCm : undefined,
        depth_cm: shape === 'rectangle' ? depthCm : undefined,
        material: isContainer ? material : undefined,
        color: isContainer ? color : undefined,
        label: !isContainer ? name : undefined,
      } as any)
      onAction()
    } catch (e) {
      console.error('Failed to update object:', e)
    } finally {
      setBusy(false)
    }
  }

  const handleArchive = async () => {
    if (!confirm(t.addObject.archive(object.name))) return
    try {
      await objects.archive(object.id)
      onAction()
    } catch (e) {
      console.error('Failed to archive object:', e)
    }
  }

  const handleAssignPlant = async (plantId: number) => {
    setBusy(true)
    try {
      await plantsApi.setContainer(plantId, object.id)
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
      await plantsApi.setContainer(plantId, null)
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
        <button
        onClick={onClose}
        aria-label="Sluiten"
        className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group"
      >
        <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
      </button>

        <div className="px-5 pb-5">
          {!editing ? (
            <>
              {/* View mode */}
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-text-soft"
                  style={{ backgroundColor: (object.color || '#888') + '22' }}
                >
                  <Glyph name={CATEGORY_GLYPH[object.category || 'container'] || 'pot'} size={26} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-text truncate">{object.label || object.name}</h3>
                  <p className="text-sm text-text-muted">
                    {isContainer
                      ? `${SHAPE_LABELS[object.shape] || object.shape} ${object.object_type} — ${dimensions}`
                      : `${PRESET_LABELS[object.preset || ''] || object.object_type} — ${dimensions}`
                    }
                  </p>
                  {isContainer && object.material && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {MATERIAL_LABELS[object.material] || object.material}
                    </p>
                  )}
                </div>
              </div>

              {/* Contained plants — containers only */}
              {isContainer && object.contained_plants.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    {t.addObject.plantsInside(object.contained_plants.length)}
                  </h4>
                  <div className="space-y-2">
                    {object.contained_plants.map((plant) => (
                      <div key={plant.id} className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[plant.care_status] || STATUS_COLORS.good }}
                        />
                        <span className="flex-1 text-sm text-text">{plantDisplayName(plant, t.locale)}</span>
                        <button
                          onClick={() => handleReleasePlant(plant.id)}
                          disabled={busy}
                          className="text-xs text-text-muted hover:text-overdue transition-colors"
                        >
                          {t.addObject.remove}
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

              {/* Plant picker — containers only */}
              {isContainer && showPlantPicker && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    {t.addObject.assignPlant}
                  </h4>
                  {mapPlants.length === 0 ? (
                    <p className="text-sm text-text-muted">{t.addObject.noStandalonePlants}</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {mapPlants.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAssignPlant(p.id)}
                          disabled={busy}
                          className="w-full flex items-center gap-2 bg-bg rounded-lg px-3 py-2 text-left hover:bg-border/50 transition-colors"
                        >
                          <span className="text-text-soft shrink-0"><Glyph name="sprout" size={15} /></span>
                          <span className="flex-1 text-sm text-text">{plantDisplayName(p, t.locale)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {isContainer && (
                  <button
                    onClick={() => setShowPlantPicker(!showPlantPicker)}
                    className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform inline-flex items-center justify-center gap-1.5"
                  >
                    <Glyph name="sprout" size={15} /> {showPlantPicker ? t.addObject.hidePlantPicker : t.addObject.addPlant}
                  </button>
                )}
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
                >
                  {t.addObject.edit}
                </button>
                <button
                  onClick={handleArchive}
                  className="flex-1 bg-overdue/10 text-overdue rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform inline-flex items-center justify-center gap-1.5"
                >
                  <Glyph name="trash" size={15} /> {t.addObject.removeObject}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Edit mode */}
              <h3 className="text-lg font-semibold text-text mb-4">
                {isContainer ? t.addObject.editObject : (t.addObject.edit + ' ' + (PRESET_LABELS[object.preset || ''] || 'object'))}
              </h3>

              <label className="block mb-3">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  {isContainer ? t.addObject.name : t.addObject.label}
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                    onChange={(e) => setMaterial(e.target.value as "wood" | "terracotta" | "plastic" | "corten" | "stone")}
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

              {/* Save / Cancel */}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!name.trim() || busy}
                  className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-50"
                >
                  {busy ? t.addObject.saving : t.addObject.save}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
                >
                  {t.addObject.cancel}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
